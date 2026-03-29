/**
 * Shared helpers for loop runout estimates.
 */

const VIDEO_POKER_BASE_RTP = 0.981649;
const VIDEO_POKER_ROYAL_FLUSH_PROBABILITY = 0.000025;
const VIDEO_POKER_MAX_BET_APE = 100;
const VIDEO_POKER_PAT_HAND_PROBABILITY = 19716 / 2598960;
const VIDEO_POKER_EXPECTED_REDRAW_PROBABILITY = 1 - VIDEO_POKER_PAT_HAND_PROBABILITY;
const BLACKJACK_MAIN_ESTIMATED_RTP = 0.995;
const BLACKJACK_PLAYER_SIDE_ESTIMATED_RTP = 2160 / 2704;
const BLACKJACK_AVERAGE_FEE_MULTIPLIER = 2.25;
const DEFAULT_MONTE_CARLO_SESSION_COUNT = 10000;
const DEFAULT_MONTE_CARLO_MAX_GAMES = 200000;

const VIDEO_POKER_OUTCOME_TABLE = [
  { probability: 0.54547, payoutMultiplier: 0 },
  { probability: 0.214585, payoutMultiplier: 1 },
  { probability: 0.129279, payoutMultiplier: 2 },
  { probability: 0.074449, payoutMultiplier: 3 },
  { probability: 0.011214, payoutMultiplier: 4 },
  { probability: 0.010995, payoutMultiplier: 6 },
  { probability: 0.011512, payoutMultiplier: 9 },
  { probability: 0.002363, payoutMultiplier: 25 },
  { probability: 0.000108, payoutMultiplier: 50 },
  { probability: 0.000025, payoutMultiplier: 250, isRoyalFlush: true },
];

const VIDEO_POKER_OUTCOME_CDF = [];
{
  let cumulative = 0;
  for (const outcome of VIDEO_POKER_OUTCOME_TABLE) {
    cumulative += outcome.probability;
    VIDEO_POKER_OUTCOME_CDF.push({ ...outcome, cumulative });
  }
}

function percentile(sortedValues, fraction) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    return 0;
  }

  const index = Math.max(0, Math.min(sortedValues.length - 1, Math.floor((sortedValues.length - 1) * fraction)));
  return sortedValues[index];
}

function getEstimateScope({ balanceApe, availableApe, stopLossApe = null } = {}) {
  const safeBalanceApe = Number(balanceApe) || 0;
  const safeAvailableApe = Math.max(Number(availableApe) || 0, 0);
  const safeStopLossApe = stopLossApe === null ? null : Math.max(Number(stopLossApe) || 0, 0);

  return {
    scopeLabel: safeStopLossApe !== null ? 'stop-loss' : 'wallet squandering',
    balanceApe: safeBalanceApe,
    availableApe: safeAvailableApe,
    stopLossApe: safeStopLossApe,
  };
}

export function calculateLoopRunoutEstimate({
  balanceApe,
  availableApe,
  stopLossApe = null,
  expectedLossPerGameApe,
} = {}) {
  const scope = getEstimateScope({ balanceApe, availableApe, stopLossApe });
  const bankrollBudgetApe = scope.stopLossApe !== null
    ? Math.max(scope.balanceApe - scope.stopLossApe, 0)
    : scope.availableApe;
  const safeExpectedLossPerGameApe = Math.max(Number(expectedLossPerGameApe) || 0, 0);

  if (!Number.isFinite(safeExpectedLossPerGameApe) || safeExpectedLossPerGameApe <= 0) {
    return {
      scopeLabel: scope.scopeLabel,
      bankrollBudgetApe,
      expectedLossPerGameApe: 0,
      positiveEv: true,
      estimatedGames: null,
      method: 'ev',
    };
  }

  return {
    scopeLabel: scope.scopeLabel,
    bankrollBudgetApe,
    expectedLossPerGameApe: safeExpectedLossPerGameApe,
    positiveEv: false,
    estimatedGames: Math.floor(bankrollBudgetApe / safeExpectedLossPerGameApe),
    method: 'ev',
  };
}

export function calculateMonteCarloLoopRunoutEstimate({
  balanceApe,
  availableApe,
  stopLossApe = null,
  minBalanceFloorApe = 1,
  requiredApeToStart = 0,
  sampleGameNetDeltaApe,
  sessionCount = DEFAULT_MONTE_CARLO_SESSION_COUNT,
  maxGamesCap = DEFAULT_MONTE_CARLO_MAX_GAMES,
  rng = Math.random,
} = {}) {
  const scope = getEstimateScope({ balanceApe, availableApe, stopLossApe });
  const safeSessionCount = Math.max(1, Math.floor(Number(sessionCount) || 0));
  const safeRequiredApeToStart = Math.max(Number(requiredApeToStart) || 0, 0);
  const safeMinBalanceFloorApe = Math.max(Number(minBalanceFloorApe) || 0, 0);
  const safeMaxGamesCap = Math.max(1, Math.floor(Number(maxGamesCap) || 0));
  const reserveApe = Math.max(scope.balanceApe - scope.availableApe, 0);
  const samples = new Array(safeSessionCount);
  let totalGames = 0;
  let hitCapSessions = 0;

  if (typeof sampleGameNetDeltaApe !== 'function') {
    throw new Error('Monte Carlo loop estimate requires a game sampler');
  }

  for (let sessionIndex = 0; sessionIndex < safeSessionCount; sessionIndex++) {
    let balance = scope.balanceApe;
    let games = 0;

    while (games < safeMaxGamesCap) {
      if (scope.stopLossApe !== null) {
        if (balance <= scope.stopLossApe) break;
      } else if (balance <= safeMinBalanceFloorApe) {
        break;
      }

      const available = Math.max(balance - reserveApe, 0);
      if (available < safeRequiredApeToStart) {
        break;
      }

      const sample = sampleGameNetDeltaApe({
        balanceApe: balance,
        availableApe: available,
        reserveApe,
        rng,
      });
      const netDeltaApe = typeof sample === 'number'
        ? sample
        : Number(sample?.netDeltaApe) || 0;
      const terminal = typeof sample === 'object' && sample !== null
        ? Boolean(sample.terminal)
        : false;

      balance += netDeltaApe;
      games++;

      if (terminal) {
        break;
      }
    }

    if (games === safeMaxGamesCap) {
      hitCapSessions++;
    }

    samples[sessionIndex] = games;
    totalGames += games;
  }

  const sortedSamples = samples.slice().sort((a, b) => a - b);
  const estimatedGames = Math.round(totalGames / safeSessionCount);

  return {
    scopeLabel: scope.scopeLabel,
    positiveEv: hitCapSessions === safeSessionCount,
    estimatedGames: hitCapSessions === safeSessionCount ? null : estimatedGames,
    p10Games: percentile(sortedSamples, 0.10),
    p50Games: percentile(sortedSamples, 0.50),
    p90Games: percentile(sortedSamples, 0.90),
    sessionCount: safeSessionCount,
    method: 'monte-carlo',
  };
}

export function formatLoopRunoutEstimate(estimate) {
  if (!estimate) {
    return null;
  }

  if (estimate.positiveEv || estimate.estimatedGames === null) {
    return `Estimate games before ${estimate.scopeLabel} not bounded at current EV`;
  }

  if (estimate.method === 'monte-carlo') {
    return `Estimate games before ${estimate.scopeLabel}: ~${estimate.p50Games} ⚠️. On a lucky day, it could be ${estimate.p90Games} 🍀; on a bad run, just ${estimate.p10Games} 💀`;
  }

  return `Estimate games before ${estimate.scopeLabel} ~${estimate.estimatedGames} games`;
}

function sampleVideoPokerOutcome(rng) {
  const roll = rng();
  for (const outcome of VIDEO_POKER_OUTCOME_CDF) {
    if (roll <= outcome.cumulative) {
      return outcome;
    }
  }
  return VIDEO_POKER_OUTCOME_CDF[VIDEO_POKER_OUTCOME_CDF.length - 1];
}

export function sampleVideoPokerGameNetDeltaApe({
  betAmountApe,
  jackpotApe = 0,
  initialFeeApe = 0,
  redrawFeeApe = 0,
  rng = Math.random,
} = {}) {
  const safeBetAmountApe = Math.max(Number(betAmountApe) || 0, 0);
  const safeJackpotApe = Math.max(Number(jackpotApe) || 0, 0);
  const safeInitialFeeApe = Math.max(Number(initialFeeApe) || 0, 0);
  const safeRedrawFeeApe = Math.max(Number(redrawFeeApe) || 0, 0);
  const outcome = sampleVideoPokerOutcome(rng);
  const redrawFeePaidApe = rng() < VIDEO_POKER_EXPECTED_REDRAW_PROBABILITY ? safeRedrawFeeApe : 0;
  let payoutApe = outcome.payoutMultiplier * safeBetAmountApe;

  if (outcome.isRoyalFlush && safeBetAmountApe === VIDEO_POKER_MAX_BET_APE && safeJackpotApe > 0) {
    payoutApe += safeJackpotApe;
  }

  return payoutApe - safeBetAmountApe - safeInitialFeeApe - redrawFeePaidApe;
}

export function estimateVideoPokerLoopRunoutMonteCarlo({
  balanceApe,
  availableApe,
  stopLossApe = null,
  betAmountApe,
  jackpotApe = 0,
  initialFeeApe = 0,
  redrawFeeApe = 0,
  sessionCount = DEFAULT_MONTE_CARLO_SESSION_COUNT,
  rng = Math.random,
} = {}) {
  const safeBetAmountApe = Math.max(Number(betAmountApe) || 0, 0);
  const safeInitialFeeApe = Math.max(Number(initialFeeApe) || 0, 0);

  return calculateMonteCarloLoopRunoutEstimate({
    balanceApe,
    availableApe,
    stopLossApe,
    requiredApeToStart: safeBetAmountApe + safeInitialFeeApe,
    sampleGameNetDeltaApe: ({ rng: gameRng }) => sampleVideoPokerGameNetDeltaApe({
      betAmountApe: safeBetAmountApe,
      jackpotApe,
      initialFeeApe,
      redrawFeeApe,
      rng: gameRng,
    }),
    sessionCount,
    rng,
  });
}

export function getVideoPokerEstimatedRtp({ betAmountApe, jackpotApe = 0 } = {}) {
  const safeBetAmountApe = Number(betAmountApe) || 0;
  const safeJackpotApe = Math.max(Number(jackpotApe) || 0, 0);

  if (safeBetAmountApe === VIDEO_POKER_MAX_BET_APE && safeJackpotApe > 0) {
    return VIDEO_POKER_BASE_RTP + (VIDEO_POKER_ROYAL_FLUSH_PROBABILITY * (safeJackpotApe / safeBetAmountApe));
  }

  return VIDEO_POKER_BASE_RTP;
}

export function getVideoPokerEstimatedFeesApe({ initialFeeApe = 0, redrawFeeApe = 0 } = {}) {
  const safeInitialFeeApe = Math.max(Number(initialFeeApe) || 0, 0);
  const safeRedrawFeeApe = Math.max(Number(redrawFeeApe) || 0, 0);
  return safeInitialFeeApe + (safeRedrawFeeApe * VIDEO_POKER_EXPECTED_REDRAW_PROBABILITY);
}

export function getVideoPokerEstimatedLossPerGameApe({
  betAmountApe,
  jackpotApe = 0,
  initialFeeApe = 0,
  redrawFeeApe = 0,
} = {}) {
  const safeBetAmountApe = Math.max(Number(betAmountApe) || 0, 0);
  const rtp = getVideoPokerEstimatedRtp({ betAmountApe: safeBetAmountApe, jackpotApe });
  const fees = getVideoPokerEstimatedFeesApe({ initialFeeApe, redrawFeeApe });
  return (safeBetAmountApe * (1 - rtp)) + fees;
}

export function getBlackjackEstimatedRtp({ mainBetApe, playerSideApe = 0 } = {}) {
  const safeMainBetApe = Math.max(Number(mainBetApe) || 0, 0);
  const safePlayerSideApe = Math.max(Number(playerSideApe) || 0, 0);
  const totalBetApe = safeMainBetApe + safePlayerSideApe;

  if (totalBetApe <= 0) {
    return BLACKJACK_MAIN_ESTIMATED_RTP;
  }

  return (
    (safeMainBetApe * BLACKJACK_MAIN_ESTIMATED_RTP) +
    (safePlayerSideApe * BLACKJACK_PLAYER_SIDE_ESTIMATED_RTP)
  ) / totalBetApe;
}

export function getBlackjackEstimatedFeesApe({ vrfFeeApe } = {}) {
  const safeVrfFeeApe = Math.max(Number(vrfFeeApe) || 0, 0);
  return safeVrfFeeApe * BLACKJACK_AVERAGE_FEE_MULTIPLIER;
}

export function getBlackjackEstimatedLossPerGameApe({
  mainBetApe,
  playerSideApe = 0,
  vrfFeeApe = 0,
} = {}) {
  const safeMainBetApe = Math.max(Number(mainBetApe) || 0, 0);
  const safePlayerSideApe = Math.max(Number(playerSideApe) || 0, 0);
  const totalBetApe = safeMainBetApe + safePlayerSideApe;
  const rtp = getBlackjackEstimatedRtp({ mainBetApe: safeMainBetApe, playerSideApe: safePlayerSideApe });
  const fees = getBlackjackEstimatedFeesApe({ vrfFeeApe });
  return (totalBetApe * (1 - rtp)) + fees;
}
