import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  AUTO_MODE_BEST,
  AUTO_MODE_SIMPLE,
  normalizeAutoMode,
} from '../../lib/stateful/auto.js';
import { getLoopDelayMs } from '../../lib/stateful/timing.js';

describe('Stateful Auto Mode', () => {
  it('treats bare --auto as simple mode', () => {
    assert.strictEqual(normalizeAutoMode(true), AUTO_MODE_SIMPLE);
  });

  it('accepts explicit simple and best modes', () => {
    assert.strictEqual(normalizeAutoMode('simple'), AUTO_MODE_SIMPLE);
    assert.strictEqual(normalizeAutoMode('best'), AUTO_MODE_BEST);
  });

  it('returns null for invalid modes', () => {
    assert.strictEqual(normalizeAutoMode('turbo'), null);
  });

  it('adds human delay on top of fixed delay', () => {
    for (let i = 0; i < 200; i++) {
      const delayMs = getLoopDelayMs({ delaySeconds: 5, human: true });
      assert.ok(delayMs >= 8000, `delay ${delayMs} should be at least 8s`);
      assert.ok(delayMs <= 14000, `delay ${delayMs} should be at most 14s`);
    }
  });
});
