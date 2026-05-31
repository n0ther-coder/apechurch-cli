/**
 * Shared helpers for stateful auto-play modes.
 */
export const AUTO_MODE_SIMPLE = 'simple';
export const AUTO_MODE_BEST = 'best';
export const AUTO_MODE_MAX = 'max';
export const AUTO_MODE_WINSTON_LADDER = 'winston-ladder';

export const DEFAULT_AUTO_MODES = Object.freeze([AUTO_MODE_SIMPLE, AUTO_MODE_BEST]);

function toValidAutoModeSet(validModes = DEFAULT_AUTO_MODES) {
  return new Set(validModes.map((mode) => String(mode).trim().toLowerCase()));
}

export function formatAutoModes(validModes = DEFAULT_AUTO_MODES) {
  return Array.from(toValidAutoModeSet(validModes)).join(', ');
}

/**
 * Normalize CLI auto mode input.
 *
 * Commander optional options produce:
 * - undefined when omitted
 * - true for bare `--auto`
 * - string for explicit modes such as `--auto best`
 */
export function normalizeAutoMode(rawMode, validModes = DEFAULT_AUTO_MODES) {
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

  const validAutoModes = toValidAutoModeSet(validModes);
  return validAutoModes.has(normalized) ? normalized : null;
}

export function isAutoModeEnabled(autoMode, validModes = DEFAULT_AUTO_MODES) {
  if (!autoMode) {
    return false;
  }
  return toValidAutoModeSet(validModes).has(String(autoMode).trim().toLowerCase());
}

export function isBestAutoMode(autoMode) {
  return autoMode === AUTO_MODE_BEST;
}
