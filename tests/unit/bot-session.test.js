/**
 * Unit Tests: shared bot session helpers.
 *
 * These tests cover only the public helper surface used by private bots. They
 * intentionally do not encode any private bot strategy.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatBeforeGameLine,
  formatBotCommandLine,
  formatCommandLine,
  formatIterationSummaryLine,
  formatPlayCommandSuffix,
  getStandardBotInternalDelayMs,
  getStandardBotCliForwardTokens,
  getNestedBotEconomics,
  getStandardBotLoopCondition,
  getPlayStatus,
  getSettledPlayEconomics,
  getStandardBotNestedBotForwardTokens,
  parseApeToWei,
  parseStandardBotArgs,
  prepareStandardBotLoopRuntime,
  shouldTriggerFallback,
} from '../../lib/bots/session.js';

describe('Bot Session Helpers', () => {
  it('parses standard json and fallback options without consuming private bot args', () => {
    const parsed = parseStandardBotArgs([
      '--json',
      '--fallback-loss',
      '25',
      '--fallback-bot=fallback-bot',
      '--private-mode',
      'x',
    ]);

    assert.strictEqual(parsed.json, true);
    assert.strictEqual(parsed.fallbackLoss, '25');
    assert.strictEqual(parsed.fallbackBot, 'fallback-bot');
    assert.deepStrictEqual(parsed.remainingArgs, ['--private-mode', 'x']);
  });

  it('parses --color as a shared bot output option', () => {
    const parsed = parseStandardBotArgs(['--color', '--private-mode']);

    assert.strictEqual(parsed.color, true);
    assert.deepStrictEqual(parsed.remainingArgs, ['--private-mode']);
  });

  it('parses standard bot loop controls separately from private args', () => {
    const parsed = parseStandardBotArgs([
      '--take-profit=12',
      '--min-profit',
      '5',
      '--recover-loss',
      '3',
      '--giveback-profit=4',
      '--stop-loss',
      '8',
      '--max-loss=9',
      '--max-games',
      '2',
      '--gp-ape',
      '7.5',
      '--human',
      '--delay=6',
      '--private-mode',
    ]);

    assert.deepStrictEqual(parsed.loopControls, {
      takeProfit: '12',
      minProfit: '5',
      recoverLoss: '3',
      givebackProfit: '4',
      stopLoss: '8',
      maxLoss: '9',
      maxGames: '2',
      gpApe: '7.5',
      human: true,
      delay: '6',
    });
    assert.deepStrictEqual(parsed.remainingArgs, ['--private-mode']);

    assert.strictEqual(parseStandardBotArgs(['--delay=0']).loopControls.delay, '0');
  });

  it('accepts --bankroll as an alias for --max-loss', () => {
    const parsed = parseStandardBotArgs(['--bankroll', '9']);
    assert.strictEqual(parsed.loopControls.maxLoss, '9');
  });

  it('parses and forwards custom standard bot human timing ranges', () => {
    const parsed = parseStandardBotArgs([
      '--human',
      '2-17',
      '--private-mode',
    ]);

    assert.strictEqual(parsed.loopControls.human, '2-17');
    assert.deepStrictEqual(parsed.remainingArgs, ['--private-mode']);
    assert.deepStrictEqual(
      getStandardBotCliForwardTokens(parsed.loopControls, {}),
      ['--human', '2-17'],
    );

    const disabled = parseStandardBotArgs(['--human=false']);
    assert.strictEqual(disabled.loopControls.human, false);
    assert.deepStrictEqual(getStandardBotCliForwardTokens(disabled.loopControls, {}), []);
  });

  it('computes internal bot pacing from explicit delay plus human timing', () => {
    assert.strictEqual(getStandardBotInternalDelayMs({ delay: null, human: false }), 0);
    assert.strictEqual(getStandardBotInternalDelayMs({ delay: '6', human: false }), 6000);

    for (let i = 0; i < 10; i += 1) {
      const delayMs = getStandardBotInternalDelayMs({ delay: '5', human: '2-4' });
      assert.ok(delayMs >= 7000, `delay ${delayMs} should include the fixed and minimum human delay`);
      assert.ok(delayMs <= 9000, `delay ${delayMs} should include the fixed and maximum human delay`);
    }
  });

  it('forwards absolute take-profit and stop-loss wallet guards unchanged', async () => {
    const parsed = parseStandardBotArgs([
      '--take-profit',
      '1400',
      '--stop-loss',
      '300',
      '--gp-ape',
      '7.5',
      '--human',
      '--delay',
      '6',
    ]);
    const runtime = await prepareStandardBotLoopRuntime({
      loopControls: parsed.loopControls,
      getBalanceApe: async () => 1000,
      dryRun: false,
    });

    assert.deepStrictEqual(
      getStandardBotCliForwardTokens(parsed.loopControls, runtime),
      ['--take-profit', '1400', '--stop-loss', '300', '--gp-ape', '7.5', '--human', '--delay', '6'],
    );
    assert.strictEqual(parsed.loopControls.maxLoss, '700');
  });

  it('derives CLI wallet guards from relative min-profit and max-loss controls', async () => {
    const parsed = parseStandardBotArgs([
      '--min-profit',
      '5',
      '--max-loss',
      '8',
      '--gp-ape',
      '7.5',
      '--human',
      '--delay',
      '6',
    ]);
    const runtime = await prepareStandardBotLoopRuntime({
      loopControls: parsed.loopControls,
      getBalanceApe: async () => 100,
      dryRun: false,
    });

    assert.deepStrictEqual(
      getStandardBotCliForwardTokens(parsed.loopControls, runtime),
      ['--take-profit', '105', '--stop-loss', '92', '--gp-ape', '7.5', '--human', '--delay', '6'],
    );
  });

  it('forwards absolute wallet guards to nested bots', async () => {
    const parsed = parseStandardBotArgs([
      '--min-profit',
      '5',
      '--max-loss',
      '8',
      '--recover-loss',
      '3',
      '--giveback-profit',
      '4',
      '--max-games',
      '9',
    ]);
    const runtime = await prepareStandardBotLoopRuntime({
      loopControls: parsed.loopControls,
      getBalanceApe: async () => 100,
      dryRun: false,
    });

    assert.deepStrictEqual(
      getStandardBotNestedBotForwardTokens(parsed.loopControls, {
        runtime,
        remainingMaxGames: 2,
      }),
      [
        '--take-profit',
        '105',
        '--recover-loss',
        '3',
        '--giveback-profit',
        '4',
        '--stop-loss',
        '92',
        '--max-games',
        '2',
      ],
    );
  });

  it('detects standard bot gross P&L loop conditions', () => {
    const parsed = parseStandardBotArgs(['--max-loss', '2', '--max-games', '3']);

    assert.deepStrictEqual(
      getStandardBotLoopCondition({
        loopControls: parsed.loopControls,
        totalPnlWei: -3n * 10n ** 18n,
        executions: 2,
      }),
      {
        kind: 'max_loss',
        threshold_ape: '2',
        pnl_ape: '-3',
        executions: 2,
      },
    );

    assert.deepStrictEqual(
      getStandardBotLoopCondition({
        loopControls: parsed.loopControls,
        totalPnlWei: 0n,
        executions: 3,
      }),
      {
        kind: 'max_games',
        threshold: 3,
        pnl_ape: '0',
        executions: 3,
      },
    );
  });

  it('detects absolute wallet take-profit and stop-loss loop conditions', () => {
    const parsed = parseStandardBotArgs(['--take-profit', '1400', '--stop-loss', '300']);

    assert.deepStrictEqual(
      getStandardBotLoopCondition({
        loopControls: parsed.loopControls,
        totalPnlWei: 10n * 10n ** 18n,
        currentBalanceApe: '1400.1',
        executions: 4,
      }),
      {
        kind: 'take_profit',
        threshold_ape: '1400',
        balance_ape: '1400.1',
        pnl_ape: '10',
        executions: 4,
      },
    );

    assert.deepStrictEqual(
      getStandardBotLoopCondition({
        loopControls: parsed.loopControls,
        totalPnlWei: -10n * 10n ** 18n,
        currentBalanceApe: '299.9',
        executions: 5,
      }),
      {
        kind: 'stop_loss',
        threshold_ape: '300',
        balance_ape: '299.9',
        pnl_ape: '-10',
        executions: 5,
      },
    );
  });

  it('requires fallback options to be specified together', () => {
    assert.throws(
      () => parseStandardBotArgs(['--fallback-loss', '10']),
      /must be specified together/,
    );
    assert.throws(
      () => parseStandardBotArgs(['--fallback-bot', 'other-bot']),
      /must be specified together/,
    );
  });

  it('formats the standard terminal output lines without colors', () => {
    assert.strictEqual(
      formatBeforeGameLine({
        balanceApe: '100.0000',
        totalPayoutWei: 30n * 10n ** 18n,
        totalWagerWei: 20n * 10n ** 18n,
        totalPnlWei: 10n * 10n ** 18n,
      }),
      '# balance: 100.0000, payout_ape: 30, wager_ape: 20, pnl: 10',
    );

    assert.strictEqual(
      formatIterationSummaryLine({
        gameNumber: 3,
        totalWagerWei: 20n * 10n ** 18n,
        totalPayoutWei: 25n * 10n ** 18n,
        totalPnlWei: 5n * 10n ** 18n,
      }),
      '# game_n: 3, wagered: 20, pnl: 5, multiply: 1.25',
    );

    assert.strictEqual(
      formatPlayCommandSuffix({
        status: 'complete',
        wager_ape: '3.248005801137022857',
        result: { payout_ape: '0' },
      }),
      '  # bet: 3.248006, payout: 0',
    );

    assert.strictEqual(
      formatPlayCommandSuffix({ status: 'loop_control_reached' }),
      '  # loop_control_reached',
    );
  });

  it('formats the launched play command with shell-safe quoting', () => {
    assert.strictEqual(
      formatCommandLine(['gimboz-smash', '10', '--range', '23-89']),
      'apechurch-cli play gimboz-smash 10 --range 23-89',
    );
    assert.strictEqual(
      formatCommandLine(['roulette', '10', 'RED BLACK']),
      "apechurch-cli play roulette 10 'RED BLACK'",
    );
    assert.strictEqual(
      formatBotCommandLine('nested-bot', ['16', '--take-profit', '1400']),
      'apechurch-cli bot nested-bot 16 --take-profit 1400',
    );
  });

  it('parses leading-decimal APE amounts consistently', () => {
    assert.strictEqual(parseApeToWei('.5'), 5n * 10n ** 17n);
    assert.strictEqual(shouldTriggerFallback({
      totalPnlWei: -5n * 10n ** 17n,
      fallbackLoss: '.5',
    }), true);
  });

  it('extracts settled economics from stateless and stateful play payloads', () => {
    const stateless = getSettledPlayEconomics({
      status: 'complete',
      wager_ape: '10',
      result: { payout_ape: '15' },
    }, 1);
    assert.strictEqual(stateless.pnlWei, 5n * 10n ** 18n);

    const stateful = getSettledPlayEconomics({
      state: 'HAND_COMPLETE',
      totalBet: '12.5',
      result: { payout: '0' },
    }, 2);
    assert.strictEqual(stateful.pnlWei, -125n * 10n ** 17n);
    assert.strictEqual(getPlayStatus({ state: 'HAND_COMPLETE' }), 'complete');
  });

  it('extracts nested bot economics from summary payloads', () => {
    const economics = getNestedBotEconomics({
      total_wager_ape: '18',
      total_payout_ape: '9',
    }, 1, 'nested-bot');

    assert.strictEqual(economics.wagerWei, 18n * 10n ** 18n);
    assert.strictEqual(economics.payoutWei, 9n * 10n ** 18n);
    assert.strictEqual(economics.pnlWei, -9n * 10n ** 18n);
  });

  it('detects fallback threshold hits from total bot P&L', () => {
    assert.strictEqual(shouldTriggerFallback({
      totalPnlWei: -25n * 10n ** 18n,
      fallbackLoss: '25',
    }), true);
    assert.strictEqual(shouldTriggerFallback({
      totalPnlWei: -24n * 10n ** 18n,
      fallbackLoss: '25',
    }), false);
    assert.strictEqual(shouldTriggerFallback({
      totalPnlWei: 1n,
      fallbackLoss: '25',
    }), false);
  });
});
