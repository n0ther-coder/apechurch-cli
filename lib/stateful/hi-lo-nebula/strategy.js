/**
 * Hi-Lo Nebula auto-play helpers.
 */
import {
  DEFAULT_ROUNDS_FOR_JACKPOT,
  getAvailableGuessDirections,
  getGuessSuccessProbability,
  getPayoutMultiplier,
  getSuccessfulNextRanks,
  GuessDirection,
} from './constants.js';

const DECISION_EPSILON = 1e-9;
const FEE_RATIO_BUCKET_SCALE = 1e6;

export function getSimpleDecision(state) {
  if (!state?.awaitingDecision) {
    return null;
  }

  if (state.canCashOut) {
    return {
      type: 'cashout',
      label: 'Cash Out',
      reason: 'bank the current cashout after one correct guess',
    };
  }

  const directions = getAvailableGuessDirections(state.currentCard);
  const bestDirection = directions
    .slice()
    .sort((left, right) => {
      const probabilityDelta = getGuessSuccessProbability(state.currentCard, right)
        - getGuessSuccessProbability(state.currentCard, left);
      if (probabilityDelta !== 0) {
        return probabilityDelta;
      }

      return (getPayoutMultiplier(state.currentCard, left) || 0)
        - (getPayoutMultiplier(state.currentCard, right) || 0);
    })[0];

  return {
    type: 'guess',
    direction: bestDirection,
    label: formatDecisionLabel(bestDirection),
    reason: 'highest immediate hit rate',
  };
}

export function getBestDecision(state, runtimeConfig = null) {
  if (!state?.awaitingDecision) {
    return null;
  }

  const roundsForJackpot = runtimeConfig?.roundsForJackpot || state.roundsForJackpot || DEFAULT_ROUNDS_FOR_JACKPOT;
  const currentBet = state.canCashOut ? state.currentCashout : state.initialBetAmount;
  const feeRatio = toRatio(runtimeConfig?.vrfFee ?? 0n, currentBet);
  const jackpotBonusRatio = toRatio(state.currentJackpotAmount ?? 0n, currentBet);
  const memo = new Map();
  const cashoutValue = state.canCashOut ? 1 : Number.NEGATIVE_INFINITY;
  const bestGuess = chooseBestGuess({
    currentCard: state.currentCard,
    roundsWon: state.roundsWon,
    roundsForJackpot,
    feeRatio,
    jackpotBonusRatio,
    memo,
  });

  if (cashoutValue >= bestGuess.evNormalized - DECISION_EPSILON) {
    return {
      type: 'cashout',
      label: 'Cash Out',
      reason: `cashout dominates continuation (net EV ${bestGuess.evNormalized.toFixed(3)}x)`,
      evMultiplier: 1,
    };
  }

  return {
    type: 'guess',
    direction: bestGuess.direction,
    label: formatDecisionLabel(bestGuess.direction),
    reason: `best continuation net EV ${bestGuess.evNormalized.toFixed(3)}x`,
    evMultiplier: bestGuess.evNormalized,
  };
}

function solveRelativeValue({
  currentCard,
  roundsWon,
  roundsForJackpot,
  feeRatio,
  jackpotBonusRatio,
  memo,
}) {
  const key = `${currentCard}:${roundsWon}:${roundFeeBucket(feeRatio)}`;
  if (memo.has(key)) {
    return memo.get(key);
  }

  const guessChoice = chooseBestGuess({
    currentCard,
    roundsWon,
    roundsForJackpot,
    feeRatio,
    jackpotBonusRatio,
    memo,
  });
  const cashoutNow = roundsWon > 0 ? 1 : Number.NEGATIVE_INFINITY;
  const result = Math.max(cashoutNow, guessChoice.evNormalized);
  memo.set(key, result);
  return result;
}

function chooseBestGuess({
  currentCard,
  roundsWon,
  roundsForJackpot,
  feeRatio,
  jackpotBonusRatio,
  memo,
}) {
  const directions = getAvailableGuessDirections(currentCard);
  let best = null;

  for (const direction of directions) {
    const payoutMultiplier = getPayoutMultiplier(currentCard, direction) || 0;
    const successRanks = getSuccessfulNextRanks(currentCard, direction);
    const successProbability = successRanks.length / 13;

    let evNormalized = -feeRatio;
    if (roundsWon >= roundsForJackpot - 1) {
      evNormalized += successProbability * (payoutMultiplier + jackpotBonusRatio);
    } else {
      const nextFeeRatio = payoutMultiplier > 0 ? (feeRatio / payoutMultiplier) : feeRatio;
      for (const nextRank of successRanks) {
        const nextStateValue = solveRelativeValue({
          currentCard: nextRank,
          roundsWon: roundsWon + 1,
          roundsForJackpot,
          feeRatio: nextFeeRatio,
          jackpotBonusRatio,
          memo,
        });
        evNormalized += (1 / 13) * payoutMultiplier * nextStateValue;
      }
    }

    const candidate = {
      direction,
      evNormalized,
      payoutMultiplier,
      successProbability,
    };
    if (isBetterCandidate(candidate, best)) {
      best = candidate;
    }
  }

  return best || {
    direction: directions[0] ?? GuessDirection.SAME,
    evNormalized: Number.NEGATIVE_INFINITY,
    payoutMultiplier: 0,
    successProbability: 0,
  };
}

function isBetterCandidate(candidate, best) {
  if (!best) {
    return true;
  }

  if (candidate.evNormalized > best.evNormalized + DECISION_EPSILON) {
    return true;
  }
  if (candidate.evNormalized < best.evNormalized - DECISION_EPSILON) {
    return false;
  }

  if (candidate.successProbability > best.successProbability + DECISION_EPSILON) {
    return true;
  }
  if (candidate.successProbability < best.successProbability - DECISION_EPSILON) {
    return false;
  }

  if (candidate.payoutMultiplier < best.payoutMultiplier - DECISION_EPSILON) {
    return true;
  }
  if (candidate.payoutMultiplier > best.payoutMultiplier + DECISION_EPSILON) {
    return false;
  }

  return Number(candidate.direction) < Number(best.direction);
}

function roundFeeBucket(feeRatio) {
  return Math.round(Number(feeRatio || 0) * FEE_RATIO_BUCKET_SCALE);
}

function toRatio(numerator, denominator) {
  const denom = BigInt(denominator || 0n);
  if (denom <= 0n) {
    return 0;
  }
  return Number(BigInt(numerator || 0n)) / Number(denom);
}

function formatDecisionLabel(direction) {
  switch (Number(direction)) {
    case GuessDirection.LOWER:
      return 'Lower';
    case GuessDirection.HIGHER:
      return 'Higher';
    case GuessDirection.SAME:
      return 'Same';
    default:
      return 'Unknown';
  }
}
