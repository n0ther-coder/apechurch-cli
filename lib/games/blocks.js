/**
 * @fileoverview Blocks game handler
 *
 * Blocks is a consecutive-roll 3x3 board game:
 * - Each roll fills a 3x3 board with random colors
 * - The largest connected color cluster determines that roll's multiplier
 * - Every paying roll compounds the current payout
 * - Any non-paying roll ends the whole game at 0x
 * - Mode 0 ("Low") starts paying at 3 connected tiles
 * - Mode 1 ("High") removes that low-floor payout and raises the cap
 *
 * On-chain encoding:
 * - riskMode: uint8 (0-1)
 * - numRuns: uint8 (1-5)
 * - gameId: uint256
 * - ref: address (referral)
 * - userRandomWord: bytes32 (client entropy)
 *
 * @module lib/games/blocks
 */
import { encodeAbiParameters } from 'viem';
import { clampRange, ensureIntRange } from '../utils.js';
import { getPlinkoVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';

const MODE_NAMES = Object.freeze({
  0: 'Low',
  1: 'High',
});

export async function playBlocks({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  mode,
  runs,
  referral,
  gpPerApe,
  timeoutMs,
}) {
  const refAddress = getValidRefAddress(referral);
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  const modeValue = ensureIntRange(
    mode ?? gameEntry.config.mode.default,
    'mode',
    gameEntry.config.mode.min,
    gameEntry.config.mode.max,
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
      { name: 'riskMode', type: 'uint8' },
      { name: 'numRuns', type: 'uint8' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [modeValue, runsValue, gameId, refAddress, userRandomWord],
  );

  const config = {
    mode: modeValue,
    modeName: MODE_NAMES[modeValue] || 'Low',
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

export function getBlocksConfig(opts, positionalConfig, gameEntry, strategyConfig, randomIntInclusive, options = {}) {
  const config = {};
  const preferGameDefault = Boolean(options.preferGameDefault);
  const strategyMode = Array.isArray(strategyConfig.blocks?.mode)
    ? strategyConfig.blocks.mode
    : [gameEntry.config.mode.default, gameEntry.config.mode.default];
  const strategyRuns = Array.isArray(strategyConfig.blocks?.runs)
    ? strategyConfig.blocks.runs
    : [gameEntry.config.runs.default, gameEntry.config.runs.default];

  if (opts.mode !== undefined) {
    config.mode = parseInt(opts.mode, 10);
  } else if (positionalConfig.mode !== undefined) {
    config.mode = positionalConfig.mode;
  } else if (preferGameDefault) {
    config.mode = gameEntry.config.mode.default;
  } else {
    const [modeMin, modeMax] = clampRange(
      strategyMode[0],
      strategyMode[1],
      gameEntry.config.mode.min,
      gameEntry.config.mode.max,
    );
    config.mode = randomIntInclusive(modeMin, modeMax);
  }

  if (opts.runs !== undefined) {
    config.runs = parseInt(opts.runs, 10);
  } else if (positionalConfig.runs !== undefined) {
    config.runs = positionalConfig.runs;
  } else if (preferGameDefault) {
    config.runs = gameEntry.config.runs.default;
  } else {
    const [runsMin, runsMax] = clampRange(
      strategyRuns[0],
      strategyRuns[1],
      gameEntry.config.runs.min,
      gameEntry.config.runs.max,
    );
    config.runs = randomIntInclusive(runsMin, runsMax);
  }

  return config;
}
