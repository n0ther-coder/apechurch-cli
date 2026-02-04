/**
 * Bear-A-Dice game handler
 * Roll 2 dice up to 5 times. Avoid unlucky numbers based on difficulty.
 * 
 * Difficulty modes (lose on these totals):
 *   0 (Easy):    Lose on 7
 *   1 (Normal):  Lose on 6,7,8
 *   2 (Hard):    Lose on 5,6,7,8,9
 *   3 (Extreme): Lose on 4,5,6,7,8,9,10
 *   4 (Master):  Lose on 3,4,5,6,7,8,9,10,11 — only snake eyes (2) or boxcars (12) win!
 * 
 * WARNING: Modes 1+ are very risky. Stick to 0 for auto-play.
 */
import { encodeAbiParameters } from 'viem';
import { getPlinkoVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';

// Gas constants for VRF fee calculation
const BASE_GAS = 500000;
const GAS_PER_ROLL = 100000;

/**
 * Play Bear-A-Dice
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
  timeoutMs,
}) {
  const refAddress = getValidRefAddress(referral);
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  // Validate difficulty (0-4), default to 0 (Easy)
  let diff = difficulty ?? gameEntry.config.difficulty.default;
  if (diff < 0) diff = 0;
  if (diff > 4) diff = 4;

  // Validate rolls (1-5), default to 1
  // Note: Extreme (3) and Master (4) are capped at 3 rolls
  let numRolls = rolls ?? gameEntry.config.rolls.default;
  if (numRolls < 1) numRolls = 1;
  if (numRolls > 5) numRolls = 5;
  if (diff >= 3 && numRolls > 3) numRolls = 3; // Contract cap for Extreme/Master

  // Calculate custom gas limit for VRF fee
  const customGasLimit = BASE_GAS + (numRolls * GAS_PER_ROLL);

  // Get dynamic VRF fee
  const vrfFee = await getPlinkoVrfFee(publicClient, gameEntry.contract, customGasLimit);

  // Encode game data: (uint8 difficulty, uint8 numRuns, uint256 gameId, address ref, bytes32 userRandomWord)
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

  const difficultyNames = ['Easy', 'Normal', 'Hard', 'Extreme', 'Master'];
  const config = {
    difficulty: diff,
    difficultyName: difficultyNames[diff],
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
    timeoutMs,
  });
}

/**
 * Get bear dice config from options/strategy
 */
export function getBearDiceConfig(opts, positionalConfig, strategyConfig, randomIntInclusive) {
  const config = {};

  // Determine difficulty - default to Easy (0) for safety
  if (opts.difficulty !== undefined) {
    config.difficulty = parseInt(opts.difficulty);
  } else if (positionalConfig.difficulty !== undefined) {
    config.difficulty = positionalConfig.difficulty;
  } else {
    // For auto-play, almost always Easy (0). Rarely Normal (1). Never 2+.
    // 90% Easy, 10% Normal
    const roll = Math.random();
    config.difficulty = roll < 0.9 ? 0 : 1;
  }

  // Determine number of rolls
  // On Easy (0), we can go up to 5 rolls since 5/6 chance per roll
  // On harder modes, keep rolls low
  // Note: Extreme (3) and Master (4) are capped at 3 rolls by the contract
  if (opts.rolls !== undefined) {
    config.rolls = parseInt(opts.rolls);
  } else if (positionalConfig.rolls !== undefined) {
    config.rolls = positionalConfig.rolls;
  } else {
    // If Easy mode, allow more rolls (1-5). Otherwise keep conservative (1-2).
    const isEasy = config.difficulty === 0;
    const [min, max] = strategyConfig.bearDice?.rolls || (isEasy ? [1, 5] : [1, 2]);
    config.rolls = randomIntInclusive(min, max);
  }

  // Cap rolls at 3 for Extreme (3) and Master (4) - contract limit
  if (config.difficulty >= 3 && config.rolls > 3) {
    config.rolls = 3;
  }

  return config;
}
