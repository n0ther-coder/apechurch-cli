import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  calculateHoldExpectedValue,
  getBestHoldByEV,
} from '../../lib/stateful/video-poker/solver.js';

function card(rank, suit) {
  return { rank, suit };
}

describe('Video Poker EV Solver', () => {
  it('returns exact payout for a made royal when holding all cards', () => {
    const royal = [
      card(1, 0),
      card(10, 0),
      card(11, 0),
      card(12, 0),
      card(13, 0),
    ];

    const result = calculateHoldExpectedValue(royal, [true, true, true, true, true], {
      betAmountApe: 10,
      jackpotApe: 0,
    });

    assert.strictEqual(result.outcomes, 1);
    assert.strictEqual(result.evApe, 2500);
    assert.strictEqual(result.evMultiplier, 250);
  });

  it('finds four to a royal as the max-EV hold on a classic royal draw', () => {
    const royalDraw = [
      card(1, 0),
      card(13, 0),
      card(12, 0),
      card(11, 0),
      card(2, 1),
    ];

    const result = getBestHoldByEV(royalDraw, { betAmountApe: 10, jackpotApe: 0 });
    assert.deepStrictEqual(result.hold, [true, true, true, true, false]);
    assert.deepStrictEqual(result.heldPositions, [1, 2, 3, 4]);
  });

  it('increases expected value for royal draws when the live jackpot is larger', () => {
    const royalDraw = [
      card(1, 0),
      card(13, 0),
      card(12, 0),
      card(11, 0),
      card(2, 1),
    ];
    const hold = [true, true, true, true, false];

    const withoutJackpot = calculateHoldExpectedValue(royalDraw, hold, {
      betAmountApe: 100,
      jackpotApe: 0,
    });
    const withJackpot = calculateHoldExpectedValue(royalDraw, hold, {
      betAmountApe: 100,
      jackpotApe: 5000,
    });

    assert.ok(withJackpot.evApe > withoutJackpot.evApe);
    assert.ok(withJackpot.evMultiplier > withoutJackpot.evMultiplier);
  });

  it('ignores jackpot value for sub-max bets', () => {
    const royalDraw = [
      card(1, 0),
      card(13, 0),
      card(12, 0),
      card(11, 0),
      card(2, 1),
    ];
    const hold = [true, true, true, true, false];

    const withoutJackpot = calculateHoldExpectedValue(royalDraw, hold, {
      betAmountApe: 50,
      jackpotApe: 0,
    });
    const withJackpot = calculateHoldExpectedValue(royalDraw, hold, {
      betAmountApe: 50,
      jackpotApe: 5000,
    });

    assert.strictEqual(withJackpot.evApe, withoutJackpot.evApe);
    assert.strictEqual(withJackpot.evMultiplier, withoutJackpot.evMultiplier);
  });
});
