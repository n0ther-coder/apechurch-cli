// Decision-only currency comparisons. Never quantize accounting or stakes.
export const DEFAULT_STRATEGY_PRECISION = 'none';

export function normalizeStrategyPrecision(value) {
  const text = String(value).trim();
  if (text === 'none' || /^(?:[0-9]|1[0-8])$/.test(text)) return text;
  throw new Error('--strategy-precision requires an integer from 0 to 18, or none.');
}

export function extractStrategyPrecisionArgs(args = [], inherited = DEFAULT_STRATEGY_PRECISION) {
  const remainingArgs = [];
  let explicit = null;
  for (let i = 0; i < args.length; i++) {
    const token = String(args[i]);
    if (token === '--strategy-precision' || token.startsWith('--strategy-precision=')) {
      if (explicit !== null) throw new Error('--strategy-precision may be specified only once.');
      explicit = normalizeStrategyPrecision(token === '--strategy-precision' ? args[++i] : token.slice(21));
    } else remainingArgs.push(token);
  }
  return { remainingArgs, explicit, precision: explicit ?? normalizeStrategyPrecision(inherited) };
}

export function inheritStrategyPrecisionArgs(args, inherited = DEFAULT_STRATEGY_PRECISION) {
  const parsed = extractStrategyPrecisionArgs(args, inherited);
  return parsed.explicit === null ? [...args, '--strategy-precision', parsed.precision] : [...args];
}

export function resolveStrategyPrecisionResume(args, savedSummary = null) {
  const parsed = extractStrategyPrecisionArgs(args);
  if (!savedSummary) return parsed.precision;
  const savedValues = [
    savedSummary.resume_state?.strategy_precision,
    savedSummary.resume_state?.loop_controls?.strategyPrecision,
    extractStrategyPrecisionArgs(savedSummary.args ?? [], 'none').explicit,
  ].filter(value => value != null).map(normalizeStrategyPrecision);
  if (new Set(savedValues).size > 1) {
    throw new Error('Inconsistent saved --strategy-precision; refusing to resume.');
  }
  const precision = savedValues[0] ?? 'none';
  if (parsed.explicit !== null && parsed.explicit !== precision) {
    throw new Error('Cannot change --strategy-precision when resuming a run.');
  }
  return precision;
}

// rightNumerator / denominator is an exact amount in wei, including sub-wei
// thresholds. Dividing only the difference keeps the tolerance absolute.
export function compareStrategyAmounts(leftWei, rightNumerator = 0n, precision = DEFAULT_STRATEGY_PRECISION, denominator = 1n) {
  const mode = normalizeStrategyPrecision(precision);
  const divisor = BigInt(denominator);
  if (divisor <= 0n) throw new Error('Strategy comparison denominator must be positive.');
  let difference = BigInt(leftWei) * divisor - BigInt(rightNumerator);
  if (mode !== 'none') difference /= divisor * 10n ** (18n - BigInt(mode));
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function strategyShortfall(leftWei, rightNumerator, denominator = 1n) {
  const divisor = BigInt(denominator);
  if (divisor <= 0n) throw new Error('Strategy comparison denominator must be positive.');
  const missing = BigInt(rightNumerator) - BigInt(leftWei) * divisor;
  if (missing <= 0n) return {};
  let finite = divisor;
  for (const factor of [2n, 5n]) while (finite % factor === 0n) finite /= factor;
  if (finite !== 1n) throw new Error('Shortfall requires a terminating decimal threshold.');
  const scale = divisor * 10n ** 18n;
  let remainder = missing % scale;
  let fraction = '';
  while (remainder) {
    remainder *= 10n;
    fraction += String(remainder / scale);
    remainder %= scale;
  }
  return { shortfall_ape: `${missing / scale}${fraction ? `.${fraction}` : ''}` };
}

export function createStrategyComparison(controls = {}) {
  return (leftWei, rightNumerator = 0n, denominator = 1n) =>
    compareStrategyAmounts(leftWei, rightNumerator, controls.strategyPrecision ?? DEFAULT_STRATEGY_PRECISION, denominator);
}
