import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  canEmitWinChime,
  getRoundedWinMultiplier,
  getWinChimeNotes,
  getWinChimeIntervals,
} from '../../lib/chime.js';

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
    assert.strictEqual(canEmitWinChime({}), true);
    assert.strictEqual(canEmitWinChime({ isJson: true }), false);
  });
});
