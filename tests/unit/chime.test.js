import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  canEmitWinChime,
  getRoundedWinMultiplier,
  getWinChimeNotes,
  getWinChimeIntervals,
} from '../../lib/chime.js';
import { FORCE_CHIME_ENV_VAR } from '../../lib/constants.js';

describe('Win Chime', () => {
  it('rounds payout multipliers up from wei values', () => {
    assert.strictEqual(getRoundedWinMultiplier(0n, 1n), 0);
    assert.strictEqual(getRoundedWinMultiplier(1n, 1n), 1);
    assert.strictEqual(getRoundedWinMultiplier(11n, 10n), 2);
    assert.strictEqual(getRoundedWinMultiplier(25n, 10n), 3);
  });

  it('returns a deterministic slot-like cadence', () => {
    assert.deepStrictEqual(getWinChimeIntervals(0), []);
    assert.deepStrictEqual(getWinChimeIntervals(5), [90, 115, 130, 110, 140]);
  });

  it('builds a repeatable slot-like note pattern', () => {
    const notes = getWinChimeNotes(5);

    assert.strictEqual(notes.length, 5);
    assert.strictEqual(notes[0].frequency, 1046.5);
    assert.strictEqual(notes[1].frequency, 1318.51);
    assert.strictEqual(notes[4].frequency, 1760);
    assert.ok(notes.every((note) => note.durationMs >= 55));
    assert.ok(notes.every((note) => note.gapMs >= 18));
  });

  it('disables the chime only in json mode', () => {
    const previous = process.env[FORCE_CHIME_ENV_VAR];
    delete process.env[FORCE_CHIME_ENV_VAR];
    try {
      assert.strictEqual(canEmitWinChime({}), true);
      assert.strictEqual(canEmitWinChime({ isJson: true }), false);
    } finally {
      if (previous !== undefined) process.env[FORCE_CHIME_ENV_VAR] = previous;
    }
  });

  it('allows bots to force chimes for nested json plays', () => {
    const previous = process.env[FORCE_CHIME_ENV_VAR];
    process.env[FORCE_CHIME_ENV_VAR] = '1';
    try {
      assert.strictEqual(canEmitWinChime({ isJson: true }), true);
    } finally {
      if (previous === undefined) delete process.env[FORCE_CHIME_ENV_VAR];
      else process.env[FORCE_CHIME_ENV_VAR] = previous;
    }
  });
});
