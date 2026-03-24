import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  evaluateHand,
  getPayoutApe,
  isMaxBetAmount,
  isRoyalRanks,
  isStraightRanks,
} from '../../lib/stateful/video-poker/evaluator.js';
import { HandStatus } from '../../lib/stateful/video-poker/constants.js';

function card(rank, suit) {
  return { rank, suit };
}

describe('Video Poker Evaluator', () => {
  it('recognizes royal ranks and straights with ace high or low', () => {
    assert.strictEqual(isRoyalRanks([1, 10, 11, 12, 13]), true);
    assert.strictEqual(isStraightRanks([1, 2, 3, 4, 5]), true);
    assert.strictEqual(isStraightRanks([1, 10, 11, 12, 13]), true);
  });

  it('classifies a royal flush correctly', () => {
    const result = evaluateHand([
      card(1, 0),
      card(10, 0),
      card(11, 0),
      card(12, 0),
      card(13, 0),
    ]);

    assert.strictEqual(result.handStatus, HandStatus.ROYAL_FLUSH);
    assert.strictEqual(result.payoutMultiplier, 250);
  });

  it('classifies jacks or better but not low pairs', () => {
    const highPair = evaluateHand([
      card(11, 0),
      card(11, 1),
      card(4, 2),
      card(7, 3),
      card(9, 0),
    ]);
    const lowPair = evaluateHand([
      card(10, 0),
      card(10, 1),
      card(4, 2),
      card(7, 3),
      card(9, 0),
    ]);

    assert.strictEqual(highPair.handStatus, HandStatus.JACKS_OR_BETTER);
    assert.strictEqual(lowPair.handStatus, HandStatus.NOTHING);
  });

  it('adds the live jackpot bonus on top of royal payout at max bet', () => {
    assert.strictEqual(isMaxBetAmount(100), true);
    assert.strictEqual(
      getPayoutApe(HandStatus.ROYAL_FLUSH, { betAmountApe: 100, jackpotApe: 1234 }),
      26234,
    );
  });
});
