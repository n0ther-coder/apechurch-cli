import { describe, it } from 'node:test';
import assert from 'node:assert';

import { renderGame } from '../../lib/stateful/blackjack/display.js';
import { formatActionLabel } from '../../lib/stateful/blackjack/state.js';
import { getVisibleWidth, stripAnsi } from '../../lib/ansi.js';

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

  it('serializes blackjack auto solver summaries in json mode', () => {
    const output = renderGame(makeState(), [], {
      displayMode: 'json',
      autoMode: 'best',
      autoDecisions: [
        {
          sequence: 1,
          requestedSolver: 'best',
          effectiveSolver: 'simple',
          fallbackError: 'Blackjack EV search budget exceeded',
          action: 1,
          key: 'h',
          label: 'Hit',
          reason: 'Basic strategy fallback',
        },
      ],
    });
    const parsed = JSON.parse(output);

    assert.strictEqual(parsed.autoMode, 'best');
    assert.strictEqual(parsed.effectiveSolver, 'simple');
    assert.strictEqual(parsed.solverDecisionCount, 1);
    assert.strictEqual(parsed.solverFallbacks[0].requestedSolver, 'best');
    assert.strictEqual(parsed.solverFallbacks[0].effectiveSolver, 'simple');
    assert.strictEqual(parsed.solverFallbacks[0].fallbackError, 'Blackjack EV search budget exceeded');
    assert.strictEqual(parsed.autoDecisions, undefined);
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

  it('shows the realized net profit and push icon for zero-net completed hands', () => {
    const output = renderGame(makeState({
      isComplete: true,
      totalPayout: 25000000000000000000n,
    }), [], { displayMode: 'simple' });

    const plain = stripAnsi(output);
    assert.match(plain, /🤝 RESULT: PUSH/);
    assert.match(plain, /\(net profit 0\.0000 APE\)/);
  });

  it('keeps the full-mode dealer-wins row aligned when it includes an emoji outcome icon', () => {
    const output = renderGame(makeState({
      isComplete: true,
      totalPayout: 0n,
      dealerHand: {
        cards: [makeCard(10, 3, '[10♠]'), makeCard(9, 2, '[9♣]')],
        handValue: 19,
        isSoft: false,
        status: 0,
        bet: 0n,
      },
      playerHands: [
        {
          cards: [makeCard(10, 0, '[10♦]'), makeCard(5, 3, '[5♠]')],
          handValue: 15,
          isSoft: false,
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
    }), [], { displayMode: 'full' });

    const dealerWinsLine = output.split('\n').find((line) => line.includes('DEALER WINS'));

    assert.ok(dealerWinsLine);
    assert.strictEqual(getVisibleWidth(dealerWinsLine), 55);
  });
});
