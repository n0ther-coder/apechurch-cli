import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  createLoopStats,
  formatLoopProgress,
  recordLoopGame,
} from '../../lib/loop-stats.js';

describe('Loop Stats', () => {
  it('formats loss-side points as GB per APE spent', () => {
    const stats = createLoopStats();

    recordLoopGame(stats, { won: false, wageredApe: 100, payoutApe: 90 });
    recordLoopGame(stats, { won: true, wageredApe: 35, payoutApe: 39 });

    const output = formatLoopProgress({
      currentBalanceApe: 173.4,
      startingBalanceApe: 150,
      stats,
      nextDelayLabel: '6s',
    });

    const lines = output.split('\n');

    assert.deepStrictEqual(lines, [
      '💰 Balance: 173.40 APE (+23.40)',
      '✌️  Win rate: 50.0% (1/2)',
      '🎲 RTP: 95.6% (payout 129.00  wagered 135.00  loss 6.00)',
      '🧮 Points: 1350, 225.0 GB/APE',
      '⏳ Next game in 6s',
    ]);
  });

  it('formats profit-side points as total GB and APE gained', () => {
    const stats = createLoopStats();

    recordLoopGame(stats, { won: true, wageredApe: 100, payoutApe: 150 });
    recordLoopGame(stats, { won: false, wageredApe: 35, payoutApe: -7.5 + 35 });

    const output = formatLoopProgress({
      currentBalanceApe: 173.4,
      startingBalanceApe: 150,
      stats,
      nextDelayLabel: '6s',
    });

    const lines = output.split('\n');

    assert.deepStrictEqual(lines, [
      '💰 Balance: 173.40 APE (+23.40)',
      '✌️  Win rate: 50.0% (1/2)',
      '🎲 RTP: 131.5% (payout 177.50  wagered 135.00  win 42.50)',
      '🧮 Points: 1350, +1350 GB, +42.50 APE',
      '⏳ Next game in 6s',
    ]);
  });

  it('formats break-even points using the base conversion rate', () => {
    const stats = createLoopStats();

    recordLoopGame(stats, { won: false, wageredApe: 25, payoutApe: 25 });

    const output = formatLoopProgress({
      currentBalanceApe: 150,
      startingBalanceApe: 150,
      stats,
      nextDelayLabel: '6s',
    });

    const lines = output.split('\n');

    assert.deepStrictEqual(lines, [
      '💰 Balance: 150.00 APE (+0.00)',
      '✌️  Win rate: 0.0% (0/1)',
      '🎲 RTP: 100.0% (payout 25.00  wagered 25.00  even 0.00)',
      '🧮 Points: 250, 10 GB/APE',
      '⏳ Next game in 6s',
    ]);
  });
});
