/**
 * @fileoverview Monkey Match game handler
 *
 * Poker-style matching game where monkeys pop from barrels.
 *
 * Mechanics:
 * - 5 barrels each reveal a random monkey
 * - Monkeys form poker-style hands
 * - Payouts based on hand strength
 * - Two risk modes affect monkey pool size
 *
 * Game Modes:
 * - 1 (Low Risk): 6 monkey types
 *   - Easier to form matches (fewer types = higher collision rate)
 *   - Lower payouts to compensate
 *
 * - 2 (Normal Risk): 7 monkey types
 *   - Harder to match (more variety)
 *   - Better mid-tier payouts
 *
 * Hand Rankings (approximate payouts):
 * - Five of a Kind: 50x (same monkey in all 5 barrels)
 * - Four of a Kind: ~15x
 * - Full House: ~8x (three + two of same type)
 * - Three of a Kind: ~3x
 * - Two Pair: ~2x
 * - One Pair: ~1.2x
 * - High Card: 0x (loss)
 *
 * Strategy Note:
 * - Low Risk is better for consistent small wins
 * - Normal Risk has better mid-tier payouts but harder to hit
 * - For auto-play, Low Risk is generally preferred (lower variance)
 *
 * On-chain encoding:
 * - gameMode: uint8 (1 or 2)
 * - gameId: uint256
 * - ref: address (referral)
 * - userRandomWord: bytes32 (client entropy)
 *
 * @module lib/games/monkeymatch
 */
import { encodeAbiParameters } from 'viem';
import { getStaticVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Human-readable mode names
 * @type {Object<number, string>}
 */
const MODE_NAMES = {
  1: 'Low Risk',
  2: 'Normal Risk',
};

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Play Monkey Match
 *
 * @param {Object} params - Game parameters
 * @param {import('viem/accounts').PrivateKeyAccount} params.account - Player's account
 * @param {import('viem').PublicClient} params.publicClient - viem public client
 * @param {import('viem').WalletClient} params.walletClient - viem wallet client
 * @param {Object} params.gameEntry - Game registry entry
 * @param {bigint} params.wager - Wager in wei
 * @param {number} [params.mode] - Game mode 1-2 (default: 1 = Low Risk)
 * @param {string} [params.referral] - Referral address
 * @param {number} params.timeoutMs - How long to wait for result
 *
 * @returns {Promise<Object>} Game response with status and result
 * @throws {Error} If parameters are invalid or transaction fails
 *
 * @example
 * // Low Risk mode (6 monkey types, easier matches)
 * const result = await playMonkeyMatch({
 *   account,
 *   publicClient,
 *   walletClient,
 *   gameEntry,
 *   wager: parseEther('10'),
 *   mode: 1,
 *   timeoutMs: 30000,
 * });
 *
 * // Normal Risk mode (7 monkey types, better mid payouts)
 * const result = await playMonkeyMatch({
 *   ...params,
 *   mode: 2,
 * });
 */
export async function playMonkeyMatch({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  mode,
  referral,
  timeoutMs,
}) {
  // Validate referral address
  const refAddress = getValidRefAddress(referral);

  // Generate unique identifiers
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  // Validate mode (1=Low Risk, 2=Normal Risk), default to Low Risk
  let gameMode = mode ?? gameEntry.config.mode.default;
  if (gameMode < 1) gameMode = 1;
  if (gameMode > 2) gameMode = 2;

  // Get static VRF fee (single draw, similar to slots)
  const vrfFee = await getStaticVrfFee(publicClient, gameEntry.contract);

  // Encode game data for contract
  const encodedData = encodeAbiParameters(
    [
      { name: 'gameMode', type: 'uint8' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [gameMode, gameId, refAddress, userRandomWord]
  );

  const config = {
    mode: gameMode,
    modeName: MODE_NAMES[gameMode] || 'Low Risk',
  };

  return executeGame({
    account,
    publicClient,
    walletClient,
    contractAddress: gameEntry.contract,
    encodedData,
    wager,
    vrfFee,
    gameId,
    gameEntry,
    config,
    timeoutMs,
  });
}

// ============================================================================
// CONFIG GETTER
// ============================================================================

/**
 * Get Monkey Match config from CLI options or strategy
 *
 * Strategy logic:
 * - Auto-play favors Low Risk (70%) for consistency
 * - Occasionally Normal Risk (30%) for variety
 *
 * @param {Object} opts - CLI options
 * @param {Object} positionalConfig - Parsed positional arguments
 * @param {Object} strategyConfig - Strategy configuration (unused for this game)
 * @param {Function} randomIntInclusive - Random number generator (unused)
 * @returns {Object} { mode: number }
 */
export function getMonkeyMatchConfig(opts, positionalConfig, strategyConfig, randomIntInclusive) {
  const config = {};

  // Determine mode (1=Low Risk, 2=Normal Risk)
  if (opts.mode !== undefined) {
    config.mode = parseInt(opts.mode);
  } else if (positionalConfig.mode !== undefined) {
    config.mode = positionalConfig.mode;
  } else {
    // For auto-play: 70% Low Risk, 30% Normal Risk
    config.mode = Math.random() < 0.7 ? 1 : 2;
  }

  // Clamp to valid range
  if (config.mode < 1) config.mode = 1;
  if (config.mode > 2) config.mode = 2;

  return config;
}
