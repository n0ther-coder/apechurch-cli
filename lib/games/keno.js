/**
 * Keno game handler
 * Pick 1-10 numbers from 1-40. Game draws 10 numbers. Payouts based on matches.
 */
import { encodeAbiParameters } from 'viem';
import { getStaticVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';

/**
 * Generate random unique numbers for Keno
 */
function generateRandomPicks(count) {
  const picks = new Set();
  while (picks.size < count) {
    const num = Math.floor(Math.random() * 40) + 1; // 1-40
    picks.add(num);
  }
  return Array.from(picks).sort((a, b) => a - b);
}

/**
 * Parse keno numbers from string or generate random
 */
export function parseKenoNumbers(input, pickCount) {
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
    if (isNaN(num) || num < 1 || num > 40) {
      throw new Error(`Invalid keno number: "${part}". Must be 1-40.`);
    }
    if (seen.has(num)) {
      throw new Error(`Duplicate number: ${num}. Each number can only be picked once.`);
    }
    seen.add(num);
    numbers.push(num);
  }

  if (numbers.length < 1 || numbers.length > 10) {
    throw new Error(`Must pick 1-10 numbers. You picked ${numbers.length}.`);
  }

  return numbers.sort((a, b) => a - b);
}

/**
 * Play a Keno game
 */
export async function playKeno({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  picks,
  numbers,
  referral,
  timeoutMs,
}) {
  const refAddress = getValidRefAddress(referral);
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  // Determine pick count
  let pickCount = picks ?? gameEntry.config.picks.default;
  if (pickCount < 1) pickCount = 1;
  if (pickCount > 10) pickCount = 10;

  // Parse or generate numbers
  let gameNumbers;
  try {
    gameNumbers = parseKenoNumbers(numbers, pickCount);
  } catch (error) {
    throw error;
  }

  // Validate pick count matches numbers if both specified
  if (numbers && !numbers.toLowerCase?.() === 'random' && gameNumbers.length !== pickCount) {
    // Use the actual number of picks provided
    pickCount = gameNumbers.length;
  }

  // Get VRF fee (static)
  const vrfFee = await getStaticVrfFee(publicClient, gameEntry.contract);

  // Encode game data: (uint8[] gameNumbers, uint256 gameId, address ref, bytes32 userRandomWord)
  const encodedData = encodeAbiParameters(
    [
      { name: 'gameNumbers', type: 'uint8[]' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [gameNumbers, gameId, refAddress, userRandomWord]
  );

  const config = {
    picks: gameNumbers.length,
    numbers: gameNumbers,
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
 * Get keno config from options/strategy
 */
export function getKenoConfig(opts, positionalConfig, strategyConfig, randomIntInclusive) {
  const config = {};

  // Determine pick count
  if (opts.picks !== undefined) {
    config.picks = parseInt(opts.picks);
  } else if (positionalConfig.picks !== undefined) {
    config.picks = positionalConfig.picks;
  } else {
    const [min, max] = strategyConfig.keno?.picks || [3, 6];
    config.picks = randomIntInclusive(min, max);
  }

  // Determine numbers (if specified)
  if (opts.numbers) {
    config.numbers = opts.numbers;
  } else if (positionalConfig.numbers) {
    config.numbers = positionalConfig.numbers;
  }
  // If no numbers specified, playKeno will generate random ones

  return config;
}
