/**
 * @fileoverview Shared utility functions for Ape Church CLI
 *
 * General-purpose helpers used across the codebase:
 * - Input validation and parsing
 * - Cryptographic randomness generation
 * - Error message sanitization for clean JSON output
 * - Numeric formatting and range operations
 *
 * @module lib/utils
 */
import crypto from 'crypto';
import fs from 'fs';
import { ZERO_ADDRESS } from './constants.js';

// ============================================================================
// ADDRESS VALIDATION
// ============================================================================

/**
 * Default referral address
 * Used when user hasn't set a custom referral - ensures attribution for organic users
 */
// Ape Church team address
// const DEFAULT_REFERRAL = '0x0d69B1D26F56DEE4449f5ED3998B0380aAa2FE40';
const DEFAULT_REFERRAL = '0x358635772Fa78ee388b249Cab567A9A35F1D3A28';

/**
 * Validate an Ethereum address and return it, or default referral if invalid
 *
 * Used for referral addresses - we accept any valid address but fall back
 * to the Ape Church team address for invalid/missing inputs.
 * Users can override by setting their own referral via `profile set --referral`.
 *
 * @param {string|null|undefined} address - Address to validate
 * @returns {string} Valid address or DEFAULT_REFERRAL
 *
 * @example
 * getValidRefAddress('0x1234...') // Returns '0x1234...'
 * getValidRefAddress(null)        // Returns DEFAULT_REFERRAL
 * getValidRefAddress('invalid')   // Returns DEFAULT_REFERRAL
 */
export function getValidRefAddress(address) {
  if (!address || typeof address !== 'string') return DEFAULT_REFERRAL;
  const trimmed = address.trim();
  // Basic 40-hex-char check (doesn't validate checksum)
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return trimmed;
  }
  return DEFAULT_REFERRAL;
}

// ============================================================================
// CRYPTOGRAPHIC RANDOMNESS
// ============================================================================

/**
 * Generate cryptographically secure random 32 bytes as hex string
 *
 * Used for:
 * - userRandomWord in game contracts (client-side entropy)
 * - gameId generation for tracking plays
 *
 * @returns {string} 0x-prefixed 64-character hex string (32 bytes)
 *
 * @example
 * randomBytes32() // '0x7a3f...' (66 chars total including 0x)
 */
export function randomBytes32() {
  return `0x${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Generate cryptographically secure random uint256 as BigInt
 *
 * Used for gameId in contract calls - needs to be a large unique identifier
 * that won't collide with other games.
 *
 * @returns {bigint} Random 256-bit unsigned integer
 *
 * @example
 * randomUint256() // 1234567890...n (very large BigInt)
 */
export function randomUint256() {
  return BigInt(`0x${crypto.randomBytes(32).toString('hex')}`);
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Sanitize error messages for clean JSON output
 *
 * Converts verbose viem/RPC errors into human-readable messages.
 * Removes stack traces and technical details that would clutter JSON output.
 *
 * Handles common patterns:
 * - RPC connection failures
 * - Insufficient funds
 * - Contract reverts (extracts revert reason)
 * - Nonce errors
 * - Rate limiting
 * - Gas estimation failures
 *
 * @param {Error|string|null} error - Error object or message to sanitize
 * @returns {string} Human-readable error message (max 200 chars)
 *
 * @example
 * sanitizeError(new Error('execution reverted: Not enough balance'))
 * // Returns: 'Transaction reverted: Not enough balance'
 */
export function sanitizeError(error) {
  if (!error) return 'Unknown error';

  // Extract message from Error object or use string directly
  const msg = error.message || error.shortMessage || String(error);

  // --- RPC/Network Errors ---
  if (msg.includes('could not coalesce') || msg.includes('failed to fetch')) {
    return 'RPC connection failed. Check APECHAIN_RPC_URL or try again.';
  }
  if (msg.includes('network') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
    return 'Network error. Check your connection and RPC URL.';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'Request timed out. The RPC may be slow. Try again.';
  }
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) {
    return 'Rate limited by RPC. Wait a moment and try again.';
  }

  // --- Transaction Errors ---
  if (msg.includes('insufficient funds')) {
    return 'Insufficient funds for transaction.';
  }
  if (msg.includes('execution reverted')) {
    // Try to extract the actual revert reason
    const match = msg.match(/execution reverted[:\s]*(.+?)(?:\n|$)/i);
    return match ? `Transaction reverted: ${match[1].trim()}` : 'Transaction reverted by contract.';
  }
  if (msg.includes('user rejected') || msg.includes('denied')) {
    return 'Transaction was rejected.';
  }
  if (msg.includes('nonce')) {
    return 'Nonce error. A previous transaction may be pending. Wait a moment and retry.';
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

  // --- Fallback: Clean up the message ---
  // Take only the first line (removes stack traces)
  const cleaned = msg.split('\n')[0].trim();

  // Truncate overly long messages
  if (cleaned.length > 200) {
    return cleaned.substring(0, 197) + '...';
  }

  return cleaned;
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

/**
 * Parse and validate a positive integer (> 0)
 *
 * @param {string|number} value - Value to parse
 * @param {string} label - Human-readable name for error messages
 * @returns {number} Parsed positive integer
 * @throws {Error} If value is not a positive integer
 *
 * @example
 * parsePositiveInt('10', 'bet amount') // Returns 10
 * parsePositiveInt('0', 'bet amount')  // Throws: 'bet amount must be a positive integer.'
 */
export function parsePositiveInt(value, label) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

/**
 * Parse and validate a non-negative integer (>= 0)
 *
 * @param {string|number} value - Value to parse
 * @param {string} label - Human-readable name for error messages
 * @returns {number} Parsed non-negative integer
 * @throws {Error} If value is not a non-negative integer
 *
 * @example
 * parseNonNegativeInt('0', 'offset') // Returns 0
 * parseNonNegativeInt('-1', 'offset') // Throws
 */
export function parseNonNegativeInt(value, label) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return parsed;
}

/**
 * Parse an integer and ensure it's within a valid range
 *
 * @param {string|number} value - Value to parse
 * @param {string} label - Human-readable name for error messages
 * @param {number} min - Minimum allowed value (inclusive)
 * @param {number} max - Maximum allowed value (inclusive)
 * @returns {number} Parsed integer within range
 * @throws {Error} If value is not an integer or outside range
 *
 * @example
 * ensureIntRange('50', 'win chance', 5, 95) // Returns 50
 * ensureIntRange('100', 'win chance', 5, 95) // Throws: 'win chance must be between 5 and 95.'
 */
export function ensureIntRange(value, label, min, max) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

// ============================================================================
// NUMERIC OPERATIONS
// ============================================================================

/**
 * Clamp a range to given bounds
 *
 * Used to constrain strategy ranges to game-valid values.
 *
 * @param {number} min - Lower bound of input range
 * @param {number} max - Upper bound of input range
 * @param {number} low - Minimum allowed (clamp floor)
 * @param {number} high - Maximum allowed (clamp ceiling)
 * @returns {[number, number]} Clamped [min, max] tuple
 *
 * @example
 * clampRange(1, 100, 5, 95) // Returns [5, 95]
 * clampRange(10, 50, 5, 95) // Returns [10, 50]
 */
export function clampRange(min, max, low, high) {
  return [Math.max(min, low), Math.min(max, high)];
}

/**
 * Add two BigInt values represented as strings
 *
 * Used for summing wei values without precision loss.
 *
 * @param {string} a - First BigInt as string
 * @param {string} b - Second BigInt as string
 * @returns {string} Sum as string
 *
 * @example
 * addBigIntStrings('1000000000000000000', '500000000000000000')
 * // Returns '1500000000000000000'
 */
export function addBigIntStrings(a, b) {
  return (BigInt(a) + BigInt(b)).toString();
}

/**
 * Format APE amount to 6 decimal places
 *
 * APE uses 18 decimals, but 6 is enough precision for display.
 *
 * @param {number|string} value - APE amount to format
 * @returns {string} Formatted string with 6 decimal places
 *
 * @example
 * formatApeAmount(1.23456789) // Returns '1.234568'
 */
export function formatApeAmount(value) {
  return Number(value).toFixed(6);
}

/**
 * Generate a random integer within an inclusive range
 *
 * Uses Math.random() (not cryptographically secure - fine for game parameter selection).
 *
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (inclusive)
 * @returns {number} Random integer in [min, max]
 *
 * @example
 * randomIntInclusive(1, 10) // Returns 1, 2, 3, ..., or 10
 */
export function randomIntInclusive(min, max) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

/**
 * Choose a value from weighted options
 *
 * Used for strategy-based game selection where some games
 * should be picked more often than others.
 *
 * @param {Array<{value: any, weight: number}>} options - Options with weights
 * @returns {any} The selected option's value
 *
 * @example
 * chooseWeighted([
 *   { value: 'roulette', weight: 3 },
 *   { value: 'plinko', weight: 1 }
 * ]) // Returns 'roulette' ~75% of the time
 */
export function chooseWeighted(options) {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  const roll = Math.random() * total;
  let acc = 0;
  for (const option of options) {
    acc += option.weight;
    if (roll <= acc) return option.value;
  }
  // Fallback to last option (shouldn't happen with valid weights)
  return options[options.length - 1].value;
}

// ============================================================================
// FILE SYSTEM
// ============================================================================

/**
 * Ensure a directory exists, creating it if necessary
 *
 * Creates parent directories as needed (recursive).
 *
 * @param {string} dirPath - Path to directory
 *
 * @example
 * ensureDir('/home/user/.local-cli/skill')
 * // Creates parent directories recursively if they don't exist
 */
export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
