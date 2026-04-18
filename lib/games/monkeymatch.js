/**
 * @fileoverview Monkey Match game handler
 *
 * Poker-style matching game where monkeys pop from barrels.
 *
 * Mechanics:
 * - The contract requests 5 VRF words per round
 * - Each monkey resolves as (randomWord % totalMonkeys) + 1
 * - The 5 monkeys form poker-style hands
 * - Payouts depend only on the final multiplicity pattern
 *
 * Game Modes:
 * - 0 (Low): maps to on-chain mode 1 with 6 monkey types
 *   - Easier to form matches (fewer types = higher collision rate)
 *   - Lower volatility and slightly lower exact RTP
 *
 * - 1 (High): maps to on-chain mode 2 with 7 monkey types
 *   - Harder to match (more variety)
 *   - Higher exact RTP and better mid-tier payouts
 *
 * Hand Rankings (verified on-chain payouts):
 * - Five of a Kind: 50x (same monkey in all 5 barrels)
 * - Four of a Kind: 5x
 * - Full House: 4x
 * - Three of a Kind: 2x in Low, 3x in High
 * - Two Pair: 1.25x in Low, 2x in High
 * - One Pair: 0.2x in Low, 0.1x in High
 * - High Card: 0x (loss)
 *
 * Strategy Note:
 * - There is no post-deal decision tree or redraw phase
 * - "Best play" reduces to mode selection only
 * - High has the higher exact RTP; Low is the lower-variance option
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
import { ensureIntRange } from '../utils.js';
import { getGameOptionLabel, parseGameConfigValue } from '../game-config.js';
import { getStaticVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Human-readable mode names
 * @type {Object<number, string>}
 */
const MODE_NAMES = {
  1: 'Low',
  2: 'High',
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
 * @param {number} [params.mode] - On-chain mode 1-2 (default: 1 = Low)
 * @param {string} [params.referral] - Referral address
 * @param {number} params.timeoutMs - How long to wait for result
 *
 * @returns {Promise<Object>} Game response with status and result
 * @throws {Error} If parameters are invalid or transaction fails
 *
 * @example
 * // Low mode (6 monkey types, easier matches)
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
 * // High mode (7 monkey types, better mid payouts)
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
  risk,
  mode,
  referral,
  gpPerApe,
  timeoutMs,
}) {
  // Validate referral address
  const refAddress = getValidRefAddress(referral);

  // Generate unique identifiers
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  const gameMode = ensureIntRange(
    mode ?? risk ?? gameEntry.config.mode.default,
    'mode',
    gameEntry.config.mode.min,
    gameEntry.config.mode.max,
  );

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
    modeName: getGameOptionLabel(gameEntry, 'mode', gameMode, MODE_NAMES[gameMode] || 'Low'),
    risk: gameMode - 1,
    riskName: getGameOptionLabel(gameEntry, 'mode', gameMode, MODE_NAMES[gameMode] || 'Low'),
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
    gpPerApe,
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
 * - There is no intra-game solver for Monkey Match
 * - If risk is omitted, default to Low
 * - High has the higher exact RTP; Low is the lower-variance option
 *
 * @param {Object} opts - CLI options
 * @param {Object} positionalConfig - Parsed positional arguments
 * @param {Object} strategyConfig - Strategy configuration (unused for this game)
 * @param {Function} randomIntInclusive - Random number generator (unused)
 * @returns {Object} { mode: number }
 */
export function getMonkeyMatchConfig(opts, positionalConfig, gameEntry, strategyConfig, randomIntInclusive, options = {}) {
  const config = {};

  if (opts.risk !== undefined) {
    config.mode = parseGameConfigValue(gameEntry, 'mode', opts.risk, { numericKind: 'public' });
  } else if (positionalConfig.risk !== undefined) {
    config.mode = parseGameConfigValue(gameEntry, 'mode', positionalConfig.risk, { numericKind: 'public' });
  } else if (options.preferGameDefault) {
    config.mode = gameEntry.config.mode.default;
  } else {
    config.mode = gameEntry.config.mode.default;
  }

  config.mode = ensureIntRange(
    config.mode,
    'mode',
    gameEntry.config.mode.min,
    gameEntry.config.mode.max,
  );

  return config;
}
