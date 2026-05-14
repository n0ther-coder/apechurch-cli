/**
 * Unit Tests: shared bot session helpers.
 *
 * These tests cover only the public helper surface used by private bots. They
 * intentionally do not encode any private bot strategy.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatAfterGameLine,
  formatBeforeGameLine,
  formatCommandLine,
  getPlayStatus,
  getSettledPlayEconomics,
  parseApeToWei,
  parseStandardBotArgs,
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
        wins: 1,
        gamesPlayed: 2,
        totalPayoutWei: 30n * 10n ** 18n,
        totalWagerWei: 20n * 10n ** 18n,
        totalPnlWei: 10n * 10n ** 18n,
      }),
      '# balance: 100.0000, win_rate: 1/2, payout_ape: 30, wager_ape: 20, pnl: 10',
    );

    assert.strictEqual(
      formatAfterGameLine({
        gameNumber: 3,
        status: 'complete',
        wagerWei: 10n * 10n ** 18n,
        payoutWei: 25n * 10n ** 18n,
      }),
      '# game_n: 3, status: complete, bet: 10, payout: 25, multiply: 2.5',
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
