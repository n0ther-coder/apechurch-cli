/**
 * Shared utility functions for Ape Church CLI
 */
import crypto from 'crypto';
import fs from 'fs';
import { ZERO_ADDRESS } from './constants.js';

/**
 * Validate EVM address and return it or ZERO_ADDRESS
 */
export function getValidRefAddress(address) {
  if (!address || typeof address !== 'string') return ZERO_ADDRESS;
  const trimmed = address.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return trimmed;
  }
  return ZERO_ADDRESS;
}

/**
 * Generate random 32 bytes as hex string
 */
export function randomBytes32() {
  return `0x${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Generate random uint256 as BigInt
 */
export function randomUint256() {
  return BigInt(`0x${crypto.randomBytes(32).toString('hex')}`);
}

/**
 * Sanitize error messages for clean JSON output (no stack traces)
 */
export function sanitizeError(error) {
  if (!error) return 'Unknown error';
  
  const msg = error.message || error.shortMessage || String(error);
  
  // Common viem/RPC error patterns
  if (msg.includes('could not coalesce') || msg.includes('failed to fetch')) {
    return 'RPC connection failed. Check APECHAIN_RPC_URL or try again.';
  }
  if (msg.includes('insufficient funds')) {
    return 'Insufficient funds for transaction.';
  }
  if (msg.includes('execution reverted')) {
    const match = msg.match(/execution reverted[:\s]*(.+?)(?:\n|$)/i);
    return match ? `Transaction reverted: ${match[1].trim()}` : 'Transaction reverted by contract.';
  }
  if (msg.includes('user rejected') || msg.includes('denied')) {
    return 'Transaction was rejected.';
  }
  if (msg.includes('nonce')) {
    return 'Nonce error. A previous transaction may be pending. Wait a moment and retry.';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'Request timed out. The RPC may be slow. Try again.';
  }
  if (msg.includes('network') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
    return 'Network error. Check your connection and RPC URL.';
  }
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) {
    return 'Rate limited by RPC. Wait a moment and try again.';
  }
  if (msg.includes('gas') && msg.includes('exceed')) {
    return 'Transaction would exceed gas limits. Try a smaller bet or fewer balls/spins.';
  }
  if (msg.includes('underpriced') || msg.includes('replacement')) {
    return 'Transaction underpriced. Network may be congested. Retry shortly.';
  }
  if (msg.includes('already known')) {
    return 'Transaction already submitted. Check your history.';
  }
  
  // Remove stack traces and long technical details
  const cleaned = msg.split('\n')[0].trim();
  
  // Limit length
  if (cleaned.length > 200) {
    return cleaned.substring(0, 197) + '...';
  }
  
  return cleaned;
}

/**
 * Parse and validate positive integer
 */
export function parsePositiveInt(value, label) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

/**
 * Parse and validate non-negative integer
 */
export function parseNonNegativeInt(value, label) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return parsed;
}

/**
 * Ensure integer is within range
 */
export function ensureIntRange(value, label, min, max) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

/**
 * Clamp a range to given bounds
 */
export function clampRange(min, max, low, high) {
  return [Math.max(min, low), Math.min(max, high)];
}

/**
 * Add two BigInt strings
 */
export function addBigIntStrings(a, b) {
  return (BigInt(a) + BigInt(b)).toString();
}

/**
 * Format APE amount to 6 decimal places
 */
export function formatApeAmount(value) {
  return Number(value).toFixed(6);
}

/**
 * Random integer inclusive of min and max
 */
export function randomIntInclusive(min, max) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

/**
 * Choose from weighted options
 */
export function chooseWeighted(options) {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  const roll = Math.random() * total;
  let acc = 0;
  for (const option of options) {
    acc += option.weight;
    if (roll <= acc) return option.value;
  }
  return options[options.length - 1].value;
}

/**
 * Ensure directory exists
 */
export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
