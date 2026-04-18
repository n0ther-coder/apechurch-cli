/**
 * @fileoverview Helpers for public game config surfaces
 *
 * Public CLI flags do not always map 1:1 to on-chain numeric values.
 * This module keeps user-facing names/ranges (`--risk`, labels, defaults)
 * separate from the internal config fields used by handlers and history.
 *
 * @module lib/game-config
 */
import { ensureIntRange } from './utils.js';

function normalizeConfigToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function parseStrictInteger(value) {
  const text = String(value || '').trim();
  if (!/^-?\d+$/.test(text)) {
    return null;
  }
  return Number.parseInt(text, 10);
}

function getConfigEntry(gameEntry, field) {
  return gameEntry?.config?.[field] || null;
}

export function getGameConfigCliName(gameEntry, field) {
  const cfg = getConfigEntry(gameEntry, field);
  return typeof cfg?.cliName === 'string' && cfg.cliName.trim()
    ? cfg.cliName.trim()
    : field;
}

export function getGameConfigDisplayRange(gameEntry, field) {
  const cfg = getConfigEntry(gameEntry, field);
  if (!cfg) {
    return { min: undefined, max: undefined };
  }
  return {
    min: cfg.cliMin ?? cfg.min,
    max: cfg.cliMax ?? cfg.max,
  };
}

export function getGameConfigDisplayDefault(gameEntry, field) {
  const cfg = getConfigEntry(gameEntry, field);
  return cfg ? (cfg.cliDefault ?? cfg.default) : undefined;
}

export function getGameOptionLabel(gameEntry, field, value, fallback = null) {
  const options = Array.isArray(gameEntry?.config?.[field]?.options)
    ? gameEntry.config[field].options
    : [];
  const match = options.find((option) => (
    Number(option?.value) === Number(value)
    || Number(option?.publicValue) === Number(value)
  ));
  return typeof match?.label === 'string' && match.label.trim()
    ? match.label.trim()
    : fallback;
}

function findOptionByLabel(options, token) {
  return options.find((option) => {
    const candidates = [
      option?.label,
      ...(Array.isArray(option?.aliases) ? option.aliases : []),
    ]
      .map(normalizeConfigToken)
      .filter(Boolean);
    return candidates.includes(token);
  }) || null;
}

function findOptionByNumericValue(options, numericValue, numericKind) {
  const candidateExtractors = numericKind === 'internal'
    ? [option => option?.value]
    : numericKind === 'public'
      ? [option => option?.publicValue ?? option?.value]
      : [option => option?.publicValue ?? option?.value, option => option?.value];

  for (const getCandidate of candidateExtractors) {
    const match = options.find((option) => Number(getCandidate(option)) === numericValue);
    if (match) {
      return match;
    }
  }

  return null;
}

export function parseGameConfigValue(gameEntry, field, rawValue, { numericKind = 'either' } = {}) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return undefined;
  }

  const cfg = getConfigEntry(gameEntry, field);
  if (!cfg) {
    return parseStrictInteger(rawValue);
  }

  const label = getGameConfigCliName(gameEntry, field);
  const options = Array.isArray(cfg.options) ? cfg.options : [];
  const token = normalizeConfigToken(rawValue);

  if (options.length > 0) {
    const byLabel = findOptionByLabel(options, token);
    if (byLabel) {
      return Number(byLabel.value);
    }

    const numericValue = parseStrictInteger(rawValue);
    if (numericValue !== null) {
      const byNumeric = findOptionByNumericValue(options, numericValue, numericKind);
      if (byNumeric) {
        return Number(byNumeric.value);
      }
    }

    const acceptedLabels = options
      .map((option) => option?.label)
      .filter((value) => typeof value === 'string' && value.trim());
    const { min, max } = getGameConfigDisplayRange(gameEntry, field);
    if (min !== undefined && max !== undefined) {
      throw new Error(`${label} must be between ${min} and ${max}, or one of: ${acceptedLabels.join(', ')}.`);
    }
    throw new Error(`${label} must be one of: ${acceptedLabels.join(', ')}.`);
  }

  if (cfg.min !== undefined && cfg.max !== undefined) {
    return ensureIntRange(rawValue, label, cfg.min, cfg.max);
  }

  return parseStrictInteger(rawValue);
}
