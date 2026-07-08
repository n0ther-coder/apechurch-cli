/**
 * Shared timing helpers for stateful games.
 */
import { randomIntInclusive } from '../utils.js';

export const DEFAULT_LOOP_DELAY_SECONDS = 5;
export const DEFAULT_HUMAN_LOOP_DELAY_MIN_SECONDS = 3;
export const DEFAULT_HUMAN_LOOP_DELAY_MAX_SECONDS = 9;
export const DEFAULT_WEIGHTED_HUMAN_TIMING_CLI_VALUE = `weighted:${DEFAULT_HUMAN_LOOP_DELAY_MIN_SECONDS}-${DEFAULT_HUMAN_LOOP_DELAY_MAX_SECONDS}`;

const BOOLEAN_TRUE_VALUES = new Set(['1', 'true', 'yes', 'y']);
const BOOLEAN_FALSE_VALUES = new Set(['0', 'false', 'no', 'n']);
const HUMAN_DELAY_RANGE_RE = /^(\d+)\s*-\s*(\d+)$/;
const WEIGHTED_HUMAN_DELAY_RE = /^weighted:(\d+)\s*-\s*(\d+)$/;

/**
 * Parse loop delay from CLI input.
 */
export function parseLoopDelaySeconds(rawValue, fallback = DEFAULT_LOOP_DELAY_SECONDS) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }

  const parsed = Number.parseFloat(rawValue);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function isHumanTimingOptionValue(value) {
  const input = String(value ?? '').trim().toLowerCase();
  return BOOLEAN_TRUE_VALUES.has(input)
    || BOOLEAN_FALSE_VALUES.has(input)
    || WEIGHTED_HUMAN_DELAY_RE.test(input)
    || HUMAN_DELAY_RANGE_RE.test(input);
}

export function normalizeHumanTiming(value = false) {
  if (value === undefined || value === null || value === false) {
    return false;
  }

  if (value && typeof value === 'object') {
    const minSeconds = Number(value.minSeconds);
    const maxSeconds = Number(value.maxSeconds);
    if (
      !Number.isSafeInteger(minSeconds)
      || !Number.isSafeInteger(maxSeconds)
      || minSeconds < 1
      || maxSeconds < minSeconds
    ) {
      throw new Error('Invalid --human value. Must be a range like 2-17 with positive integer seconds.');
    }
    return {
      minSeconds,
      maxSeconds,
      weighted: Boolean(value.weighted),
      cliValue: value.cliValue ?? (value.weighted ? null : `${minSeconds}-${maxSeconds}`),
    };
  }

  if (value === true) {
    return {
      minSeconds: DEFAULT_HUMAN_LOOP_DELAY_MIN_SECONDS,
      maxSeconds: DEFAULT_HUMAN_LOOP_DELAY_MAX_SECONDS,
      weighted: true,
      cliValue: null,
    };
  }

  const input = String(value).trim().toLowerCase();
  if (input === '' || BOOLEAN_TRUE_VALUES.has(input)) {
    return normalizeHumanTiming(true);
  }
  if (BOOLEAN_FALSE_VALUES.has(input)) {
    return false;
  }

  const weightedMatch = input.match(WEIGHTED_HUMAN_DELAY_RE);
  if (weightedMatch) {
    const minSeconds = Number(weightedMatch[1]);
    const maxSeconds = Number(weightedMatch[2]);
    if (
      minSeconds !== DEFAULT_HUMAN_LOOP_DELAY_MIN_SECONDS
      || maxSeconds !== DEFAULT_HUMAN_LOOP_DELAY_MAX_SECONDS
    ) {
      throw new Error(`Invalid --human value: "${value}". Weighted timing currently supports only ${DEFAULT_WEIGHTED_HUMAN_TIMING_CLI_VALUE}.`);
    }
    return {
      minSeconds,
      maxSeconds,
      weighted: true,
      cliValue: DEFAULT_WEIGHTED_HUMAN_TIMING_CLI_VALUE,
    };
  }

  const match = input.match(HUMAN_DELAY_RANGE_RE);
  if (!match) {
    throw new Error(`Invalid --human value: "${value}". Must be a range like 2-17 with positive integer seconds or ${DEFAULT_WEIGHTED_HUMAN_TIMING_CLI_VALUE}.`);
  }

  const minSeconds = Number(match[1]);
  const maxSeconds = Number(match[2]);
  if (
    !Number.isSafeInteger(minSeconds)
    || !Number.isSafeInteger(maxSeconds)
    || minSeconds < 1
    || maxSeconds < minSeconds
  ) {
    throw new Error(`Invalid --human value: "${value}". Must be a range like 2-17 with positive integer seconds.`);
  }

  return {
    minSeconds,
    maxSeconds,
    weighted: false,
    cliValue: `${minSeconds}-${maxSeconds}`,
  };
}

export function formatHumanDelayRange(value = true) {
  const humanTiming = normalizeHumanTiming(value);
  if (!humanTiming) return null;
  return `${humanTiming.minSeconds}-${humanTiming.maxSeconds}s`;
}

export function getHumanTimingCliValue(value = true) {
  const humanTiming = normalizeHumanTiming(value);
  if (!humanTiming) return null;
  return humanTiming.cliValue;
}

/**
 * Humanized jitter between looped games.
 *
 * Uses 1 + 2d4 seconds, producing a 3-9s range
 * with peak probability at 6s.
 */
export function getHumanLoopDelayMs(human = true) {
  const humanTiming = normalizeHumanTiming(human);
  if (!humanTiming) return 0;

  if (!humanTiming.weighted) {
    return randomIntInclusive(humanTiming.minSeconds, humanTiming.maxSeconds) * 1000;
  }

  const seconds = 1 + randomIntInclusive(1, 4) + randomIntInclusive(1, 4);
  return seconds * 1000;
}

/**
 * Short random think delay for auto-play decisions.
 */
export function getAutoThinkDelayMs() {
  return 250 + (randomIntInclusive(1, 4) + randomIntInclusive(1, 4)) * 150;
}

/**
 * Resolve the delay to use before the next looped game.
 *
 * When human timing is enabled, the humanized delay is added
 * on top of the fixed loop delay.
 */
export function getLoopDelayMs({ delaySeconds = DEFAULT_LOOP_DELAY_SECONDS, human = false } = {}) {
  const fixedDelayMs = Math.round(Math.max(delaySeconds, 0) * 1000);
  return normalizeHumanTiming(human) ? fixedDelayMs + getHumanLoopDelayMs(human) : fixedDelayMs;
}

/**
 * Resolve the effective fixed delay, treating implicit CLI defaults differently
 * from an explicitly supplied --delay value.
 */
export function resolveLoopDelaySeconds({
  rawDelay,
  human = false,
  defaultDelaySeconds = DEFAULT_LOOP_DELAY_SECONDS,
} = {}) {
  if (rawDelay === undefined || rawDelay === null || rawDelay === '') {
    return normalizeHumanTiming(human) ? 0 : defaultDelaySeconds;
  }

  return parseLoopDelaySeconds(rawDelay, defaultDelaySeconds);
}

/**
 * Format a delay for user-facing logs.
 */
export function formatDelayMs(ms) {
  const seconds = ms / 1000;
  return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
}

/**
 * Promise-based sleep helper.
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
