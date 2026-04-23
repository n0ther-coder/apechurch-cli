import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  createLoopTerminalState,
  formatLoopTerminalConditionMessage,
  getBalanceLoopTerminalCondition,
  getSingleGameLoopTerminalCondition,
  parseLoopTerminalOptions,
} from '../../lib/loop-conditions.js';

describe('Loop Terminal Conditions', () => {
  it('parses balance and single-game terminal options together', () => {
    assert.deepStrictEqual(parseLoopTerminalOptions({
      takeProfit: '200',
      minProfit: '30',
      stopLoss: '50',
      maxLoss: '15',
      maxGames: '25',
      targetX: '3.5',
      targetProfit: '150',
      retrace: '30',
      recoverLoss: '20',
      givebackProfit: '35',
    }), {
      targetBalance: 200,
      minProfit: 30,
      stopLoss: 50,
      maxLoss: 15,
      maxGames: 25,
      targetX: 3.5,
      targetProfit: 150,
      retrace: 30,
      recoverLoss: 20,
      givebackProfit: 35,
    });
  });

  it('rejects invalid target-profit values', () => {
    assert.throws(
      () => parseLoopTerminalOptions({ targetProfit: '0' }),
      /Invalid --target-profit value/
    );
  });

  it('rejects invalid max-loss values', () => {
    assert.throws(
      () => parseLoopTerminalOptions({ maxLoss: '0' }),
      /Invalid --max-loss value/
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

  it('detects retrace hits from exact settled losses', () => {
    const condition = getSingleGameLoopTerminalCondition({
      gameResult: {
        bet: 25,
        payout: 5,
        exactPayout: true,
      },
      retrace: 20,
    });

    assert.deepStrictEqual(condition, {
      kind: 'retrace',
      threshold: 20,
      wagerApe: 25,
      payoutApe: 5,
      lossApe: 20,
      multiplier: 0.2,
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

  it('formats human-readable retrace stop messages', () => {
    const message = formatLoopTerminalConditionMessage({
      kind: 'retrace',
      threshold: 20,
      wagerApe: 25,
      payoutApe: 5,
      lossApe: 20,
      multiplier: 0.2,
    }, {
      gamesPlayed: 6,
    });

    assert.ok(message.includes('Retrace hit! Loss: 20.00 APE >= 20.00 APE'));
    assert.ok(message.includes('Payout: 5.00 APE on 25.00 APE wager'));
    assert.ok(message.includes('Games played: 6'));
  });

  it('detects min-profit hits from session P&L', () => {
    const condition = getBalanceLoopTerminalCondition({
      currentBalanceApe: 123,
      startingBalanceApe: 100,
      minProfit: 20,
      gamesPlayed: 5,
    });

    assert.deepStrictEqual(condition, {
      kind: 'min_profit',
      threshold: 20,
      sessionPnlApe: 23,
    });
  });

  it('detects max-loss hits from session P&L', () => {
    const condition = getBalanceLoopTerminalCondition({
      currentBalanceApe: 79,
      startingBalanceApe: 100,
      maxLoss: 20,
      gamesPlayed: 5,
    });

    assert.deepStrictEqual(condition, {
      kind: 'max_loss',
      threshold: 20,
      sessionPnlApe: -21,
    });
  });

  it('arms recover-loss after a drawdown and stops on break-even recovery', () => {
    const terminalState = createLoopTerminalState();

    assert.strictEqual(getBalanceLoopTerminalCondition({
      currentBalanceApe: 85,
      startingBalanceApe: 100,
      recoverLoss: 20,
      gamesPlayed: 3,
      state: terminalState,
    }), null);

    assert.strictEqual(getBalanceLoopTerminalCondition({
      currentBalanceApe: 78,
      startingBalanceApe: 100,
      recoverLoss: 20,
      gamesPlayed: 4,
      state: terminalState,
    }), null);

    assert.equal(terminalState.recoverLossArmed, true);

    assert.deepStrictEqual(getBalanceLoopTerminalCondition({
      currentBalanceApe: 101,
      startingBalanceApe: 100,
      recoverLoss: 20,
      gamesPlayed: 7,
      state: terminalState,
    }), {
      kind: 'recover_loss',
      threshold: 20,
      sessionPnlApe: 1,
    });
  });

  it('arms giveback-profit after a run-up and stops on break-even giveback', () => {
    const terminalState = createLoopTerminalState();

    assert.strictEqual(getBalanceLoopTerminalCondition({
      currentBalanceApe: 130,
      startingBalanceApe: 100,
      givebackProfit: 40,
      gamesPlayed: 3,
      state: terminalState,
    }), null);

    assert.strictEqual(getBalanceLoopTerminalCondition({
      currentBalanceApe: 142,
      startingBalanceApe: 100,
      givebackProfit: 40,
      gamesPlayed: 4,
      state: terminalState,
    }), null);

    assert.equal(terminalState.givebackProfitArmed, true);

    assert.deepStrictEqual(getBalanceLoopTerminalCondition({
      currentBalanceApe: 99,
      startingBalanceApe: 100,
      givebackProfit: 40,
      gamesPlayed: 8,
      state: terminalState,
    }), {
      kind: 'giveback_profit',
      threshold: 40,
      sessionPnlApe: -1,
    });
  });

  it('formats human-readable recover-loss stop messages', () => {
    const message = formatLoopTerminalConditionMessage({
      kind: 'recover_loss',
      threshold: 25,
      sessionPnlApe: 0.5,
    }, {
      currentBalanceApe: 100.5,
      startingBalanceApe: 100,
      gamesPlayed: 9,
    });

    assert.ok(message.includes('Loss recovered! Session P&L: +0.50 APE'));
    assert.ok(message.includes('Triggered after reaching -25.00 APE or worse'));
    assert.ok(message.includes('Games played: 9'));
  });

  it('formats human-readable min-profit stop messages', () => {
    const message = formatLoopTerminalConditionMessage({
      kind: 'min_profit',
      threshold: 20,
      sessionPnlApe: 23,
    }, {
      currentBalanceApe: 123,
      startingBalanceApe: 100,
      gamesPlayed: 5,
    });

    assert.ok(message.includes('Min-profit reached! Session P&L: +23.00 APE (target: +20.00 APE)'));
    assert.ok(message.includes('Games played: 5'));
  });

  it('formats human-readable max-loss stop messages', () => {
    const message = formatLoopTerminalConditionMessage({
      kind: 'max_loss',
      threshold: 20,
      sessionPnlApe: -21,
    }, {
      currentBalanceApe: 79,
      startingBalanceApe: 100,
      gamesPlayed: 5,
    });

    assert.ok(message.includes('Max-loss hit! Session P&L: -21.00 APE (limit: -20.00 APE)'));
    assert.ok(message.includes('Games played: 5'));
  });
});
