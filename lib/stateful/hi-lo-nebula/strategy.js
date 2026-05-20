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
export const WINSTON_LADDER_MAX_GUESSES = 7;
export const WINSTON_LADDER_FIRST_TARGET_MULTIPLIER = 1.5;
export const WINSTON_LADDER_TWO_GAME_TARGET_MULTIPLIER = 2.5;
const WEI_PER_APE = 1e18;

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

export function getWinstonLadderDecision(state, context = {}) {
  if (!state?.awaitingDecision) {
    return null;
  }

  const initialBetApe = getInitialBetApe(state, context);
  if (!(initialBetApe > 0)) {
    return getSimpleDecision(state);
  }

  const roundIndex = Number(context.roundIndex) === 2 ? 2 : 1;
  if (roundIndex === 2) {
    return getWinstonSecondGameDecision(state, {
      ...context,
      initialBetApe,
    });
  }

  return getWinstonFirstGameDecision(state, {
    ...context,
    initialBetApe,
  });
}

export function getWinstonLadderNewGameTargetProbability({
  initialBetApe,
  targetPayoutApe,
  maxGuesses = WINSTON_LADDER_MAX_GUESSES,
} = {}) {
  const bet = Number(initialBetApe);
  const target = Number(targetPayoutApe);
  if (!(bet > 0) || !(target > 0)) {
    return 0;
  }
  if (bet >= target - DECISION_EPSILON) {
    return 1;
  }

  let probability = 0;
  const memo = new Map();
  for (let rank = 2; rank <= 14; rank += 1) {
    probability += (1 / 13) * getTargetProbability({
      currentCard: rank,
      currentPayoutApe: bet,
      roundsWon: 0,
      targetPayoutApe: target,
      maxGuesses,
      memo,
    });
  }
  return probability;
}

function getWinstonFirstGameDecision(state, context) {
  const currentCashoutApe = getCurrentCashoutApe(state);
  const firstTargetPayoutApe = context.initialBetApe * WINSTON_LADDER_FIRST_TARGET_MULTIPLIER;

  if (state.canCashOut && currentCashoutApe >= firstTargetPayoutApe - DECISION_EPSILON) {
    return {
      type: 'cashout',
      label: 'Cash Out',
      reason: `winston-ladder first target reached (${formatMultiplier(currentCashoutApe / context.initialBetApe)})`,
    };
  }

  if (state.canCashOut && state.roundsWon >= WINSTON_LADDER_MAX_GUESSES) {
    return {
      type: 'cashout',
      label: 'Cash Out',
      reason: 'winston-ladder 7-guess cap reached',
    };
  }

  if (!state.canCashOut && state.roundsWon === 0) {
    return getMostLikelyGuessDecision(state, 'winston-ladder first guess uses highest hit rate');
  }

  const continueChoice = chooseBestTargetGuess(state, {
    targetPayoutApe: firstTargetPayoutApe,
    maxGuesses: WINSTON_LADDER_MAX_GUESSES,
  });
  const ladderTargetPayoutApe = getWinstonTwoGameTargetPayoutApe(context);
  const secondGameRequiredPayoutApe = Math.max(ladderTargetPayoutApe - currentCashoutApe, 0);
  const secondGameProbability = getWinstonLadderNewGameTargetProbability({
    initialBetApe: context.initialBetApe,
    targetPayoutApe: secondGameRequiredPayoutApe,
    maxGuesses: WINSTON_LADDER_MAX_GUESSES,
  });

  if (
    state.canCashOut
    && (!continueChoice || continueChoice.targetProbability <= secondGameProbability + DECISION_EPSILON)
  ) {
    return {
      type: 'cashout',
      label: 'Cash Out',
      reason: `winston-ladder second game is at least as likely (${formatProbability(secondGameProbability)} vs ${formatProbability(continueChoice?.targetProbability ?? 0)})`,
    };
  }

  if (continueChoice) {
    return formatWinstonGuessDecision(continueChoice, 'winston-ladder best chance to reach 1.5x first-game target');
  }

  return getSimpleDecision(state);
}

function getWinstonSecondGameDecision(state, context) {
  const currentCashoutApe = getCurrentCashoutApe(state);
  const firstPayoutApe = Number(context.firstPayoutApe) || 0;
  const ladderTargetPayoutApe = getWinstonTwoGameTargetPayoutApe(context);
  const currentTotalPayoutApe = firstPayoutApe + currentCashoutApe;
  const requiredSecondPayoutApe = Math.max(ladderTargetPayoutApe - firstPayoutApe, 0);

  if (state.canCashOut && currentTotalPayoutApe >= ladderTargetPayoutApe - DECISION_EPSILON) {
    return {
      type: 'cashout',
      label: 'Cash Out',
      reason: `winston-ladder total target reached (${formatMultiplier(currentTotalPayoutApe / context.initialBetApe)})`,
    };
  }

  if (state.canCashOut && state.roundsWon >= WINSTON_LADDER_MAX_GUESSES) {
    return {
      type: 'cashout',
      label: 'Cash Out',
      reason: 'winston-ladder 7-guess cap reached',
    };
  }

  const continueChoice = chooseBestTargetGuess(state, {
    targetPayoutApe: requiredSecondPayoutApe,
    maxGuesses: WINSTON_LADDER_MAX_GUESSES,
  });

  if (!continueChoice || continueChoice.targetProbability <= DECISION_EPSILON) {
    if (state.canCashOut) {
      return {
        type: 'cashout',
        label: 'Cash Out',
        reason: 'winston-ladder target is unreachable within the 7-guess cap',
      };
    }
    return getMostLikelyGuessDecision(state, 'winston-ladder fallback highest hit rate');
  }

  return formatWinstonGuessDecision(continueChoice, 'winston-ladder best chance to reach ladder target');
}

function chooseBestTargetGuess(state, {
  targetPayoutApe,
  maxGuesses,
} = {}) {
  const directions = getAvailableGuessDirections(state.currentCard);
  const currentPayoutApe = getCurrentDecisionPayoutApe(state);
  const memo = new Map();
  let best = null;

  for (const direction of directions) {
    const candidate = getTargetGuessCandidate({
      currentCard: state.currentCard,
      currentPayoutApe,
      roundsWon: state.roundsWon,
      direction,
      targetPayoutApe,
      maxGuesses,
      memo,
    });
    if (isBetterTargetCandidate(candidate, best)) {
      best = candidate;
    }
  }

  return best;
}

function getTargetGuessCandidate({
  currentCard,
  currentPayoutApe,
  roundsWon,
  direction,
  targetPayoutApe,
  maxGuesses,
  memo,
}) {
  const payoutMultiplier = getPayoutMultiplier(currentCard, direction) || 0;
  const successRanks = getSuccessfulNextRanks(currentCard, direction);
  const successProbability = successRanks.length / 13;
  let targetProbability = 0;

  if (roundsWon < maxGuesses && payoutMultiplier > 0) {
    const nextPayoutApe = currentPayoutApe * payoutMultiplier;
    for (const nextRank of successRanks) {
      targetProbability += (1 / 13) * getTargetProbability({
        currentCard: nextRank,
        currentPayoutApe: nextPayoutApe,
        roundsWon: roundsWon + 1,
        targetPayoutApe,
        maxGuesses,
        memo,
      });
    }
  }

  return {
    direction,
    targetProbability,
    payoutMultiplier,
    successProbability,
  };
}

function getTargetProbability({
  currentCard,
  currentPayoutApe,
  roundsWon,
  targetPayoutApe,
  maxGuesses,
  memo,
}) {
  if (currentPayoutApe >= targetPayoutApe - DECISION_EPSILON) {
    return 1;
  }
  if (roundsWon >= maxGuesses) {
    return 0;
  }

  const key = `${currentCard}:${roundsWon}:${roundProbabilityBucket(currentPayoutApe)}:${roundProbabilityBucket(targetPayoutApe)}`;
  if (memo.has(key)) {
    return memo.get(key);
  }

  let bestProbability = 0;
  for (const direction of getAvailableGuessDirections(currentCard)) {
    const payoutMultiplier = getPayoutMultiplier(currentCard, direction) || 0;
    const successRanks = getSuccessfulNextRanks(currentCard, direction);
    let probability = 0;
    if (payoutMultiplier > 0) {
      const nextPayoutApe = currentPayoutApe * payoutMultiplier;
      for (const nextRank of successRanks) {
        probability += (1 / 13) * getTargetProbability({
          currentCard: nextRank,
          currentPayoutApe: nextPayoutApe,
          roundsWon: roundsWon + 1,
          targetPayoutApe,
          maxGuesses,
          memo,
        });
      }
    }
    bestProbability = Math.max(bestProbability, probability);
  }

  memo.set(key, bestProbability);
  return bestProbability;
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

function isBetterTargetCandidate(candidate, best) {
  if (!best) {
    return true;
  }

  if (candidate.targetProbability > best.targetProbability + DECISION_EPSILON) {
    return true;
  }
  if (candidate.targetProbability < best.targetProbability - DECISION_EPSILON) {
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

function getMostLikelyGuessDecision(state, reason) {
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
    reason,
  };
}

function formatWinstonGuessDecision(candidate, reason) {
  return {
    type: 'guess',
    direction: candidate.direction,
    label: formatDecisionLabel(candidate.direction),
    reason: `${reason} (${formatProbability(candidate.targetProbability)})`,
    targetProbability: candidate.targetProbability,
  };
}

function roundFeeBucket(feeRatio) {
  return Math.round(Number(feeRatio || 0) * FEE_RATIO_BUCKET_SCALE);
}

function roundProbabilityBucket(value) {
  return Math.round(Number(value || 0) * 1e8);
}

function toRatio(numerator, denominator) {
  const denom = BigInt(denominator || 0n);
  if (denom <= 0n) {
    return 0;
  }
  return Number(BigInt(numerator || 0n)) / Number(denom);
}

function getInitialBetApe(state, context = {}) {
  const contextBet = Number(context.initialBetApe);
  if (Number.isFinite(contextBet) && contextBet > 0) {
    return contextBet;
  }
  const stateBet = Number(state?.initialBetAmountApe);
  if (Number.isFinite(stateBet) && stateBet > 0) {
    return stateBet;
  }
  return weiToApeNumber(state?.initialBetAmount);
}

function getCurrentCashoutApe(state) {
  const cashoutApe = Number(state?.currentCashoutApe);
  if (Number.isFinite(cashoutApe) && cashoutApe > 0) {
    return cashoutApe;
  }
  return weiToApeNumber(state?.currentCashout);
}

function getCurrentDecisionPayoutApe(state) {
  if (state?.canCashOut) {
    return getCurrentCashoutApe(state);
  }
  return getInitialBetApe(state);
}

function getWinstonTwoGameTargetPayoutApe(context = {}) {
  const explicitTarget = Number(context.ladderTargetPayoutApe);
  if (Number.isFinite(explicitTarget) && explicitTarget > 0) {
    return explicitTarget;
  }
  return Number(context.initialBetApe || 0) * WINSTON_LADDER_TWO_GAME_TARGET_MULTIPLIER;
}

function weiToApeNumber(value) {
  if (value === undefined || value === null) {
    return 0;
  }
  try {
    return Number(BigInt(value)) / WEI_PER_APE;
  } catch {
    return 0;
  }
}

function formatMultiplier(multiplier) {
  if (!Number.isFinite(multiplier)) {
    return 'N/A';
  }
  return `${multiplier.toFixed(3)}x`;
}

function formatProbability(probability) {
  const value = Number(probability) || 0;
  return `${(value * 100).toFixed(2)}%`;
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
