/**
 * @fileoverview Blocks game handler
 *
 * Blocks is a multi-roll max-of-a-kind board game:
 * - Each roll fills a selectable 2x2, 3x3, or 4x4 board with random colors
 * - The largest same-color count determines that roll's multiplier
 * - --split divides the wager across independent rolls and sums their payouts
 * - --survive compounds paying rolls; any non-paying roll ends the game at 0x
 * - Mode 0 ("Low") uses the lower grid-specific survival threshold
 * - Mode 1 ("High") uses the higher, more volatile payout ladder
 *
 * On-chain encoding:
 * - gameMode: uint8 (0=3x3, 1=4x4, 2=2x2)
 * - riskMode: uint8 (0-1)
 * - numRuns: uint8 (1-5)
 * - compounding: bool (--split=false, --survive=true; defaults to true)
 * - gameId: uint256
 * - ref: address (referral)
 * - userRandomWord: bytes32 (client entropy)
 *
 * @module lib/games/blocks
 */
import { encodeAbiParameters } from 'viem';
import { clampRange, ensureIntRange } from '../utils.js';
import { getGameOptionLabel, parseGameConfigValue } from '../game-config.js';
import { getPlinkoVrfFee, executeGame, resolveGamePayloadInputs } from './base.js';

const MODE_NAMES = Object.freeze({
  0: 'Low',
  1: 'High',
});

const GRID_MODE_BY_LABEL = Object.freeze({
  '2x2': 2,
  '3x3': 0,
  '4x4': 1,
});

const GRID_LABEL_BY_MODE = Object.freeze({
  0: '3x3',
  1: '4x4',
  2: '2x2',
});

const GRID_TILES_BY_MODE = Object.freeze({
  0: 9,
  1: 16,
  2: 4,
});

export function parseBlocksGrid(value, { defaultMode = 0 } = {}) {
  if (!hasOptionValue(value)) {
    return defaultMode;
  }

  const normalized = String(value).trim().toLowerCase();
  if (Object.hasOwn(GRID_MODE_BY_LABEL, normalized)) {
    return GRID_MODE_BY_LABEL[normalized];
  }

  throw new Error('grid must be one of: 2x2, 3x3, 4x4. Numeric grid modes are not accepted.');
}

export function getBlocksGridLabel(gridMode) {
  return GRID_LABEL_BY_MODE[Number(gridMode)] || null;
}

export function getBlocksBoardSize(gridMode) {
  return GRID_TILES_BY_MODE[Number(gridMode)] || 0;
}

export function getBlocksVrfGasLimit(gameEntry, gridMode, runs) {
  const boardSize = getBlocksBoardSize(gridMode);
  const baseGas = Number(gameEntry?.vrf?.baseGas);
  const perTileGas = Number(gameEntry?.vrf?.perTileGas);
  if (!boardSize || !Number.isFinite(baseGas) || !Number.isFinite(perTileGas) || perTileGas <= 0) {
    throw new Error('Invalid Blocks VRF gas configuration.');
  }
  return Math.trunc(baseGas + (Number(runs) * boardSize * perTileGas));
}

export function encodeBlocksGameData({
  gridMode,
  riskMode,
  numRuns,
  compounding = true,
  gameId,
  refAddress,
  userRandomWord,
}) {
  return encodeAbiParameters(
    [
      { name: 'gameMode', type: 'uint8' },
      { name: 'riskMode', type: 'uint8' },
      { name: 'numRuns', type: 'uint8' },
      { name: 'compounding', type: 'bool' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [gridMode, riskMode, numRuns, Boolean(compounding), gameId, refAddress, userRandomWord],
  );
}

export async function playBlocks({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  grid,
  gridMode,
  risk,
  mode,
  split,
  survive,
  runs,
  rolls,
  referral,
  xGameId,
  xRef,
  xUserRandomWord,
  gpPerApe,
  resilient,
  timeoutMs,
}) {
  const { gameId, refAddress, userRandomWord } = resolveGamePayloadInputs({
    referral,
    xGameId,
    xRef,
    xUserRandomWord,
  });

  const modeValue = ensureIntRange(
    mode ?? risk ?? gameEntry.config.mode.default,
    'mode',
    gameEntry.config.mode.min,
    gameEntry.config.mode.max,
  );
  const { requestedRuns, compounding } = resolveBlocksAttemptInput({
    split,
    survive,
    runs,
    rolls,
  });
  const runsValue = ensureBlocksAttemptCount(
    requestedRuns ?? gameEntry.config.runs.default,
    compounding ? 'survive' : 'split',
    gameEntry.config.runs.min,
    gameEntry.config.runs.max,
  );
  const defaultGridMode = Number(gameEntry.config.grid?.default ?? 0);
  const gridValue = ensureIntRange(
    hasOptionValue(gridMode) ? gridMode : parseBlocksGrid(grid, { defaultMode: defaultGridMode }),
    'grid mode',
    0,
    2,
  );
  const gridLabel = getBlocksGridLabel(gridValue);

  const customGasLimit = getBlocksVrfGasLimit(gameEntry, gridValue, runsValue);
  const vrfFee = await getPlinkoVrfFee(publicClient, gameEntry.contract, customGasLimit);

  const encodedData = encodeBlocksGameData({
    gridMode: gridValue,
    riskMode: modeValue,
    numRuns: runsValue,
    compounding,
    gameId,
    refAddress,
    userRandomWord,
  });

  const config = {
    grid: gridLabel,
    gridMode: gridValue,
    mode: modeValue,
    modeName: getGameOptionLabel(gameEntry, 'mode', modeValue, MODE_NAMES[modeValue] || 'Low'),
    risk: modeValue,
    riskName: getGameOptionLabel(gameEntry, 'mode', modeValue, MODE_NAMES[modeValue] || 'Low'),
    ...(compounding ? { survive: runsValue } : { split: runsValue }),
    compounding,
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
    resilient,
    timeoutMs,
  });
}

function hasOptionValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function parseOptionalInt(value) {
  return hasOptionValue(value) ? parseInt(value, 10) : null;
}

function resolveBlocksSurviveInput(survive, runs, rolls) {
  if (hasOptionValue(survive)) {
    return survive;
  }

  const hasRuns = hasOptionValue(runs);
  const hasRolls = hasOptionValue(rolls);

  if (hasRuns && hasRolls) {
    const parsedRuns = parseOptionalInt(runs);
    const parsedRolls = parseOptionalInt(rolls);
    if (Number.isFinite(parsedRuns) && Number.isFinite(parsedRolls) && parsedRuns !== parsedRolls) {
      throw new Error('Conflicting Blocks legacy survival count values.');
    }
  }

  return hasRuns ? runs : hasRolls ? rolls : undefined;
}

function resolveBlocksAttemptInput({ split, survive, runs, rolls } = {}) {
  const requestedSurvive = resolveBlocksSurviveInput(survive, runs, rolls);
  const hasSplit = hasOptionValue(split);

  if (hasSplit && hasOptionValue(requestedSurvive)) {
    throw new Error('Options --split and --survive cannot be used together for Blocks.');
  }

  return {
    requestedRuns: hasSplit ? split : requestedSurvive,
    compounding: !hasSplit,
  };
}

function ensureBlocksAttemptCount(value, label, min, max) {
  const normalized = String(value).trim();
  const parsed = /^\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

export function getBlocksConfig(opts, positionalConfig, gameEntry, strategyConfig, randomIntInclusive, options = {}) {
  const config = {};
  const preferGameDefault = Boolean(options.preferGameDefault);
  const strategyRuns = Array.isArray(strategyConfig.blocks?.runs)
    ? strategyConfig.blocks.runs
    : [gameEntry.config.runs.default, gameEntry.config.runs.default];

  config.gridMode = parseBlocksGrid(opts.grid, {
    defaultMode: Number(gameEntry.config.grid?.default ?? 0),
  });
  config.grid = getBlocksGridLabel(config.gridMode);

  if (opts.risk !== undefined) {
    config.mode = parseGameConfigValue(gameEntry, 'mode', opts.risk, { numericKind: 'public' });
  } else if (positionalConfig.risk !== undefined) {
    config.mode = parseGameConfigValue(gameEntry, 'mode', positionalConfig.risk, { numericKind: 'public' });
  } else {
    config.mode = gameEntry.config.mode.default;
  }

  const { requestedRuns, compounding } = resolveBlocksAttemptInput({
    split: opts.split,
    survive: opts.survive,
    runs: opts.runs,
    rolls: opts.rolls,
  });
  if (!compounding && positionalConfig.runs !== undefined) {
    throw new Error('Options --split and --survive cannot be used together for Blocks.');
  }
  if (requestedRuns !== undefined) {
    const attempts = ensureBlocksAttemptCount(
      requestedRuns,
      compounding ? 'survive' : 'split',
      gameEntry.config.runs.min,
      gameEntry.config.runs.max,
    );
    if (compounding) {
      config.survive = attempts;
    } else {
      config.split = attempts;
      config.compounding = false;
    }
  } else if (positionalConfig.runs !== undefined) {
    config.survive = positionalConfig.runs;
  } else if (preferGameDefault) {
    config.survive = gameEntry.config.runs.default;
  } else {
    const [runsMin, runsMax] = clampRange(
      strategyRuns[0],
      strategyRuns[1],
      gameEntry.config.runs.min,
      gameEntry.config.runs.max,
    );
    config.survive = randomIntInclusive(runsMin, runsMax);
  }

  return config;
}
