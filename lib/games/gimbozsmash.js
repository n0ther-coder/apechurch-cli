/**
 * @fileoverview Gimboz Smash game handler
 *
 * Public CLI inputs use the 1-100 board shown in the Ape Church UI.
 * The verified contract calldata and stored ranges are observed as
 * 0-based inclusive intervals over 0-99, so this handler converts the
 * human-facing ranges to the contract-facing format.
 *
 * @module lib/games/gimbozsmash
 */
import { encodeAbiParameters } from 'viem';
import { ensureIntRange } from '../utils.js';
import { getStaticVrfFee, executeGame, resolveGamePayloadInputs } from './base.js';
import { getGimbozSmashPayoutMultiplier } from '../rtp.js';

const HUMAN_MIN_TARGET = 1;
const HUMAN_MAX_TARGET = 100;
const CONTRACT_MIN_TARGET = 0;
const CONTRACT_MAX_TARGET = 99;
const MIN_WIN_COUNT = 1;
const MAX_WIN_COUNT = 95;
const MAX_INTERVALS = 2;
const BOARD_SIZE = HUMAN_MAX_TARGET - HUMAN_MIN_TARGET + 1;
const MIN_OUT_RANGE_COUNT = BOARD_SIZE - MAX_WIN_COUNT;
const MAX_OUT_RANGE_COUNT = MAX_WIN_COUNT;

export const GIMBOZ_SMASH_GAME_INFO_ABI = [
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
        { name: 'numWinIntervals', type: 'uint8' },
        { name: 'winStarts', type: 'uint8[2]' },
        { name: 'winEnds', type: 'uint8[2]' },
        { name: 'winCount', type: 'uint8' },
        { name: 'winningNumber', type: 'uint8' },
        { name: 'totalPayout', type: 'uint256' },
        { name: 'hasEnded', type: 'bool' },
        { name: 'timestamp', type: 'uint256' },
      ],
    }],
  },
];

function formatGimbozSmashPayoutMultiplier(multiplier) {
  return `${Number(multiplier).toFixed(4).replace(/\.?0+$/, '')}x`;
}

function parseBigIntLike(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value !== '') {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function countCoveredNumbers(intervals = []) {
  return intervals.reduce((total, interval) => total + (interval.end - interval.start + 1), 0);
}

function formatHumanRange(interval = {}) {
  return `${interval.start}-${interval.end}`;
}

function normalizeHumanInterval(interval = {}, {
  startLabel = 'target start',
  endLabel = 'target end',
  invalidPrefix = 'Invalid range',
} = {}) {
  const start = ensureIntRange(interval.start, startLabel, HUMAN_MIN_TARGET, HUMAN_MAX_TARGET);
  const end = ensureIntRange(interval.end ?? interval.start, endLabel, HUMAN_MIN_TARGET, HUMAN_MAX_TARGET);

  if (start > end) {
    throw new Error(`${invalidPrefix}: start ${start} is greater than end ${end}.`);
  }

  return { start, end };
}

export function mergeGimbozSmashIntervals(intervals = []) {
  const normalized = intervals
    .map((interval) => normalizeHumanInterval(interval))
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const merged = [];

  for (const interval of normalized) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, interval.end);
      continue;
    }
    merged.push({ ...interval });
  }

  return merged;
}

export function formatGimbozSmashTargets(intervals = []) {
  return intervals
    .map((interval) => formatHumanRange(interval))
    .join(',');
}

function validateGimbozSmashIntervals(intervals = []) {
  if (!Array.isArray(intervals) || intervals.length === 0) {
    throw new Error('Invalid range: provide one or two ranges such as 1-50 or 1-20,81-100.');
  }

  if (intervals.length > MAX_INTERVALS) {
    throw new Error('Invalid range: Gimboz Smash supports at most two target intervals.');
  }

  const normalized = mergeGimbozSmashIntervals(intervals);
  const winCount = countCoveredNumbers(normalized);

  if (normalized.length > MAX_INTERVALS) {
    throw new Error('Invalid range: Gimboz Smash supports at most two target intervals.');
  }

  if (winCount < MIN_WIN_COUNT || winCount > MAX_WIN_COUNT) {
    throw new Error(`Invalid range: total covered numbers must be between ${MIN_WIN_COUNT} and ${MAX_WIN_COUNT}.`);
  }

  return normalized;
}

function buildGimbozSmashConfig(intervals = []) {
  const normalizedIntervals = validateGimbozSmashIntervals(intervals);
  const winCount = countCoveredNumbers(normalizedIntervals);
  const payoutMultiplier = getGimbozSmashPayoutMultiplier(winCount);

  return {
    targets: formatGimbozSmashTargets(normalizedIntervals),
    intervals: normalizedIntervals.map((interval) => ({ ...interval })),
    numWinIntervals: normalizedIntervals.length,
    winCount,
    winChance: `${winCount}%`,
    payout: formatGimbozSmashPayoutMultiplier(payoutMultiplier ?? (97.5 / winCount)),
  };
}

function buildGimbozSmashConfigFromIntervals(intervals = [], metadata = {}) {
  const config = buildGimbozSmashConfig(intervals);
  if (metadata.outRange) {
    return {
      ...config,
      outRange: metadata.outRange,
    };
  }
  return config;
}

function parseHumanTargetToken(token, {
  kind = 'range',
  hint = 'Use ranges like 1-50 or 1-20,81-100.',
  invalidPrefix = 'Invalid range',
} = {}) {
  const trimmed = String(token || '').trim();
  const match = trimmed.match(/^(\d+)(?:\s*-\s*(\d+))?$/);

  if (!match) {
    throw new Error(`${invalidPrefix}: "${trimmed}". ${hint}`);
  }

  return normalizeHumanInterval(
    {
      start: match[1],
      end: match[2] ?? match[1],
    },
    {
      startLabel: kind === 'out-range' ? 'out-range start' : 'target start',
      endLabel: kind === 'out-range' ? 'out-range end' : 'target end',
      invalidPrefix,
    },
  );
}

export function parseGimbozSmashTargets(rawTargets) {
  const normalized = String(rawTargets || '').trim();
  if (!normalized) {
    throw new Error('Invalid range: provide one or two ranges such as 1-50 or 1-20,81-100.');
  }

  const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > MAX_INTERVALS) {
    throw new Error('Invalid range: provide one or two ranges such as 1-50 or 1-20,81-100.');
  }

  return buildGimbozSmashConfigFromIntervals(parts.map((part) => parseHumanTargetToken(part)));
}

function buildComplementIntervals(interval) {
  const intervals = [];

  if (interval.start > HUMAN_MIN_TARGET) {
    intervals.push({ start: HUMAN_MIN_TARGET, end: interval.start - 1 });
  }

  if (interval.end < HUMAN_MAX_TARGET) {
    intervals.push({ start: interval.end + 1, end: HUMAN_MAX_TARGET });
  }

  return intervals;
}

export function parseGimbozSmashOutRange(rawOutRange) {
  const normalized = String(rawOutRange || '').trim();
  if (!normalized) {
    throw new Error('Invalid out-range: provide one inclusive range such as 45-50.');
  }

  if (normalized.includes(',')) {
    throw new Error('Invalid out-range: provide exactly one inclusive range such as 45-50.');
  }

  const excluded = parseHumanTargetToken(normalized, {
    kind: 'out-range',
    hint: 'Use one inclusive range such as 45-50.',
    invalidPrefix: 'Invalid out-range',
  });
  const excludedCount = excluded.end - excluded.start + 1;

  if (excludedCount < MIN_OUT_RANGE_COUNT || excludedCount > MAX_OUT_RANGE_COUNT) {
    throw new Error(`Invalid out-range: excluded coverage must be between ${MIN_OUT_RANGE_COUNT} and ${MAX_OUT_RANGE_COUNT} numbers so the resulting winning targets fit the live contract.`);
  }

  return buildGimbozSmashConfigFromIntervals(
    buildComplementIntervals(excluded),
    { outRange: formatHumanRange(excluded) },
  );
}

function hasConfiguredValue(value) {
  return value !== undefined && String(value).trim() !== '';
}

function resolveGimbozSmashInsideSelection({ range } = {}) {
  const hasRange = hasConfiguredValue(range);

  if (hasRange) {
    return String(range).trim();
  }

  return '';
}

export function parseGimbozSmashInput({ range, outRange, defaultRange } = {}, { allowEmpty = false } = {}) {
  const insideSelection = resolveGimbozSmashInsideSelection({ range });
  const hasInsideSelection = insideSelection !== '';
  const hasOutRange = outRange !== undefined && String(outRange).trim() !== '';

  if (hasInsideSelection && hasOutRange) {
    throw new Error('Invalid Gimboz Smash config: choose either --range or --out-range, not both.');
  }

  if (hasOutRange) {
    return parseGimbozSmashOutRange(outRange);
  }

  if (hasInsideSelection) {
    return parseGimbozSmashTargets(insideSelection);
  }

  if (hasConfiguredValue(defaultRange) && !allowEmpty) {
    return parseGimbozSmashTargets(defaultRange);
  }

  if (allowEmpty) {
    return null;
  }

  throw new Error('Invalid range: provide one or two ranges such as 1-50 or 1-20,81-100.');
}

function buildConfigFromContractIntervals(intervals = []) {
  return buildGimbozSmashConfigFromIntervals(intervals.map((interval) => ({
    start: ensureIntRange(interval.start + 1, 'target start', HUMAN_MIN_TARGET, HUMAN_MAX_TARGET),
    end: ensureIntRange(interval.end + 1, 'target end', HUMAN_MIN_TARGET, HUMAN_MAX_TARGET),
  })));
}

function toContractIntervalArrays(intervals = []) {
  const starts = [0, 0];
  const ends = [0, 0];

  intervals.forEach((interval, index) => {
    starts[index] = ensureIntRange(interval.start - 1, 'target start', CONTRACT_MIN_TARGET, CONTRACT_MAX_TARGET);
    ends[index] = ensureIntRange(interval.end - 1, 'target end', CONTRACT_MIN_TARGET, CONTRACT_MAX_TARGET);
  });

  return {
    winStarts: starts,
    winEnds: ends,
  };
}

function buildRandomTargetsFromWinCount(winCount, randomIntInclusive) {
  const start = randomIntInclusive(HUMAN_MIN_TARGET, HUMAN_MAX_TARGET - winCount + 1);
  const end = start + winCount - 1;
  return buildGimbozSmashConfig([{ start, end }]);
}

export function getGimbozSmashConfig(opts, positionalConfig, gameEntry, strategyConfig, randomIntInclusive, options = {}) {
  const explicitConfig = parseGimbozSmashInput(
    {
      range: opts.range ?? positionalConfig.range,
      outRange: opts.outRange ?? positionalConfig.outRange,
    },
    { allowEmpty: true },
  );
  if (explicitConfig) {
    return explicitConfig;
  }

  if (options.preferGameDefault) {
    return parseGimbozSmashTargets(gameEntry?.config?.range?.default || '1-50');
  }

  const [winCountMin, winCountMax] = strategyConfig.gimbozSmash?.winCount || [40, 60];
  const winCount = ensureIntRange(
    randomIntInclusive(winCountMin, winCountMax),
    'targets',
    MIN_WIN_COUNT,
    MAX_WIN_COUNT,
  );

  return buildRandomTargetsFromWinCount(winCount, randomIntInclusive);
}

export async function playGimbozSmash({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  range,
  outRange,
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
  const config = parseGimbozSmashInput({
      range,
      outRange,
      defaultRange: gameEntry.config.range.default,
    });
  const vrfFee = await getStaticVrfFee(publicClient, gameEntry.contract);
  const { winStarts, winEnds } = toContractIntervalArrays(config.intervals);

  const encodedData = encodeAbiParameters(
    [
      { name: 'numWinIntervals', type: 'uint8' },
      { name: 'winStarts', type: 'uint8[2]' },
      { name: 'winEnds', type: 'uint8[2]' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [config.numWinIntervals, winStarts, winEnds, gameId, refAddress, userRandomWord],
  );

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
    fetchSettledResult: fetchGimbozSmashSettledResult,
    gpPerApe,
    timeoutMs,
  });
}

export function formatGimbozSmashSettledDetails(rawGameInfo = {}) {
  const declaredIntervals = ensureIntRange(
    rawGameInfo.numWinIntervals ?? 0,
    'numWinIntervals',
    0,
    MAX_INTERVALS,
  );
  const rawStarts = Array.isArray(rawGameInfo.winStarts) ? rawGameInfo.winStarts.map((value) => Number(value)) : [];
  const rawEnds = Array.isArray(rawGameInfo.winEnds) ? rawGameInfo.winEnds.map((value) => Number(value)) : [];
  const rawIntervals = [];

  for (let index = 0; index < declaredIntervals; index += 1) {
    const start = rawStarts[index];
    const end = rawEnds[index];
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < CONTRACT_MIN_TARGET || end > CONTRACT_MAX_TARGET || start > end) {
      continue;
    }
    rawIntervals.push({ start, end });
  }

  const config = rawIntervals.length > 0 ? buildConfigFromContractIntervals(rawIntervals) : null;
  const winningNumberRaw = Number(rawGameInfo.winningNumber);
  const winningNumber = Number.isInteger(winningNumberRaw)
    ? ensureIntRange(winningNumberRaw + 1, 'winningNumber', HUMAN_MIN_TARGET, HUMAN_MAX_TARGET)
    : null;
  const totalPayout = parseBigIntLike(rawGameInfo.totalPayout);
  const won = totalPayout > 0n;

  return {
    num_win_intervals: config?.numWinIntervals ?? rawIntervals.length,
    targets: config?.targets ?? null,
    intervals: config?.intervals ?? [],
    raw_intervals: rawIntervals.map((interval) => ({ ...interval })),
    win_count: Number(rawGameInfo.winCount ?? config?.winCount ?? 0) || 0,
    winning_number: winningNumber,
    winning_number_raw: Number.isInteger(winningNumberRaw) ? winningNumberRaw : null,
    won,
    landed_in_target: winningNumber !== null
      ? (config?.intervals || []).some((interval) => winningNumber >= interval.start && winningNumber <= interval.end)
      : null,
  };
}

export async function fetchGimbozSmashSettledResult({ publicClient, contractAddress, gameId }) {
  const rawGameInfo = await publicClient.readContract({
    address: contractAddress,
    abi: GIMBOZ_SMASH_GAME_INFO_ABI,
    functionName: 'getGameInfo',
    args: [gameId],
  });

  return {
    details: formatGimbozSmashSettledDetails(rawGameInfo),
  };
}
