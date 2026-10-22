import { parseEther } from 'viem';

// A result threshold is an absolute currency amount or a whole percentage.
// Payout multipliers use a different parser and must never enter this function.
export function normalizePnlThreshold(value, label = 'PnL threshold', { allowZero = false } = {}) {
  const text = String(value ?? '').trim();
  if (/^\d+%$/.test(text)) {
    const percentage = BigInt(text.slice(0, -1));
    if (!allowZero && percentage === 0n) throw new Error(`${label} must be positive.`);
    return `${percentage}%`;
  }
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
    throw new Error(`Invalid ${label}: use an absolute APE amount or a whole percentage, such as 25%.`);
  }
  const amount = parseEther(text);
  if (amount < 0n || (!allowZero && amount === 0n)) throw new Error(`${label} must be positive.`);
  return text;
}

export function pnlThresholdWei(value, wagerWei = 0n) {
  if (value === null || value === undefined) return null;
  const text = normalizePnlThreshold(value, 'PnL threshold', { allowZero: true });
  if (text.endsWith('%') && BigInt(wagerWei) <= 0n) return null;
  return text.endsWith('%')
    ? BigInt(wagerWei) * BigInt(text.slice(0, -1)) / 100n
    : parseEther(text);
}

export function pnlThresholdApe(value, wagerApe = 0) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (text.endsWith('%') && Number(wagerApe) <= 0) return null;
  return text.endsWith('%') ? Number(wagerApe) * Number(text.slice(0, -1)) / 100 : Number(text);
}
