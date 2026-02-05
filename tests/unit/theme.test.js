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
  formatField,
  formatYesNo,
  formatHeader,
  formatAddress,
  formatPercent,
  formatMultiplier,
  formatHistoryLine,
  colorsEnabled,
} from '../../lib/theme.js';

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
        wager_ape: '10',
        pnl_ape: '9.5',
        won: true,
        settled: true,
      };
      const result = formatHistoryLine(game);
      assert.ok(result.includes('✅'));
      assert.ok(result.includes('ApeStrong'));
    });

    it('formats losing game line', () => {
      const game = {
        game: 'Roulette',
        wager_ape: '5',
        pnl_ape: '-5',
        won: false,
        settled: true,
      };
      const result = formatHistoryLine(game);
      assert.ok(result.includes('❌'));
      assert.ok(result.includes('Roulette'));
    });

    it('formats pending game line', () => {
      const game = {
        game: 'Plinko',
        wager_ape: '2',
        pnl_ape: '0',
        won: false,
        settled: false,
      };
      const result = formatHistoryLine(game);
      assert.ok(result.includes('⏳'));
    });
  });

  describe('colorsEnabled', () => {
    it('returns a boolean', () => {
      const result = colorsEnabled();
      assert.strictEqual(typeof result, 'boolean');
    });
  });
});
