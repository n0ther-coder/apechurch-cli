/**
 * Wallet and client management for Ape Church CLI
 */
import fs from 'fs';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { apechain, WALLET_FILE, APECHURCH_DIR } from './constants.js';
import { ensureDir } from './utils.js';

/**
 * Load wallet from file
 */
export function getWallet() {
  if (!fs.existsSync(WALLET_FILE)) {
    console.error(JSON.stringify({ error: 'No wallet found. Human must run install.' }));
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
  return privateKeyToAccount(data.privateKey);
}

/**
 * Check if wallet exists
 */
export function walletExists() {
  return fs.existsSync(WALLET_FILE);
}

/**
 * Create new wallet and save to file
 */
export function createNewWallet() {
  ensureDir(APECHURCH_DIR);
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  fs.writeFileSync(WALLET_FILE, JSON.stringify({ privateKey }, null, 2));
  return account;
}

/**
 * Load wallet data (for export)
 */
export function loadWalletData() {
  if (!fs.existsSync(WALLET_FILE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
}

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
