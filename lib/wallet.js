/**
 * @fileoverview Wallet and client management for Ape Church CLI
 *
 * Handles all wallet operations:
 * - Key generation and storage
 * - Optional password encryption (scrypt + AES-256-GCM)
 * - Session management for cached unlocked keys
 * - viem client creation for blockchain interactions
 *
 * Security model:
 * - Private keys stored in ~/.apechurch/wallet.json
 * - File permissions set to 0o600 (owner read/write only)
 * - Encryption uses scrypt (memory-hard) to resist brute force
 * - Sessions cache decrypted keys for 3 hours to reduce password prompts
 *
 * @module lib/wallet
 */
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { apechain, WALLET_FILE, APECHURCH_DIR } from './constants.js';
import { ensureDir } from './utils.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Session file path - stores temporarily unlocked private key
 * Hidden file (dot prefix) for slight obscurity
 * @type {string}
 */
const SESSION_FILE = path.join(APECHURCH_DIR, '.session');

/**
 * Default session duration: 3 hours
 * Balances security (keys not exposed forever) with convenience (no constant prompts)
 * @type {number}
 */
const DEFAULT_SESSION_TIMEOUT_MS = 3 * 60 * 60 * 1000;

/**
 * Scrypt parameters for key derivation
 * N=16384 (2^14) is OWASP-recommended minimum for interactive logins
 * Higher N = more memory/CPU required for each decryption attempt
 */
const SCRYPT_PARAMS = { N: 2 ** 14, r: 8, p: 1 };

// ============================================================================
// ENCRYPTION UTILITIES
// ============================================================================

/**
 * Encrypt a private key using scrypt + AES-256-GCM
 *
 * Uses Node.js crypto only - no external dependencies.
 *
 * Algorithm:
 * 1. Generate random 32-byte salt
 * 2. Generate random 16-byte IV
 * 3. Derive 32-byte key from password using scrypt
 * 4. Encrypt private key with AES-256-GCM
 * 5. Return salt, IV, ciphertext, and auth tag
 *
 * @param {string} privateKey - The private key to encrypt (0x-prefixed hex)
 * @param {string} password - User's password
 * @returns {Object} Encrypted data object with salt, iv, authTag, ciphertext (all hex strings)
 */
export function encryptPrivateKey(privateKey, password) {
  // Random salt prevents rainbow table attacks
  const salt = crypto.randomBytes(32);
  // Random IV ensures same plaintext encrypts differently each time
  const iv = crypto.randomBytes(16);

  // Derive encryption key using scrypt (CPU/memory-hard)
  const key = crypto.scryptSync(password, salt, 32, SCRYPT_PARAMS);

  // AES-256-GCM provides both encryption and authentication
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final()
  ]);
  // Auth tag allows detecting tampering
  const authTag = cipher.getAuthTag();

  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: encrypted.toString('hex'),
  };
}

/**
 * Decrypt a private key with password
 *
 * @param {Object} encryptedData - Object containing salt, iv, authTag, ciphertext
 * @param {string} password - User's password
 * @returns {string|null} Decrypted private key, or null if password is wrong/data corrupted
 */
export function decryptPrivateKey(encryptedData, password) {
  try {
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    const ciphertext = Buffer.from(encryptedData.ciphertext, 'hex');

    // Re-derive the same key from password
    const key = crypto.scryptSync(password, salt, 32, SCRYPT_PARAMS);

    // Decrypt and verify authenticity
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  } catch {
    // GCM auth tag mismatch = wrong password or corrupted data
    return null;
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Save a session (cache decrypted private key to disk)
 *
 * Sessions allow users to unlock once and play multiple games
 * without re-entering their password each time.
 *
 * Security considerations:
 * - Session file is plaintext (contains private key)
 * - File permissions restrict access to owner only
 * - Session expires after timeout (default 3 hours)
 * - User can manually lock via `wallet lock`
 *
 * @param {string} privateKey - Decrypted private key to cache
 * @param {number} [timeoutMs=DEFAULT_SESSION_TIMEOUT_MS] - Session duration in ms
 */
export function saveSession(privateKey, timeoutMs = DEFAULT_SESSION_TIMEOUT_MS) {
  ensureDir(APECHURCH_DIR);
  const session = {
    privateKey,
    expiresAt: Date.now() + timeoutMs,
  };
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session), { mode: 0o600 });
}

/**
 * Load cached session if valid (not expired)
 *
 * @returns {string|null} Cached private key, or null if no valid session
 */
export function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) {
    return null;
  }
  try {
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    if (Date.now() > session.expiresAt) {
      // Session expired - clean it up
      clearSession();
      return null;
    }
    return session.privateKey;
  } catch {
    // Corrupted session file
    clearSession();
    return null;
  }
}

/**
 * Clear/lock the session (delete cached key)
 *
 * Called when:
 * - User runs `wallet lock`
 * - Session expires
 * - Wallet encryption status changes
 */
export function clearSession() {
  if (fs.existsSync(SESSION_FILE)) {
    fs.unlinkSync(SESSION_FILE);
  }
}

/**
 * Get remaining session time in seconds
 *
 * @returns {number} Seconds until session expires (0 if no session)
 */
export function getSessionTimeRemaining() {
  if (!fs.existsSync(SESSION_FILE)) {
    return 0;
  }
  try {
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    const remaining = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
    return remaining;
  } catch {
    return 0;
  }
}

// ============================================================================
// WALLET FILE OPERATIONS
// ============================================================================

/**
 * Check if the stored wallet is encrypted
 *
 * @returns {boolean} True if wallet exists and is encrypted
 */
export function isWalletEncrypted() {
  if (!fs.existsSync(WALLET_FILE)) {
    return false;
  }
  try {
    const data = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
    return data.encrypted === true;
  } catch {
    return false;
  }
}

/**
 * Load raw wallet data from file
 *
 * @returns {Object|null} Wallet data object, or null if no wallet
 */
export function loadWalletData() {
  if (!fs.existsSync(WALLET_FILE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
}

/**
 * Save wallet data to file
 *
 * Sets restrictive permissions (owner only) to protect private key.
 *
 * @param {Object} data - Wallet data to save
 */
export function saveWalletData(data) {
  ensureDir(APECHURCH_DIR);
  fs.writeFileSync(WALLET_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

/**
 * Get password hints from wallet
 *
 * Hints help users remember their password without storing the password itself.
 * Maximum 3 hints allowed.
 *
 * @returns {string[]} Array of hint strings (empty if none)
 */
export function getWalletHints() {
  const data = loadWalletData();
  return data?.hints || [];
}

/**
 * Update password hints on wallet
 *
 * @param {string[]} hints - Array of hint strings (max 3)
 */
export function setWalletHints(hints) {
  const data = loadWalletData();
  if (data) {
    data.hints = hints.slice(0, 3);
    saveWalletData(data);
  }
}

// ============================================================================
// PRIVATE KEY ACCESS
// ============================================================================

/**
 * Get the private key, handling encryption and sessions
 *
 * Resolution order:
 * 1. If wallet is plain text → return immediately
 * 2. If wallet is encrypted and session exists → return cached key
 * 3. If wallet is encrypted and password provided → decrypt and return
 * 4. If wallet is encrypted and no password → return error with needsPassword flag
 *
 * @param {string|null} [password=null] - Password for encrypted wallets
 * @returns {Object} Result object:
 *   - Success: { privateKey: string, source: 'plain'|'session'|'password' }
 *   - Error: { error: string, needsPassword?: boolean, wrongPassword?: boolean, hints?: string[] }
 */
export function getPrivateKey(password = null) {
  const data = loadWalletData();
  if (!data) {
    return { error: 'No wallet found. Run: apechurch install' };
  }

  // Plain text wallet - no encryption
  if (!data.encrypted) {
    return { privateKey: data.privateKey, source: 'plain' };
  }

  // Encrypted wallet - check for active session first
  const sessionKey = loadSession();
  if (sessionKey) {
    return { privateKey: sessionKey, source: 'session' };
  }

  // No session - need password
  if (!password) {
    return {
      error: 'Wallet is locked. Run: apechurch wallet unlock',
      needsPassword: true,
      hints: data.hints || []
    };
  }

  // Attempt decryption
  const decrypted = decryptPrivateKey(data, password);
  if (!decrypted) {
    return { error: 'Wrong password', wrongPassword: true };
  }

  return { privateKey: decrypted, source: 'password' };
}

// ============================================================================
// ENCRYPTION MANAGEMENT
// ============================================================================

/**
 * Encrypt an existing plain-text wallet
 *
 * @param {string} password - Password to encrypt with
 * @param {string[]} [hints=[]] - Optional password hints
 * @returns {Object} { success: true } or { error: string }
 */
export function encryptWallet(password, hints = []) {
  const data = loadWalletData();
  if (!data) {
    return { error: 'No wallet found' };
  }
  if (data.encrypted) {
    return { error: 'Wallet is already encrypted' };
  }

  const encrypted = encryptPrivateKey(data.privateKey, password);
  const newData = {
    encrypted: true,
    ...encrypted,
    hints: hints.slice(0, 3),
  };
  saveWalletData(newData);
  clearSession(); // Clear any existing session for clean state
  return { success: true };
}

/**
 * Decrypt an encrypted wallet (remove password protection)
 *
 * Converts wallet back to plain text storage.
 *
 * @param {string} password - Current password
 * @returns {Object} { success: true } or { error: string }
 */
export function decryptWallet(password) {
  const data = loadWalletData();
  if (!data) {
    return { error: 'No wallet found' };
  }
  if (!data.encrypted) {
    return { error: 'Wallet is not encrypted' };
  }

  const privateKey = decryptPrivateKey(data, password);
  if (!privateKey) {
    return { error: 'Wrong password' };
  }

  const newData = {
    encrypted: false,
    privateKey,
  };
  saveWalletData(newData);
  clearSession();
  return { success: true };
}

/**
 * Unlock an encrypted wallet (start a session)
 *
 * Decrypts the key and caches it for the session duration.
 * Subsequent operations won't require the password until session expires.
 *
 * @param {string} password - Wallet password
 * @param {number} [timeoutMs=DEFAULT_SESSION_TIMEOUT_MS] - Session duration
 * @returns {Object} { success: true, expiresIn: number } or { error: string }
 */
export function unlockWallet(password, timeoutMs = DEFAULT_SESSION_TIMEOUT_MS) {
  const result = getPrivateKey(password);
  if (result.error) {
    return result;
  }
  saveSession(result.privateKey, timeoutMs);
  return { success: true, expiresIn: timeoutMs };
}

// ============================================================================
// WALLET ACCOUNT OPERATIONS
// ============================================================================

/**
 * Check if a wallet exists
 *
 * @returns {boolean} True if wallet file exists
 */
export function walletExists() {
  return fs.existsSync(WALLET_FILE);
}

/**
 * Get wallet account for transactions
 *
 * Convenience function that exits on error (for CLI commands).
 * For more control, use getPrivateKey() and handle errors yourself.
 *
 * @returns {import('viem/accounts').PrivateKeyAccount} viem account object
 */
export function getWallet() {
  const result = getPrivateKey();
  if (result.error) {
    console.error(JSON.stringify({ error: result.error }));
    process.exit(1);
  }
  return privateKeyToAccount(result.privateKey);
}

/**
 * Create a new wallet (unencrypted)
 *
 * Generates a cryptographically secure private key and saves it.
 *
 * @returns {import('viem/accounts').PrivateKeyAccount} New account
 */
export function createNewWallet() {
  ensureDir(APECHURCH_DIR);
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const data = {
    encrypted: false,
    privateKey,
  };
  saveWalletData(data);
  return account;
}

/**
 * Create a new wallet with encryption
 *
 * Generates key, encrypts it, and auto-unlocks for convenience.
 *
 * @param {string} password - Password to encrypt with
 * @param {string[]} [hints=[]] - Optional password hints
 * @returns {import('viem/accounts').PrivateKeyAccount} New account
 */
export function createEncryptedWallet(password, hints = []) {
  ensureDir(APECHURCH_DIR);
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const encrypted = encryptPrivateKey(privateKey, password);
  const data = {
    encrypted: true,
    ...encrypted,
    hints: hints.slice(0, 3),
  };
  saveWalletData(data);

  // Auto-unlock so user can immediately start playing
  saveSession(privateKey);

  return account;
}

// ============================================================================
// VIEM CLIENT CREATION
// ============================================================================

/**
 * Get HTTP transport for ApeChain RPC
 *
 * Uses the RPC URL configured in apechain constant.
 * Can be overridden via APECHAIN_RPC_URL environment variable.
 *
 * @returns {import('viem').HttpTransport} HTTP transport instance
 */
export function getTransport() {
  return http();
}

/**
 * Create viem clients for blockchain interaction
 *
 * Returns both:
 * - publicClient: For read operations (balances, contract reads)
 * - walletClient: For write operations (sending transactions)
 *
 * @param {import('viem/accounts').PrivateKeyAccount|null} account - Account for wallet client
 * @returns {Object} { publicClient, walletClient }
 */
export function createClients(account) {
  const transport = getTransport();
  const publicClient = createPublicClient({ chain: apechain, transport });
  const walletClient = account
    ? createWalletClient({ account, chain: apechain, transport })
    : null;
  return { publicClient, walletClient };
}
