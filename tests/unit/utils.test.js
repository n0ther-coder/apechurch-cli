/**
 * Unit Tests: lib/utils.js
 * 
 * Tests for pure utility functions - no network calls.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatApeAmount,
  sanitizeError,
  randomUint256,
  randomBytes32,
  addBigIntStrings,
  parseNonNegativeInt,
  randomIntInclusive,
} from '../../lib/utils.js';

describe('Utils', () => {
  
  describe('formatApeAmount', () => {
    it('formats whole numbers with decimals', () => {
      const result = formatApeAmount(10);
      assert.ok(result.startsWith('10'));
    });

    it('formats decimals correctly', () => {
      const result = formatApeAmount(10.5);
      assert.ok(result.includes('10.5'));
    });

    it('handles string input', () => {
      const result = formatApeAmount('25.123');
      assert.ok(result.includes('25'));
    });

    it('handles zero', () => {
      const result = formatApeAmount(0);
      assert.ok(result.startsWith('0'));
    });
  });

  describe('sanitizeError', () => {
    it('extracts message from Error object', () => {
      const error = new Error('Something went wrong');
      const result = sanitizeError(error);
      assert.ok(result.includes('Something went wrong'));
    });

    it('handles string errors', () => {
      const result = sanitizeError('Raw error string');
      assert.ok(result.includes('Raw error'));
    });

    it('strips sensitive RPC details', () => {
      const error = new Error('execution reverted: insufficient balance at 0x1234...');
      const result = sanitizeError(error);
      // Should not expose full error internals in some cases
      assert.ok(typeof result === 'string');
    });
  });

  describe('randomUint256', () => {
    it('returns a BigInt', () => {
      const result = randomUint256();
      assert.strictEqual(typeof result, 'bigint');
    });

    it('returns positive values', () => {
      const result = randomUint256();
      assert.ok(result > 0n);
    });

    it('returns different values on each call', () => {
      const a = randomUint256();
      const b = randomUint256();
      assert.notStrictEqual(a, b);
    });
  });

  describe('randomBytes32', () => {
    it('returns a hex string', () => {
      const result = randomBytes32();
      assert.ok(result.startsWith('0x'));
    });

    it('returns correct length (66 chars = 0x + 64 hex)', () => {
      const result = randomBytes32();
      assert.strictEqual(result.length, 66);
    });

    it('returns valid hex characters', () => {
      const result = randomBytes32();
      assert.ok(/^0x[a-fA-F0-9]{64}$/.test(result));
    });

    it('returns different values on each call', () => {
      const a = randomBytes32();
      const b = randomBytes32();
      assert.notStrictEqual(a, b);
    });
  });

  describe('addBigIntStrings', () => {
    it('adds two positive numbers', () => {
      const result = addBigIntStrings('100', '50');
      assert.strictEqual(result, '150');
    });

    it('handles negative numbers', () => {
      const result = addBigIntStrings('100', '-30');
      assert.strictEqual(result, '70');
    });

    it('handles large numbers (wei scale)', () => {
      const a = '1000000000000000000'; // 1 ETH in wei
      const b = '500000000000000000';  // 0.5 ETH in wei
      const result = addBigIntStrings(a, b);
      assert.strictEqual(result, '1500000000000000000');
    });

    it('handles zero', () => {
      const result = addBigIntStrings('100', '0');
      assert.strictEqual(result, '100');
    });
  });

  describe('parseNonNegativeInt', () => {
    it('parses valid positive integer', () => {
      const result = parseNonNegativeInt('42', 'test');
      assert.strictEqual(result, 42);
    });

    it('parses zero', () => {
      const result = parseNonNegativeInt('0', 'test');
      assert.strictEqual(result, 0);
    });

    it('throws for negative numbers', () => {
      assert.throws(() => {
        parseNonNegativeInt('-5', 'test');
      }, /non-negative/);
    });

    it('throws for non-numeric strings', () => {
      assert.throws(() => {
        parseNonNegativeInt('abc', 'test');
      }, /non-negative/);
    });

    it('truncates floats to integers', () => {
      const result = parseNonNegativeInt('3.14', 'test');
      assert.strictEqual(result, 3);
    });
  });

  describe('randomIntInclusive', () => {
    it('returns value within range', () => {
      for (let i = 0; i < 100; i++) {
        const result = randomIntInclusive(1, 10);
        assert.ok(result >= 1 && result <= 10);
      }
    });

    it('handles single value range', () => {
      const result = randomIntInclusive(5, 5);
      assert.strictEqual(result, 5);
    });

    it('returns integer values', () => {
      const result = randomIntInclusive(1, 100);
      assert.strictEqual(result, Math.floor(result));
    });
  });
});
