/**
 * Shared helpers for loop runout estimates.
 */
import { formatEther, parseEther } from 'viem';
import { parseBaccaratBet } from './games/baccarat.js';
import { getPlinkoVrfFee, getStaticVrfFee } from './games/base.js';
import { getBlocksBoardSize } from './games/blocks.js';
import { parseGimbozSmashInput } from './games/gimbozsmash.js';
import { parseRouletteBets } from './games/roulette.js';
import { getSlotsTransactionFee } from './games/slots.js';
import {
  BACCARAT_PAYOUTS,
  BEAR_DICE_MODE_TABLES,
  COSMIC_PLINKO_OUTCOME_TABLES,
  JUNGLE_PLINKO_OUTCOME_TABLES,
  KENO_PAYOUTS_BY_PICKS,
  MONKEY_MATCH_OUTCOME_TABLES,
  PRIMES_MODE_TABLES,
  ROULETTE_POCKETS,
  getRouletteBetPayoutUnits,
  isRouletteWinningPocket,
  SPEED_KENO_PAYOUTS_BY_PICKS,
  SLOT_OUTCOME_TABLES,
  VIDEO_POKER_PAYOUTS,
} from './payout-tables.js';
import {
  formatGlydeOrCrashTargetMultiplier,
  getApestrongPayoutMultiplier,
  getBlocksOutcomeTable,
  getConfiguredGameExpectedRtpReference,
  getGlydeOrCrashWinProbability,
  getGimbozSmashPayoutMultiplier,
  parseGlydeOrCrashTargetMultiplierInput,
} from './rtp.js';
import {
  BET_AMOUNTS as VIDEO_POKER_BET_AMOUNTS,
  MAX_BET_INDEX as VIDEO_POKER_MAX_BET_INDEX,
} from './stateful/video-poker/constants.js';

const VIDEO_POKER_BASE_RTP = 0.981649;
const VIDEO_POKER_ROYAL_FLUSH_PROBABILITY = 0.000025;
const VIDEO_POKER_MAX_BET_APE = VIDEO_POKER_BET_AMOUNTS[VIDEO_POKER_MAX_BET_INDEX];
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

const BACCARAT_PLAYER_WIN_PROBABILITY = 2153464 / 4826809;
const BACCARAT_BANKER_WIN_PROBABILITY = 2212744 / 4826809;
const BACCARAT_TIE_PROBABILITY = 460601 / 4826809;

const VIDEO_POKER_OUTCOME_TABLE = [
  { probability: 0.54547, payoutMultiplier: VIDEO_POKER_PAYOUTS[0] },
  { probability: 0.214585, payoutMultiplier: VIDEO_POKER_PAYOUTS[1] },
  { probability: 0.129279, payoutMultiplier: VIDEO_POKER_PAYOUTS[2] },
  { probability: 0.074449, payoutMultiplier: VIDEO_POKER_PAYOUTS[3] },
  { probability: 0.011214, payoutMultiplier: VIDEO_POKER_PAYOUTS[4] },
  { probability: 0.010995, payoutMultiplier: VIDEO_POKER_PAYOUTS[5] },
  { probability: 0.011512, payoutMultiplier: VIDEO_POKER_PAYOUTS[6] },
  { probability: 0.002363, payoutMultiplier: VIDEO_POKER_PAYOUTS[7] },
  { probability: 0.000108, payoutMultiplier: VIDEO_POKER_PAYOUTS[8] },
  { probability: 0.000025, payoutMultiplier: VIDEO_POKER_PAYOUTS[9], isRoyalFlush: true },
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

function sampleBlocksPayoutApe({
  wagerApe,
  gridMode,
  mode,
  runs,
  rng = Math.random,
} = {}) {
  const safeMode = Math.max(0, Math.min(1, Math.trunc(Number(mode) || 0)));
  const safeGridMode = Math.max(0, Math.min(2, Math.trunc(Number(gridMode) || 0)));
  const safeRuns = Math.max(1, Math.min(5, Math.trunc(Number(runs) || 0)));
  const cdf = buildOutcomeCdf(getBlocksOutcomeTable({ gridMode: safeGridMode, mode: safeMode }));
  if (!cdf.length) {
    return 0;
  }

  let payoutMultiplier = 1;
  for (let rollIndex = 0; rollIndex < safeRuns; rollIndex += 1) {
    const outcome = drawFromCdf(cdf, rng);
    const rollMultiplier = Number(outcome?.payoutMultiplier) || 0;
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
      return Math.max(1, Math.trunc(Number(config?.split ?? config?.balls ?? gameEntry?.config?.balls?.default) || 0));
    case 'geez-diggerz':
    case 'sushi-showdown':
    case 'dino-dough':
    case 'bubblegum-heist':
      return Math.max(1, Math.trunc(Number(config?.split ?? config?.spins ?? gameEntry?.config?.spins?.default) || 0));
    case 'speed-keno':
      return Math.max(1, Math.trunc(Number(config?.split ?? config?.games ?? gameEntry?.config?.games?.default) || 0));
    case 'primes':
      return Math.max(1, Math.trunc(Number(config?.split ?? config?.runs ?? gameEntry?.config?.runs?.default) || 0));
    case 'blocks':
      return Math.max(1, Math.trunc(Number(config?.split ?? config?.survive ?? config?.runs ?? gameEntry?.config?.runs?.default) || 0));
    case 'bear-dice':
      return Math.max(1, Math.trunc(Number(config?.survive ?? config?.rolls ?? config?.runs ?? gameEntry?.config?.rolls?.default) || 0));
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
              payoutApe += amountPerBetApe * (getRouletteBetPayoutUnits(gameNumber) / 1000);
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
          payoutApe = parsed.isBanker ? 0 : (parsed.playerBankerBetApe * BACCARAT_PAYOUTS.player);
        } else if (roll < (BACCARAT_PLAYER_WIN_PROBABILITY + BACCARAT_BANKER_WIN_PROBABILITY)) {
          payoutApe = parsed.isBanker ? (parsed.playerBankerBetApe * BACCARAT_PAYOUTS.banker) : 0;
        } else {
          payoutApe = parsed.playerBankerBetApe + (parsed.tieBetApe * BACCARAT_PAYOUTS.tie);
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
    case 'glyde-or-crash': {
      const normalizedMultiplier = formatGlydeOrCrashTargetMultiplier(
        config?.multiplierBasisPoints ?? config?.multiplier ?? gameEntry?.config?.multiplier?.default,
      );
      if (!normalizedMultiplier) {
        return null;
      }

      let multiplierBasisPoints;
      try {
        multiplierBasisPoints = parseGlydeOrCrashTargetMultiplierInput(normalizedMultiplier.replace(/,/g, ''));
      } catch {
        return null;
      }

      const winProbability = getGlydeOrCrashWinProbability(multiplierBasisPoints);
      if (!Number.isFinite(winProbability)) {
        return null;
      }

      const payoutMultiplier = multiplierBasisPoints / 10000;
      return (rng = Math.random) => {
        const payoutApe = rng() < winProbability ? (safeWagerApe * payoutMultiplier) : 0;
        return payoutApe - safeWagerApe - safeVrfFeeApe;
      };
    }
    case 'gimboz-smash': {
      try {
        const parsed = parseGimbozSmashInput({
          range: config?.outRange ? undefined : (config?.targets ?? gameEntry?.config?.range?.default),
          outRange: config?.outRange,
        });
        const payoutMultiplier = getGimbozSmashPayoutMultiplier(parsed.winCount);
        if (!Number.isFinite(payoutMultiplier)) {
          return null;
        }

        return (rng = Math.random) => {
          const payoutApe = rng() < (parsed.winCount / 100) ? (safeWagerApe * payoutMultiplier) : 0;
          return payoutApe - safeWagerApe - safeVrfFeeApe;
        };
      } catch {
        return null;
      }
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
      const games = Math.max(1, Math.min(20, Math.trunc(Number(config?.split ?? config?.games ?? gameEntry?.config?.games?.default) || 0)));
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
      const rolls = Math.max(1, Math.min(5, Math.trunc(Number(config?.survive ?? config?.rolls ?? config?.runs ?? gameEntry?.config?.rolls?.default) || 0)));
      return (rng = Math.random) => sampleBearDicePayoutApe({
        wagerApe: safeWagerApe,
        difficulty,
        rolls,
        rng,
      }) - safeWagerApe - safeVrfFeeApe;
    }
    case 'blocks': {
      const gridMode = Math.max(0, Math.min(2, Math.trunc(Number(config?.gridMode ?? gameEntry?.config?.grid?.default) || 0)));
      const mode = Math.max(0, Math.min(1, Math.trunc(Number(config?.mode ?? gameEntry?.config?.mode?.default) || 0)));
      const runs = Math.max(1, Math.min(5, Math.trunc(Number(config?.split ?? config?.survive ?? config?.runs ?? gameEntry?.config?.runs?.default) || 0)));
      if (config?.compounding === false) {
        const cdf = buildOutcomeCdf(getBlocksOutcomeTable({ gridMode, mode }));
        const unitBetApe = safeWagerApe / runs;
        return (rng = Math.random) => sampleRepeatedOutcomePayoutApe({
          count: runs,
          unitBetApe,
          cdf,
          rng,
        }) - safeWagerApe - safeVrfFeeApe;
      }
      return (rng = Math.random) => sampleBlocksPayoutApe({
        wagerApe: safeWagerApe,
        gridMode,
        mode,
        runs,
        rng,
      }) - safeWagerApe - safeVrfFeeApe;
    }
    case 'primes': {
      const difficulty = Math.max(0, Math.min(3, Math.trunc(Number(config?.difficulty ?? gameEntry?.config?.difficulty?.default) || 0)));
      const runs = Math.max(1, Math.min(20, Math.trunc(Number(config?.split ?? config?.runs ?? gameEntry?.config?.runs?.default) || 0)));
      const difficultyTable = PRIMES_MODE_TABLES[difficulty];
      if (!difficultyTable) {
        return null;
      }
      const cdf = buildOutcomeCdf([
        { probability: 1 / difficultyTable.maxRange, payoutMultiplier: difficultyTable.zeroMultiplier / 10000 },
        { probability: difficultyTable.primeCount / difficultyTable.maxRange, payoutMultiplier: difficultyTable.primeMultiplier / 10000 },
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
      const balls = Math.max(1, Math.min(100, Math.trunc(Number(config?.split ?? config?.balls ?? gameEntry?.config?.balls?.default) || 0)));
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
      const balls = Math.max(1, Math.min(30, Math.trunc(Number(config?.split ?? config?.balls ?? gameEntry?.config?.balls?.default) || 0)));
      const cdf = buildOutcomeCdf(COSMIC_PLINKO_OUTCOME_TABLES[mode] || COSMIC_PLINKO_OUTCOME_TABLES[0]);
      const unitBetApe = safeWagerApe / balls;
      return (rng = Math.random) => sampleRepeatedOutcomePayoutApe({
        count: balls,
        unitBetApe,
        cdf,
        rng,
      }) - safeWagerApe - safeVrfFeeApe;
    }
    case 'dino-dough':
    case 'bubblegum-heist':
    case 'geez-diggerz':
    case 'sushi-showdown': {
      const spins = Math.max(1, Math.min(15, Math.trunc(Number(config?.split ?? config?.spins ?? gameEntry?.config?.spins?.default) || 0)));
      const cdf = buildOutcomeCdf(SLOT_OUTCOME_TABLES[gameKey]);
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
      return Math.max(1, Math.trunc(Number(config?.split ?? config?.balls ?? gameEntry?.config?.balls?.default) || 0));
    case 'speedkeno':
      return Math.max(1, Math.trunc(Number(config?.split ?? config?.games ?? gameEntry?.config?.games?.default) || 0));
    case 'beardice':
      return Math.max(1, Math.trunc(Number(config?.survive ?? config?.rolls ?? config?.runs ?? gameEntry?.config?.rolls?.default) || 0));
    case 'blocks': {
      const runs = Math.max(1, Math.trunc(Number(config?.split ?? config?.survive ?? config?.runs ?? gameEntry?.config?.runs?.default) || 0));
      const gridMode = Math.max(0, Math.min(2, Math.trunc(Number(config?.gridMode ?? gameEntry?.config?.grid?.default) || 0)));
      return runs * getBlocksBoardSize(gridMode);
    }
    case 'primes':
      return Math.max(1, Math.trunc(Number(config?.split ?? config?.runs ?? gameEntry?.config?.runs?.default) || 0));
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
    case 'slots-dynamic': {
      const spins = Math.max(1, Math.trunc(Number(config?.split ?? config?.spins ?? gameEntry?.config?.spins?.default) || 0));
      return Number(formatEther(await getSlotsTransactionFee(publicClient, gameEntry, spins))) || 0;
    }
    case 'plinko':
    case 'speedkeno':
    case 'beardice':
    case 'primes': {
      const unitCount = getConfiguredUnitCountWithDefault({ gameEntry, config });
      const customGasLimit = gameEntry.vrf.baseGas + (unitCount * gameEntry.vrf.perUnitGas);
      return Number(formatEther(await getPlinkoVrfFee(publicClient, gameEntry.contract, customGasLimit))) || 0;
    }
    case 'blocks': {
      const tileCount = getConfiguredUnitCountWithDefault({ gameEntry, config });
      const customGasLimit = gameEntry.vrf.baseGas + (tileCount * gameEntry.vrf.perTileGas);
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
