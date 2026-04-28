import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildGlydeOrCrashConfig,
  formatGlydeOrCrashSettledDetails,
} from '../../lib/games/glydeorcrash.js';
import { parseGlydeOrCrashTargetMultiplierInput } from '../../lib/rtp.js';

describe('Glyde or Crash helpers', () => {
  it('parses multiplier inputs into the verified basis-point config', () => {
    assert.deepStrictEqual(buildGlydeOrCrashConfig('1.5x'), {
      multiplier: '1.5x',
      multiplierBasisPoints: 15000,
      targetMultiplier: 15000,
      winChance: '64.6666%',
      payout: '1.5x',
      exactRtp: '96.9999%',
    });

    assert.deepStrictEqual(buildGlydeOrCrashConfig('2'), {
      multiplier: '2x',
      multiplierBasisPoints: 20000,
      targetMultiplier: 20000,
      winChance: '48.5%',
      payout: '2x',
      exactRtp: '97%',
    });
  });

  it('rejects unsupported multipliers and over-precise decimals', () => {
    assert.throws(
      () => parseGlydeOrCrashTargetMultiplierInput('1'),
      /between 1.01x and 10000x/i,
    );
    assert.throws(
      () => parseGlydeOrCrashTargetMultiplierInput('10000.0001x'),
      /between 1.01x and 10000x/i,
    );
    assert.throws(
      () => parseGlydeOrCrashTargetMultiplierInput('1.23456x'),
      /at most 4 decimal places/i,
    );
  });

  it('formats settled details from SpeedCrash getGameInfo data', () => {
    const details = formatGlydeOrCrashSettledDetails({
      targetMultiplier: 500000n,
      crashMultiplier: 19449n,
      totalPayout: 0n,
    });

    assert.deepStrictEqual(details, {
      target_multiplier: '50x',
      target_multiplier_bps: 500000,
      crash_multiplier: '1.9449x',
      crash_multiplier_bps: 19449,
      won: false,
      reached_target: false,
      crashed_before_target: true,
    });
  });
});
