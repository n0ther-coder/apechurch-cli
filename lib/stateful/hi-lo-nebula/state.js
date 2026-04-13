/**
 * Hi-Lo Nebula state management helpers.
 */
import { formatEther, parseEther } from 'viem';
import {
  BASIS_POINTS,
  DEFAULT_JACKPOT_FEE_BPS,
  DEFAULT_PLATFORM_FEE_BPS,
  DEFAULT_ROUNDS_FOR_JACKPOT,
  getAvailableGuessDirections,
  getCardLabel,
  getGuessSuccessProbability,
  getPayoutBps,
  getPayoutMultiplier,
  GuessDirection,
  GuessDirectionLabels,
  GuessDirectionNames,
  GuessDirectionShortLabels,
  HI_LO_NEBULA_ABI,
  HI_LO_NEBULA_CONTRACT,
} from './constants.js';

const ONE_APE_WEI = parseEther('1');

export async function getRuntimeConfig(publicClient) {
  const [
    vrfFee,
    platformFee,
    jackpotFee,
    roundsForJackpot,
    jackpotTotal,
    jackpotAmountPerApe,
  ] = await Promise.all([
    publicClient.readContract({
      address: HI_LO_NEBULA_CONTRACT,
      abi: HI_LO_NEBULA_ABI,
      functionName: 'getVRFFee',
    }),
    publicClient.readContract({
      address: HI_LO_NEBULA_CONTRACT,
      abi: HI_LO_NEBULA_ABI,
      functionName: 'platformFee',
    }).catch(() => BigInt(DEFAULT_PLATFORM_FEE_BPS)),
    publicClient.readContract({
      address: HI_LO_NEBULA_CONTRACT,
      abi: HI_LO_NEBULA_ABI,
      functionName: 'jackpotFee',
    }).catch(() => BigInt(DEFAULT_JACKPOT_FEE_BPS)),
    publicClient.readContract({
      address: HI_LO_NEBULA_CONTRACT,
      abi: HI_LO_NEBULA_ABI,
      functionName: 'roundsForJackpot',
    }).catch(() => BigInt(DEFAULT_ROUNDS_FOR_JACKPOT)),
    publicClient.readContract({
      address: HI_LO_NEBULA_CONTRACT,
      abi: HI_LO_NEBULA_ABI,
      functionName: 'jackpotTotal',
    }),
    publicClient.readContract({
      address: HI_LO_NEBULA_CONTRACT,
      abi: HI_LO_NEBULA_ABI,
      functionName: 'getJackpotAmount',
      args: [ONE_APE_WEI],
    }).catch(() => 0n),
  ]);

  return {
    vrfFee,
    platformFeeBps: Number(platformFee),
    jackpotFeeBps: Number(jackpotFee),
    roundsForJackpot: Number(roundsForJackpot),
    jackpotTotal,
    jackpotAmountPerApe,
    jackpotAmountPerApeApe: Number.parseFloat(formatEther(jackpotAmountPerApe)),
  };
}

export async function getGameState(publicClient, gameId, runtimeConfig = null) {
  const raw = await publicClient.readContract({
    address: HI_LO_NEBULA_CONTRACT,
    abi: HI_LO_NEBULA_ABI,
    functionName: 'getGameInfo',
    args: [BigInt(gameId)],
  });

  const state = parseGameInfo(raw, gameId, runtimeConfig);
  const baseBetWei = state.canCashOut ? state.currentCashout : state.initialBetAmount;
  const currentJackpotAmount = await getExactJackpotAmount(publicClient, baseBetWei, runtimeConfig);

  return {
    ...state,
    currentJackpotAmount,
    currentJackpotAmountApe: Number.parseFloat(formatEther(currentJackpotAmount)),
  };
}

export function calculateJackpotAmountFromState({ baseBetWei, runtimeConfig }) {
  if (!runtimeConfig || !baseBetWei || baseBetWei <= 0n) {
    return 0n;
  }

  const scaled = (BigInt(baseBetWei) * BigInt(runtimeConfig.jackpotAmountPerApe || 0n)) / ONE_APE_WEI;
  const jackpotTotal = BigInt(runtimeConfig.jackpotTotal || 0n);
  return scaled > jackpotTotal ? jackpotTotal : scaled;
}

export async function getExactJackpotAmount(publicClient, baseBetWei, runtimeConfig = null) {
  if (!baseBetWei || baseBetWei <= 0n) {
    return 0n;
  }

  try {
    return await publicClient.readContract({
      address: HI_LO_NEBULA_CONTRACT,
      abi: HI_LO_NEBULA_ABI,
      functionName: 'getJackpotAmount',
      args: [BigInt(baseBetWei)],
    });
  } catch {
    return calculateJackpotAmountFromState({ baseBetWei, runtimeConfig });
  }
}

export function parseGameInfo(raw, gameId, runtimeConfig = null) {
  const roundsForJackpot = runtimeConfig?.roundsForJackpot || DEFAULT_ROUNDS_FOR_JACKPOT;
  const rounds = Array.isArray(raw.rounds)
    ? raw.rounds.map((round, index) => parseRound(round, index))
    : [];
  const initialBetAmount = BigInt(raw.initialBetAmount || 0n);
  const payout = BigInt(raw.payout || 0n);
  const hasEnded = Boolean(raw.hasEnded);
  const resolvedRounds = rounds.filter((round) => round.nextCard > 0);
  const winningRounds = resolvedRounds.filter((round) => round.payout > 0n);
  const unresolvedDecisionRound = rounds.find((round) =>
    round.startingCard > 0
    && round.nextCard === 0
    && round.direction === GuessDirection.NONE
  ) || null;
  const unresolvedPendingRound = rounds.find((round) =>
    round.startingCard > 0
    && round.nextCard === 0
    && round.direction !== GuessDirection.NONE
  ) || null;
  const lastResolvedRound = resolvedRounds.length > 0 ? resolvedRounds[resolvedRounds.length - 1] : null;
  const awaitingInitialDeal = !hasEnded && rounds.length > 0 && rounds[0].startingCard === 0;
  const awaitingGuessResult = !hasEnded && unresolvedPendingRound !== null;
  const awaitingDecision = !hasEnded && !awaitingInitialDeal && !awaitingGuessResult && unresolvedDecisionRound !== null;
  const currentRound = awaitingDecision ? unresolvedDecisionRound : (awaitingGuessResult ? unresolvedPendingRound : unresolvedDecisionRound);
  const currentCard = awaitingDecision || awaitingGuessResult
    ? currentRound?.startingCard ?? 0
    : lastResolvedRound?.nextCard ?? 0;
  const currentCashout = lastResolvedRound?.payout ?? 0n;
  const canCashOut = !hasEnded && currentCashout > 0n;
  const cardsDrawn = currentCard > 0
    ? Math.min(resolvedRounds.length + 1, roundsForJackpot)
    : 0;
  const currentGuessNumber = Math.min(winningRounds.length + 1, roundsForJackpot);
  const unresolvedPlaceholderExists = rounds.some((round) =>
    round.startingCard > 0
    && round.nextCard === 0
    && round.direction === GuessDirection.NONE
  );
  const payoutBaseForJackpot = canCashOut ? currentCashout : initialBetAmount;
  const currentJackpotAmount = calculateJackpotAmountFromState({
    baseBetWei: payoutBaseForJackpot,
    runtimeConfig,
  });

  let outcome = null;
  if (hasEnded) {
    if (payout === 0n) {
      outcome = 'loss';
    } else if (winningRounds.length >= roundsForJackpot || payout > currentCashout) {
      outcome = 'jackpot';
    } else if (unresolvedPlaceholderExists && payout === currentCashout) {
      outcome = 'cashout';
    } else {
      outcome = 'win';
    }
  }

  return {
    gameId: String(gameId),
    player: raw.user,
    initialBetAmount,
    initialBetAmountApe: Number.parseFloat(formatEther(initialBetAmount)),
    payout,
    payoutApe: Number.parseFloat(formatEther(payout)),
    hasEnded,
    timestamp: Number(raw.timestamp || 0n),
    rounds,
    roundsForJackpot,
    platformFeeBps: runtimeConfig?.platformFeeBps ?? DEFAULT_PLATFORM_FEE_BPS,
    jackpotFeeBps: runtimeConfig?.jackpotFeeBps ?? DEFAULT_JACKPOT_FEE_BPS,
    currentCard,
    currentCardLabel: currentCard > 0 ? getCardLabel(currentCard) : '?',
    currentRoundIndex: currentRound?.index ?? null,
    currentRound,
    lastResolvedRound,
    currentCashout,
    currentCashoutApe: Number.parseFloat(formatEther(currentCashout)),
    currentJackpotAmount,
    currentJackpotAmountApe: Number.parseFloat(formatEther(currentJackpotAmount)),
    roundsWon: winningRounds.length,
    cardsDrawn,
    currentGuessNumber,
    awaitingInitialDeal,
    awaitingGuessResult,
    awaitingDecision,
    canCashOut,
    isComplete: hasEnded,
    outcome,
    unresolvedPlaceholderExists,
    availableDirections: awaitingDecision ? getAvailableGuessDirections(currentCard) : [],
    currentOptions: awaitingDecision ? getCurrentOptions(currentCard) : [],
    recentTransition: lastResolvedRound ? formatRecentTransition(lastResolvedRound) : null,
    pendingGuessLabel: awaitingGuessResult && currentRound
      ? formatGuessLabel(currentRound.direction)
      : null,
    totalFeeBps: (runtimeConfig?.platformFeeBps ?? DEFAULT_PLATFORM_FEE_BPS)
      + (runtimeConfig?.jackpotFeeBps ?? DEFAULT_JACKPOT_FEE_BPS),
  };
}

export function formatGuessLabel(direction) {
  return GuessDirectionLabels[Number(direction)] || GuessDirectionNames[Number(direction)] || 'Unknown';
}

export function formatGuessShortLabel(direction) {
  return GuessDirectionShortLabels[Number(direction)] || String(direction || '?').toUpperCase();
}

export function getCurrentOptions(currentCard) {
  return getAvailableGuessDirections(currentCard).map((direction) => {
    const multiplier = getPayoutMultiplier(currentCard, direction);
    return {
      direction,
      label: formatGuessLabel(direction),
      shortLabel: formatGuessShortLabel(direction),
      successProbability: getGuessSuccessProbability(currentCard, direction),
      multiplier,
      multiplierBps: getPayoutBps(currentCard, direction),
    };
  });
}

function parseRound(rawRound, index) {
  const startingCard = Number(rawRound.startingCard || 0);
  const nextCard = Number(rawRound.nextCard || 0);
  const direction = Number(rawRound.DIRECTION || 0);
  const betAmount = BigInt(rawRound.betAmount || 0n);
  const payout = BigInt(rawRound.payout || 0n);

  return {
    index,
    startingCard,
    startingCardLabel: startingCard > 0 ? getCardLabel(startingCard) : '?',
    nextCard,
    nextCardLabel: nextCard > 0 ? getCardLabel(nextCard) : '?',
    direction,
    directionName: GuessDirectionNames[direction] || 'UNKNOWN',
    directionLabel: formatGuessLabel(direction),
    directionShortLabel: formatGuessShortLabel(direction),
    betAmount,
    betAmountApe: Number.parseFloat(formatEther(betAmount)),
    payout,
    payoutApe: Number.parseFloat(formatEther(payout)),
    resolved: nextCard > 0,
  };
}

function formatRecentTransition(round) {
  if (!round?.resolved) {
    return null;
  }

  return `${round.startingCardLabel} ${round.directionShortLabel} -> ${round.nextCardLabel}`;
}

export function validateBetAmount(amount) {
  const numericAmount = Number.parseFloat(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return {
      valid: false,
      error: 'Bet amount must be a positive number of APE.',
    };
  }

  return {
    valid: true,
    amountApe: numericAmount,
  };
}

export function formatMultiplier(multiplier) {
  if (!Number.isFinite(multiplier)) {
    return 'N/A';
  }

  return `${multiplier.toFixed(4)}x`;
}

export function getNetProfitApe(state) {
  return (Number(state?.payoutApe) || 0) - (Number(state?.initialBetAmountApe) || 0);
}

export function getTotalWageredApe(state) {
  if (!state || !Array.isArray(state.rounds)) {
    return Number(state?.initialBetAmountApe) || 0;
  }

  const total = state.rounds.reduce((sum, round) => sum + (Number(round?.betAmountApe) || 0), 0);
  return total > 0 ? total : (Number(state.initialBetAmountApe) || 0);
}
