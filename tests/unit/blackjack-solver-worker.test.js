import { describe, it } from 'node:test';
import assert from 'node:assert';

import { Action } from '../../lib/stateful/blackjack/constants.js';
import { getBestActionByEV } from '../../lib/stateful/blackjack/solver.js';
import {
  BLACKJACK_SOLVER_TIMEOUT_CODE,
  solveBestActionByEVWithWorker,
} from '../../lib/stateful/blackjack/solver-worker-runner.js';

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

function makeState({ playerHands, dealer } = {}) {
  return {
    activeHandIndex: 0,
    playerHands: [
      makeHand(playerHands[0]),
      makeHand([], { betUnits: 0, active: false }),
    ],
    dealerHand: {
      cards: dealer.map((value) => ({ value })),
    },
    insuranceBet: {
      hasBet: false,
    },
    initialBet: 100n,
    surrendered: false,
  };
}

describe('Blackjack EV Solver Worker', () => {
  it('returns the same best action as the synchronous solver', async () => {
    const state = makeState({
      playerHands: [[5, 6]],
      dealer: [6],
    });
    const allowedActions = [Action.HIT, Action.STAND, Action.DOUBLE, Action.SURRENDER];
    const expected = getBestActionByEV(state, { allowedActions, maxPlayerStates: 50000 });

    const result = await solveBestActionByEVWithWorker(state, {
      allowedActions,
      maxPlayerStates: 50000,
      timeoutMs: 5000,
    });

    assert.strictEqual(result.action, expected.action);
    assert.strictEqual(result.solverWorker, true);
    assert.ok(result.solverElapsedMs >= 0);
  });

  it('terminates the worker when the timeout is reached', async () => {
    const state = makeState({
      playerHands: [[3, 3]],
      dealer: [3],
    });

    await assert.rejects(
      () => solveBestActionByEVWithWorker(state, {
        allowedActions: [Action.HIT, Action.STAND, Action.DOUBLE, Action.SPLIT, Action.SURRENDER],
        maxPlayerStates: 50000,
        timeoutMs: 1,
      }),
      (error) => (
        error.code === BLACKJACK_SOLVER_TIMEOUT_CODE &&
        /timed out/.test(error.message) &&
        error.solverElapsedMs >= 0
      )
    );
  });
});
