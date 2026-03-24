/**
 * Shared helpers for stateful auto-play modes.
 */
export const AUTO_MODE_SIMPLE = 'simple';
export const AUTO_MODE_BEST = 'best';

const VALID_AUTO_MODES = new Set([AUTO_MODE_SIMPLE, AUTO_MODE_BEST]);

/**
 * Normalize CLI auto mode input.
 *
 * Commander optional options produce:
 * - undefined when omitted
 * - true for bare `--auto`
 * - string for `--auto best`
 */
export function normalizeAutoMode(rawMode) {
  if (rawMode === undefined || rawMode === null || rawMode === false) {
    return null;
  }

  if (rawMode === true) {
    return AUTO_MODE_SIMPLE;
  }

  const normalized = String(rawMode).trim().toLowerCase();
  if (normalized === '') {
    return AUTO_MODE_SIMPLE;
  }

  return VALID_AUTO_MODES.has(normalized) ? normalized : null;
}

export function isAutoModeEnabled(autoMode) {
  return autoMode === AUTO_MODE_SIMPLE || autoMode === AUTO_MODE_BEST;
}

export function isBestAutoMode(autoMode) {
  return autoMode === AUTO_MODE_BEST;
}
