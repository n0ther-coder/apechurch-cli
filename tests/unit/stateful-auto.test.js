import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  AUTO_MODE_BEST,
  AUTO_MODE_SIMPLE,
  AUTO_MODE_WINSTON_LADDER,
  normalizeAutoMode,
} from '../../lib/stateful/auto.js';
import { getLoopDelayMs, resolveLoopDelaySeconds } from '../../lib/stateful/timing.js';

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

  it('accepts game-specific modes only when they are explicitly enabled', () => {
    assert.strictEqual(normalizeAutoMode('winston-ladder'), null);
    assert.strictEqual(
      normalizeAutoMode('winston-ladder', [
        AUTO_MODE_SIMPLE,
        AUTO_MODE_BEST,
        AUTO_MODE_WINSTON_LADDER,
      ]),
      AUTO_MODE_WINSTON_LADDER,
    );
  });

  it('uses the default 5s only when no human timing is requested', () => {
    assert.strictEqual(resolveLoopDelaySeconds({ rawDelay: undefined, human: false }), 5);
    assert.strictEqual(resolveLoopDelaySeconds({ rawDelay: undefined, human: true }), 0);
  });

  it('supports alternate default delays for simple-game loops', () => {
    assert.strictEqual(resolveLoopDelaySeconds({
      rawDelay: undefined,
      human: false,
      defaultDelaySeconds: 3,
    }), 3);
    assert.strictEqual(resolveLoopDelaySeconds({
      rawDelay: undefined,
      human: true,
      defaultDelaySeconds: 3,
    }), 0);
  });

  it('keeps only the humanized 3-9s jitter when --human is used without --delay', () => {
    for (let i = 0; i < 200; i++) {
      const delayMs = getLoopDelayMs({
        delaySeconds: resolveLoopDelaySeconds({ rawDelay: undefined, human: true }),
        human: true,
      });
      assert.ok(delayMs >= 3000, `delay ${delayMs} should be at least 3s`);
      assert.ok(delayMs <= 9000, `delay ${delayMs} should be at most 9s`);
    }
  });

  it('adds human delay on top of an explicit fixed delay', () => {
    for (let i = 0; i < 200; i++) {
      const delayMs = getLoopDelayMs({ delaySeconds: 5, human: true });
      assert.ok(delayMs >= 8000, `delay ${delayMs} should be at least 8s`);
      assert.ok(delayMs <= 14000, `delay ${delayMs} should be at most 14s`);
    }
  });

  it('supports custom human timing ranges', () => {
    assert.strictEqual(resolveLoopDelaySeconds({ rawDelay: undefined, human: '2-17' }), 0);

    for (let i = 0; i < 200; i++) {
      const delayMs = getLoopDelayMs({ delaySeconds: 1, human: '2-4' });
      assert.ok(delayMs >= 3000, `delay ${delayMs} should be at least 3s`);
      assert.ok(delayMs <= 5000, `delay ${delayMs} should be at most 5s`);
    }

    assert.throws(
      () => getLoopDelayMs({ delaySeconds: 0, human: '17-2' }),
      /Invalid --human value/,
    );
  });
});
