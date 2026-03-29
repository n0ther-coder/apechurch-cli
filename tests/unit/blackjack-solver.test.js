import { describe, it } from 'node:test';
import assert from 'node:assert';

import { Action } from '../../lib/stateful/blackjack/constants.js';
import { getBestActionByEV } from '../../lib/stateful/blackjack/solver.js';

function summarize(values) {
  let total = 0;
  let softAces = 0;

  for (const value of values) {
    total += value;
    if (value === 11) softAces++;

    while (total > 21 && softAces > 0) {
      total -= 10;
      softAces--;
    }
  }

  return {
    handValue: total,
    isSoft: softAces > 0 && total <= 21,
    isBlackjack: values.length === 2 && total === 21,
  };
}

function makeHand(values, { betUnits = 1, active = true } = {}) {
  const summary = summarize(values);
  return {
    cards: values.map((value) => ({ value })),
    handValue: summary.handValue,
    isSoft: summary.isSoft,
    isActive: active,
    isBlackjack: summary.isBlackjack,
    bet: BigInt(betUnits) * 100n,
  };
}

function makeState({
  playerHands,
  dealer,
  activeHandIndex = 0,
  activeHands = null,
  insuranceTaken = false,
  surrendered = false,
} = {}) {
  const hands = [
    makeHand(playerHands[0], { active: activeHands ? activeHands[0] : activeHandIndex === 0 }),
    playerHands[1] ? makeHand(playerHands[1], { active: activeHands ? activeHands[1] : activeHandIndex === 1 }) : makeHand([], { betUnits: 0, active: false }),
  ];

  return {
    activeHandIndex,
    playerHands: hands,
    dealerHand: {
      cards: dealer.map((value) => ({ value })),
    },
    insuranceBet: {
      hasBet: insuranceTaken,
    },
    initialBet: 100n,
    surrendered,
  };
}

describe('Blackjack EV Solver', () => {
  it('doubles hard 11 against dealer 6', () => {
    const state = makeState({
      playerHands: [[5, 6]],
      dealer: [6],
    });

    const result = getBestActionByEV(state, {
      allowedActions: [Action.HIT, Action.STAND, Action.DOUBLE, Action.SURRENDER],
    });

    assert.strictEqual(result.action, Action.DOUBLE);
    assert.ok(result.actionValues[Action.DOUBLE] > result.actionValues[Action.HIT]);
    assert.ok(result.actionValues[Action.DOUBLE] > result.actionValues[Action.STAND]);
  });

  it('takes early surrender on hard 16 against dealer Ace', () => {
    const state = makeState({
      playerHands: [[10, 6]],
      dealer: [11],
    });

    const result = getBestActionByEV(state, {
      allowedActions: [Action.HIT, Action.STAND, Action.DOUBLE, Action.SURRENDER, Action.INSURANCE],
    });

    assert.strictEqual(result.action, Action.SURRENDER);
    assert.ok(result.actionValues[Action.SURRENDER] > result.actionValues[Action.HIT]);
    assert.ok(result.actionValues[Action.SURRENDER] > result.actionValues[Action.STAND]);
  });

  it('does not take insurance on a strong made hand by default', () => {
    const state = makeState({
      playerHands: [[10, 10]],
      dealer: [11],
    });

    const result = getBestActionByEV(state, {
      allowedActions: [Action.HIT, Action.STAND, Action.DOUBLE, Action.SURRENDER, Action.INSURANCE],
    });

    assert.strictEqual(result.action, Action.STAND);
    assert.ok(result.actionValues[Action.STAND] > result.actionValues[Action.INSURANCE]);
  });

  it('splits eights against dealer 6', () => {
    const state = makeState({
      playerHands: [[8, 8]],
      dealer: [6],
    });

    const result = getBestActionByEV(state, {
      allowedActions: [Action.HIT, Action.STAND, Action.DOUBLE, Action.SPLIT, Action.SURRENDER],
    });

    assert.strictEqual(result.action, Action.SPLIT);
    assert.ok(result.actionValues[Action.SPLIT] > result.actionValues[Action.HIT]);
    assert.ok(result.actionValues[Action.SPLIT] > result.actionValues[Action.STAND]);
  });

  it('handles exact EV on the second split hand', () => {
    const state = makeState({
      playerHands: [[8, 2], [8, 3]],
      dealer: [6],
      activeHandIndex: 1,
      activeHands: [false, true],
    });

    const result = getBestActionByEV(state, {
      allowedActions: [Action.HIT, Action.STAND, Action.DOUBLE],
    });

    assert.strictEqual(result.action, Action.DOUBLE);
    assert.ok(result.actionValues[Action.DOUBLE] > result.actionValues[Action.HIT]);
    assert.ok(result.actionValues[Action.DOUBLE] > result.actionValues[Action.STAND]);
  });

  it('splits aces against dealer 6', () => {
    const state = makeState({
      playerHands: [[11, 11]],
      dealer: [6],
    });

    const result = getBestActionByEV(state, {
      allowedActions: [Action.HIT, Action.STAND, Action.DOUBLE, Action.SPLIT, Action.SURRENDER],
    });

    assert.strictEqual(result.action, Action.SPLIT);
    assert.ok(result.actionValues[Action.SPLIT] > result.actionValues[Action.HIT]);
    assert.ok(result.actionValues[Action.SPLIT] > result.actionValues[Action.STAND]);
  });

  it('fails fast when the exact EV search exceeds the configured player-state budget', () => {
    const state = makeState({
      playerHands: [[3, 3]],
      dealer: [3],
    });

    assert.throws(
      () => getBestActionByEV(state, {
        allowedActions: [Action.HIT, Action.STAND, Action.DOUBLE, Action.SPLIT, Action.SURRENDER],
        maxPlayerStates: 100,
      }),
      /search budget exceeded/
    );
  });
});
