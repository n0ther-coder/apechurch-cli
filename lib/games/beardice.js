/**
 * @fileoverview Bear-A-Dice game handler
 *
 * Dice avoidance game where players try to dodge unlucky numbers.
 *
 * Mechanics:
 * - Roll 2 standard dice (sum ranges 2-12)
 * - Player chooses difficulty (which sums are "unlucky")
 * - Player chooses number of rolls (1-5)
 * - Must survive all rolls without hitting an unlucky number
 * - More rolls = higher payout but more chances to lose
 *
 * Difficulty Modes (lose on these totals):
 * - 0 (Easy): Lose on 7 only (most common roll - 16.67% per roll)
 * - 1 (Normal): Lose on 6,7,8 (44.44% per roll - risky!)
 * - 2 (Hard): Lose on 5,6,7,8,9 (66.67% per roll - very risky!)
 * - 3 (Extreme): Lose on 4,5,6,7,8,9,10 (83.33% per roll - brutal)
 * - 4 (Master): Lose on 3-11 (94.44% per roll - only 2 or 12 wins!)
 *
 * Verified Contract Surface:
 * - All difficulties support 1-5 rolls on-chain
 * - Extreme (3) and Master (4) also expose 4-roll and 5-roll payout tables
 *
 * Strategy Note:
 * - For automated play, stick to Easy (0)
 * - Easy mode with 5 rolls only survives all five rolls about 40.19% of the time
 * - Higher difficulties are for thrill-seekers, not optimal play
 *
 * VRF Cost:
 * Variable gas based on roll count.
 * Formula: baseGas + (rolls * perRollGas)
 *
 * On-chain encoding:
 * - difficulty: uint8 (0-4)
 * - numRuns: uint8 (1-5)
 * - gameId: uint256
 * - ref: address (referral)
 * - userRandomWord: bytes32 (client entropy)
 *
 * @module lib/games/beardice
 */
import { encodeAbiParameters } from 'viem';
import { getPlinkoVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Base gas for VRF fee calculation
 * @type {number}
 */
const BASE_GAS = 500000;

/**
 * Additional gas per dice roll
 * @type {number}
 */
const GAS_PER_ROLL = 100000;

/**
 * Human-readable difficulty names
 * @type {string[]}
 */
const DIFFICULTY_NAMES = ['Easy', 'Normal', 'Hard', 'Extreme', 'Master'];

const LOSING_SUMS_BY_DIFFICULTY = Object.freeze([
  Object.freeze([7]),
  Object.freeze([6, 7, 8]),
  Object.freeze([5, 6, 7, 8, 9]),
  Object.freeze([4, 5, 6, 7, 8, 9, 10]),
  Object.freeze([3, 4, 5, 6, 7, 8, 9, 10, 11]),
]);

const BEAR_DICE_GAME_INFO_ABI = [
  {
    type: 'function',
    name: 'getGameInfo',
    stateMutability: 'view',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'player', type: 'address' },
        { name: 'betAmount', type: 'uint256' },
        { name: 'numRuns', type: 'uint8' },
        { name: 'difficulty', type: 'uint8' },
        { name: 'dice1Results', type: 'uint8[]' },
        { name: 'dice2Results', type: 'uint8[]' },
        { name: 'totalPayout', type: 'uint256' },
        { name: 'hasEnded', type: 'bool' },
        { name: 'timestamp', type: 'uint256' },
      ],
    }],
  },
];

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Play Bear-A-Dice
 *
 * @param {Object} params - Game parameters
 * @param {import('viem/accounts').PrivateKeyAccount} params.account - Player's account
 * @param {import('viem').PublicClient} params.publicClient - viem public client
 * @param {import('viem').WalletClient} params.walletClient - viem wallet client
 * @param {Object} params.gameEntry - Game registry entry
 * @param {bigint} params.wager - Wager in wei
 * @param {number} [params.difficulty] - Difficulty 0-4 (default: 0 = Easy)
 * @param {number} [params.rolls] - Number of rolls 1-5 (default: 1)
 * @param {string} [params.referral] - Referral address
 * @param {number} params.timeoutMs - How long to wait for result
 *
 * @returns {Promise<Object>} Game response with status and result
 * @throws {Error} If parameters are invalid or transaction fails
 *
 * @example
 * // Easy mode, 3 rolls (safest meaningful play)
 * const result = await playBearDice({
 *   account,
 *   publicClient,
 *   walletClient,
 *   gameEntry,
 *   wager: parseEther('10'),
 *   difficulty: 0,
 *   rolls: 3,
 *   timeoutMs: 30000,
 * });
 *
 * // YOLO Master mode (only 2 or 12 wins)
 * const result = await playBearDice({
 *   ...params,
 *   difficulty: 4,
 *   rolls: 1, // Even 1 roll is ~5.56% win rate
 * });
 */
export async function playBearDice({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  difficulty,
  rolls,
  referral,
  gpPerApe,
  timeoutMs,
}) {
  // Validate referral address
  const refAddress = getValidRefAddress(referral);

  // Generate unique identifiers
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  // Validate difficulty (0-4), default to Easy (0)
  let diff = difficulty ?? gameEntry.config.difficulty.default;
  if (diff < 0) diff = 0;
  if (diff > 4) diff = 4;

  // Validate rolls (1-5), default to 1
  let numRolls = rolls ?? gameEntry.config.rolls.default;
  if (numRolls < 1) numRolls = 1;
  if (numRolls > 5) numRolls = 5;

  // Calculate custom gas limit for VRF fee
  const customGasLimit = BASE_GAS + (numRolls * GAS_PER_ROLL);

  // Get dynamic VRF fee
  const vrfFee = await getPlinkoVrfFee(publicClient, gameEntry.contract, customGasLimit);

  // Encode game data for contract
  const encodedData = encodeAbiParameters(
    [
      { name: 'difficulty', type: 'uint8' },
      { name: 'numRuns', type: 'uint8' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [diff, numRolls, gameId, refAddress, userRandomWord]
  );

  const config = {
    difficulty: diff,
    difficultyName: DIFFICULTY_NAMES[diff],
    rolls: numRolls,
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
    fetchSettledResult: fetchBearDiceSettledResult,
    gpPerApe,
    timeoutMs,
  });
}

// ============================================================================
// CONFIG GETTER
// ============================================================================

/**
 * Get Bear-A-Dice config from CLI options or strategy
 *
 * Strategy logic:
 * - Auto-play heavily favors Easy (0) - 90% chance
 * - Occasionally Normal (1) - 10% chance
 * - Never Hard+ for auto-play (too risky)
 * - Roll count scales with difficulty (more rolls on Easy)
 *
 * @param {Object} opts - CLI options
 * @param {Object} positionalConfig - Parsed positional arguments
 * @param {Object} strategyConfig - Strategy configuration
 * @param {Function} randomIntInclusive - Random number generator
 * @returns {Object} { difficulty: number, rolls: number }
 */
export function resolveBearDiceConfig(baseConfig = {}, opts, positionalConfig, strategyConfig, randomIntInclusive) {
  const config = { ...baseConfig };

  // Determine difficulty - default to Easy (0) for safety
  if (opts.difficulty !== undefined) {
    config.difficulty = parseInt(opts.difficulty);
  } else if (positionalConfig.difficulty !== undefined) {
    config.difficulty = positionalConfig.difficulty;
  } else if (config.difficulty === undefined) {
    // For auto-play: 90% Easy, 10% Normal. Never Hard+ automatically.
    const roll = Math.random();
    config.difficulty = roll < 0.9 ? 0 : 1;
  }

  // Determine number of rolls
  // Easy (0) can safely do more rolls (each has ~83% survival)
  // Harder modes should keep rolls low
  if (opts.rolls !== undefined) {
    config.rolls = parseInt(opts.rolls);
  } else if (positionalConfig.rolls !== undefined) {
    config.rolls = positionalConfig.rolls;
  } else if (config.rolls === undefined) {
    const isEasy = config.difficulty === 0;
    const [min, max] = strategyConfig.bearDice?.rolls || (isEasy ? [1, 5] : [1, 2]);
    config.rolls = randomIntInclusive(min, max);
  }

  return config;
}

export function getBearDiceConfig(opts, positionalConfig, strategyConfig, randomIntInclusive) {
  return resolveBearDiceConfig({}, opts, positionalConfig, strategyConfig, randomIntInclusive);
}

export function formatBearDiceSettledDetails(rawGameInfo = {}) {
  const difficulty = Number(rawGameInfo.difficulty ?? 0);
  const numRuns = Number(rawGameInfo.numRuns ?? 0);
  const dice1Results = Array.isArray(rawGameInfo.dice1Results)
    ? rawGameInfo.dice1Results.map((value) => Number(value))
    : [];
  const dice2Results = Array.isArray(rawGameInfo.dice2Results)
    ? rawGameInfo.dice2Results.map((value) => Number(value))
    : [];
  const losingSums = LOSING_SUMS_BY_DIFFICULTY[difficulty] || [];
  const rollCount = Math.min(dice1Results.length, dice2Results.length);
  const rolls = [];

  for (let index = 0; index < rollCount; index += 1) {
    const die1 = dice1Results[index];
    const die2 = dice2Results[index];

    // The contract preallocates the arrays to numRuns; unused trailing slots remain 0.
    if (!Number.isInteger(die1) || !Number.isInteger(die2) || die1 < 1 || die1 > 6 || die2 < 1 || die2 > 6) {
      break;
    }

    const sum = die1 + die2;
    const losing = losingSums.includes(sum);

    rolls.push({
      index: index + 1,
      die_1: die1,
      die_2: die2,
      sum,
      losing,
      safe: !losing,
    });
  }

  const firstLosingRoll = rolls.find((roll) => roll.losing) || null;
  const trailingZeroSlots = Math.max(numRuns - rolls.length, 0);

  return {
    difficulty,
    difficulty_name: DIFFICULTY_NAMES[difficulty] || `Difficulty ${difficulty}`,
    num_runs: numRuns,
    rolls_executed: rolls.length,
    trailing_zero_slots: trailingZeroSlots,
    completed_all_runs: trailingZeroSlots === 0,
    terminated_early: trailingZeroSlots > 0,
    first_losing_roll_index: firstLosingRoll?.index ?? null,
    rolls,
  };
}

async function fetchBearDiceSettledResult({ publicClient, contractAddress, gameId }) {
  const rawGameInfo = await publicClient.readContract({
    address: contractAddress,
    abi: BEAR_DICE_GAME_INFO_ABI,
    functionName: 'getGameInfo',
    args: [gameId],
  });

  return {
    details: formatBearDiceSettledDetails(rawGameInfo),
  };
}
