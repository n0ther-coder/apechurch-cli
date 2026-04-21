import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatGimbozSmashSettledDetails,
  parseGimbozSmashInput,
  parseGimbozSmashOutRange,
  parseGimbozSmashTargets,
} from '../../lib/games/gimbozsmash.js';

describe('Gimboz Smash helpers', () => {
  it('parses single inclusive intervals on the public 1-100 board', () => {
    const config = parseGimbozSmashTargets('20-80');

    assert.deepStrictEqual(config, {
      targets: '20-80',
      intervals: [{ start: 20, end: 80 }],
      numWinIntervals: 1,
      winCount: 61,
      winChance: '61%',
      payout: '1.5983x',
    });
  });

  it('parses two disjoint intervals and preserves the combined coverage count', () => {
    const config = parseGimbozSmashTargets('1-20,81-100');

    assert.deepStrictEqual(config, {
      targets: '1-20,81-100',
      intervals: [
        { start: 1, end: 20 },
        { start: 81, end: 100 },
      ],
      numWinIntervals: 2,
      winCount: 40,
      winChance: '40%',
      payout: '2.4375x',
    });
  });

  it('merges adjacent intervals before encoding the contract payload', () => {
    const config = parseGimbozSmashTargets('1-20,21-30');

    assert.deepStrictEqual(config, {
      targets: '1-30',
      intervals: [{ start: 1, end: 30 }],
      numWinIntervals: 1,
      winCount: 30,
      winChance: '30%',
      payout: '3.25x',
    });
  });

  it('rewrites an outside range into explicit winning intervals', () => {
    const config = parseGimbozSmashOutRange('45-50');

    assert.deepStrictEqual(config, {
      targets: '1-44,51-100',
      intervals: [
        { start: 1, end: 44 },
        { start: 51, end: 100 },
      ],
      numWinIntervals: 2,
      winCount: 94,
      winChance: '94%',
      payout: '1.0372x',
      outRange: '45-50',
    });
  });

  it('accepts --range-style input through the shared Gimboz parser', () => {
    const config = parseGimbozSmashInput({ range: '20-80' });

    assert.deepStrictEqual(config, {
      targets: '20-80',
      intervals: [{ start: 20, end: 80 }],
      numWinIntervals: 1,
      winCount: 61,
      winChance: '61%',
      payout: '1.5983x',
    });
  });

  it('rejects unsupported interval counts and over-wide coverage', () => {
    assert.throws(
      () => parseGimbozSmashTargets('1-10,20-30,40-50'),
      /one or two ranges/i,
    );
    assert.throws(
      () => parseGimbozSmashTargets('1-96'),
      /total covered numbers must be between 1 and 95/i,
    );
    assert.throws(
      () => parseGimbozSmashOutRange('50-50'),
      /excluded coverage must be between 5 and 95/i,
    );
    assert.throws(
      () => parseGimbozSmashInput({ range: '1-50', outRange: '45-50' }),
      /choose either --range or --out-range/i,
    );
  });

  it('formats settled details from the contract-facing 0-based intervals', () => {
    const details = formatGimbozSmashSettledDetails({
      numWinIntervals: 2,
      winStarts: [0, 79],
      winEnds: [19, 99],
      winCount: 41,
      winningNumber: 22,
      totalPayout: 0n,
    });

    assert.deepStrictEqual(details, {
      num_win_intervals: 2,
      targets: '1-20,80-100',
      intervals: [
        { start: 1, end: 20 },
        { start: 80, end: 100 },
      ],
      raw_intervals: [
        { start: 0, end: 19 },
        { start: 79, end: 99 },
      ],
      win_count: 41,
      winning_number: 23,
      winning_number_raw: 22,
      won: false,
      landed_in_target: false,
    });
  });
});
