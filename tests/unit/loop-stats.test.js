import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  createLoopStats,
  formatLoopProgress,
  formatSessionStats,
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
      '⚖️ Balance: 173.40 APE (+23.40)',
      '✌️  Win rate: 50.0% (1/2)',
      '🎲 RTP: 95.6% (payout 129.00  wagered 135.00  loss 6.00)',
      '🧮 Points: 1350 (225.0 GB/APE)',
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
      '⚖️ Balance: 173.40 APE (+23.40)',
      '✌️  Win rate: 50.0% (1/2)',
      '🎲 RTP: 131.5% (payout 177.50  wagered 135.00  win 42.50)',
      '🧮 Points: 1350 (+1350 GB, +42.50 APE)',
      '⏳ Next game in 6s',
    ]);
  });

  it('formats break-even points as positive GP only', () => {
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
      '⚖️ Balance: 150.00 APE (+0.00)',
      '✌️  Win rate: 0.0% (0/1)',
      '🎲 RTP: 100.0% (payout 25.00  wagered 25.00  even 0.00)',
      '🧮 Points: 250 (+250 GB)',
      '⏳ Next game in 6s',
    ]);
  });

  it('omits next-game line when the loop is about to terminate', () => {
    const stats = createLoopStats();

    recordLoopGame(stats, { won: true, wageredApe: 100, payoutApe: 150 });

    const output = formatLoopProgress({
      currentBalanceApe: 200,
      startingBalanceApe: 150,
      stats,
    });

    assert.deepStrictEqual(output.split('\n'), [
      '⚖️ Balance: 200.00 APE (+50.00)',
      '✌️  Win rate: 100.0% (1/1)',
      '🎲 RTP: 150.0% (payout 150.00  wagered 100.00  win 50.00)',
      '🧮 Points: 1000 (+1000 GB, +50.00 APE)',
    ]);
  });

  it('formats final session stats like the intermediate summary lines', () => {
    const stats = createLoopStats();

    recordLoopGame(stats, { won: true, wageredApe: 100, payoutApe: 150, feesPaidApe: 1.25 });
    recordLoopGame(stats, { won: false, wageredApe: 35, payoutApe: 25, feesPaidApe: 0.75 });

    const output = formatSessionStats({
      gamesPlayed: 2,
      startingBalanceApe: 150,
      endingBalanceApe: 188,
      stats,
    });

    const lines = output.split('\n');

    assert.deepStrictEqual(lines, [
      '🏁 Session Stats:',
      '   🎰 Games: 2',
      '   💸 Fees paid: 2.00 APE',
      '   🎉 Net result: +38.00 APE (⚖️ end 188.00 > start 150.00)',
      '   ✌️  Win rate: 50.0% (1/2)',
      '   🎲 RTP: 129.6% (payout 175.00  wagered 135.00  win 40.00)',
      '   🧮 Points: 1350 (+1350 GB, +40.00 APE)',
    ]);
  });

  it('formats session net-result comparator for break-even sessions', () => {
    const stats = createLoopStats();

    recordLoopGame(stats, { won: false, wageredApe: 25, payoutApe: 25, feesPaidApe: 0.5 });

    const output = formatSessionStats({
      gamesPlayed: 1,
      startingBalanceApe: 150,
      endingBalanceApe: 150,
      stats,
    });

    assert.match(output, /🤝 Net result: \+0\.00 APE \(⚖️ end 150\.00 = start 150\.00\)/);
  });
});
