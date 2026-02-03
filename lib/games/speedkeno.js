/**
 * Speed Keno game handler
 * Pick 1-5 numbers from 1-20. Batch up to 20 games. Dynamic VRF fee.
 */
import { encodeAbiParameters } from 'viem';
import { getPlinkoVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';

// Gas constants for VRF fee calculation
const BASE_GAS = 325000;
const GAS_PER_GAME = 55000;

/**
 * Generate random unique numbers for Speed Keno (1-20)
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
 * Parse speed keno numbers from string or generate random
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

/**
 * Play a Speed Keno game
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
  timeoutMs,
}) {
  const refAddress = getValidRefAddress(referral);
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  // Determine number of games (1-20)
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

  // If numbers provided, use their count as pickCount
  if (numbers && numbers.toLowerCase?.() !== 'random') {
    pickCount = gameNumbers.length;
  }

  // Calculate custom gas limit for VRF fee
  const customGasLimit = BASE_GAS + (numGames * GAS_PER_GAME);

  // Get dynamic VRF fee
  const vrfFee = await getPlinkoVrfFee(publicClient, gameEntry.contract, customGasLimit);

  // Encode game data: (uint8 numGames, uint8[] gameNumbers, uint256 gameId, address ref, bytes32 userRandomWord)
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
    timeoutMs,
  });
}

/**
 * Get speed keno config from options/strategy
 */
export function getSpeedKenoConfig(opts, positionalConfig, strategyConfig, randomIntInclusive) {
  const config = {};

  // Determine number of games
  if (opts.games !== undefined) {
    config.games = parseInt(opts.games);
  } else if (positionalConfig.games !== undefined) {
    config.games = positionalConfig.games;
  } else {
    const [min, max] = strategyConfig.speedKeno?.games || [5, 10];
    config.games = randomIntInclusive(min, max);
  }

  // Determine pick count
  if (opts.picks !== undefined) {
    config.picks = parseInt(opts.picks);
  } else if (positionalConfig.picks !== undefined) {
    config.picks = positionalConfig.picks;
  } else {
    const [min, max] = strategyConfig.speedKeno?.picks || [2, 4];
    config.picks = randomIntInclusive(min, max);
  }

  // Determine numbers (if specified)
  if (opts.numbers) {
    config.numbers = opts.numbers;
  } else if (positionalConfig.numbers) {
    config.numbers = positionalConfig.numbers;
  }
  // If no numbers specified, playSpeedKeno will generate random ones

  return config;
}
