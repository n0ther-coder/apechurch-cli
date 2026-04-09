/**
 * @fileoverview Primes game handler
 *
 * Primes is a batched random-number game:
 * - Pick a difficulty that defines the numeric range
 * - Split the wager across 1-20 runs
 * - Each run draws one uniform integer in the selected range
 * - Zero is the fixed top-payout case; primes pay the base multiplier
 *
 * On-chain encoding:
 * - difficulty: uint8 (0-3)
 * - numRuns: uint8 (1-20)
 * - gameId: uint256
 * - ref: address (referral)
 * - userRandomWord: bytes32 (client entropy)
 *
 * @module lib/games/primes
 */
import { encodeAbiParameters } from 'viem';
import { clampRange, ensureIntRange } from '../utils.js';
import { getPlinkoVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';

const DIFFICULTY_NAMES = ['Easy', 'Medium', 'Hard', 'Extreme'];

export async function playPrimes({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  difficulty,
  runs,
  referral,
  gpPerApe,
  timeoutMs,
}) {
  const refAddress = getValidRefAddress(referral);
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  const difficultyValue = ensureIntRange(
    difficulty ?? gameEntry.config.difficulty.default,
    'difficulty',
    gameEntry.config.difficulty.min,
    gameEntry.config.difficulty.max,
  );
  const runsValue = ensureIntRange(
    runs ?? gameEntry.config.runs.default,
    'runs',
    gameEntry.config.runs.min,
    gameEntry.config.runs.max,
  );

  const customGasLimit = gameEntry.vrf.baseGas + (runsValue * gameEntry.vrf.perUnitGas);
  const vrfFee = await getPlinkoVrfFee(publicClient, gameEntry.contract, customGasLimit);

  const encodedData = encodeAbiParameters(
    [
      { name: 'difficulty', type: 'uint8' },
      { name: 'numRuns', type: 'uint8' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [difficultyValue, runsValue, gameId, refAddress, userRandomWord],
  );

  const config = {
    difficulty: difficultyValue,
    difficultyName: DIFFICULTY_NAMES[difficultyValue],
    runs: runsValue,
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

export function getPrimesConfig(opts, positionalConfig, strategyConfig, randomIntInclusive) {
  const config = {};
  const strategyDifficulty = Array.isArray(strategyConfig.primes?.difficulty)
    ? strategyConfig.primes.difficulty
    : [0, 1];
  const strategyRuns = Array.isArray(strategyConfig.primes?.runs)
    ? strategyConfig.primes.runs
    : [8, 16];

  if (opts.difficulty !== undefined) {
    config.difficulty = parseInt(opts.difficulty, 10);
  } else if (positionalConfig.difficulty !== undefined) {
    config.difficulty = positionalConfig.difficulty;
  } else {
    const [min, max] = clampRange(strategyDifficulty[0], strategyDifficulty[1], 0, 3);
    config.difficulty = randomIntInclusive(min, max);
  }

  if (opts.runs !== undefined) {
    config.runs = parseInt(opts.runs, 10);
  } else if (positionalConfig.runs !== undefined) {
    config.runs = positionalConfig.runs;
  } else {
    const [min, max] = clampRange(strategyRuns[0], strategyRuns[1], 1, 20);
    config.runs = randomIntInclusive(min, max);
  }

  return config;
}
