/**
 * @fileoverview Shared Plinko-style game handler (Jungle Plinko, Cosmic Plinko)
 *
 * Ball-drop game inspired by the classic Plinko board.
 *
 * Shared mechanics:
 * - Drop balls from the top of a pegged board
 * - Visual gameplay presents balls bouncing through pegs into multiplier buckets
 * - Wager is split evenly across all balls
 * - On-chain, each ball resolves from a single VRF-derived weighted bucket draw
 *   using the selected mode's cumulative bucket table
 * - Exact RTP is therefore mode-specific and ball-count invariant, except for
 *   wei rounding when total wager is not evenly divisible by ball count
 *
 * Parameters are game-specific and validated from the registry entry.
 * Jungle uses modes 0-4 and 1-100 balls. Cosmic uses modes 0-2 and 1-30 balls.
 *
 * VRF Cost:
 * - Jungle Plinko uses a custom gas formula based on ball count
 * - Cosmic Plinko uses a static VRF fee
 *
 * On-chain encoding:
 * - gameMode: uint8 (0-4)
 * - numBalls: uint8 (1-100)
 * - gameId: uint256
 * - ref: address (referral)
 * - userRandomWord: bytes32 (client entropy)
 *
 * @module lib/games/plinko
 */
import { encodeAbiParameters } from 'viem';
import { clampRange, ensureIntRange } from '../utils.js';
import { getGameOptionLabel, parseGameConfigValue } from '../game-config.js';
import { getPlinkoVrfFee, getStaticVrfFee, executeGame, resolveGamePayloadInputs } from './base.js';

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Play a Plinko game
 *
 * @param {Object} params - Game parameters
 * @param {import('viem/accounts').PrivateKeyAccount} params.account - Player's account
 * @param {import('viem').PublicClient} params.publicClient - viem public client
 * @param {import('viem').WalletClient} params.walletClient - viem wallet client
 * @param {Object} params.gameEntry - Game registry entry
 * @param {bigint} params.wager - Total wager in wei (split across all balls)
 * @param {number} [params.mode] - Risk mode, validated against the selected game config
 * @param {number} [params.balls] - Number of balls, validated against the selected game config
 * @param {string} [params.referral] - Referral address
 * @param {number} params.timeoutMs - How long to wait for result
 *
 * @returns {Promise<Object>} Game response with status and result
 * @throws {Error} If parameters are invalid or transaction fails
 *
 * @example
 * // Jungle: medium risk, 50 balls
 * const result = await playPlinko({
 *   account,
 *   publicClient,
 *   walletClient,
 *   gameEntry,
 *   wager: parseEther('10'),
 *   mode: 2,
 *   balls: 50,
 *   timeoutMs: 30000,
 * });
 *
 * // Cosmic: high risk, fewer balls (more variance)
 * const result = await playPlinko({
 *   ...params,
 *   mode: 2,
 *   balls: 10,
 * });
 */
export async function playPlinko({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  risk,
  mode,
  balls,
  referral,
  xGameId,
  xRef,
  xUserRandomWord,
  gpPerApe,
  timeoutMs,
}) {
  const { gameId, refAddress, userRandomWord } = resolveGamePayloadInputs({
    referral,
    xGameId,
    xRef,
    xUserRandomWord,
  });

  // Validate and normalize parameters using game config limits
  const modeValue = ensureIntRange(
    mode ?? risk ?? gameEntry.config.mode.default,
    'mode',
    gameEntry.config.mode.min,
    gameEntry.config.mode.max
  );
  const ballsValue = ensureIntRange(
    balls ?? gameEntry.config.balls.default,
    'balls',
    gameEntry.config.balls.min,
    gameEntry.config.balls.max
  );

  let vrfFee;
  if (gameEntry.vrf.type === 'plinko') {
    const customGasLimit = gameEntry.vrf.baseGas + (ballsValue * gameEntry.vrf.perUnitGas);
    vrfFee = await getPlinkoVrfFee(publicClient, gameEntry.contract, customGasLimit);
  } else {
    vrfFee = await getStaticVrfFee(publicClient, gameEntry.contract);
  }

  // Encode game data for contract
  const encodedData = encodeAbiParameters(
    [
      { name: 'gameMode', type: 'uint8' },
      { name: 'numBalls', type: 'uint8' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [modeValue, ballsValue, gameId, refAddress, userRandomWord]
  );

  const config = {
    mode: modeValue,
    modeName: getGameOptionLabel(gameEntry, 'mode', modeValue, `Risk ${modeValue}`),
    risk: modeValue,
    riskName: getGameOptionLabel(gameEntry, 'mode', modeValue, `Risk ${modeValue}`),
    balls: ballsValue,
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
 * Get Plinko config from CLI options or strategy
 *
 * Resolution order for each parameter:
 * 1. Explicit CLI flag (--risk, --balls)
 * 2. Positional argument from CLI
 * 3. Default to the game's lowest-risk mode, then strategy/random for balls
 *
 * @param {Object} opts - CLI options
 * @param {Object} positionalConfig - Parsed positional arguments
 * @param {Object} gameEntry - Game registry entry (for defaults)
 * @param {Object} strategyConfig - Strategy configuration
 * @param {Function} randomIntInclusive - Random number generator
 * @returns {Object} { mode: number, balls: number }
 *
 * @example
 * // Strategy 'conservative' has mode [0,1] and balls [80,100]
 * getPlinkoConfig({}, {}, gameEntry, conservativeConfig, randomIntInclusive)
 * // Returns: { mode: 1, balls: 92 } (random within ranges)
 */
export function getPlinkoConfig(opts, positionalConfig, gameEntry, strategyConfig, randomIntInclusive, options = {}) {
  const preferGameDefault = Boolean(options.preferGameDefault);
  const config = {};
  const strategyBalls = Array.isArray(strategyConfig.plinko?.balls)
    ? strategyConfig.plinko.balls
    : [gameEntry.config.balls.default, gameEntry.config.balls.default];

  if (opts.risk !== undefined) {
    config.mode = parseGameConfigValue(gameEntry, 'mode', opts.risk, { numericKind: 'public' });
  } else if (positionalConfig.risk !== undefined) {
    config.mode = parseGameConfigValue(gameEntry, 'mode', positionalConfig.risk, { numericKind: 'public' });
  } else {
    config.mode = gameEntry.config.mode.default;
  }

  // Resolve balls
  if (opts.balls !== undefined) {
    config.balls = parseInt(opts.balls);
  } else if (positionalConfig.balls !== undefined) {
    config.balls = positionalConfig.balls;
  } else if (preferGameDefault) {
    config.balls = gameEntry.config.balls.default;
  } else {
    const [ballMin, ballMax] = clampRange(
      strategyBalls[0],
      strategyBalls[1],
      gameEntry.config.balls.min,
      gameEntry.config.balls.max
    );
    config.balls = randomIntInclusive(ballMin, ballMax);
  }

  return config;
}
