import { describe, it } from 'node:test';
import assert from 'node:assert';

import { renderGame } from '../../lib/stateful/video-poker/display.js';

describe('Video Poker Display', () => {
  it('serializes bigint fields in json mode', () => {
    const json = renderGame(
      {
        gameId: '123',
        betAmount: 5000000000000000000n,
        betAmountApe: 5,
        totalPayout: 25000000000000000000n,
        totalPayoutApe: 25,
        initialCards: [],
        finalCards: [],
        gameState: 3,
        gameStateName: 'HAND_COMPLETE',
        handStatus: 2,
        handStatusName: 'TWO_PAIR',
        awaitingRNG: false,
        timestamp: 1234567890,
        isComplete: true,
        awaitingDecision: false,
        payout: 2,
      },
      { displayMode: 'json' }
    );

    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.betAmount, '5000000000000000000');
    assert.strictEqual(parsed.totalPayout, '25000000000000000000');
    assert.strictEqual(parsed.betAmountApe, 5);
    assert.strictEqual(parsed.handStatusName, 'TWO_PAIR');
  });
});
