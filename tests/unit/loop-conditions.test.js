import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  formatLoopTerminalConditionMessage,
  getSingleGameLoopTerminalCondition,
  parseLoopTerminalOptions,
} from '../../lib/loop-conditions.js';

describe('Loop Terminal Conditions', () => {
  it('parses balance and single-game terminal options together', () => {
    assert.deepStrictEqual(parseLoopTerminalOptions({
      target: '200',
      stopLoss: '50',
      maxGames: '25',
      targetX: '3.5',
      targetProfit: '150',
    }), {
      targetBalance: 200,
      stopLoss: 50,
      maxGames: 25,
      targetX: 3.5,
      targetProfit: 150,
    });
  });

  it('rejects invalid target-profit values', () => {
    assert.throws(
      () => parseLoopTerminalOptions({ targetProfit: '0' }),
      /Invalid --target-profit value/
    );
  });

  it('detects target-x hits from exact settled payouts', () => {
    const condition = getSingleGameLoopTerminalCondition({
      gameResult: {
        bet: 10,
        payout: 39,
        exactPayout: true,
      },
      targetX: 3.9,
    });

    assert.deepStrictEqual(condition, {
      kind: 'target_x',
      threshold: 3.9,
      wagerApe: 10,
      payoutApe: 39,
      multiplier: 3.9,
    });
  });

  it('detects target-profit hits from exact settled payouts', () => {
    const condition = getSingleGameLoopTerminalCondition({
      gameResult: {
        bet: 25,
        payout: 250,
        exactPayout: true,
      },
      targetProfit: 200,
    });

    assert.deepStrictEqual(condition, {
      kind: 'target_profit',
      threshold: 200,
      wagerApe: 25,
      payoutApe: 250,
      multiplier: 10,
    });
  });

  it('ignores approximate fallback payouts', () => {
    const condition = getSingleGameLoopTerminalCondition({
      gameResult: {
        bet: 10,
        payout: 100,
        exactPayout: false,
      },
      targetX: 5,
      targetProfit: 50,
    });

    assert.strictEqual(condition, null);
  });

  it('formats human-readable target-x stop messages', () => {
    const message = formatLoopTerminalConditionMessage({
      kind: 'target_x',
      threshold: 5,
      wagerApe: 10,
      payoutApe: 75,
      multiplier: 7.5,
    }, {
      gamesPlayed: 4,
    });

    assert.ok(message.includes('Target multiplier hit! 7.5x >= 5x'));
    assert.ok(message.includes('Payout: 75.00 APE on 10.00 APE wager'));
    assert.ok(message.includes('Games played: 4'));
  });
});
