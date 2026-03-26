import { describe, it } from 'node:test';
import assert from 'node:assert';

import { renderGame } from '../../lib/stateful/video-poker/display.js';

describe('Video Poker Display', () => {
  it('renders the current hand hint inline with positioned cards', () => {
    const output = renderGame(
      {
        gameId: '123',
        betAmount: 25000000000000000000n,
        betAmountApe: 25,
        totalPayout: 0n,
        totalPayoutApe: 0,
        initialCards: [
          { rank: 6, rankName: '6', suit: 1, suitSymbol: '♦', isEmpty: false },
          { rank: 12, rankName: 'Q', suit: 0, suitSymbol: '♥', isEmpty: false },
          { rank: 6, rankName: '6', suit: 2, suitSymbol: '♣', isEmpty: false },
          { rank: 13, rankName: 'K', suit: 1, suitSymbol: '♦', isEmpty: false },
          { rank: 9, rankName: '9', suit: 3, suitSymbol: '♠', isEmpty: false },
        ],
        finalCards: [],
        gameState: 1,
        gameStateName: 'PLAYER_DECISION',
        handStatus: 0,
        handStatusName: 'NOTHING',
        awaitingRNG: false,
        timestamp: 1234567890,
        isComplete: false,
        awaitingDecision: true,
        payout: 0,
      },
      { displayMode: 'full', gameLabel: 'Game #3 /10' }
    );

    assert.match(output, /1:\[6♦\].*5:\[9♠\]\s+📊  Low Pair \(no payout\)/);
    assert.doesNotMatch(output, /📊 Current:/);
  });

  it('renders the loop game label in the header', () => {
    const output = renderGame(
      {
        gameId: '123',
        betAmount: 5000000000000000000n,
        betAmountApe: 5,
        totalPayout: 0n,
        totalPayoutApe: 0,
        initialCards: [],
        finalCards: [],
        gameState: 1,
        gameStateName: 'PLAYER_DECISION',
        handStatus: 0,
        handStatusName: 'NOTHING',
        awaitingRNG: false,
        timestamp: 1234567890,
        isComplete: false,
        awaitingDecision: false,
        payout: 0,
      },
      { displayMode: 'full', gameLabel: 'Game #3 /10' }
    );

    assert.match(output, /VIDEO POKER\s+│\s+Bet: 5 APE\s+\|\s+Game #3 \/10/);
    const lines = output.split('\n');
    assert.ok(lines[1].length > lines[2].length);
  });

  it('can suppress the header for intermediate renders', () => {
    const output = renderGame(
      {
        gameId: '123',
        betAmount: 5000000000000000000n,
        betAmountApe: 5,
        totalPayout: 0n,
        totalPayoutApe: 0,
        initialCards: [],
        finalCards: [],
        gameState: 1,
        gameStateName: 'PLAYER_DECISION',
        handStatus: 0,
        handStatusName: 'NOTHING',
        awaitingRNG: false,
        timestamp: 1234567890,
        isComplete: false,
        awaitingDecision: false,
        payout: 0,
      },
      { displayMode: 'full', gameLabel: 'Game #3 /10', showHeader: false }
    );

    assert.doesNotMatch(output, /VIDEO POKER/);
  });

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
