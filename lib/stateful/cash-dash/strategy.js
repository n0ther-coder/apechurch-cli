/**
 * Cash Dash auto-play helpers.
 */
import { BASIS_POINTS, DEFAULT_ROW_PAYOUT_BPS } from './constants.js';
import { formatMultiplier, formatTileLabel } from './state.js';

export function getSimpleDecision(state, opts = {}) {
  if (!state?.awaitingDecision) {
    return null;
  }

  const cashoutAfter = normalizeCashoutAfter(opts.cashoutAfter);
  if (state.canCashOut && state.roundsWon >= cashoutAfter) {
    return {
      type: 'cashout',
      label: 'Cash Out',
      reason: `bank after ${state.roundsWon} safe row${state.roundsWon === 1 ? '' : 's'}`,
    };
  }

  const index = chooseTileIndex(state, opts);
  return {
    type: 'guess',
    index,
    label: formatTileLabel(index),
    reason: state.roundsWon < cashoutAfter
      ? `continuing until ${cashoutAfter} safe row${cashoutAfter === 1 ? '' : 's'}`
      : 'all hidden tiles are symmetric',
  };
}

export function getBestDecision(state, runtimeConfig = null, opts = {}) {
  if (!state?.awaitingDecision) {
    return null;
  }

  const cashoutAfter = normalizeCashoutAfter(opts.cashoutAfter);
  const continuation = estimateOneStepContinuation(state, runtimeConfig);

  if (state.canCashOut && state.roundsWon >= cashoutAfter) {
    return {
      type: 'cashout',
      label: 'Cash Out',
      reason: `cashout dominates continuation (net EV ${formatMultiplier(continuation.netEvMultiplier, 3)})`,
      evMultiplier: 1,
      continuationEvMultiplier: continuation.netEvMultiplier,
    };
  }

  const index = chooseTileIndex(state, opts);
  return {
    type: 'guess',
    index,
    label: formatTileLabel(index),
    reason: state.roundsWon < cashoutAfter
      ? `risk target requires ${cashoutAfter} safe row${cashoutAfter === 1 ? '' : 's'} (next EV ${formatMultiplier(continuation.netEvMultiplier, 3)})`
      : `best continuation net EV ${formatMultiplier(continuation.netEvMultiplier, 3)}`,
    evMultiplier: continuation.netEvMultiplier,
    survivalProbability: continuation.survivalProbability,
  };
}

export function estimateOneStepContinuation(state, runtimeConfig = null) {
  const tileCount = Number(state?.currentTileCount || 0);
  const rowPayoutBps = runtimeConfig?.rowPayoutBps || DEFAULT_ROW_PAYOUT_BPS;
  const payoutBps = Number(rowPayoutBps[tileCount] ?? DEFAULT_ROW_PAYOUT_BPS[tileCount] ?? BASIS_POINTS);
  const payoutMultiplier = payoutBps / BASIS_POINTS;
  const survivalProbability = tileCount > 0 ? (tileCount - 1) / tileCount : 0;
  const grossEvMultiplier = survivalProbability * payoutMultiplier;
  const feeRatio = toRatio(runtimeConfig?.vrfFee ?? 0n, state?.currentPayout ?? state?.initialBetAmount ?? 0n);

  return {
    tileCount,
    payoutMultiplier,
    survivalProbability,
    grossEvMultiplier,
    feeRatio,
    netEvMultiplier: grossEvMultiplier - feeRatio,
  };
}

function chooseTileIndex(state, opts = {}) {
  const availableTiles = Array.isArray(state?.availableTiles) && state.availableTiles.length > 0
    ? state.availableTiles
    : Array.from({ length: Number(state?.currentTileCount || 0) }, (_, index) => index);
  const preferred = Number(opts.preferredTileIndex);

  if (Number.isInteger(preferred) && availableTiles.includes(preferred)) {
    return preferred;
  }

  return availableTiles[0] ?? 0;
}

function normalizeCashoutAfter(value) {
  const parsed = Number.parseInt(value ?? 1, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function toRatio(numerator, denominator) {
  const denom = BigInt(denominator || 0n);
  if (denom <= 0n) {
    return 0;
  }
  return Number(BigInt(numerator || 0n)) / Number(denom);
}
