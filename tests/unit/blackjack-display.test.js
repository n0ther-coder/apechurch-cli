import { describe, it } from 'node:test';
import assert from 'node:assert';

import { renderGame } from '../../lib/stateful/blackjack/display.js';
import { formatActionLabel } from '../../lib/stateful/blackjack/state.js';

function makeCard(rank, suit, display) {
  return {
    rank,
    suit,
    rawCard: 0,
    value: rank === 1 ? 11 : Math.min(rank, 10),
    display,
  };
}

function makeState(overrides = {}) {
  return {
    gameId: '123',
    gameState: 1,
    gameStateName: 'PLAYER_ACTION',
    awaitingRandomNumber: false,
    activeHandIndex: 0,
    isComplete: false,
    isPlayerTurn: true,
    surrendered: false,
    initialBet: 25000000000000000000n,
    totalBet: 25000000000000000000n,
    totalPayout: 0n,
    dealerHand: {
      cards: [makeCard(9, 3, '[9♠]')],
      handValue: 9,
      isSoft: false,
      status: 0,
      bet: 0n,
    },
    playerHands: [
      {
        cards: [makeCard(1, 0, '[A♦]'), makeCard(5, 3, '[5♠]')],
        handValue: 16,
        isSoft: true,
        status: 0,
        bet: 25000000000000000000n,
      },
      {
        cards: [],
        handValue: 0,
        isSoft: false,
        status: 0,
        bet: 0n,
      },
    ],
    sideBets: [
      { bet: 0n, payout: 0n, amountForHouse: 0n, hasBet: false },
      { bet: 0n, payout: 0n, amountForHouse: 0n, hasBet: false },
    ],
    insuranceBet: { bet: 0n, payout: 0n, amountForHouse: 0n, hasBet: false },
    ...overrides,
  };
}

describe('Blackjack Display', () => {
  it('shows explicit none lines for player and dealer side bets in full mode', () => {
    const output = renderGame(makeState(), [], { displayMode: 'full', gameLabel: 'Game #1 /50' });

    assert.match(output, /║  YOU:  \[A♦\] \[5♠\]  = 16 \(soft\)  \(25 APE\)\s+║/);
    assert.match(output, /║  Main Bet: 25 APE\s+║/);
    assert.match(output, /║  Player Side: none\s+║/);
    assert.match(output, /║  Dealer Side: none\s+║/);
  });

  it('shows a configured player side bet amount in full mode', () => {
    const output = renderGame(makeState({
      sideBets: [
        { bet: 1000000000000000000n, payout: 0n, amountForHouse: 0n, hasBet: true },
        { bet: 0n, payout: 0n, amountForHouse: 0n, hasBet: false },
      ],
      totalBet: 26000000000000000000n,
    }), [], { displayMode: 'full', gameLabel: 'Game #1 /50' });

    assert.match(output, /║  Main Bet: 25 APE\s+║/);
    assert.match(output, /║  Player Side: 1 APE\s+║/);
    assert.match(output, /║  Dealer Side: none\s+║/);
  });

  it('serializes side bets in json mode even when they are zero', () => {
    const output = renderGame(makeState(), [], { displayMode: 'json' });
    const parsed = JSON.parse(output);

    assert.deepStrictEqual(parsed.sideBets, {
      player: { bet: '0', payout: '0' },
      dealer: { bet: '0', payout: '0' },
    });
    assert.strictEqual(parsed.mainBet, '25');
  });

  it('formats blackjack stake actions without forced decimal zeros', () => {
    assert.strictEqual(
      formatActionLabel({ label: 'Double', betCost: 25000000000000000000n }, true),
      'Double (+25 APE)'
    );
    assert.strictEqual(
      formatActionLabel({ label: 'Insurance', betCost: 12500000000000000000n }, true),
      'Insurance (+12.5 APE)'
    );
  });
});
