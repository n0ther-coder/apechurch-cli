/**
 * @fileoverview Speed Keno game handler
 *
 * Fast-paced keno variant with batched games for efficiency.
 *
 * Differences from regular Keno:
 * - Smaller pool: Pick 1-5 numbers from 1-20 (vs 1-10 from 1-40)
 * - Batching: Play 1-20 games in a single transaction
 * - Higher hit rates due to smaller pool
 * - Lower max payouts (2000x for 5/5 vs 1,000,000x for 10/10)
 *
 * Mechanics:
 * - Player picks 1-5 unique numbers from pool of 1-20
 * - Specifies how many games to batch (1-20)
 * - The wager is split across all games with Solidity floor division
 * - Each game requests 5 winning numbers without replacement
 * - The contract uses Pyth V2 RNG with a custom gas limit that scales by batch size
 * - Results aggregate in single response
 *
 * Verified On-Chain Payout Examples:
 * - 1 pick: 0 hits = 0.5x, 1 hit = 2.4x
 * - 3 picks: 0 or 1 hit = 0.5x, 2 hits = 2.5x, 3 hits = 25x
 * - 5 picks: 0 hits = 1.25x, 4 hits = 35x, 5 hits = 2,000x
 *
 * Strategy Notes:
 * - There is no post-bet action tree or solver for Speed Keno
 * - Because each draw is symmetric over the 20-number board, the specific
 *   chosen numbers do not change RTP; only the pick count matters
 * - 5 picks has the highest exact RTP
 * - Batch count mainly affects variance and fee efficiency, not per-game EV
 *
 * On-chain encoding:
 * - numGames: uint8 (1-20)
 * - gameNumbers: uint8[] (1-5 values, each 1-20)
 * - gameId: uint256
 * - ref: address (referral)
 * - userRandomWord: bytes32 (client entropy)
 *
 * @module lib/games/speedkeno
 */
import { encodeAbiParameters } from 'viem';
import { getPlinkoVrfFee, executeGame, resolveGamePayloadInputs } from './base.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Base gas for VRF fee calculation
 * @type {number}
 */
const BASE_GAS = 325000;

/**
 * Additional gas per batched game
 * @type {number}
 */
const GAS_PER_GAME = 55000;

// ============================================================================
// NUMBER GENERATION/PARSING
// ============================================================================

/**
 * Generate random unique numbers for Speed Keno (1-20 pool)
 *
 * @param {number} count - How many numbers to generate (1-5)
 * @returns {number[]} Sorted array of unique numbers
 */
function generateRandomPicks(count) {
  const picks = new Set();
  while (picks.size < count) {
    const num = Math.floor(Math.random() * 20) + 1; // 1-20
    picks.add(num);
  }
  return Array.from(picks).sort((a, b) => a - b);
}

/**
 * Parse speed keno numbers from user input or generate random picks
 *
 * @param {string|null} input - Comma-separated numbers or "random"
 * @param {number} pickCount - How many numbers to pick (for random generation)
 * @returns {number[]} Sorted array of unique numbers
 * @throws {Error} If numbers are invalid, duplicated, or out of range
 *
 * @example
 * parseSpeedKenoNumbers('1,7,13', 3)  // Returns [1, 7, 13]
 * parseSpeedKenoNumbers('random', 3)  // Returns 3 random numbers from 1-20
 */
export function parseSpeedKenoNumbers(input, pickCount) {
  // If no input or "random", generate random picks
  if (!input || input.toLowerCase() === 'random') {
    return generateRandomPicks(pickCount);
  }

  // Parse comma-separated numbers
  const parts = input.split(',').map(s => s.trim()).filter(s => s.length > 0);
  const numbers = [];
  const seen = new Set();

  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 1 || num > 20) {
      throw new Error(`Invalid speed keno number: "${part}". Must be 1-20.`);
    }
    if (seen.has(num)) {
      throw new Error(`Duplicate number: ${num}. Each number can only be picked once.`);
    }
    seen.add(num);
    numbers.push(num);
  }

  if (numbers.length < 1 || numbers.length > 5) {
    throw new Error(`Must pick 1-5 numbers. You picked ${numbers.length}.`);
  }

  return numbers.sort((a, b) => a - b);
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Play a Speed Keno game
 *
 * @param {Object} params - Game parameters
 * @param {import('viem/accounts').PrivateKeyAccount} params.account - Player's account
 * @param {import('viem').PublicClient} params.publicClient - viem public client
 * @param {import('viem').WalletClient} params.walletClient - viem wallet client
 * @param {Object} params.gameEntry - Game registry entry
 * @param {bigint} params.wager - Total wager in wei (split across all games)
 * @param {number} [params.picks] - Number of picks 1-5 (default: 3)
 * @param {string} [params.numbers] - Specific numbers "1,7,13" or "random"
 * @param {number} [params.games] - Number of batched games 1-20 (default: 5)
 * @param {string} [params.referral] - Referral address
 * @param {number} params.timeoutMs - How long to wait for result
 *
 * @returns {Promise<Object>} Game response with status and result
 * @throws {Error} If parameters are invalid or transaction fails
 *
 * @example
 * // 10 batched games, 3 random picks each
 * const result = await playSpeedKeno({
 *   account,
 *   publicClient,
 *   walletClient,
 *   gameEntry,
 *   wager: parseEther('10'),
 *   picks: 3,
 *   games: 10,
 *   timeoutMs: 30000,
 * });
 * // 10 APE / 10 games = 1 APE per game
 */
export async function playSpeedKeno({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  picks,
  numbers,
  games,
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

  // Determine number of batched games (1-20)
  let numGames = games ?? gameEntry.config.games.default;
  if (numGames < 1) numGames = 1;
  if (numGames > 20) numGames = 20;

  // Determine pick count (1-5)
  let pickCount = picks ?? gameEntry.config.picks.default;
  if (pickCount < 1) pickCount = 1;
  if (pickCount > 5) pickCount = 5;

  // Parse or generate numbers
  let gameNumbers;
  try {
    gameNumbers = parseSpeedKenoNumbers(numbers, pickCount);
  } catch (error) {
    throw error;
  }

  // If user provided specific numbers, use their count
  if (numbers && numbers.toLowerCase?.() !== 'random') {
    pickCount = gameNumbers.length;
  }

  // Calculate custom gas limit for VRF fee (scales with game count)
  const customGasLimit = BASE_GAS + (numGames * GAS_PER_GAME);

  // Get dynamic VRF fee
  const vrfFee = await getPlinkoVrfFee(publicClient, gameEntry.contract, customGasLimit);

  // Encode game data for contract
  const encodedData = encodeAbiParameters(
    [
      { name: 'numGames', type: 'uint8' },
      { name: 'gameNumbers', type: 'uint8[]' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [numGames, gameNumbers, gameId, refAddress, userRandomWord]
  );

  const config = {
    games: numGames,
    picks: gameNumbers.length,
    numbers: gameNumbers,
    wagerPerGame: (Number(wager) / numGames / 1e18).toFixed(4),
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
 * Get Speed Keno config from CLI options or strategy
 *
 * Strategy logic:
 * - There is no intra-game solver for Speed Keno
 * - Best EV comes from 5 picks
 * - Batch count changes pacing and variance, not the exact per-game RTP
 *
 * @param {Object} opts - CLI options
 * @param {Object} positionalConfig - Parsed positional arguments
 * @param {Object} strategyConfig - Strategy configuration
 * @param {Function} randomIntInclusive - Random number generator
 * @returns {Object} { games: number, picks: number, numbers?: string }
 */
export function getSpeedKenoConfig(opts, positionalConfig, gameEntry, strategyConfig, randomIntInclusive, options = {}) {
  const config = {};

  // Determine number of batched games
  if (opts.games !== undefined) {
    config.games = parseInt(opts.games);
  } else if (positionalConfig.games !== undefined) {
    config.games = positionalConfig.games;
  } else if (options.preferGameDefault) {
    config.games = gameEntry.config.games.default;
  } else {
    const [min, max] = strategyConfig.speedKeno?.games || [5, 10];
    config.games = randomIntInclusive(min, max);
  }

  // Determine pick count
  if (opts.picks !== undefined) {
    config.picks = parseInt(opts.picks);
  } else if (positionalConfig.picks !== undefined) {
    config.picks = positionalConfig.picks;
  } else if (options.preferGameDefault) {
    config.picks = gameEntry.config.picks.default;
  } else {
    const [min, max] = strategyConfig.speedKeno?.picks || [2, 4];
    config.picks = randomIntInclusive(min, max);
  }

  // Determine specific numbers (optional)
  if (opts.numbers) {
    config.numbers = opts.numbers;
  } else if (positionalConfig.numbers) {
    config.numbers = positionalConfig.numbers;
  }
  // If no numbers specified, playSpeedKeno will generate random ones

  return config;
}
