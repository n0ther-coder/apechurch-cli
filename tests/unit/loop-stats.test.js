import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  createLoopStats,
  formatLoopGameCompletion,
  formatLoopProgress,
  formatSessionStats,
  recordLoopGame,
} from '../../lib/loop-stats.js';
import { stripAnsi } from '../../lib/ansi.js';

describe('Loop Stats', () => {
  it('formats a standalone loop completion line with the gray game id suffix', () => {
    const output = formatLoopGameCompletion({
      currentGame: 7,
      gameId: '1234567890',
    });

    assert.strictEqual(stripAnsi(output), 'Game 7 complete (1234567890)');
  });

  it('adds a 60-character progress bar when max-games is configured', () => {
    const output = formatLoopGameCompletion({
      currentGame: 30,
      maxGames: 60,
      gameId: '1234567890',
    });

    assert.deepStrictEqual(stripAnsi(output).split('\n'), [
      'Game 30 complete (1234567890)',
      `🔢  ${'▓'.repeat(30)}${'░'.repeat(30)} 50%`,
    ]);
  });

  it('formats loss-side points as GP per APE spent', () => {
    const stats = createLoopStats();

    recordLoopGame(stats, { won: false, wageredApe: 100, payoutApe: 90 });
    recordLoopGame(stats, { won: true, wageredApe: 35, payoutApe: 39 });

    const output = formatLoopProgress({
      currentBalanceApe: 173.4,
      startingBalanceApe: 150,
      stats,
      rtpGame: 'ape-strong',
      nextDelayLabel: '6s',
    });

    const lines = output.split('\n');

    assert.deepStrictEqual(lines, [
      '⚖️  Balance: 173.40 APE (+23.40)',
      '✌️  Win rate: 50.00% (1/2)',
      '🎲 RTP (expected/reported/current): 97.38% 👌 / 98.53% / 95.56% (payout 129.00 APE  wagered 135.00 APE  loss 6.00 APE)',
      '🧮 Points: 675 (112.5 GP/APE)',
      '⏳ Next game in 6s',
    ]);
  });

  it('formats profit-side points as total GP and APE gained', () => {
    const stats = createLoopStats();

    recordLoopGame(stats, { won: true, wageredApe: 100, payoutApe: 150 });
    recordLoopGame(stats, { won: false, wageredApe: 35, payoutApe: -7.5 + 35 });

    const output = formatLoopProgress({
      currentBalanceApe: 173.4,
      startingBalanceApe: 150,
      stats,
      rtpGame: 'ape-strong',
      nextDelayLabel: '6s',
    });

    const lines = output.split('\n');

    assert.deepStrictEqual(lines, [
      '⚖️  Balance: 173.40 APE (+23.40)',
      '✌️  Win rate: 50.00% (1/2)',
      '🎲 RTP (expected/reported/current): 97.38% 👌 / 98.53% / 131.48% (payout 177.50 APE  wagered 135.00 APE  win 42.50 APE)',
      '🧮 Points: 675 (+675 GP, +42.50 APE)',
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
      rtpGame: 'ape-strong',
      nextDelayLabel: '6s',
    });

    const lines = output.split('\n');

    assert.deepStrictEqual(lines, [
      '⚖️  Balance: 150.00 APE (+0.00)',
      '✌️  Win rate: 0.00% (0/1)',
      '🎲 RTP (expected/reported/current): 97.38% 👌 / 98.53% / 100.00% (payout 25.00 APE  wagered 25.00 APE  even 0.00 APE)',
      '🧮 Points: 125 (+125 GP)',
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
      rtpGame: 'ape-strong',
    });

    assert.deepStrictEqual(output.split('\n'), [
      '⚖️  Balance: 200.00 APE (+50.00)',
      '✌️  Win rate: 100.00% (1/1)',
      '🎲 RTP (expected/reported/current): 97.38% 👌 / 98.53% / 150.00% (payout 150.00 APE  wagered 100.00 APE  win 50.00 APE)',
      '🧮 Points: 500 (+500 GP, +50.00 APE)',
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
      rtpGame: 'ape-strong',
    });

    const lines = output.split('\n');

    assert.deepStrictEqual(lines, [
      '🏁 Session Stats:',
      '   🎰 Games: 2',
      '   💸 Fees paid: 2.0000 APE',
      '   🎉 Net result: +38.00 APE (⚖️  end 188.00 > start 150.00)',
      '   ✌️  Win rate: 50.00% (1/2)',
      '   🎲 RTP (expected/reported/current): 97.38% 👌 / 98.53% / 129.63% (payout 175.00 APE  wagered 135.00 APE  win 40.00 APE)',
      '   🧮 Points: 675 (+675 GP, +40.00 APE)',
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

    assert.match(output, /🤝 Net result: \+0\.00 APE \(⚖️  end 150\.00 = start 150\.00\)/);
  });

  it('scopes current RTP to the active variant bucket when config is provided', () => {
    const stats = createLoopStats();

    recordLoopGame(stats, {
      won: false,
      wageredApe: 10,
      payoutApe: 9,
      rtpGame: 'keno',
      rtpConfig: { picks: 4 },
    });
    recordLoopGame(stats, {
      won: true,
      wageredApe: 10,
      payoutApe: 12,
      rtpGame: 'keno',
      rtpConfig: { picks: 5 },
    });

    const output = formatLoopProgress({
      currentBalanceApe: 101,
      startingBalanceApe: 100,
      stats,
      rtpGame: 'keno',
      rtpConfig: { picks: 4 },
    });

    assert.match(output, /93\.39% 👌 \/ 86\.35% \/ 90\.00%/);
  });

  it('accepts a per-run GP rate override', () => {
    const stats = createLoopStats();

    recordLoopGame(stats, { won: false, wageredApe: 20, payoutApe: 10 });

    const output = formatLoopProgress({
      currentBalanceApe: 90,
      startingBalanceApe: 100,
      stats,
      rtpGame: 'ape-strong',
      gpPerApe: 8,
    });

    assert.match(output, /🧮 Points: 160 \(16\.0 GP\/APE\)/);
  });
});
