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
 * - 1 (Low Risk): 6 monkey types
 *   - Easier to form matches (fewer types = higher collision rate)
 *   - Lower volatility and slightly lower exact RTP
 *
 * - 2 (Normal Risk): 7 monkey types
 *   - Harder to match (more variety)
 *   - Higher exact RTP and better mid-tier payouts
 *
 * Hand Rankings (verified on-chain payouts):
 * - Five of a Kind: 50x (same monkey in all 5 barrels)
 * - Four of a Kind: 5x
 * - Full House: 4x
 * - Three of a Kind: 2x in Low Risk, 3x in Normal Risk
 * - Two Pair: 1.25x in Low Risk, 2x in Normal Risk
 * - One Pair: 0.2x in Low Risk, 0.1x in Normal Risk
 * - High Card: 0x (loss)
 *
 * Strategy Note:
 * - There is no post-deal decision tree or redraw phase
 * - "Best play" reduces to mode selection only
 * - Normal Risk has the higher exact RTP; Low Risk is the lower-variance option
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
  gpPerApe,
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
 * - If no mode is specified, the CLI keeps a lower-variance 70/30 Low/Normal default
 * - For highest exact RTP, users should explicitly choose mode 2
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
