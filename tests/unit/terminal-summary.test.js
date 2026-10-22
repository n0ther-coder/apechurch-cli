import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseEther } from 'viem';
import { createLoopStats, recordLoopGame } from '../../lib/loop-stats.js';
import { createEconomics, serializeEconomics } from '../../lib/economics.js';
import { buildLoopFailureSummary, formatPartialRunSummary, writeRunFailure, reportLoopFailure } from '../../lib/terminal-summary.js';

const economics = (w, p, c) => serializeEconomics(createEconomics({
  wagerWei: parseEther(w), payoutWei: parseEther(p), costsWei: parseEther(c),
}));

describe('terminal partial results', () => {
  it('attaches one structured partial result without writing a second stateful JSON document', () => {
    const error = new Error('Balance RPC failed');
    const stats = createLoopStats();
    recordLoopGame(stats, { wageredApe: 8, payoutApe: 10, feesPaidApe: 0.1, economics: economics('8', '10', '0.1') });
    const summary = reportLoopFailure(stats, { game: 'blackjack', error, json: true, silent: true });
    assert.equal(error.partial_summary, summary);
    assert.equal(summary.total_pnl_ape, '1.9');
    assert.equal(summary.completed_games, 1);
  });
  it('reports exact settled totals and pending exposure without declaring a completed routine', () => {
    const line = formatPartialRunSummary({ total_wager_ape: '8', total_payout_ape: '10',
      total_pnl_ape: '1.9', settled_games_played: 2, total_pending_exposure_ape: '3' });
    assert.equal(line, '# partial: settled games: 2, wagered: 8, payout: 10, net PnL: 1.9, multiplier: 1.25×, pending exposure: 3');
    assert.doesNotMatch(line, /routine:|complete/);
  });

  it('retains unavailable net results and undefined zero-wager multipliers', () => {
    const line = formatPartialRunSummary({ total_wager_ape: '0', total_payout_ape: '0', total_pnl_ape: null });
    assert.match(line, /net PnL: unavailable, multiplier: n\/a/);
    assert.match(formatPartialRunSummary({ total_wager_ape: '1000', total_payout_ape: '1019' }), /multiplier: 1.02×/);
  });

  it('includes failed-only costs once without adding another game', () => {
    const stats = createLoopStats();
    recordLoopGame(stats, { wageredApe: 8, payoutApe: 10, feesPaidApe: 0.1, economics: economics('8', '10', '0.1') });
    const error = Object.assign(new Error('Retries exhausted'), { accounting: {
      ...economics('0', '0', '0.2'), failed_transaction_only: true, counts_as_game: false,
    } });
    const summary = buildLoopFailureSummary(stats, { game: 'ape-strong', error });
    assert.equal(summary.status, 'error');
    assert.equal(summary.completed_games, 1);
    assert.equal(summary.games_played, 1);
    assert.equal(summary.total_wager_ape, '8');
    assert.equal(summary.total_payout_ape, '10');
    assert.equal(summary.total_pnl_ape, '1.7');
    assert.equal(summary.games_detail.length, 1);
    let output = '';
    writeRunFailure(summary, { stream: { write: chunk => { output += chunk; } } });
    assert.match(output, /net PnL: 1.7/);
    assert.match(output, /# error: Retries exhausted/);
  });

  it('does not discard recorded totals when legacy entries lack per-game economics', () => {
    const stats = createLoopStats();
    recordLoopGame(stats, { wageredApe: 8, payoutApe: 10, feesPaidApe: 0.1 });
    const error = Object.assign(new Error('Failed'), { accounting: {
      ...economics('0', '0', '0.2'), failed_transaction_only: true,
    } });
    assert.equal(buildLoopFailureSummary(stats, { error }).total_pnl_ape, '1.7');
  });

  it('keeps an unresolved wager outside settled counts and totals', () => {
    const stats = createLoopStats();
    recordLoopGame(stats, { wageredApe: 8, payoutApe: 10, feesPaidApe: 0.1, economics: economics('8', '10', '0.1') });
    const error = Object.assign(new Error('State read failed'), { accounting: {
      ...economics('3', '0', '0.2'), failed_transaction_only: false, counts_as_game: false,
    } });
    const result = buildLoopFailureSummary(stats, { error });
    assert.equal(result.completed_games, 1);
    assert.equal(result.total_wager_ape, '8');
    assert.equal(result.total_pnl_ape, '1.9');
    assert.equal(result.failed_attempt_accounting.wager_ape, '3');
  });
});
