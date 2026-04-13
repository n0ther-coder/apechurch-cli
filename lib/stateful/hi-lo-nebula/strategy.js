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
  const jackpotBonusRatio = runtimeConfig?.jackpotAmountPerApeApe || 0;
  const memo = new Map();
  const cashoutValue = state.canCashOut ? 1 : 0;
  const bestGuess = chooseBestGuess({
    currentCard: state.currentCard,
    roundsWon: state.roundsWon,
    roundsForJackpot,
    jackpotBonusRatio,
    memo,
  });

  if (cashoutValue >= bestGuess.evMultiplier) {
    return {
      type: 'cashout',
      label: 'Cash Out',
      reason: `cashout dominates continuation (EV ${bestGuess.evMultiplier.toFixed(3)}x)`,
      evMultiplier: 1,
    };
  }

  return {
    type: 'guess',
    direction: bestGuess.direction,
    label: formatDecisionLabel(bestGuess.direction),
    reason: `best continuation EV ${bestGuess.evMultiplier.toFixed(3)}x`,
    evMultiplier: bestGuess.evMultiplier,
  };
}

function solveRelativeValue({
  currentCard,
  roundsWon,
  roundsForJackpot,
  jackpotBonusRatio,
  memo,
}) {
  const key = `${currentCard}:${roundsWon}:${roundsForJackpot}:${jackpotBonusRatio.toFixed(12)}`;
  if (memo.has(key)) {
    return memo.get(key);
  }

  const guessChoice = chooseBestGuess({
    currentCard,
    roundsWon,
    roundsForJackpot,
    jackpotBonusRatio,
    memo,
  });
  const cashoutNow = roundsWon > 0 ? 1 : 0;
  const result = Math.max(cashoutNow, guessChoice.evMultiplier);
  memo.set(key, result);
  return result;
}

function chooseBestGuess({
  currentCard,
  roundsWon,
  roundsForJackpot,
  jackpotBonusRatio,
  memo,
}) {
  const directions = getAvailableGuessDirections(currentCard);
  let best = {
    direction: directions[0] ?? GuessDirection.SAME,
    evMultiplier: 0,
  };

  for (const direction of directions) {
    const payoutMultiplier = getPayoutMultiplier(currentCard, direction) || 0;
    const successRanks = getSuccessfulNextRanks(currentCard, direction);

    let evMultiplier = 0;
    if (roundsWon >= roundsForJackpot - 1) {
      const terminalWinMultiplier = payoutMultiplier * (1 + jackpotBonusRatio);
      evMultiplier = (successRanks.length / 13) * terminalWinMultiplier;
    } else {
      for (const nextRank of successRanks) {
        const nextStateValue = solveRelativeValue({
          currentCard: nextRank,
          roundsWon: roundsWon + 1,
          roundsForJackpot,
          jackpotBonusRatio,
          memo,
        });
        evMultiplier += (1 / 13) * payoutMultiplier * nextStateValue;
      }
    }

    if (evMultiplier > best.evMultiplier + 1e-12) {
      best = { direction, evMultiplier };
    }
  }

  return best;
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
