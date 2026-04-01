/**
 * Unit Tests: lib/theme.js
 * 
 * Tests for color formatters and theme functions.
 * Note: Tests verify output format, not actual ANSI codes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  theme,
  formatPnL,
  formatBalance,
  formatAmount,
  formatOutcomeIcon,
  formatNetProfitLabel,
  formatField,
  formatYesNo,
  formatHeader,
  formatAddress,
  formatPercent,
  formatMultiplier,
  formatHistoryLine,
  colorsEnabled,
} from '../../lib/theme.js';
import { getVisibleWidth, stripAnsi } from '../../lib/ansi.js';

describe('Theme', () => {

  describe('theme object', () => {
    it('has all required color functions', () => {
      // Results
      assert.strictEqual(typeof theme.win, 'function');
      assert.strictEqual(typeof theme.loss, 'function');
      assert.strictEqual(typeof theme.push, 'function');
      assert.strictEqual(typeof theme.pending, 'function');
      
      // Money
      assert.strictEqual(typeof theme.positive, 'function');
      assert.strictEqual(typeof theme.negative, 'function');
      assert.strictEqual(typeof theme.balance, 'function');
      
      // Status
      assert.strictEqual(typeof theme.success, 'function');
      assert.strictEqual(typeof theme.error, 'function');
      assert.strictEqual(typeof theme.warning, 'function');
      assert.strictEqual(typeof theme.info, 'function');
    });

    it('color functions return strings', () => {
      assert.strictEqual(typeof theme.win('test'), 'string');
      assert.strictEqual(typeof theme.loss('test'), 'string');
      assert.strictEqual(typeof theme.success('test'), 'string');
    });
  });

  describe('formatPnL', () => {
    it('formats positive amounts with + prefix', () => {
      const result = formatPnL(10.5);
      assert.ok(result.includes('+'));
      assert.ok(result.includes('10.5'));
      assert.ok(result.includes('APE'));
    });

    it('formats negative amounts with - prefix', () => {
      const result = formatPnL(-5.25);
      assert.ok(result.includes('-'));
      assert.ok(result.includes('5.25'));
      assert.ok(result.includes('APE'));
    });

    it('formats zero without + prefix', () => {
      const result = formatPnL(0);
      assert.ok(result.includes('0'));
      assert.ok(result.includes('APE'));
    });

    it('respects decimal places parameter', () => {
      const result = formatPnL(10.123456, 2);
      assert.ok(result.includes('10.12'));
    });

    it('handles string input', () => {
      const result = formatPnL('15.5');
      assert.ok(result.includes('15.5'));
    });
  });

  describe('formatBalance', () => {
    it('formats balance with APE suffix', () => {
      const result = formatBalance(100);
      assert.ok(result.includes('100'));
      assert.ok(result.includes('APE'));
    });

    it('formats with 4 decimal places by default', () => {
      const result = formatBalance(50.1);
      assert.ok(result.includes('50.1000'));
    });

    it('respects custom decimal places', () => {
      const result = formatBalance(50.123456, 2);
      assert.ok(result.includes('50.12'));
    });
  });

  describe('formatAmount', () => {
    it('formats amount with APE suffix', () => {
      const result = formatAmount(25);
      assert.ok(result.includes('25'));
      assert.ok(result.includes('APE'));
    });
  });

  describe('net outcome helpers', () => {
    it('formats outcome icons from realized net profit', () => {
      assert.ok(formatOutcomeIcon(10).includes('🎉'));
      assert.ok(formatOutcomeIcon(0).includes('🤝'));
      assert.ok(formatOutcomeIcon(-1).includes('💀'));
    });

    it('formats a labeled net profit suffix', () => {
      const result = formatNetProfitLabel(12.5, 2);
      assert.ok(result.includes('net profit'));
      assert.ok(result.includes('+12.50'));
      assert.ok(result.includes('APE'));
    });
  });

  describe('formatField', () => {
    it('formats label and value pair', () => {
      const result = formatField('Balance', '100 APE');
      assert.ok(result.includes('Balance'));
      assert.ok(result.includes('100 APE'));
    });

    it('pads label to specified width', () => {
      const result = formatField('Test', 'value', 20);
      // Label should be padded
      assert.ok(result.length > 10);
    });
  });

  describe('formatYesNo', () => {
    it('returns Yes for true', () => {
      const result = formatYesNo(true);
      assert.ok(result.includes('Yes'));
    });

    it('returns No for false', () => {
      const result = formatYesNo(false);
      assert.ok(result.includes('No'));
    });
  });

  describe('formatHeader', () => {
    it('formats header text', () => {
      const result = formatHeader('Test Header');
      assert.ok(result.includes('Test Header'));
    });

    it('includes emoji prefix when provided', () => {
      const result = formatHeader('Status', '🎰');
      assert.ok(result.includes('🎰'));
      assert.ok(result.includes('Status'));
    });
  });

  describe('formatAddress', () => {
    it('returns full address by default', () => {
      const addr = '0x1234567890abcdef1234567890abcdef12345678';
      const result = formatAddress(addr);
      assert.ok(result.includes(addr));
    });

    it('truncates address when requested', () => {
      const addr = '0x1234567890abcdef1234567890abcdef12345678';
      const result = formatAddress(addr, true);
      assert.ok(result.includes('0x1234'));
      assert.ok(result.includes('5678'));
      assert.ok(result.includes('...'));
    });
  });

  describe('formatPercent', () => {
    it('formats positive percentage with + prefix', () => {
      const result = formatPercent(25.5);
      assert.ok(result.includes('+'));
      assert.ok(result.includes('25.5'));
      assert.ok(result.includes('%'));
    });

    it('formats negative percentage', () => {
      const result = formatPercent(-10.2);
      assert.ok(result.includes('-'));
      assert.ok(result.includes('10.2'));
      assert.ok(result.includes('%'));
    });
  });

  describe('formatMultiplier', () => {
    it('formats multiplier with x suffix', () => {
      const result = formatMultiplier(2.5);
      assert.ok(result.includes('2.50'));
      assert.ok(result.includes('x'));
    });
  });

  describe('formatHistoryLine', () => {
    it('formats winning game line', () => {
      const game = {
        game: 'ApeStrong',
        gameId: '123456789',
        historyIndex: 1,
        timestamp: Date.UTC(2026, 2, 27, 14, 28, 51),
        last_sync_on: '2026-03-29T12:00:00.000Z',
        wager_ape: '10',
        pnl_ape: '9.5',
        won: true,
        settled: true,
      };
      const result = formatHistoryLine(game);
      assert.ok(result.includes('🎉'));
      assert.ok(result.includes('2026-03-27 14:28:51 UTC 🎉'));
      assert.ok(result.indexOf('ApeStrong') > result.indexOf('🎉'));
      assert.ok(result.includes('       9.50 APE'));
      assert.ok(result.includes('       10.00 wAPE'));
      assert.ok(result.includes('ApeStrong'));
      assert.ok(!result.includes('<123456789>'));
      assert.ok(result.includes('(verified on-chain, 2026-03-29 12:00:00 UTC)'));
    });

    it('formats losing game line', () => {
      const game = {
        game: 'Roulette',
        gameId: '42',
        historyIndex: 2,
        timestamp: Date.UTC(2026, 2, 27, 14, 30, 0),
        last_sync_on: '2026-03-29T12:05:00.000Z',
        wager_ape: '5',
        pnl_ape: '-5',
        won: false,
        settled: true,
      };
      const result = formatHistoryLine(game);
      assert.ok(result.includes('💀'));
      assert.ok(result.includes('2026-03-27 14:30:00 UTC 💀'));
      assert.ok(result.indexOf('Roulette') > result.indexOf('💀'));
      assert.ok(result.includes('       5.00 APE'));
      assert.ok(result.includes('        5.00 wAPE'));
      assert.ok(result.includes('Roulette'));
      assert.ok(!result.includes('<42>'));
      assert.ok(result.includes('(verified on-chain, 2026-03-29 12:05:00 UTC)'));
    });

    it('formats break-even game line with handshake icon', () => {
      const game = {
        game: 'Blackjack',
        gameId: '987654321',
        historyIndex: 3,
        timestamp: Date.UTC(2026, 2, 27, 14, 31, 0),
        last_sync_on: '2026-03-29T12:06:00.000Z',
        wager_ape: '1',
        pnl_ape: '0',
        won: false,
        settled: true,
      };
      const result = formatHistoryLine(game);
      assert.ok(result.includes('🤝'));
      assert.ok(result.includes('2026-03-27 14:31:00 UTC 🤝'));
      assert.ok(result.indexOf('Blackjack') > result.indexOf('🤝'));
      assert.ok(result.includes('        1.00 wAPE'));
      assert.ok(result.includes('Blackjack'));
      assert.ok(!result.includes('<987654321>'));
      assert.ok(result.includes('       0.00 APE'));
      assert.ok(result.includes('(verified on-chain, 2026-03-29 12:06:00 UTC)'));
    });

    it('formats pending game line', () => {
      const game = {
        game: 'Plinko',
        gameId: '555',
        historyIndex: 4,
        timestamp: Date.UTC(2026, 2, 27, 14, 32, 0),
        last_sync_on: '2026-03-29T12:07:00.000Z',
        wager_ape: '2',
        pnl_ape: '0',
        won: false,
        settled: false,
      };
      const result = formatHistoryLine(game);
      assert.ok(result.includes('⏳'));
      assert.ok(result.includes('2026-03-27 14:32:00 UTC ⏳'));
      assert.ok(result.indexOf('Plinko') > result.indexOf('⏳'));
      assert.ok(result.includes('pending'));
      assert.ok(result.includes('        2.00 wAPE'));
      assert.ok(result.includes('(verified on-chain, 2026-03-29 12:07:00 UTC)'));
    });

    it('formats local-only history lines with an explicit local source label', () => {
      const game = {
        game: 'Blackjack',
        gameId: '777',
        historyIndex: 5,
        timestamp: Date.UTC(2026, 2, 27, 14, 34, 0),
        settled: false,
        last_sync_msg: 'unsupported game fetch',
      };
      const result = formatHistoryLine(game);

      assert.ok(result.includes('🚫'));
      assert.ok(result.includes('N/A'));
      assert.ok(result.indexOf('Blackjack') > result.indexOf('🚫'));
      assert.ok(result.includes('Blackjack'));
      assert.ok(!result.includes('<777>'));
      assert.ok(result.includes('(local-only record)'));
    });

    it('shows verified failure details for refreshed unsynced supported games', () => {
      const result = formatHistoryLine({
        game: 'Bubblegum Heist',
        gameId: '888',
        timestamp: Date.UTC(2026, 2, 27, 14, 34, 0),
        last_sync_on: '2026-03-29T12:11:00.000Z',
        last_sync_msg: 'execution reverted',
      });

      assert.ok(result.includes('🚫'));
      assert.ok(result.includes('(execution reverted, 2026-03-29 12:11:00 UTC)'));
    });

    it('aligns N/A with the decimal columns of net-result values', () => {
      const verified = stripAnsi(formatHistoryLine({
        game: 'Roulette',
        gameId: '1',
        timestamp: Date.UTC(2026, 2, 27, 14, 35, 0),
        last_sync_on: '2026-03-29T12:09:00.000Z',
        wager_ape: '9.5',
        pnl_ape: '9.5',
        settled: true,
      }));
      const localOnly = stripAnsi(formatHistoryLine({
        game: 'Blackjack',
        gameId: '2',
        timestamp: Date.UTC(2026, 2, 27, 14, 36, 0),
        settled: false,
      }));

      const numberStart = verified.indexOf('9.50 APE');
      assert.strictEqual(localOnly.indexOf('N'), numberStart + 1);
      assert.strictEqual(localOnly.indexOf('/'), numberStart + 2);
      assert.strictEqual(localOnly.indexOf('A'), numberStart + 3);
    });

    it('keeps game names aligned between verified and local-only rows', () => {
      const verified = stripAnsi(formatHistoryLine({
        game: 'Roulette',
        gameId: '1',
        timestamp: Date.UTC(2026, 2, 27, 14, 35, 0),
        last_sync_on: '2026-03-29T12:09:00.000Z',
        wager_ape: '3',
        pnl_ape: '6',
        settled: true,
      }));
      const localOnly = stripAnsi(formatHistoryLine({
        game: 'Blackjack',
        gameId: '2',
        timestamp: Date.UTC(2026, 2, 27, 14, 36, 0),
        settled: false,
      }));

      assert.strictEqual(verified.indexOf('Roulette'), localOnly.indexOf('Blackjack'));
    });

    it('caps the rendered game-name column at 16 visible characters', () => {
      const result = formatHistoryLine({
        game: 'Bubblegum Heist Deluxe',
        gameId: '1000',
        timestamp: Date.UTC(2026, 2, 27, 14, 37, 0),
        last_sync_on: '2026-03-29T12:10:00.000Z',
        wager_ape: '4',
        pnl_ape: '8',
        settled: true,
      });
      const plain = stripAnsi(result);
      const afterIcon = plain.split('🎉 ')[1];
      const gameColumn = afterIcon.slice(0, 16);

      assert.strictEqual(getVisibleWidth(gameColumn), 16);
      assert.strictEqual(gameColumn, 'Bubblegum Heist ');
    });

    it('shows the game id at the end of the line only when requested', () => {
      const game = {
        game: 'Roulette',
        gameId: '999',
        timestamp: Date.UTC(2026, 2, 27, 14, 35, 0),
        last_sync_on: '2026-03-29T12:09:00.000Z',
        wager_ape: '3',
        pnl_ape: '6',
        settled: true,
      };
      const result = formatHistoryLine(game, { showIds: true });

      assert.ok(result.endsWith('<999>'));
    });

    it('keeps full width when result already uses eight integer digits', () => {
      const game = {
        game: 'ApeStrong',
        gameId: '123',
        timestamp: Date.UTC(2026, 2, 27, 14, 33, 0),
        wager_ape: '10',
        pnl_ape: '12345678.9',
        won: true,
        settled: true,
      };
      const result = formatHistoryLine(game);
      assert.ok(result.includes('12345678.90 APE'));
    });
  });

  describe('colorsEnabled', () => {
    it('returns a boolean', () => {
      const result = colorsEnabled();
      assert.strictEqual(typeof result, 'boolean');
    });
  });
});
