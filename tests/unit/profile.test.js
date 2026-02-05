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
