/**
 * Shared timing helpers for stateful games.
 */
import { randomIntInclusive } from '../utils.js';

export const DEFAULT_LOOP_DELAY_SECONDS = 5;

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

/**
 * Humanized delay between looped games.
 *
 * Uses 1 + 2d4 seconds, producing a 3-9s range
 * with peak probability at 6s.
 */
export function getHumanLoopDelayMs() {
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
 */
export function getLoopDelayMs({ delaySeconds = DEFAULT_LOOP_DELAY_SECONDS, human = false } = {}) {
  if (human) {
    return getHumanLoopDelayMs();
  }

  return Math.round(Math.max(delaySeconds, 1) * 1000);
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
