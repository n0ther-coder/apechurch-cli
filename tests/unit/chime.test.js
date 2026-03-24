import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  canEmitWinChime,
  getRoundedWinMultiplier,
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
    assert.deepStrictEqual(getWinChimeIntervals(5), [90, 115, 130, 110, 90]);
  });

  it('requires a tty stream and non-json mode', () => {
    const ttyStream = { isTTY: true, write() {} };
    const nonTtyStream = { isTTY: false, write() {} };

    assert.strictEqual(canEmitWinChime({ stream: ttyStream }), true);
    assert.strictEqual(canEmitWinChime({ stream: ttyStream, isJson: true }), false);
    assert.strictEqual(canEmitWinChime({ stream: nonTtyStream }), false);
  });
});
