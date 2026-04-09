/**
 * Unit Tests: lib/profile.js
 * 
 * Tests for profile, state, and history management.
 * Uses temporary files to avoid modifying real data.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  normalizeUsername,
  generateUsername,
  normalizeStrategy,
  normalizeGpPerApe,
  resolveGpPerApe,
  resolveGpPerApeInfo,
  formatGpPerApeValue,
  formatGpPerApeNotice,
  estimateGpFromWagerApe,
} from '../../lib/profile.js';

describe('Profile', () => {

  describe('normalizeUsername', () => {
    it('returns valid alphanumeric username unchanged', () => {
      const result = normalizeUsername('TestUser123');
      assert.strictEqual(result, 'TestUser123');
    });

    it('accepts underscores', () => {
      const result = normalizeUsername('test_user_bot');
      assert.strictEqual(result, 'test_user_bot');
    });

    it('throws for spaces in username', () => {
      assert.throws(() => {
        normalizeUsername('test user');
      }, /letters.*numbers.*underscores/i);
    });

    it('generates username for empty string', () => {
      const result = normalizeUsername('');
      // Empty string triggers username generation
      assert.ok(result.length > 0, 'Should return generated username');
      assert.ok(result.includes('_'), 'Generated username should contain underscore');
    });

    it('throws for long usernames', () => {
      const longName = 'a'.repeat(50);
      assert.throws(() => {
        normalizeUsername(longName);
      }, /32 characters/);
    });

    it('trims whitespace', () => {
      const result = normalizeUsername('  validuser  ');
      assert.strictEqual(result, 'validuser');
    });
  });

  describe('generateUsername', () => {
    it('returns a string', () => {
      const result = generateUsername();
      assert.strictEqual(typeof result, 'string');
    });

    it('returns non-empty string', () => {
      const username = generateUsername();
      assert.ok(username.length > 0, 'Username should not be empty');
    });

    it('generates different names each call', () => {
      const names = new Set();
      for (let i = 0; i < 10; i++) {
        names.add(generateUsername());
      }
      // Should have at least some variety (might have occasional collision)
      assert.ok(names.size >= 5);
    });

    it('follows expected format (APE_BOT_*)', () => {
      const username = generateUsername();
      assert.ok(username.startsWith('APE_BOT_') || username.includes('_'), 
        `Username "${username}" should follow expected format`);
    });
  });

  describe('normalizeStrategy (persona)', () => {
    // Note: normalizeStrategy normalizes PERSONA names, not betting strategies
    it('accepts valid persona names', () => {
      const validPersonas = ['aggressive', 'balanced', 'conservative'];
      
      for (const name of validPersonas) {
        const result = normalizeStrategy(name);
        assert.strictEqual(result, name.toLowerCase());
      }
    });

    it('normalizes case', () => {
      const result = normalizeStrategy('BALANCED');
      assert.strictEqual(result, 'balanced');
    });

    it('returns default for invalid names', () => {
      const result = normalizeStrategy('nonexistent');
      assert.strictEqual(result, 'balanced'); // Default value
    });

    it('handles null/undefined with default', () => {
      const result = normalizeStrategy(null);
      assert.strictEqual(result, 'balanced');
    });
  });

  describe('normalizeGpPerApe', () => {
    it('accepts positive integers and decimals', () => {
      assert.strictEqual(normalizeGpPerApe('5'), 5);
      assert.strictEqual(normalizeGpPerApe('2.5'), 2.5);
    });

    it('allows null only when explicitly requested', () => {
      assert.strictEqual(normalizeGpPerApe(null, { allowNull: true }), null);
      assert.throws(() => normalizeGpPerApe(null), /positive number/i);
    });

    it('rejects zero and negative values', () => {
      assert.throws(() => normalizeGpPerApe('0'), /positive number/i);
      assert.throws(() => normalizeGpPerApe('-1'), /positive number/i);
    });
  });

  describe('resolveGpPerApe', () => {
    it('defaults to the new base rate when nothing else is configured', () => {
      assert.strictEqual(resolveGpPerApe({ profile: {} }), 5);
    });

    it('uses the wallet current rate before the base rate', () => {
      assert.strictEqual(
        resolveGpPerApe({ profile: { currentGpPerApe: 7.5 } }),
        7.5
      );
    });

    it('gives CLI overrides priority over the wallet current rate', () => {
      assert.strictEqual(
        resolveGpPerApe({
          cliGpPerApe: 9,
          profile: { currentGpPerApe: 7.5 },
        }),
        9
      );
    });
  });

  describe('resolveGpPerApeInfo', () => {
    it('describes the base default when nothing else is configured', () => {
      assert.deepStrictEqual(
        resolveGpPerApeInfo({ profile: {} }),
        {
          gpPerApe: 5,
          baseGpPerApe: 5,
          currentGpPerApe: null,
          source: 'base',
          sourceLabel: 'base default',
        }
      );
    });

    it('describes the wallet current rate when present', () => {
      assert.deepStrictEqual(
        resolveGpPerApeInfo({ profile: { currentGpPerApe: 7.5 } }),
        {
          gpPerApe: 7.5,
          baseGpPerApe: 5,
          currentGpPerApe: 7.5,
          source: 'profile',
          sourceLabel: 'wallet current',
        }
      );
    });

    it('describes CLI overrides with highest priority', () => {
      assert.deepStrictEqual(
        resolveGpPerApeInfo({
          cliGpPerApe: 9,
          profile: { currentGpPerApe: 7.5 },
        }),
        {
          gpPerApe: 9,
          baseGpPerApe: 5,
          currentGpPerApe: 7.5,
          source: 'cli',
          sourceLabel: 'run override',
        }
      );
    });
  });

  describe('formatGpPerApe helpers', () => {
    it('formats GP rates without unnecessary padding', () => {
      assert.strictEqual(formatGpPerApeValue(5), '5');
      assert.strictEqual(formatGpPerApeValue(7.5), '7.5');
    });

    it('builds a startup notice with change and reset help', () => {
      const output = formatGpPerApeNotice({
        info: {
          gpPerApe: 7.5,
          baseGpPerApe: 5,
          currentGpPerApe: 7.5,
          source: 'profile',
          sourceLabel: 'wallet current',
        },
      });

      assert.ok(output.includes('Current GP Rate: 7.5 GP/APE (wallet current)'));
      assert.ok(output.includes('--gp-ape <points>'));
      assert.ok(output.includes('profile set --gp-ape <points>'));
      assert.ok(output.includes('profile set --no-gp-ape'));
    });
  });

  describe('estimateGpFromWagerApe', () => {
    it('estimates whole GP for local history entries', () => {
      assert.deepStrictEqual(
        estimateGpFromWagerApe({ wagerApe: 2, gpPerApe: 5 }),
        '10'
      );
    });

    it('floors fractional estimates to whole GP', () => {
      assert.deepStrictEqual(
        estimateGpFromWagerApe({ wagerApe: 1, gpPerApe: 7.5 }),
        '7'
      );
    });
  });
});

describe('State Management', () => {
  // These tests would need to use a temp directory
  // to avoid modifying real state files
  
  describe('loadState / saveState', () => {
    it('placeholder - needs temp directory setup', () => {
      // TODO: Set up temp APECHURCH_DIR for testing
      assert.ok(true);
    });
  });

  describe('loadHistory', () => {
    it('placeholder - needs temp directory setup', () => {
      // TODO: Test history loading/saving
      assert.ok(true);
    });
  });

  describe('Active Games tracking', () => {
    it('placeholder - needs temp directory setup', () => {
      // TODO: Test addActiveGame / removeActiveGame / getActiveGames
      assert.ok(true);
    });
  });
});
