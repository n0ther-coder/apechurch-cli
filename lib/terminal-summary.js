import { formatEther, parseEther } from 'viem';
import { aggregateEconomicsPayloads } from './economics.js';

function amount(summary, total, single, wei) {
  if (Object.hasOwn(summary, total)) return summary[total];
  if (Object.hasOwn(summary, single)) return summary[single];
  return summary[wei] == null ? null : formatEther(BigInt(summary[wei]));
}

// A partial total never declares a routine complete or a pending wager settled.
export function formatPartialRunSummary(summary = {}) {
  const wager = amount(summary, 'total_wager_ape', 'wager_ape', 'wager_wei');
  const payout = amount(summary, 'total_payout_ape', 'payout_ape', 'payout_wei');
  const pnl = amount(summary, 'total_pnl_ape', 'pnl_ape', 'pnl_wei');
  let multiplier = 'n/a';
  try {
    const w = parseEther(String(wager));
    const p = parseEther(String(payout));
    if (w > 0n) {
      const ratio = (p * 200n + w) / (2n * w);
      multiplier = `${ratio / 100n}.${String(ratio % 100n).padStart(2, '0')}×`;
    }
  } catch { /* Missing amounts stay explicitly unavailable. */ }
  const games = summary.settled_games_played ?? summary.completed_games ?? 'n/a';
  const pending = summary.total_pending_exposure_ape ?? summary.pending_exposure_ape;
  const costs = summary.failed_attempt_accounting?.cost_ape;
  return `# partial: settled games: ${games}, wagered: ${wager ?? 'unavailable'}, payout: ${payout ?? 'unavailable'}, net PnL: ${pnl ?? 'unavailable'}, multiplier: ${multiplier}`
    + (pending != null && String(pending) !== '0' ? `, pending exposure: ${pending}` : '')
    + (costs != null ? `, failed-attempt costs: ${costs}` : '');
}

export function writeRunFailure(summary, { stream = process.stdout } = {}) {
  stream.write(`${formatPartialRunSummary(summary)}\n`);
  const error = summary.error;
  const message = typeof error === 'object' ? error?.message : error;
  if (message) stream.write(`# error: ${String(message).replace(/[\r\n]+/g, ' ')}\n`);
}

export function buildLoopFailureSummary(stats, { game, error, loop = true } = {}) {
  const settled = stats.economics ?? [];
  const failure = error?.accounting;
  const fallback = { wager_ape: String(stats.totalWageredApe ?? 0),
    payout_ape: String(stats.totalPayoutApe ?? 0), cost_ape: String(stats.totalFeesPaidApe ?? 0) };
  const base = settled.length ? settled : stats.completedGames > 0 ? [fallback] : [];
  const entries = failure?.failed_transaction_only ? [...base, failure] : base;
  const economics = entries.length ? aggregateEconomicsPayloads(entries) : {
    total_wager_ape: String(stats.totalWageredApe ?? 0),
    total_payout_ape: String(stats.totalPayoutApe ?? 0),
    total_pnl_ape: String((stats.totalPayoutApe ?? 0) - (stats.totalWageredApe ?? 0) - (stats.totalFeesPaidApe ?? 0)),
  };
  return { game, status: 'error', partial: true, loop,
    ...economics, completed_games: stats.completedGames ?? 0,
    games_played: stats.completedGames ?? 0, games_detail: settled,
    error: String(error?.message ?? error ?? 'Execution interrupted'),
    ...(failure ? { failed_attempt_accounting: failure } : {}),
    ...(failure && !failure.failed_transaction_only && failure.wager_ape != null
      ? { pending_exposure_ape: failure.wager_ape } : {}) };
}

export function reportLoopFailure(stats, { game, error, json = false, silent = false, loop = true } = {}) {
  const summary = buildLoopFailureSummary(stats, { game, error, loop });
  if (error && typeof error === 'object') error.partial_summary = summary;
  if (!silent) {
    if (json) process.stdout.write(`${JSON.stringify(summary)}\n`);
    else {
      writeRunFailure(summary);
      if (error && typeof error === 'object') error.terminalOutputHandled = true;
    }
  }
  return summary;
}
