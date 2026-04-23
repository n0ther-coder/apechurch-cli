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
import { getGameOptionLabel, parseGameConfigValue } from '../game-config.js';
import { getPlinkoVrfFee, executeGame, resolveGamePayloadInputs } from './base.js';

const DIFFICULTY_NAMES = ['Easy', 'Medium', 'Hard', 'Extreme'];

export async function playPrimes({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  risk,
  difficulty,
  runs,
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

  const difficultyValue = ensureIntRange(
    difficulty ?? risk ?? gameEntry.config.difficulty.default,
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
    difficultyName: getGameOptionLabel(gameEntry, 'difficulty', difficultyValue, DIFFICULTY_NAMES[difficultyValue]),
    risk: difficultyValue,
    riskName: getGameOptionLabel(gameEntry, 'difficulty', difficultyValue, DIFFICULTY_NAMES[difficultyValue]),
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

export function getPrimesConfig(opts, positionalConfig, gameEntry, strategyConfig, randomIntInclusive, options = {}) {
  const config = {};
  const strategyRuns = Array.isArray(strategyConfig.primes?.runs)
    ? strategyConfig.primes.runs
    : [8, 16];

  if (opts.risk !== undefined) {
    config.difficulty = parseGameConfigValue(gameEntry, 'difficulty', opts.risk, { numericKind: 'public' });
  } else if (positionalConfig.risk !== undefined) {
    config.difficulty = parseGameConfigValue(gameEntry, 'difficulty', positionalConfig.risk, { numericKind: 'public' });
  } else {
    config.difficulty = gameEntry.config.difficulty.default;
  }

  if (opts.runs !== undefined) {
    config.runs = parseInt(opts.runs, 10);
  } else if (positionalConfig.runs !== undefined) {
    config.runs = positionalConfig.runs;
  } else if (options.preferGameDefault) {
    config.runs = gameEntry.config.runs.default;
  } else {
    const [min, max] = clampRange(strategyRuns[0], strategyRuns[1], 1, 20);
    config.runs = randomIntInclusive(min, max);
  }

  return config;
}
