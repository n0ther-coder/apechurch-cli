/**
 * Shared helpers for loop runout estimates.
 */
import { formatEther, parseEther } from 'viem';
import { parseBaccaratBet } from './games/baccarat.js';
import { getPlinkoVrfFee, getStaticVrfFee } from './games/base.js';
import { parseRouletteBets } from './games/roulette.js';
import {
  BEAR_DICE_MODE_TABLES,
  getApestrongPayoutMultiplier,
  getConfiguredGameExpectedRtpReference,
} from './rtp.js';

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
const DEFAULT_CONFIGURED_GAME_MONTE_CARLO_MAX_SESSIONS = 4000;
const MIN_CONFIGURED_GAME_MONTE_CARLO_SESSIONS = 200;
const CONFIGURED_GAME_MONTE_CARLO_OPERATION_BUDGET = 20000000;

const ROULETTE_RED_POCKETS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const ROULETTE_BLACK_POCKETS = new Set([2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]);
const ROULETTE_POCKETS = Object.freeze([0, 37, ...Array.from({ length: 36 }, (_, index) => index + 1)]);
const BACCARAT_PLAYER_WIN_PROBABILITY = 2153464 / 4826809;
const BACCARAT_BANKER_WIN_PROBABILITY = 2212744 / 4826809;
const BACCARAT_TIE_PROBABILITY = 460601 / 4826809;

const JUNGLE_PLINKO_OUTCOME_TABLES = Object.freeze({
  0: Object.freeze([
    Object.freeze({ probability: 8 / 21, payoutMultiplier: 1.2 }),
    Object.freeze({ probability: 4 / 21, payoutMultiplier: 0.35 }),
    Object.freeze({ probability: 4 / 21, payoutMultiplier: 0.5 }),
    Object.freeze({ probability: 16 / 105, payoutMultiplier: 2.2 }),
    Object.freeze({ probability: 3 / 35, payoutMultiplier: 0.3 }),
  ]),
  1: Object.freeze([
    Object.freeze({ probability: 4 / 15, payoutMultiplier: 1.25 }),
    Object.freeze({ probability: 16 / 75, payoutMultiplier: 0.4 }),
    Object.freeze({ probability: 76 / 375, payoutMultiplier: 0.25 }),
    Object.freeze({ probability: 23 / 125, payoutMultiplier: 0.6 }),
    Object.freeze({ probability: 8 / 75, payoutMultiplier: 2.5 }),
    Object.freeze({ probability: 2 / 75, payoutMultiplier: 5 }),
  ]),
  2: Object.freeze([
    Object.freeze({ probability: 83 / 295, payoutMultiplier: 0.3 }),
    Object.freeze({ probability: 16 / 59, payoutMultiplier: 0.6 }),
    Object.freeze({ probability: 10 / 59, payoutMultiplier: 1.2 }),
    Object.freeze({ probability: 41 / 295, payoutMultiplier: 0.1 }),
    Object.freeze({ probability: 6 / 59, payoutMultiplier: 2.5 }),
    Object.freeze({ probability: 2 / 59, payoutMultiplier: 6.2 }),
    Object.freeze({ probability: 1 / 295, payoutMultiplier: 15 }),
  ]),
  3: Object.freeze([
    Object.freeze({ probability: 350 / 1539, payoutMultiplier: 0.2 }),
    Object.freeze({ probability: 350 / 1539, payoutMultiplier: 0.25 }),
    Object.freeze({ probability: 100 / 513, payoutMultiplier: 0.5 }),
    Object.freeze({ probability: 20 / 171, payoutMultiplier: 0.1 }),
    Object.freeze({ probability: 20 / 171, payoutMultiplier: 1.5 }),
    Object.freeze({ probability: 110 / 1539, payoutMultiplier: 2.1 }),
    Object.freeze({ probability: 40 / 1539, payoutMultiplier: 4.2 }),
    Object.freeze({ probability: 16 / 1539, payoutMultiplier: 8.8 }),
    Object.freeze({ probability: 8 / 1539, payoutMultiplier: 17.5 }),
    Object.freeze({ probability: 4 / 1539, payoutMultiplier: 33 }),
    Object.freeze({ probability: 1 / 1539, payoutMultiplier: 100 }),
  ]),
  4: Object.freeze([
    Object.freeze({ probability: 6250 / 25321, payoutMultiplier: 0.1 }),
    Object.freeze({ probability: 5100 / 25321, payoutMultiplier: 0.2 }),
    Object.freeze({ probability: 4355 / 25321, payoutMultiplier: 0.05 }),
    Object.freeze({ probability: 4000 / 25321, payoutMultiplier: 0.4 }),
    Object.freeze({ probability: 2500 / 25321, payoutMultiplier: 1.4 }),
    Object.freeze({ probability: 1500 / 25321, payoutMultiplier: 2 }),
    Object.freeze({ probability: 1000 / 25321, payoutMultiplier: 4 }),
    Object.freeze({ probability: 400 / 25321, payoutMultiplier: 9 }),
    Object.freeze({ probability: 150 / 25321, payoutMultiplier: 15 }),
    Object.freeze({ probability: 50 / 25321, payoutMultiplier: 35 }),
    Object.freeze({ probability: 10 / 25321, payoutMultiplier: 100 }),
    Object.freeze({ probability: 5 / 25321, payoutMultiplier: 250 }),
    Object.freeze({ probability: 1 / 25321, payoutMultiplier: 1000 }),
  ]),
});

const COSMIC_PLINKO_OUTCOME_TABLES = Object.freeze({
  0: Object.freeze([
    Object.freeze({ probability: 751 / 907, payoutMultiplier: 0.4 }),
    Object.freeze({ probability: 60 / 907, payoutMultiplier: 1.2 }),
    Object.freeze({ probability: 40 / 907, payoutMultiplier: 2 }),
    Object.freeze({ probability: 30 / 907, payoutMultiplier: 3 }),
    Object.freeze({ probability: 14 / 907, payoutMultiplier: 7 }),
    Object.freeze({ probability: 6 / 907, payoutMultiplier: 11 }),
    Object.freeze({ probability: 4 / 907, payoutMultiplier: 20 }),
    Object.freeze({ probability: 2 / 907, payoutMultiplier: 50 }),
  ]),
  1: Object.freeze([
    Object.freeze({ probability: 700 / 871, payoutMultiplier: 0.3 }),
    Object.freeze({ probability: 85 / 871, payoutMultiplier: 0.5 }),
    Object.freeze({ probability: 50 / 871, payoutMultiplier: 2 }),
    Object.freeze({ probability: 20 / 871, payoutMultiplier: 5 }),
    Object.freeze({ probability: 9 / 871, payoutMultiplier: 11 }),
    Object.freeze({ probability: 4 / 871, payoutMultiplier: 25 }),
    Object.freeze({ probability: 2 / 871, payoutMultiplier: 50 }),
    Object.freeze({ probability: 1 / 871, payoutMultiplier: 100 }),
  ]),
  2: Object.freeze([
    Object.freeze({ probability: 845 / 1454, payoutMultiplier: 0.1 }),
    Object.freeze({ probability: 200 / 727, payoutMultiplier: 0.4 }),
    Object.freeze({ probability: 45 / 727, payoutMultiplier: 1.5 }),
    Object.freeze({ probability: 30 / 727, payoutMultiplier: 3 }),
    Object.freeze({ probability: 15 / 727, payoutMultiplier: 5 }),
    Object.freeze({ probability: 35 / 2908, payoutMultiplier: 10 }),
    Object.freeze({ probability: 15 / 2908, payoutMultiplier: 25 }),
    Object.freeze({ probability: 5 / 2908, payoutMultiplier: 50 }),
    Object.freeze({ probability: 1 / 1454, payoutMultiplier: 100 }),
    Object.freeze({ probability: 1 / 2908, payoutMultiplier: 250 }),
  ]),
});

const BLOCKS_OUTCOME_TABLES = Object.freeze({
  0: Object.freeze([
    Object.freeze({ probability: 0.157535, payoutMultiplier: 0 }),
    Object.freeze({ probability: 0.558461, payoutMultiplier: 1.01 }),
    Object.freeze({ probability: 0.230303, payoutMultiplier: 1.2 }),
    Object.freeze({ probability: 0.046886, payoutMultiplier: 2 }),
    Object.freeze({ probability: 0.006251, payoutMultiplier: 5 }),
    Object.freeze({ probability: 0.000536, payoutMultiplier: 20 }),
    Object.freeze({ probability: 0.000027, payoutMultiplier: 200 }),
    Object.freeze({ probability: 0.000001, payoutMultiplier: 2500 }),
  ]),
  1: Object.freeze([
    Object.freeze({ probability: 0.715996, payoutMultiplier: 0 }),
    Object.freeze({ probability: 0.230303, payoutMultiplier: 2.25 }),
    Object.freeze({ probability: 0.046886, payoutMultiplier: 6.6 }),
    Object.freeze({ probability: 0.006251, payoutMultiplier: 15 }),
    Object.freeze({ probability: 0.000536, payoutMultiplier: 80 }),
    Object.freeze({ probability: 0.000027, payoutMultiplier: 600 }),
    Object.freeze({ probability: 0.000001, payoutMultiplier: 5000 }),
  ]),
});

const MONKEY_MATCH_OUTCOME_TABLES = Object.freeze({
  1: Object.freeze([
    Object.freeze({ probability: 25 / 54, payoutMultiplier: 0.2 }),
    Object.freeze({ probability: 25 / 108, payoutMultiplier: 1.25 }),
    Object.freeze({ probability: 25 / 162, payoutMultiplier: 2 }),
    Object.freeze({ probability: 25 / 648, payoutMultiplier: 4 }),
    Object.freeze({ probability: 25 / 1296, payoutMultiplier: 5 }),
    Object.freeze({ probability: 1 / 1296, payoutMultiplier: 50 }),
    Object.freeze({ probability: 5 / 54, payoutMultiplier: 0 }),
  ]),
  2: Object.freeze([
    Object.freeze({ probability: 1200 / 2401, payoutMultiplier: 0.1 }),
    Object.freeze({ probability: 450 / 2401, payoutMultiplier: 2 }),
    Object.freeze({ probability: 300 / 2401, payoutMultiplier: 3 }),
    Object.freeze({ probability: 60 / 2401, payoutMultiplier: 4 }),
    Object.freeze({ probability: 30 / 2401, payoutMultiplier: 5 }),
    Object.freeze({ probability: 1 / 2401, payoutMultiplier: 50 }),
    Object.freeze({ probability: 360 / 2401, payoutMultiplier: 0 }),
  ]),
});

const GEEZ_DIGGERZ_OUTCOME_TABLE = Object.freeze([
  Object.freeze({ probability: 0.0018136707, payoutMultiplier: 50 }),
  Object.freeze({ probability: 0.0083991091, payoutMultiplier: 10 }),
  Object.freeze({ probability: 0.0065836247, payoutMultiplier: 8 }),
  Object.freeze({ probability: 0.0070733158, payoutMultiplier: 6 }),
  Object.freeze({ probability: 0.0392968036, payoutMultiplier: 5 }),
  Object.freeze({ probability: 0.0049767125, payoutMultiplier: 4 }),
  Object.freeze({ probability: 0.0106643839, payoutMultiplier: 3.5 }),
  Object.freeze({ probability: 0.0159875074, payoutMultiplier: 3 }),
  Object.freeze({ probability: 0.0101148416, payoutMultiplier: 2.5 }),
  Object.freeze({ probability: 0.0854674192, payoutMultiplier: 2 }),
  Object.freeze({ probability: 0.0580011898, payoutMultiplier: 1.5 }),
  Object.freeze({ probability: 0.0515807954, payoutMultiplier: 1.25 }),
  Object.freeze({ probability: 0.0193917674, payoutMultiplier: 1 }),
  Object.freeze({ probability: 0.0626804602, payoutMultiplier: 0.5 }),
  Object.freeze({ probability: 0.0282062071, payoutMultiplier: 0.25 }),
  Object.freeze({ probability: 0.5897621915, payoutMultiplier: 0 }),
]);

const SUSHI_SHOWDOWN_OUTCOME_TABLE = Object.freeze([
  Object.freeze({ probability: 0.0000546357, payoutMultiplier: 500 }),
  Object.freeze({ probability: 0.0003642383, payoutMultiplier: 100 }),
  Object.freeze({ probability: 0.0005995692, payoutMultiplier: 55 }),
  Object.freeze({ probability: 0.0008094184, payoutMultiplier: 50 }),
  Object.freeze({ probability: 0.0009713021, payoutMultiplier: 30 }),
  Object.freeze({ probability: 0.0001821191, payoutMultiplier: 22.6337 }),
  Object.freeze({ probability: 0.0003642383, payoutMultiplier: 20 }),
  Object.freeze({ probability: 0.0002124723, payoutMultiplier: 19.4003 }),
  Object.freeze({ probability: 0.0014569531, payoutMultiplier: 16.9753 }),
  Object.freeze({ probability: 0.002158449, payoutMultiplier: 15 }),
  Object.freeze({ probability: 0.0006070638, payoutMultiplier: 13.5802 }),
  Object.freeze({ probability: 0.002158449, payoutMultiplier: 12 }),
  Object.freeze({ probability: 0.0008094184, payoutMultiplier: 10.1851 }),
  Object.freeze({ probability: 0.0008094184, payoutMultiplier: 10 }),
  Object.freeze({ probability: 0.0009443215, payoutMultiplier: 8.7301 }),
  Object.freeze({ probability: 0.0008094184, payoutMultiplier: 8 }),
  Object.freeze({ probability: 0.0064753471, payoutMultiplier: 7.6388 }),
  Object.freeze({ probability: 0.0047965534, payoutMultiplier: 7 }),
  Object.freeze({ probability: 0.0026980613, payoutMultiplier: 6.1111 }),
  Object.freeze({ probability: 0.0007082411, payoutMultiplier: 5.8201 }),
  Object.freeze({ probability: 0.0056659287, payoutMultiplier: 5.0925 }),
  Object.freeze({ probability: 0.0035974151, payoutMultiplier: 5 }),
  Object.freeze({ probability: 0.0008993538, payoutMultiplier: 4.5833 }),
  Object.freeze({ probability: 0.0028329644, payoutMultiplier: 4.365 }),
  Object.freeze({ probability: 0.001011773, payoutMultiplier: 4.074 }),
  Object.freeze({ probability: 0.006595261, payoutMultiplier: 4 }),
  Object.freeze({ probability: 0.0010492461, payoutMultiplier: 3.9285 }),
  Object.freeze({ probability: 0.0269806131, payoutMultiplier: 3.8194 }),
  Object.freeze({ probability: 0.0071948302, payoutMultiplier: 3.4375 }),
  Object.freeze({ probability: 0.0012141276, payoutMultiplier: 3.395 }),
  Object.freeze({ probability: 0.0134903065, payoutMultiplier: 3.0555 }),
  Object.freeze({ probability: 0.0089935377, payoutMultiplier: 3 }),
  Object.freeze({ probability: 0.0029978459, payoutMultiplier: 2.75 }),
  Object.freeze({ probability: 0.0015738691, payoutMultiplier: 2.619 }),
  Object.freeze({ probability: 0.0016862883, payoutMultiplier: 2.4444 }),
  Object.freeze({ probability: 0.0107922452, payoutMultiplier: 2.2916 }),
  Object.freeze({ probability: 0.004047092, payoutMultiplier: 2.037 }),
  Object.freeze({ probability: 0.0112419221, payoutMultiplier: 2 }),
  Object.freeze({ probability: 0.0041969843, payoutMultiplier: 1.9642 }),
  Object.freeze({ probability: 0.0022483844, payoutMultiplier: 1.8333 }),
  Object.freeze({ probability: 0.0530618724, payoutMultiplier: 1.75 }),
  Object.freeze({ probability: 0.0397214581, payoutMultiplier: 1.25 }),
  Object.freeze({ probability: 0.0383724275, payoutMultiplier: 0.75 }),
  Object.freeze({ probability: 0.0344752278, payoutMultiplier: 0.5 }),
  Object.freeze({ probability: 0.6880693378, payoutMultiplier: 0 }),
]);

const KENO_PAYOUTS_BY_PICKS = Object.freeze({
  1: Object.freeze({ 0: 0.5, 1: 2.25 }),
  2: Object.freeze({ 0: 0, 1: 1.8, 2: 4.25 }),
  3: Object.freeze({ 0: 0, 1: 0.8, 2: 2.5, 3: 20 }),
  4: Object.freeze({ 0: 0, 1: 0, 2: 2, 3: 7, 4: 100 }),
  5: Object.freeze({ 0: 1.25, 1: 0, 2: 1.1, 3: 2.5, 4: 10, 5: 200 }),
  6: Object.freeze({ 0: 1.5, 1: 0, 2: 0.5, 3: 2, 4: 7, 5: 50, 6: 500 }),
  7: Object.freeze({ 0: 2, 1: 0, 2: 0, 3: 1.25, 4: 4, 5: 37.5, 6: 250, 7: 2500 }),
  8: Object.freeze({ 0: 2, 1: 0, 2: 0.5, 3: 1.1, 4: 2, 5: 10, 6: 50, 7: 500, 8: 10000 }),
  9: Object.freeze({ 0: 3, 1: 0, 2: 0, 3: 0.25, 4: 1.5, 5: 10, 6: 50, 7: 500, 8: 5000, 9: 500000 }),
  10: Object.freeze({ 0: 4, 1: 0, 2: 0, 3: 0.25, 4: 1.2, 5: 4, 6: 25, 7: 250, 8: 2000, 9: 50000, 10: 1000000 }),
});

const SPEED_KENO_PAYOUTS_BY_PICKS = Object.freeze({
  1: Object.freeze({ 0: 0.5, 1: 2.4 }),
  2: Object.freeze({ 0: 0.25, 1: 1.45, 2: 5 }),
  3: Object.freeze({ 0: 0.5, 1: 0.5, 2: 2.5, 3: 25 }),
  4: Object.freeze({ 0: 0.5, 1: 0.5, 2: 1.5, 3: 5.5, 4: 100 }),
  5: Object.freeze({ 0: 1.25, 1: 0.2, 2: 0.5, 3: 3, 4: 35, 5: 2000 }),
});

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

const BEAR_DICE_SUM_PROBABILITIES = Object.freeze({
  2: 1 / 36,
  3: 2 / 36,
  4: 3 / 36,
  5: 4 / 36,
  6: 5 / 36,
  7: 6 / 36,
  8: 5 / 36,
  9: 4 / 36,
  10: 3 / 36,
  11: 2 / 36,
  12: 1 / 36,
});

const BEAR_DICE_SUM_CDF = buildOutcomeCdf(
  Object.entries(BEAR_DICE_SUM_PROBABILITIES).map(([sum, probability]) => ({
    probability,
    outcome: Number(sum),
  }))
);

const KENO_OUTCOME_CDF_CACHE = new Map();
const SPEED_KENO_OUTCOME_CDF_CACHE = new Map();

function buildOutcomeCdf(outcomes = []) {
  const normalizedOutcomes = outcomes
    .map((outcome) => ({
      ...outcome,
      probability: Math.max(Number(outcome?.probability) || 0, 0),
    }))
    .filter((outcome) => outcome.probability > 0);
  const totalProbability = normalizedOutcomes.reduce((sum, outcome) => sum + outcome.probability, 0);

  if (totalProbability <= 0) {
    return [];
  }

  let cumulative = 0;
  return normalizedOutcomes.map((outcome, index) => {
    cumulative += outcome.probability / totalProbability;
    return {
      ...outcome,
      cumulative: index === normalizedOutcomes.length - 1 ? 1 : cumulative,
    };
  });
}

function drawFromCdf(cdf, rng = Math.random) {
  const roll = rng();
  for (const entry of cdf) {
    if (roll <= entry.cumulative) {
      return entry;
    }
  }

  return cdf[cdf.length - 1] || null;
}

function toApeString(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '0';
  }

  return numeric.toFixed(18).replace(/\.?0+$/, '');
}

function combination(n, k) {
  const safeN = Math.max(0, Math.trunc(Number(n) || 0));
  const safeK = Math.max(0, Math.trunc(Number(k) || 0));
  if (safeK > safeN) {
    return 0n;
  }

  const normalizedK = Math.min(safeK, safeN - safeK);
  let result = 1n;
  for (let index = 1; index <= normalizedK; index++) {
    result = (result * BigInt(safeN - normalizedK + index)) / BigInt(index);
  }
  return result;
}

function hypergeometricProbability({ populationSize, winningStates, draws, hits }) {
  const numerator = combination(winningStates, hits) * combination(populationSize - winningStates, draws - hits);
  const denominator = combination(populationSize, draws);
  return denominator > 0n ? Number(numerator) / Number(denominator) : 0;
}

function buildKenoOutcomeCdf({
  populationSize,
  drawCount,
  pickCount,
  payoutsByHits,
}) {
  const key = `${populationSize}:${drawCount}:${pickCount}`;
  const cache = populationSize === 40 ? KENO_OUTCOME_CDF_CACHE : SPEED_KENO_OUTCOME_CDF_CACHE;
  if (cache.has(key)) {
    return cache.get(key);
  }

  const outcomes = [];
  for (let hits = 0; hits <= pickCount; hits++) {
    outcomes.push({
      probability: hypergeometricProbability({
        populationSize,
        winningStates: drawCount,
        draws: pickCount,
        hits,
      }),
      payoutMultiplier: Number(payoutsByHits[hits]) || 0,
    });
  }

  const cdf = buildOutcomeCdf(outcomes);
  cache.set(key, cdf);
  return cdf;
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

function getRouletteBetTypePayoutMultiplier(gameNumber) {
  if (gameNumber === 1 || gameNumber === 38 || (gameNumber >= 2 && gameNumber <= 37)) {
    return 36.9;
  }

  if (gameNumber >= 39 && gameNumber <= 44) {
    return gameNumber >= 42 ? 3.075 : 3.075;
  }

  if (gameNumber >= 45 && gameNumber <= 50) {
    return gameNumber >= 49 ? 2.05 : 2.05;
  }

  return 0;
}

function isRouletteWinningPocket(gameNumber, pocket) {
  if (gameNumber === 1) return pocket === 0;
  if (gameNumber === 38) return pocket === 37;
  if (gameNumber >= 2 && gameNumber <= 37) return pocket === gameNumber - 1;
  if (pocket === 0 || pocket === 37) return false;

  switch (gameNumber) {
    case 39:
      return pocket >= 1 && pocket <= 12;
    case 40:
      return pocket >= 13 && pocket <= 24;
    case 41:
      return pocket >= 25 && pocket <= 36;
    case 42:
      return pocket % 3 === 1;
    case 43:
      return pocket % 3 === 2;
    case 44:
      return pocket % 3 === 0;
    case 45:
      return pocket >= 1 && pocket <= 18;
    case 46:
      return pocket >= 19 && pocket <= 36;
    case 47:
      return pocket % 2 === 0;
    case 48:
      return pocket % 2 === 1;
    case 49:
      return ROULETTE_BLACK_POCKETS.has(pocket);
    case 50:
      return ROULETTE_RED_POCKETS.has(pocket);
    default:
      return false;
  }
}

function parseBaccaratConfigApe({ bet, wagerApe } = {}) {
  try {
    const parsed = parseBaccaratBet(String(bet || '').trim(), parseEther(toApeString(wagerApe)));
    return {
      playerBankerBetApe: Number(formatEther(parsed.playerBankerBet)) || 0,
      tieBetApe: Number(formatEther(parsed.tieBet)) || 0,
      isBanker: Boolean(parsed.isBanker),
    };
  } catch {
    return null;
  }
}

function sampleOutcomePayoutApe({ cdf, unitBetApe, rng = Math.random } = {}) {
  const outcome = drawFromCdf(cdf, rng);
  return outcome ? unitBetApe * (Number(outcome.payoutMultiplier) || 0) : 0;
}

function sampleRepeatedOutcomePayoutApe({
  count,
  unitBetApe,
  cdf,
  rng = Math.random,
} = {}) {
  const safeCount = Math.max(1, Math.floor(Number(count) || 0));
  let payoutApe = 0;

  for (let index = 0; index < safeCount; index++) {
    payoutApe += sampleOutcomePayoutApe({ cdf, unitBetApe, rng });
  }

  return payoutApe;
}

function sampleBearDiceSum(rng = Math.random) {
  const outcome = drawFromCdf(BEAR_DICE_SUM_CDF, rng);
  return outcome ? outcome.outcome : 7;
}

function sampleBearDicePayoutApe({
  wagerApe,
  difficulty,
  rolls,
  rng = Math.random,
} = {}) {
  const safeDifficulty = Math.max(0, Math.trunc(Number(difficulty) || 0));
  const safeRolls = Math.max(1, Math.trunc(Number(rolls) || 0));
  const payoutsBySum = BEAR_DICE_MODE_TABLES[safeDifficulty]?.payoutsByRuns?.[safeRolls];
  if (!payoutsBySum) {
    return 0;
  }

  let payoutMultiplier = 1;
  for (let rollIndex = 0; rollIndex < safeRolls; rollIndex++) {
    const sum = sampleBearDiceSum(rng);
    const rollMultiplier = (Number(payoutsBySum[sum]) || 0) / 100;
    if (rollMultiplier <= 0) {
      return 0;
    }
    payoutMultiplier *= rollMultiplier;
  }

  return Math.max(Number(wagerApe) || 0, 0) * payoutMultiplier;
}

function getConfiguredGameSamplerComplexity({ gameEntry, config = {} } = {}) {
  const gameKey = String(gameEntry?.key || '').trim();

  switch (gameKey) {
    case 'jungle-plinko':
    case 'cosmic-plinko':
      return Math.max(1, Math.trunc(Number(config?.balls ?? gameEntry?.config?.balls?.default) || 0));
    case 'geez-diggerz':
    case 'sushi-showdown':
    case 'dino-dough':
    case 'bubblegum-heist':
      return Math.max(1, Math.trunc(Number(config?.spins ?? gameEntry?.config?.spins?.default) || 0));
    case 'speed-keno':
      return Math.max(1, Math.trunc(Number(config?.games ?? gameEntry?.config?.games?.default) || 0));
    case 'blocks':
    case 'primes':
      return Math.max(1, Math.trunc(Number(config?.runs ?? gameEntry?.config?.runs?.default) || 0));
    case 'bear-dice':
      return Math.max(1, Math.trunc(Number(config?.rolls ?? gameEntry?.config?.rolls?.default) || 0));
    case 'roulette': {
      try {
        return Math.max(1, parseRouletteBets(String(config?.bet || gameEntry?.config?.bet?.default || ''), gameEntry).length);
      } catch {
        return 1;
      }
    }
    default:
      return 1;
  }
}

function getConfiguredGameExpectedLossPerGameApe({
  gameEntry,
  wagerApe,
  config = {},
  vrfFeeApe = 0,
} = {}) {
  const safeWagerApe = Math.max(Number(wagerApe) || 0, 0);
  const safeVrfFeeApe = Math.max(Number(vrfFeeApe) || 0, 0);
  const expectedRtpReference = getConfiguredGameExpectedRtpReference({
    game: gameEntry?.key,
    config,
  });
  const expectedRtpPercent = Number(expectedRtpReference?.value);

  if (!Number.isFinite(expectedRtpPercent)) {
    return null;
  }

  return (safeWagerApe * (1 - (expectedRtpPercent / 100))) + safeVrfFeeApe;
}

function getConfiguredMonteCarloSessionCount({
  estimatedGames,
  complexity,
  sessionCount = null,
} = {}) {
  if (sessionCount !== null && sessionCount !== undefined) {
    return Math.max(1, Math.floor(Number(sessionCount) || 0));
  }

  const safeEstimatedGames = Math.max(1, Math.floor(Number(estimatedGames) || 0));
  const safeComplexity = Math.max(1, Math.floor(Number(complexity) || 0));
  const suggested = Math.floor(CONFIGURED_GAME_MONTE_CARLO_OPERATION_BUDGET / (safeEstimatedGames * safeComplexity));

  if (suggested < MIN_CONFIGURED_GAME_MONTE_CARLO_SESSIONS) {
    return null;
  }

  return Math.min(DEFAULT_CONFIGURED_GAME_MONTE_CARLO_MAX_SESSIONS, suggested);
}

function getConfiguredMonteCarloMaxGamesCap(estimatedGames) {
  const safeEstimatedGames = Math.max(0, Math.floor(Number(estimatedGames) || 0));
  return Math.min(
    DEFAULT_MONTE_CARLO_MAX_GAMES,
    Math.max(1000, safeEstimatedGames * 25)
  );
}

function createConfiguredGameNetDeltaSampler({
  gameEntry,
  wagerApe,
  config = {},
  vrfFeeApe = 0,
} = {}) {
  const gameKey = String(gameEntry?.key || '').trim();
  const safeWagerApe = Math.max(Number(wagerApe) || 0, 0);
  const safeVrfFeeApe = Math.max(Number(vrfFeeApe) || 0, 0);

  switch (gameKey) {
    case 'roulette': {
      try {
        const gameNumbers = parseRouletteBets(String(config?.bet || ''), gameEntry);
        if (gameNumbers.length === 0) {
          return null;
        }
        const amountPerBetApe = safeWagerApe / gameNumbers.length;
        return (rng = Math.random) => {
          const pocket = ROULETTE_POCKETS[Math.floor(rng() * ROULETTE_POCKETS.length)] ?? 0;
          let payoutApe = 0;
          for (const gameNumber of gameNumbers) {
            if (isRouletteWinningPocket(gameNumber, pocket)) {
              payoutApe += amountPerBetApe * getRouletteBetTypePayoutMultiplier(gameNumber);
            }
          }
          return payoutApe - safeWagerApe - safeVrfFeeApe;
        };
      } catch {
        return null;
      }
    }
    case 'baccarat': {
      const parsed = parseBaccaratConfigApe({
        bet: config?.bet || '',
        wagerApe: safeWagerApe,
      });
      if (!parsed) {
        return null;
      }

      return (rng = Math.random) => {
        const roll = rng();
        let payoutApe = 0;

        if (roll < BACCARAT_PLAYER_WIN_PROBABILITY) {
          payoutApe = parsed.isBanker ? 0 : (parsed.playerBankerBetApe * 2);
        } else if (roll < (BACCARAT_PLAYER_WIN_PROBABILITY + BACCARAT_BANKER_WIN_PROBABILITY)) {
          payoutApe = parsed.isBanker ? (parsed.playerBankerBetApe * 1.95) : 0;
        } else {
          payoutApe = parsed.playerBankerBetApe + (parsed.tieBetApe * 9);
        }

        return payoutApe - safeWagerApe - safeVrfFeeApe;
      };
    }
    case 'ape-strong': {
      const range = Math.max(5, Math.min(95, Math.trunc(Number(config?.range ?? gameEntry?.config?.range?.default) || 0)));
      const payoutMultiplier = getApestrongPayoutMultiplier(range);
      if (!Number.isFinite(payoutMultiplier)) {
        return null;
      }

      return (rng = Math.random) => {
        const payoutApe = rng() < (range / 100) ? (safeWagerApe * payoutMultiplier) : 0;
        return payoutApe - safeWagerApe - safeVrfFeeApe;
      };
    }
    case 'keno': {
      const picks = Math.max(1, Math.min(10, Math.trunc(Number(config?.picks ?? gameEntry?.config?.picks?.default) || 0)));
      const cdf = buildKenoOutcomeCdf({
        populationSize: 40,
        drawCount: 10,
        pickCount: picks,
        payoutsByHits: KENO_PAYOUTS_BY_PICKS[picks],
      });
      return (rng = Math.random) => sampleOutcomePayoutApe({
        cdf,
        unitBetApe: safeWagerApe,
        rng,
      }) - safeWagerApe - safeVrfFeeApe;
    }
    case 'speed-keno': {
      const picks = Math.max(1, Math.min(5, Math.trunc(Number(config?.picks ?? gameEntry?.config?.picks?.default) || 0)));
      const games = Math.max(1, Math.min(20, Math.trunc(Number(config?.games ?? gameEntry?.config?.games?.default) || 0)));
      const cdf = buildKenoOutcomeCdf({
        populationSize: 20,
        drawCount: 5,
        pickCount: picks,
        payoutsByHits: SPEED_KENO_PAYOUTS_BY_PICKS[picks],
      });
      const unitBetApe = safeWagerApe / games;
      return (rng = Math.random) => sampleRepeatedOutcomePayoutApe({
        count: games,
        unitBetApe,
        cdf,
        rng,
      }) - safeWagerApe - safeVrfFeeApe;
    }
    case 'monkey-match': {
      const mode = Math.max(1, Math.min(2, Math.trunc(Number(config?.mode ?? gameEntry?.config?.mode?.default) || 0)));
      const cdf = buildOutcomeCdf(MONKEY_MATCH_OUTCOME_TABLES[mode] || MONKEY_MATCH_OUTCOME_TABLES[1]);
      return (rng = Math.random) => sampleOutcomePayoutApe({
        cdf,
        unitBetApe: safeWagerApe,
        rng,
      }) - safeWagerApe - safeVrfFeeApe;
    }
    case 'bear-dice': {
      const difficulty = Math.max(0, Math.min(4, Math.trunc(Number(config?.difficulty ?? gameEntry?.config?.difficulty?.default) || 0)));
      const rolls = Math.max(1, Math.min(5, Math.trunc(Number(config?.rolls ?? gameEntry?.config?.rolls?.default) || 0)));
      return (rng = Math.random) => sampleBearDicePayoutApe({
        wagerApe: safeWagerApe,
        difficulty,
        rolls,
        rng,
      }) - safeWagerApe - safeVrfFeeApe;
    }
    case 'blocks': {
      const mode = Math.max(0, Math.min(1, Math.trunc(Number(config?.mode ?? gameEntry?.config?.mode?.default) || 0)));
      const runs = Math.max(1, Math.min(5, Math.trunc(Number(config?.runs ?? gameEntry?.config?.runs?.default) || 0)));
      const cdf = buildOutcomeCdf(BLOCKS_OUTCOME_TABLES[mode] || BLOCKS_OUTCOME_TABLES[0]);
      const unitBetApe = safeWagerApe / runs;
      return (rng = Math.random) => sampleRepeatedOutcomePayoutApe({
        count: runs,
        unitBetApe,
        cdf,
        rng,
      }) - safeWagerApe - safeVrfFeeApe;
    }
    case 'primes': {
      const difficulty = Math.max(0, Math.min(3, Math.trunc(Number(config?.difficulty ?? gameEntry?.config?.difficulty?.default) || 0)));
      const runs = Math.max(1, Math.min(20, Math.trunc(Number(config?.runs ?? gameEntry?.config?.runs?.default) || 0)));
      const difficultyTable = {
        0: { maxRange: 10, primeCount: 4, primeMultiplier: 1.9, zeroMultiplier: 2.2 },
        1: { maxRange: 100, primeCount: 25, primeMultiplier: 3.5, zeroMultiplier: 10.5 },
        2: { maxRange: 1000, primeCount: 168, primeMultiplier: 5.5, zeroMultiplier: 56 },
        3: { maxRange: 10000, primeCount: 1229, primeMultiplier: 7.57, zeroMultiplier: 500 },
      }[difficulty];
      if (!difficultyTable) {
        return null;
      }
      const cdf = buildOutcomeCdf([
        { probability: 1 / difficultyTable.maxRange, payoutMultiplier: difficultyTable.zeroMultiplier },
        { probability: difficultyTable.primeCount / difficultyTable.maxRange, payoutMultiplier: difficultyTable.primeMultiplier },
        { probability: 1 - ((difficultyTable.primeCount + 1) / difficultyTable.maxRange), payoutMultiplier: 0 },
      ]);
      const unitBetApe = safeWagerApe / runs;
      return (rng = Math.random) => sampleRepeatedOutcomePayoutApe({
        count: runs,
        unitBetApe,
        cdf,
        rng,
      }) - safeWagerApe - safeVrfFeeApe;
    }
    case 'jungle-plinko': {
      const mode = Math.max(0, Math.min(4, Math.trunc(Number(config?.mode ?? gameEntry?.config?.mode?.default) || 0)));
      const balls = Math.max(1, Math.min(100, Math.trunc(Number(config?.balls ?? gameEntry?.config?.balls?.default) || 0)));
      const cdf = buildOutcomeCdf(JUNGLE_PLINKO_OUTCOME_TABLES[mode] || JUNGLE_PLINKO_OUTCOME_TABLES[0]);
      const unitBetApe = safeWagerApe / balls;
      return (rng = Math.random) => sampleRepeatedOutcomePayoutApe({
        count: balls,
        unitBetApe,
        cdf,
        rng,
      }) - safeWagerApe - safeVrfFeeApe;
    }
    case 'cosmic-plinko': {
      const mode = Math.max(0, Math.min(2, Math.trunc(Number(config?.mode ?? gameEntry?.config?.mode?.default) || 0)));
      const balls = Math.max(1, Math.min(30, Math.trunc(Number(config?.balls ?? gameEntry?.config?.balls?.default) || 0)));
      const cdf = buildOutcomeCdf(COSMIC_PLINKO_OUTCOME_TABLES[mode] || COSMIC_PLINKO_OUTCOME_TABLES[0]);
      const unitBetApe = safeWagerApe / balls;
      return (rng = Math.random) => sampleRepeatedOutcomePayoutApe({
        count: balls,
        unitBetApe,
        cdf,
        rng,
      }) - safeWagerApe - safeVrfFeeApe;
    }
    case 'geez-diggerz': {
      const spins = Math.max(1, Math.min(15, Math.trunc(Number(config?.spins ?? gameEntry?.config?.spins?.default) || 0)));
      const cdf = buildOutcomeCdf(GEEZ_DIGGERZ_OUTCOME_TABLE);
      const unitBetApe = safeWagerApe / spins;
      return (rng = Math.random) => sampleRepeatedOutcomePayoutApe({
        count: spins,
        unitBetApe,
        cdf,
        rng,
      }) - safeWagerApe - safeVrfFeeApe;
    }
    case 'sushi-showdown': {
      const spins = Math.max(1, Math.min(15, Math.trunc(Number(config?.spins ?? gameEntry?.config?.spins?.default) || 0)));
      const cdf = buildOutcomeCdf(SUSHI_SHOWDOWN_OUTCOME_TABLE);
      const unitBetApe = safeWagerApe / spins;
      return (rng = Math.random) => sampleRepeatedOutcomePayoutApe({
        count: spins,
        unitBetApe,
        cdf,
        rng,
      }) - safeWagerApe - safeVrfFeeApe;
    }
    default:
      return null;
  }
}

function getConfiguredUnitCountWithDefault({ gameEntry, config = {} } = {}) {
  switch (gameEntry?.vrf?.type) {
    case 'plinko':
      return Math.max(1, Math.trunc(Number(config?.balls ?? gameEntry?.config?.balls?.default) || 0));
    case 'speedkeno':
      return Math.max(1, Math.trunc(Number(config?.games ?? gameEntry?.config?.games?.default) || 0));
    case 'beardice':
      return Math.max(1, Math.trunc(Number(config?.rolls ?? gameEntry?.config?.rolls?.default) || 0));
    case 'blocks':
    case 'primes':
      return Math.max(1, Math.trunc(Number(config?.runs ?? gameEntry?.config?.runs?.default) || 0));
    default:
      return null;
  }
}

export async function getConfiguredGameVrfFeeApe({
  publicClient,
  gameEntry,
  config = {},
} = {}) {
  if (!publicClient || !gameEntry?.contract || !gameEntry?.vrf?.type) {
    return 0;
  }

  switch (gameEntry.vrf.type) {
    case 'static':
    case 'slots': {
      return Number(formatEther(await getStaticVrfFee(publicClient, gameEntry.contract))) || 0;
    }
    case 'plinko':
    case 'speedkeno':
    case 'beardice':
    case 'blocks':
    case 'primes': {
      const unitCount = getConfiguredUnitCountWithDefault({ gameEntry, config });
      const customGasLimit = gameEntry.vrf.baseGas + (unitCount * gameEntry.vrf.perUnitGas);
      return Number(formatEther(await getPlinkoVrfFee(publicClient, gameEntry.contract, customGasLimit))) || 0;
    }
    default:
      return 0;
  }
}

export function estimateConfiguredGameLoopRunout({
  balanceApe,
  availableApe,
  stopLossApe = null,
  gameEntry,
  wagerApe,
  config = {},
  vrfFeeApe = 0,
  sessionCount = null,
  rng = Math.random,
} = {}) {
  const expectedLossPerGameApe = getConfiguredGameExpectedLossPerGameApe({
    gameEntry,
    wagerApe,
    config,
    vrfFeeApe,
  });
  const evEstimate = calculateLoopRunoutEstimate({
    balanceApe,
    availableApe,
    stopLossApe,
    expectedLossPerGameApe,
  });
  const sampler = createConfiguredGameNetDeltaSampler({
    gameEntry,
    wagerApe,
    config,
    vrfFeeApe,
  });

  if (!sampler || evEstimate.positiveEv || evEstimate.estimatedGames === null) {
    return evEstimate;
  }

  const complexity = getConfiguredGameSamplerComplexity({ gameEntry, config });
  const monteCarloSessionCount = getConfiguredMonteCarloSessionCount({
    estimatedGames: evEstimate.estimatedGames,
    complexity,
    sessionCount,
  });
  if (!monteCarloSessionCount) {
    return evEstimate;
  }

  return calculateMonteCarloLoopRunoutEstimate({
    balanceApe,
    availableApe,
    stopLossApe,
    minBalanceFloorApe: 0,
    requiredApeToStart: Math.max(Number(wagerApe) || 0, 0) + Math.max(Number(vrfFeeApe) || 0, 0),
    sampleGameNetDeltaApe: ({ rng: gameRng }) => sampler(gameRng),
    sessionCount: monteCarloSessionCount,
    maxGamesCap: getConfiguredMonteCarloMaxGamesCap(evEstimate.estimatedGames),
    rng,
  });
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
