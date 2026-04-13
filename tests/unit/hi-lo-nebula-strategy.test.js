import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseEther } from 'viem';

import { GuessDirection, getAvailableGuessDirections, getPayoutMultiplier, getSuccessfulNextRanks } from '../../lib/stateful/hi-lo-nebula/constants.js';
import { getBestDecision } from '../../lib/stateful/hi-lo-nebula/strategy.js';

const VRF_FEE = parseEther('0.093211589');

describe('Hi-Lo Nebula best auto strategy', () => {
  it('matches a brute-force net-EV solver on shallow horizons', () => {
    const scenarios = [
      { currentCard: 4, roundsWon: 1, roundsForJackpot: 2, currentBetApe: '20', currentJackpotApe: '0.60', canCashOut: true },
      { currentCard: 9, roundsWon: 0, roundsForJackpot: 2, currentBetApe: '25', currentJackpotApe: '0.67', canCashOut: false },
      { currentCard: 2, roundsWon: 1, roundsForJackpot: 3, currentBetApe: '30', currentJackpotApe: '0.81', canCashOut: true },
      { currentCard: 12, roundsWon: 1, roundsForJackpot: 3, currentBetApe: '18', currentJackpotApe: '0.48', canCashOut: true },
    ];

    for (const scenario of scenarios) {
      const state = makeState(scenario);
      const decision = getBestDecision(state, {
        roundsForJackpot: scenario.roundsForJackpot,
        vrfFee: VRF_FEE,
      });
      const brute = bruteBestDecision({
        currentCard: scenario.currentCard,
        roundsWon: scenario.roundsWon,
        roundsForJackpot: scenario.roundsForJackpot,
        feeRatio: Number(VRF_FEE) / Number(state.canCashOut ? state.currentCashout : state.initialBetAmount),
        jackpotBonusRatio: Number(state.currentJackpotAmount) / Number(state.canCashOut ? state.currentCashout : state.initialBetAmount),
        canCashOut: scenario.canCashOut,
      });

      assert.strictEqual(decision.type, brute.type);
      assert.strictEqual(decision.direction ?? null, brute.direction ?? null);
    }
  });

  it('prefers cashout on a practical mid-streak continuation state', () => {
    const decision = getBestDecision(makeState({
      currentCard: 4,
      roundsWon: 1,
      roundsForJackpot: 15,
      currentBetApe: '31.25',
      currentJackpotApe: '0.84',
      canCashOut: true,
    }), {
      roundsForJackpot: 15,
      vrfFee: VRF_FEE,
    });

    assert.strictEqual(decision.type, 'cashout');
  });

  it('continues on the final safe edge when the jackpot bonus is strong enough', () => {
    const decision = getBestDecision(makeState({
      currentCard: 2,
      roundsWon: 14,
      roundsForJackpot: 15,
      currentBetApe: '100',
      currentJackpotApe: '3',
      canCashOut: true,
    }), {
      roundsForJackpot: 15,
      vrfFee: VRF_FEE,
    });

    assert.strictEqual(decision.type, 'guess');
    assert.strictEqual(decision.direction, GuessDirection.HIGHER);
  });

  it('lets VRF cost override a marginal final-edge continuation', () => {
    const decision = getBestDecision(makeState({
      currentCard: 2,
      roundsWon: 14,
      roundsForJackpot: 15,
      currentBetApe: '5',
      currentJackpotApe: '0.15',
      canCashOut: true,
    }), {
      roundsForJackpot: 15,
      vrfFee: VRF_FEE,
    });

    assert.strictEqual(decision.type, 'cashout');
  });
});

function makeState({
  currentCard,
  roundsWon,
  roundsForJackpot,
  currentBetApe,
  currentJackpotApe,
  canCashOut,
}) {
  const currentBet = parseEther(currentBetApe);
  const currentJackpotAmount = parseEther(currentJackpotApe);

  return {
    awaitingDecision: true,
    canCashOut,
    currentCard,
    roundsWon,
    roundsForJackpot,
    initialBetAmount: currentBet,
    currentCashout: canCashOut ? currentBet : 0n,
    currentJackpotAmount,
  };
}

function bruteBestDecision({
  currentCard,
  roundsWon,
  roundsForJackpot,
  feeRatio,
  jackpotBonusRatio,
  canCashOut,
}) {
  const cashoutValue = canCashOut ? 1 : Number.NEGATIVE_INFINITY;
  let bestGuess = null;

  for (const direction of getAvailableGuessDirections(currentCard)) {
    const value = bruteGuessValue({
      currentCard,
      direction,
      roundsWon,
      roundsForJackpot,
      feeRatio,
      jackpotBonusRatio,
    });
    if (!bestGuess || value > bestGuess.value) {
      bestGuess = { direction, value };
    }
  }

  if (cashoutValue >= bestGuess.value) {
    return { type: 'cashout', direction: null };
  }

  return { type: 'guess', direction: bestGuess.direction };
}

function bruteGuessValue({
  currentCard,
  direction,
  roundsWon,
  roundsForJackpot,
  feeRatio,
  jackpotBonusRatio,
}) {
  const payoutMultiplier = getPayoutMultiplier(currentCard, direction) || 0;
  const successRanks = getSuccessfulNextRanks(currentCard, direction);
  let value = -feeRatio;

  if (roundsWon >= roundsForJackpot - 1) {
    return value + (successRanks.length / 13) * (payoutMultiplier + jackpotBonusRatio);
  }

  const nextFeeRatio = payoutMultiplier > 0 ? feeRatio / payoutMultiplier : feeRatio;
  for (const nextRank of successRanks) {
    value += (payoutMultiplier / 13) * bruteStateValue({
      currentCard: nextRank,
      roundsWon: roundsWon + 1,
      roundsForJackpot,
      feeRatio: nextFeeRatio,
      jackpotBonusRatio,
    });
  }

  return value;
}

function bruteStateValue({
  currentCard,
  roundsWon,
  roundsForJackpot,
  feeRatio,
  jackpotBonusRatio,
}) {
  const cashoutValue = roundsWon > 0 ? 1 : Number.NEGATIVE_INFINITY;
  let bestGuessValue = Number.NEGATIVE_INFINITY;

  for (const direction of getAvailableGuessDirections(currentCard)) {
    bestGuessValue = Math.max(bestGuessValue, bruteGuessValue({
      currentCard,
      direction,
      roundsWon,
      roundsForJackpot,
      feeRatio,
      jackpotBonusRatio,
    }));
  }

  return Math.max(cashoutValue, bestGuessValue);
}
