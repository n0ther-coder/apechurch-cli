/**
 * @fileoverview Wallet and client management for Ape Church CLI
 *
 * Security model:
 * - wallet.json stores only encrypted private key material plus public metadata
 * - plaintext private keys are never written to disk
 * - no decrypted-key session cache exists
 * - signing is always local and decrypts the key just-in-time for each signature
 * - password prompting occurs only immediately before a signature when not supplied via env
 *
 * @module lib/wallet
 */
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import readline from 'readline';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount, toAccount } from 'viem/accounts';
import {
  apechain,
  WALLET_FILE,
  WALLETS_DIR,
  APECHURCH_DIR,
  PASS_ENV_VAR,
  PRIVATE_KEY_ENV_VAR,
  BINARY_NAME,
} from './constants.js';
import { ensureDir } from './utils.js';

const SCRYPT_PARAMS = { N: 2 ** 14, r: 8, p: 1 };
const WALLET_SCHEMA_VERSION = 2;

function zeroBuffer(buf) {
  if (Buffer.isBuffer(buf)) buf.fill(0);
}

export function promptSecret(question = 'Password: ') {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: false,
    });
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stderr = process.stderr;
    let value = '';

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stderr.write('\n');
    };

    const onData = (chunk) => {
      const char = chunk.toString('utf8');

      if (char === '\u0003') {
        cleanup();
        reject(new Error('Password prompt cancelled by user.'));
        return;
      }
      if (char === '\r' || char === '\n') {
        cleanup();
        resolve(value);
        return;
      }
      if (char === '\u007f' || char === '\b' || chunk[0] === 8) {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };

    stderr.write(question);
    stdin.resume();
    stdin.setRawMode(true);
    stdin.on('data', onData);
  });
}

export function encryptPrivateKey(privateKey, password) {
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32, SCRYPT_PARAMS);

  try {
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.isBuffer(privateKey)
      ? Buffer.concat([cipher.update(privateKey), cipher.final()])
      : Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      ciphertext: encrypted.toString('hex'),
    };
  } finally {
    zeroBuffer(key);
    zeroBuffer(salt);
    zeroBuffer(iv);
  }
}

function decryptPrivateKeyBuffer(encryptedData, password) {
  let salt;
  let iv;
  let authTag;
  let ciphertext;
  let key;
  let decrypted;
  let success = false;

  try {
    salt = Buffer.from(encryptedData.salt, 'hex');
    iv = Buffer.from(encryptedData.iv, 'hex');
    authTag = Buffer.from(encryptedData.authTag, 'hex');
    ciphertext = Buffer.from(encryptedData.ciphertext, 'hex');
    key = crypto.scryptSync(password, salt, 32, SCRYPT_PARAMS);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    success = true;
    return decrypted;
  } catch {
    return null;
  } finally {
    zeroBuffer(salt);
    zeroBuffer(iv);
    zeroBuffer(authTag);
    zeroBuffer(ciphertext);
    zeroBuffer(key);
    if (!success) zeroBuffer(decrypted);
  }
}

function decryptPrivateKey(encryptedData, password) {
  const decrypted = decryptPrivateKeyBuffer(encryptedData, password);
  if (!decrypted) return null;

  try {
    return decrypted.toString('utf8');
  } finally {
    zeroBuffer(decrypted);
  }
}

export function walletExists() {
  return fs.existsSync(WALLET_FILE);
}

export function loadWalletData() {
  if (!walletExists()) return null;
  return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
}

function isEncryptedWalletData(data) {
  return Boolean(
    data &&
    data.encrypted === true &&
    typeof data.ciphertext === 'string' &&
    typeof data.salt === 'string' &&
    typeof data.iv === 'string' &&
    typeof data.authTag === 'string' &&
    typeof data.address === 'string'
  );
}

function assertNoPlaintextKeyInWalletData(data) {
  if (data && 'privateKey' in data) {
    throw new Error('Refusing to write plaintext private keys to wallet.json.');
  }
}

export function saveWalletData(data) {
  assertNoPlaintextKeyInWalletData(data);
  ensureDir(APECHURCH_DIR);
  fs.writeFileSync(WALLET_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function normalizeStoredWalletAddress(address) {
  const normalized = String(address || '').trim().toLowerCase();
  return normalized || null;
}

function writeWalletFile(filePath, data) {
  assertNoPlaintextKeyInWalletData(data);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function readStoredWalletFile(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (typeof data?.address !== 'string' || !data.address.trim()) {
      return null;
    }

    return {
      data,
      address: data.address,
      normalizedAddress: normalizeStoredWalletAddress(data.address),
      filePath,
    };
  } catch {
    return null;
  }
}

export function getWalletArchiveFilePath(address) {
  const normalizedAddress = normalizeStoredWalletAddress(address);
  if (!normalizedAddress) {
    return null;
  }

  ensureDir(WALLETS_DIR);
  return path.join(WALLETS_DIR, `${normalizedAddress}.json`);
}

export function archiveWalletData(data) {
  if (typeof data?.address !== 'string' || !data.address.trim()) {
    throw new Error('Wallet data is missing an address.');
  }

  const filePath = getWalletArchiveFilePath(data.address);
  writeWalletFile(filePath, data);
  return {
    address: data.address,
    filePath,
  };
}

export function archiveCurrentWallet() {
  const data = loadWalletData();
  if (!data) {
    return null;
  }

  return archiveWalletData(data);
}

export function listStoredWallets() {
  const wallets = [];
  const seenAddresses = new Set();
  const currentWallet = readStoredWalletFile(WALLET_FILE);

  if (currentWallet?.normalizedAddress) {
    wallets.push({
      ...currentWallet,
      isCurrent: true,
    });
    seenAddresses.add(currentWallet.normalizedAddress);
  }

  if (!fs.existsSync(WALLETS_DIR)) {
    return wallets;
  }

  const walletFiles = fs.readdirSync(WALLETS_DIR)
    .filter(fileName => fileName.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));

  for (const fileName of walletFiles) {
    const entry = readStoredWalletFile(path.join(WALLETS_DIR, fileName));
    if (!entry?.normalizedAddress || seenAddresses.has(entry.normalizedAddress)) {
      continue;
    }

    wallets.push({
      ...entry,
      isCurrent: false,
    });
    seenAddresses.add(entry.normalizedAddress);
  }

  return wallets;
}

export function findStoredWallet(address) {
  const normalizedAddress = normalizeStoredWalletAddress(address);
  if (!normalizedAddress) {
    return null;
  }

  return listStoredWallets().find(wallet => wallet.normalizedAddress === normalizedAddress) || null;
}

export function selectStoredWallet(address) {
  const wallet = findStoredWallet(address);
  if (!wallet) {
    return { error: `Wallet not found: ${address}` };
  }

  if (wallet.isCurrent) {
    return {
      success: true,
      changed: false,
      address: wallet.address,
    };
  }

  saveWalletData(wallet.data);
  return {
    success: true,
    changed: true,
    address: wallet.address,
    filePath: wallet.filePath,
  };
}

export function isWalletEncrypted() {
  const data = loadWalletData();
  return isEncryptedWalletData(data);
}

export function getWalletHints() {
  const data = loadWalletData();
  return Array.isArray(data?.hints) ? data.hints : [];
}

export function setWalletHints(hints) {
  const data = loadWalletData();
  if (!isEncryptedWalletData(data)) {
    throw new Error('Wallet must be encrypted before hints can be updated.');
  }
  saveWalletData({
    ...data,
    hints: hints.slice(0, 3),
    updatedAt: new Date().toISOString(),
  });
}

export function getWalletAddress() {
  const data = loadWalletData();
  if (!data) return null;
  if (typeof data.address === 'string') return data.address;
  return null;
}

export function getWalletPublicMetadata() {
  const data = loadWalletData();
  if (!data) return null;
  return {
    encrypted: isEncryptedWalletData(data),
    address: getWalletAddress(),
    publicKey: typeof data.publicKey === 'string' ? data.publicKey : null,
    hints: Array.isArray(data.hints) ? data.hints : [],
    version: data.version || null,
  };
}

async function resolveSigningPassword() {
  if (process.env[PASS_ENV_VAR]) {
    return process.env[PASS_ENV_VAR];
  }
  return promptSecret('🔐 Password (local only): ');
}

async function withDecryptedPrivateKey(action) {
  const data = loadWalletData();
  if (!data) {
    throw new Error(`No wallet found. Run: ${BINARY_NAME} install`);
  }
  if (!isEncryptedWalletData(data)) {
    throw new Error('Wallet file is invalid or not encrypted.');
  }

  let password;
  let privateKey;
  try {
    password = await resolveSigningPassword();
    privateKey = decryptPrivateKey(data, password);
    if (!privateKey) {
      throw new Error('Wrong password or corrupted wallet data.');
    }
    return await action(privateKey);
  } finally {
    password = null;
    privateKey = null;
  }
}

function buildSigningAccount(data) {
  const base = toAccount({
    address: data.address,
    async sign(parameters) {
      return withDecryptedPrivateKey(async (privateKey) => privateKeyToAccount(privateKey).sign(parameters));
    },
    async signAuthorization(parameters) {
      return withDecryptedPrivateKey(async (privateKey) => privateKeyToAccount(privateKey).signAuthorization(parameters));
    },
    async signMessage({ message }) {
      return withDecryptedPrivateKey(async (privateKey) => privateKeyToAccount(privateKey).signMessage({ message }));
    },
    async signTransaction(transaction, options) {
      return withDecryptedPrivateKey(async (privateKey) => privateKeyToAccount(privateKey).signTransaction(transaction, options));
    },
    async signTypedData(typedData) {
      return withDecryptedPrivateKey(async (privateKey) => privateKeyToAccount(privateKey).signTypedData(typedData));
    },
  });

  return {
    ...base,
    publicKey: data.publicKey,
    source: 'encrypted-local',
  };
}

export function getWallet() {
  const data = loadWalletData();
  if (!data) {
    console.error(JSON.stringify({ error: `No wallet found. Run: ${BINARY_NAME} install` }));
    process.exit(1);
  }
  if (!isEncryptedWalletData(data)) {
    console.error(JSON.stringify({ error: 'Wallet file is invalid or not encrypted.' }));
    process.exit(1);
  }
  return buildSigningAccount(data);
}

export function createEncryptedWalletFromPrivateKey(privateKey, password, hints = []) {
  ensureDir(APECHURCH_DIR);
  const account = privateKeyToAccount(privateKey);
  const encrypted = encryptPrivateKey(privateKey, password);
  const data = {
    version: WALLET_SCHEMA_VERSION,
    encrypted: true,
    address: account.address,
    publicKey: account.publicKey,
    ...encrypted,
    hints: hints.slice(0, 3),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveWalletData(data);
  return { address: account.address, publicKey: account.publicKey };
}

export function getConfiguredPrivateKey() {
  const value = process.env[PRIVATE_KEY_ENV_VAR];
  if (!value) return null;
  return value.startsWith('0x') ? value : `0x${value}`;
}

export function rotateEncryptedWalletPassword(currentPassword, newPassword) {
  const data = loadWalletData();
  if (!data) return { error: 'No wallet found' };
  if (!isEncryptedWalletData(data)) {
    return { error: 'Wallet file is invalid or not encrypted' };
  }

  let decryptedPrivateKey;
  try {
    decryptedPrivateKey = decryptPrivateKeyBuffer(data, currentPassword);
    if (!decryptedPrivateKey) {
      return { error: 'Wrong current password or corrupted wallet data.' };
    }

    const encrypted = encryptPrivateKey(decryptedPrivateKey, newPassword);
    saveWalletData({
      ...data,
      ...encrypted,
      updatedAt: new Date().toISOString(),
    });

    return {
      success: true,
      address: data.address,
      hintsCount: Array.isArray(data.hints) ? data.hints.length : 0,
    };
  } catch (error) {
    return { error: error.message || 'Failed to rotate wallet password' };
  } finally {
    zeroBuffer(decryptedPrivateKey);
  }
}

export function createClients(account) {
  const transport = http();
  const publicClient = createPublicClient({ chain: apechain, transport });
  const walletClient = account
    ? createWalletClient({ account, chain: apechain, transport })
    : null;
  return { publicClient, walletClient };
}
