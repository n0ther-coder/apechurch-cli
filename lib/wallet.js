/**
 * Wallet and client management for Ape Church CLI
 * Supports optional password encryption with session caching.
 */
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { apechain, WALLET_FILE, APECHURCH_DIR } from './constants.js';
import { ensureDir } from './utils.js';

// Session file for caching unlocked keys
const SESSION_FILE = path.join(APECHURCH_DIR, '.session');
const DEFAULT_SESSION_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 hours

// ============================================================================
// ENCRYPTION UTILITIES (Node.js crypto - zero dependencies)
// ============================================================================

/**
 * Encrypt a private key with password using scrypt + AES-256-GCM
 */
export function encryptPrivateKey(privateKey, password) {
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  
  // Derive key using scrypt (CPU/memory-hard)
  const key = crypto.scryptSync(password, salt, 32, { N: 2 ** 14, r: 8, p: 1 });
  
  // Encrypt with AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final()
  ]);
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
 * Returns null if password is wrong
 */
export function decryptPrivateKey(encryptedData, password) {
  try {
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    const ciphertext = Buffer.from(encryptedData.ciphertext, 'hex');
    
    // Derive key
    const key = crypto.scryptSync(password, salt, 32, { N: 2 ** 14, r: 8, p: 1 });
    
    // Decrypt
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    // Wrong password or corrupted data
    return null;
  }
}

// ============================================================================
// SESSION MANAGEMENT (3-hour cached unlock)
// ============================================================================

/**
 * Save a session (cached decrypted key)
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
 * Load session if valid (not expired)
 */
export function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) {
    return null;
  }
  try {
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    if (Date.now() > session.expiresAt) {
      // Expired - delete it
      clearSession();
      return null;
    }
    return session.privateKey;
  } catch {
    clearSession();
    return null;
  }
}

/**
 * Clear/lock session
 */
export function clearSession() {
  if (fs.existsSync(SESSION_FILE)) {
    fs.unlinkSync(SESSION_FILE);
  }
}

/**
 * Get session time remaining in seconds (0 if no session)
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
// WALLET FILE MANAGEMENT
// ============================================================================

/**
 * Check if wallet is encrypted
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
 * Load wallet data (raw file contents)
 */
export function loadWalletData() {
  if (!fs.existsSync(WALLET_FILE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
}

/**
 * Save wallet data
 */
export function saveWalletData(data) {
  ensureDir(APECHURCH_DIR);
  fs.writeFileSync(WALLET_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

/**
 * Get hints from wallet (empty array if none)
 */
export function getWalletHints() {
  const data = loadWalletData();
  return data?.hints || [];
}

/**
 * Set hints on wallet
 */
export function setWalletHints(hints) {
  const data = loadWalletData();
  if (data) {
    data.hints = hints.slice(0, 3); // Max 3 hints
    saveWalletData(data);
  }
}

/**
 * Get the private key - handles encrypted, session, and plain text
 * Returns { privateKey, source } or { error }
 */
export function getPrivateKey(password = null) {
  const data = loadWalletData();
  if (!data) {
    return { error: 'No wallet found. Run: apechurch install' };
  }
  
  // Plain text wallet
  if (!data.encrypted) {
    return { privateKey: data.privateKey, source: 'plain' };
  }
  
  // Encrypted wallet - check session first
  const sessionKey = loadSession();
  if (sessionKey) {
    return { privateKey: sessionKey, source: 'session' };
  }
  
  // Need password
  if (!password) {
    return { error: 'Wallet is locked. Run: apechurch wallet unlock', needsPassword: true, hints: data.hints || [] };
  }
  
  // Try to decrypt
  const decrypted = decryptPrivateKey(data, password);
  if (!decrypted) {
    return { error: 'Wrong password', wrongPassword: true };
  }
  
  return { privateKey: decrypted, source: 'password' };
}

/**
 * Encrypt an existing plain wallet
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
  clearSession(); // Clear any existing session
  return { success: true };
}

/**
 * Decrypt an encrypted wallet (remove password)
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
 * Unlock wallet (start session)
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
// WALLET ACCOUNT FUNCTIONS (public API)
// ============================================================================

/**
 * Check if wallet exists
 */
export function walletExists() {
  return fs.existsSync(WALLET_FILE);
}

/**
 * Get wallet account - may prompt for password if needed
 * For CLI commands, use getPrivateKey() and handle password prompting there
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
 * Create new wallet and save to file (unencrypted by default)
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
 * Create new wallet with encryption
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
  
  // Auto-unlock after creation
  saveSession(privateKey);
  
  return account;
}

// ============================================================================
// CLIENT FUNCTIONS
// ============================================================================

/**
 * Get HTTP transport for ApeChain
 */
export function getTransport() {
  return http();
}

/**
 * Create public and wallet clients
 */
export function createClients(account) {
  const transport = getTransport();
  const publicClient = createPublicClient({ chain: apechain, transport });
  const walletClient = account
    ? createWalletClient({ account, chain: apechain, transport })
    : null;
  return { publicClient, walletClient };
}
