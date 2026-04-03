/**
 * Shared RTP references and formatting helpers.
 */
import { theme } from './theme.js';
import { resolveGameDisplayName, stripAbiVerifiedSymbol } from '../registry.js';

function fixedReference(
  value,
  {
    display = `${value.toFixed(2)}%`,
    referenceType = 'theoretical',
    calculationKind = null,
    calculationModel = null,
  } = {},
) {
  return Object.freeze({
    display,
    min: value,
    max: value,
    value,
    referenceType,
    calculationKind,
    calculationModel,
  });
}

function fixedExpected(value, display = `${value.toFixed(2)}%`) {
  return fixedReference(value, { display, referenceType: 'theoretical' });
}

function fixedCalculated(value, {
  display = `${value.toFixed(2)}%`,
  calculationKind = 'exact',
  calculationModel,
} = {}) {
  return fixedReference(value, {
    display,
    referenceType: 'calculated',
    calculationKind,
    calculationModel,
  });
}

function formatMultiplierDisplay(value, digits = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const formatted = numeric.toFixed(digits).replace(/\.?0+$/, '');
  const [integerPart, fractionalPart] = formatted.split('.');
  const withGrouping = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${withGrouping}${fractionalPart ? `.${fractionalPart}` : ''}x`;
}

function fixedMaxPayout(value, { display = formatMultiplierDisplay(value) } = {}) {
  const numeric = Number(value);
  return Object.freeze({
    display,
    value: Number.isFinite(numeric) ? numeric : null,
  });
}

function toDisplayGameName(key, aliases = []) {
  const registryDisplayName = resolveGameDisplayName({ gameKey: key });
  if (registryDisplayName !== 'Unknown') {
    return registryDisplayName;
  }

  const preferredAlias = aliases.find((alias) =>
    typeof alias === 'string'
    && alias.trim()
    && alias !== key
    && /[A-Z]/.test(alias)
  );

  if (preferredAlias) {
    return preferredAlias.trim();
  }

  return String(key || '')
    .trim()
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

const KENO_EXPECTED_RTP_BY_PICKS = Object.freeze({
  1: 93.75,
  2: 93.75,
  3: 93.6741,
  4: 93.391,
  5: 94.6801,
  6: 93.897,
  7: 94.2872,
  8: 94.1885,
  9: 93.3169,
  10: 93.8297,
});

const SPEED_KENO_EXPECTED_RTP_BY_PICKS = Object.freeze({
  1: 97.5,
  2: 97.3684,
  3: 97.807,
  4: 97.42,
  5: 97.8377,
});

const KENO_MAX_PAYOUT_BY_PICKS = Object.freeze({
  1: 2.25,
  2: 4.25,
  3: 20,
  4: 100,
  5: 200,
  6: 500,
  7: 2500,
  8: 10000,
  9: 500000,
  10: 1000000,
});

const SPEED_KENO_MAX_PAYOUT_BY_PICKS = Object.freeze({
  1: 2.4,
  2: 5,
  3: 25,
  4: 100,
  5: 2000,
});

const MONKEY_MATCH_MAX_PAYOUT_BY_MODE = Object.freeze({
  1: 50,
  2: 50,
});

function fixedJackpotMaxPayout(value, { display = `${formatMultiplierDisplay(value)} + 💰` } = {}) {
  return fixedMaxPayout(value, { display });
}

const VIDEO_POKER_BASE_CALCULATED_RTP = 98.1649;
const VIDEO_POKER_ROYAL_FLUSH_PROBABILITY = 0.000025;
const BLACKJACK_MAIN_CALCULATED_RTP = 100.05321;
const BLACKJACK_PLAYER_SIDE_EXACT_RTP = (2160 / 2704) * 100;
const BLACKJACK_DEALER_SIDE_EXACT_RTP = (((4 / 13) + (25 / 169) - ((4 / 13) * (25 / 169))) * 2) * 100;

const CALCULATION_MODEL_APESTRONG = 'Exact EV from payout = 97.5 / range, invariant across supported ranges.';
const CALCULATION_MODEL_ROULETTE = 'Exact weighted sum across American-wheel payouts over 38 pockets.';
const CALCULATION_MODEL_KENO = 'Exact hypergeometric EV for the verified on-chain Keno paytable: 10 winning numbers are drawn from 40 without replacement via a partial Fisher-Yates shuffle, and the bettor is paid from payouts[picks][hits].';
const CALCULATION_MODEL_SPEED_KENO = 'Exact hypergeometric EV for 5 draws from 20 without replacement using the published paytable.';
const CALCULATION_MODEL_MONKEY_MATCH = 'Exact combinatorial EV over the verified on-chain 5-draw Monkey Match paytable. Each symbol is resolved from its own VRF word via randomWord % totalMonkeys + 1; the resulting modulo bias is negligible at displayed precision.';
const CALCULATION_MODEL_JUNGLE_PLINKO = 'Exact weighted sum over the live on-chain cumulative bucket weights and payout tables for modes 0-4. Balls do not change per-ball EV; the only balls-dependent adjustment is Solidity floor division betAmount = totalBetAmount / numBalls, which scales effective RTP by floor(totalBetAmount / numBalls) * numBalls / totalBetAmount when the buy-in is not evenly divisible.';
const CALCULATION_MODEL_BLACKJACK = 'Monte Carlo on the repo simulator: 5,000,000 single-deck main-hand games, no side bet, no fees, seeded RNG 0xA13ECAFE.';
const CALCULATION_MODEL_BLACKJACK_PLAYER_SIDE = 'Exact EV from the published with-replacement player-side outcome table.';
const CALCULATION_MODEL_BLACKJACK_DEALER_SIDE = 'Exact EV from the published with-replacement dealer-side win conditions, treated as a single 2x bet that wins on Match Dealer or Dealer Ten.';
const CALCULATION_MODEL_VIDEO_POKER = 'Exact weighted sum over the verified on-chain Jacks or Better paytable and the final-hand odds; progressive jackpot excluded unless configured. At max bet the jackpot uplift uses the live jackpotTotal pool.';
const CALCULATION_MODEL_COSMIC_PLINKO = 'Exact weighted sum over the live on-chain cumulative bucket weights and payout tables for modes 0-2. Balls do not change per-ball EV; the only balls-dependent adjustment is Solidity floor division betAmount = totalBetAmount / numBalls, which scales effective RTP by floor(totalBetAmount / numBalls) * numBalls / totalBetAmount when the buy-in is not evenly divisible.';
const CALCULATION_MODEL_BLOCKS = 'Exact weighted sum over the published largest-cluster probability table for each mode.';
const CALCULATION_MODEL_PRIMES = 'Exact weighted sum over the verified on-chain `gameModes` paytable and prime-number mapping for difficulties 0-3. Runs do not change per-run EV; the only runs-dependent adjustment is Solidity floor division betPerRun = totalBetAmount / numRuns, which scales effective RTP by floor(totalBetAmount / numRuns) * numRuns / totalBetAmount when the buy-in is not evenly divisible.';

function calculateExactWeightedRtpPercent({ cumulativeWeights = [], payouts = [] } = {}) {
  if (
    !Array.isArray(cumulativeWeights)
    || !Array.isArray(payouts)
    || cumulativeWeights.length === 0
    || cumulativeWeights.length !== payouts.length
  ) {
    return null;
  }

  let previousWeight = 0n;
  let weightedPayout = 0n;

  for (let index = 0; index < cumulativeWeights.length; index += 1) {
    const currentWeight = BigInt(cumulativeWeights[index]);
    const bucketMass = currentWeight - previousWeight;
    weightedPayout += bucketMass * BigInt(payouts[index]);
    previousWeight = currentWeight;
  }

  if (previousWeight <= 0n) {
    return null;
  }

  return Number(weightedPayout) / Number(previousWeight) / 100;
}

function calculateTableMaxPayoutMultiplier(payouts = []) {
  const numericPayouts = payouts
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (numericPayouts.length === 0) {
    return null;
  }

  return Math.max(...numericPayouts) / 10000;
}

function calculatePrimesExactRtpPercent({
  maxRange,
  primeCount,
  primeMultiplier,
  zeroMultiplier,
} = {}) {
  const normalizedMaxRange = BigInt(maxRange || 0);
  if (normalizedMaxRange <= 0n) {
    return null;
  }

  const weightedPayout = (BigInt(primeCount || 0) * BigInt(primeMultiplier || 0))
    + BigInt(zeroMultiplier || 0);
  return Number(weightedPayout) / Number(normalizedMaxRange) / 100;
}

function calculateMonkeyMatchExactRtpPercent({
  totalMonkeys,
  fiveOfKind,
  fourOfKind,
  fullHouse,
  threeOfKind,
  twoPair,
  onePair,
  payoutDenom = 1000,
} = {}) {
  const n = BigInt(totalMonkeys || 0);
  const denom = BigInt(payoutDenom || 0);
  if (n <= 0n || denom <= 0n) {
    return null;
  }

  const totalOutcomes = n * n * n * n * n;
  const nMinus1 = n - 1n;
  const nMinus2 = n - 2n;
  const nMinus3 = n - 3n;

  const weightedPayout = (
    (n * BigInt(fiveOfKind || 0))
    + (5n * n * nMinus1 * BigInt(fourOfKind || 0))
    + (10n * n * nMinus1 * BigInt(fullHouse || 0))
    + (10n * n * nMinus1 * nMinus2 * BigInt(threeOfKind || 0))
    + (15n * n * nMinus1 * nMinus2 * BigInt(twoPair || 0))
    + (10n * n * nMinus1 * nMinus2 * nMinus3 * BigInt(onePair || 0))
  );

  return (Number(weightedPayout) / Number(totalOutcomes) / Number(denom)) * 100;
}

const MONKEY_MATCH_MODE_TABLES = Object.freeze({
  1: Object.freeze({
    label: 'Low Risk',
    totalMonkeys: 6,
    payoutDenom: 1000,
    fiveOfKind: 50000,
    fourOfKind: 5000,
    fullHouse: 4000,
    threeOfKind: 2000,
    twoPair: 1250,
    onePair: 200,
  }),
  2: Object.freeze({
    label: 'Normal Risk',
    totalMonkeys: 7,
    payoutDenom: 1000,
    fiveOfKind: 50000,
    fourOfKind: 5000,
    fullHouse: 4000,
    threeOfKind: 3000,
    twoPair: 2000,
    onePair: 100,
  }),
});

const MONKEY_MATCH_EXACT_RTP_BY_MODE = Object.freeze(
  Object.fromEntries(Object.entries(MONKEY_MATCH_MODE_TABLES).map(([mode, table]) => [
    mode,
    calculateMonkeyMatchExactRtpPercent(table),
  ]))
);

const JUNGLE_PLINKO_MODE_TABLES = Object.freeze({
  0: Object.freeze({
    label: 'Safe',
    cumulativeWeights: Object.freeze([8, 28, 38, 48, 57, 67, 77, 97, 105]),
    payouts: Object.freeze([22000, 12000, 5000, 3500, 3000, 3500, 5000, 12000, 22000]),
  }),
  1: Object.freeze({
    label: 'Low',
    cumulativeWeights: Object.freeze([5, 25, 75, 109, 149, 225, 265, 300, 350, 370, 375]),
    payouts: Object.freeze([50000, 25000, 12500, 6000, 4000, 2500, 4000, 6000, 12500, 25000, 50000]),
  }),
  2: Object.freeze({
    label: 'Medium',
    cumulativeWeights: Object.freeze([1, 11, 41, 91, 171, 254, 336, 419, 499, 549, 579, 589, 590]),
    payouts: Object.freeze([150000, 62000, 25000, 12000, 6000, 3000, 1000, 3000, 6000, 12000, 25000, 62000, 150000]),
  }),
  3: Object.freeze({
    label: 'High',
    cumulativeWeights: Object.freeze([1, 5, 13, 29, 69, 179, 359, 659, 1009, 1359, 1719, 2069, 2419, 2719, 2899, 3009, 3049, 3065, 3073, 3077, 3078]),
    payouts: Object.freeze([1000000, 330000, 175000, 88000, 42000, 21000, 15000, 5000, 2500, 2000, 1000, 2000, 2500, 5000, 15000, 21000, 42000, 88000, 175000, 330000, 1000000]),
  }),
  4: Object.freeze({
    label: 'Extreme',
    cumulativeWeights: Object.freeze([1, 6, 16, 66, 216, 616, 1616, 3116, 5616, 9616, 14716, 20966, 29676, 35926, 41026, 45026, 47526, 49026, 50026, 50426, 50576, 50626, 50636, 50641, 50642]),
    payouts: Object.freeze([10000000, 2500000, 1000000, 350000, 150000, 90000, 40000, 20000, 14000, 4000, 2000, 1000, 500, 1000, 2000, 4000, 14000, 20000, 40000, 90000, 150000, 350000, 1000000, 2500000, 10000000]),
  }),
});

const JUNGLE_PLINKO_EXACT_RTP_BY_MODE = Object.freeze(
  Object.fromEntries(Object.entries(JUNGLE_PLINKO_MODE_TABLES).map(([mode, table]) => [
    mode,
    calculateExactWeightedRtpPercent(table),
  ]))
);

const JUNGLE_PLINKO_MAX_PAYOUT_BY_MODE = Object.freeze(
  Object.fromEntries(Object.entries(JUNGLE_PLINKO_MODE_TABLES).map(([mode, table]) => [
    mode,
    calculateTableMaxPayoutMultiplier(table.payouts),
  ]))
);

const COSMIC_PLINKO_MODE_TABLES = Object.freeze({
  0: Object.freeze({
    label: 'Low',
    cumulativeWeights: Object.freeze([1, 3, 6, 13, 28, 48, 78, 829, 859, 879, 894, 901, 904, 906, 907]),
    payouts: Object.freeze([500000, 200000, 110000, 70000, 30000, 20000, 12000, 4000, 12000, 20000, 30000, 70000, 110000, 200000, 500000]),
  }),
  1: Object.freeze({
    label: 'Modest',
    cumulativeWeights: Object.freeze([1, 3, 7, 16, 36, 86, 171, 1571, 1656, 1706, 1726, 1735, 1739, 1741, 1742]),
    payouts: Object.freeze([1000000, 500000, 250000, 110000, 50000, 20000, 5000, 3000, 5000, 20000, 50000, 110000, 250000, 500000, 1000000]),
  }),
  2: Object.freeze({
    label: 'High',
    cumulativeWeights: Object.freeze([1, 3, 8, 23, 58, 118, 238, 418, 1218, 4598, 5398, 5578, 5698, 5758, 5793, 5808, 5813, 5815, 5816]),
    payouts: Object.freeze([2500000, 1000000, 500000, 250000, 100000, 50000, 30000, 15000, 4000, 1000, 4000, 15000, 30000, 50000, 100000, 250000, 500000, 1000000, 2500000]),
  }),
});

const COSMIC_PLINKO_EXACT_RTP_BY_MODE = Object.freeze(
  Object.fromEntries(Object.entries(COSMIC_PLINKO_MODE_TABLES).map(([mode, table]) => [
    mode,
    calculateExactWeightedRtpPercent(table),
  ]))
);

const COSMIC_PLINKO_MAX_PAYOUT_BY_MODE = Object.freeze(
  Object.fromEntries(Object.entries(COSMIC_PLINKO_MODE_TABLES).map(([mode, table]) => [
    mode,
    calculateTableMaxPayoutMultiplier(table.payouts),
  ]))
);

const PRIMES_MODE_TABLES = Object.freeze({
  0: Object.freeze({
    slug: 'easy',
    label: 'Easy',
    maxRange: 10,
    primeCount: 4,
    primeMultiplier: 19000,
    zeroMultiplier: 22000,
  }),
  1: Object.freeze({
    slug: 'medium',
    label: 'Medium',
    maxRange: 100,
    primeCount: 25,
    primeMultiplier: 35000,
    zeroMultiplier: 105000,
  }),
  2: Object.freeze({
    slug: 'hard',
    label: 'Hard',
    maxRange: 1000,
    primeCount: 168,
    primeMultiplier: 55000,
    zeroMultiplier: 560000,
  }),
  3: Object.freeze({
    slug: 'extreme',
    label: 'Extreme',
    maxRange: 10000,
    primeCount: 1229,
    primeMultiplier: 75700,
    zeroMultiplier: 5000000,
  }),
});

const PRIMES_EXACT_RTP_BY_MODE = Object.freeze(
  Object.fromEntries(Object.entries(PRIMES_MODE_TABLES).map(([mode, table]) => [
    mode,
    calculatePrimesExactRtpPercent(table),
  ]))
);

const PRIMES_MAX_PAYOUT_BY_MODE = Object.freeze(
  Object.fromEntries(Object.entries(PRIMES_MODE_TABLES).map(([mode, table]) => [
    mode,
    Number(table.zeroMultiplier) / 10000,
  ]))
);

function createCalculatedVariant({
  game,
  variantKey,
  variantLabel,
  value,
  calculationKind = 'exact',
  calculationModel,
  maxPayout = null,
}) {
  return Object.freeze({
    game,
    variantKey,
    variantLabel,
    calculated: fixedCalculated(value, {
      calculationKind,
      calculationModel,
    }),
    maxPayout,
  });
}

const ROULETTE_VARIANT_CALCULATED_RTP = (36.9 / 38) * 100;
const ROULETTE_CALCULATED_VARIANTS = Object.freeze([
  createCalculatedVariant({
    game: 'roulette',
    variantKey: 'roulette:bet-type:single-number',
    variantLabel: 'Single Number',
    value: ROULETTE_VARIANT_CALCULATED_RTP,
    calculationModel: CALCULATION_MODEL_ROULETTE,
    maxPayout: fixedMaxPayout(36.9),
  }),
  createCalculatedVariant({
    game: 'roulette',
    variantKey: 'roulette:bet-type:split',
    variantLabel: 'Split',
    value: ROULETTE_VARIANT_CALCULATED_RTP,
    calculationModel: CALCULATION_MODEL_ROULETTE,
    maxPayout: fixedMaxPayout(18.45),
  }),
  createCalculatedVariant({
    game: 'roulette',
    variantKey: 'roulette:bet-type:corner',
    variantLabel: 'Corner',
    value: ROULETTE_VARIANT_CALCULATED_RTP,
    calculationModel: CALCULATION_MODEL_ROULETTE,
    maxPayout: fixedMaxPayout(9.225),
  }),
  createCalculatedVariant({
    game: 'roulette',
    variantKey: 'roulette:bet-type:red-black',
    variantLabel: 'Red / Black',
    value: ROULETTE_VARIANT_CALCULATED_RTP,
    calculationModel: CALCULATION_MODEL_ROULETTE,
    maxPayout: fixedMaxPayout(2.05),
  }),
  createCalculatedVariant({
    game: 'roulette',
    variantKey: 'roulette:bet-type:even-odd',
    variantLabel: 'Even / Odd',
    value: ROULETTE_VARIANT_CALCULATED_RTP,
    calculationModel: CALCULATION_MODEL_ROULETTE,
    maxPayout: fixedMaxPayout(2.05),
  }),
  createCalculatedVariant({
    game: 'roulette',
    variantKey: 'roulette:bet-type:dozen',
    variantLabel: 'Dozen',
    value: ROULETTE_VARIANT_CALCULATED_RTP,
    calculationModel: CALCULATION_MODEL_ROULETTE,
    maxPayout: fixedMaxPayout(3.075),
  }),
  createCalculatedVariant({
    game: 'roulette',
    variantKey: 'roulette:bet-type:half',
    variantLabel: 'Half',
    value: ROULETTE_VARIANT_CALCULATED_RTP,
    calculationModel: CALCULATION_MODEL_ROULETTE,
    maxPayout: fixedMaxPayout(2.05),
  }),
]);

const KENO_CALCULATED_VARIANTS = Object.freeze(
  Object.entries(KENO_EXPECTED_RTP_BY_PICKS).map(([picks, value]) => createCalculatedVariant({
    game: 'keno',
    variantKey: `keno:picks:${picks}`,
    variantLabel: `Picks ${picks}`,
    value,
    calculationModel: CALCULATION_MODEL_KENO,
    maxPayout: fixedMaxPayout(KENO_MAX_PAYOUT_BY_PICKS[picks]),
  }))
);

const SPEED_KENO_CALCULATED_VARIANTS = Object.freeze(
  Object.entries(SPEED_KENO_EXPECTED_RTP_BY_PICKS).map(([picks, value]) => createCalculatedVariant({
    game: 'speed-keno',
    variantKey: `speed-keno:picks:${picks}`,
    variantLabel: `Picks ${picks}`,
    value,
    calculationModel: CALCULATION_MODEL_SPEED_KENO,
    maxPayout: fixedMaxPayout(SPEED_KENO_MAX_PAYOUT_BY_PICKS[picks]),
  }))
);

const MONKEY_MATCH_CALCULATED_VARIANTS = Object.freeze([
  createCalculatedVariant({
    game: 'monkey-match',
    variantKey: 'monkey-match:mode:1',
    variantLabel: MONKEY_MATCH_MODE_TABLES[1].label,
    value: MONKEY_MATCH_EXACT_RTP_BY_MODE[1],
    calculationModel: CALCULATION_MODEL_MONKEY_MATCH,
    maxPayout: fixedMaxPayout(MONKEY_MATCH_MAX_PAYOUT_BY_MODE[1]),
  }),
  createCalculatedVariant({
    game: 'monkey-match',
    variantKey: 'monkey-match:mode:2',
    variantLabel: MONKEY_MATCH_MODE_TABLES[2].label,
    value: MONKEY_MATCH_EXACT_RTP_BY_MODE[2],
    calculationModel: CALCULATION_MODEL_MONKEY_MATCH,
    maxPayout: fixedMaxPayout(MONKEY_MATCH_MAX_PAYOUT_BY_MODE[2]),
  }),
]);

const JUNGLE_PLINKO_CALCULATED_VARIANTS = Object.freeze(
  Object.entries(JUNGLE_PLINKO_MODE_TABLES).map(([mode, table]) => createCalculatedVariant({
    game: 'jungle-plinko',
    variantKey: `jungle-plinko:mode:${mode}`,
    variantLabel: table.label,
    value: JUNGLE_PLINKO_EXACT_RTP_BY_MODE[mode],
    calculationModel: CALCULATION_MODEL_JUNGLE_PLINKO,
    maxPayout: fixedMaxPayout(JUNGLE_PLINKO_MAX_PAYOUT_BY_MODE[mode]),
  }))
);

const VIDEO_POKER_CALCULATED_VARIANTS = Object.freeze([
  createCalculatedVariant({
    game: 'video-poker',
    variantKey: 'video-poker:bet:base',
    variantLabel: 'Bet 1/5/10/25/50 APE',
    value: VIDEO_POKER_BASE_CALCULATED_RTP,
    calculationModel: CALCULATION_MODEL_VIDEO_POKER,
    maxPayout: fixedMaxPayout(250),
  }),
  createCalculatedVariant({
    game: 'video-poker',
    variantKey: 'video-poker:bet:100',
    variantLabel: 'Bet 100 APE',
    value: VIDEO_POKER_BASE_CALCULATED_RTP,
    calculationModel: CALCULATION_MODEL_VIDEO_POKER,
    maxPayout: fixedJackpotMaxPayout(250),
  }),
]);

const BLACKJACK_CALCULATED_VARIANTS = Object.freeze([
  createCalculatedVariant({
    game: 'blackjack',
    variantKey: 'blackjack:main-only',
    variantLabel: 'Main Only',
    value: BLACKJACK_MAIN_CALCULATED_RTP,
    calculationKind: 'statistical',
    calculationModel: CALCULATION_MODEL_BLACKJACK,
    maxPayout: fixedMaxPayout(2.5),
  }),
  createCalculatedVariant({
    game: 'blackjack',
    variantKey: 'blackjack:player-side-only',
    variantLabel: 'Side Only',
    value: BLACKJACK_PLAYER_SIDE_EXACT_RTP,
    calculationKind: 'exact',
    calculationModel: CALCULATION_MODEL_BLACKJACK_PLAYER_SIDE,
    maxPayout: fixedMaxPayout(500),
  }),
  createCalculatedVariant({
    game: 'blackjack',
    variantKey: 'blackjack:dealer-side-only',
    variantLabel: 'Dealer Side Only',
    value: BLACKJACK_DEALER_SIDE_EXACT_RTP,
    calculationKind: 'exact',
    calculationModel: CALCULATION_MODEL_BLACKJACK_DEALER_SIDE,
    maxPayout: fixedMaxPayout(2),
  }),
]);

const COSMIC_PLINKO_CALCULATED_VARIANTS = Object.freeze(
  Object.entries(COSMIC_PLINKO_MODE_TABLES).map(([mode, table]) => createCalculatedVariant({
    game: 'cosmic-plinko',
    variantKey: `cosmic-plinko:mode:${mode}`,
    variantLabel: table.label,
    value: COSMIC_PLINKO_EXACT_RTP_BY_MODE[mode],
    calculationModel: CALCULATION_MODEL_COSMIC_PLINKO,
    maxPayout: fixedMaxPayout(COSMIC_PLINKO_MAX_PAYOUT_BY_MODE[mode]),
  }))
);

const BLOCKS_CALCULATED_VARIANTS = Object.freeze([
  createCalculatedVariant({
    game: 'blocks',
    variantKey: 'blocks:mode:easy',
    variantLabel: 'Easy',
    value: 98.405621,
    calculationModel: CALCULATION_MODEL_BLOCKS,
    maxPayout: fixedMaxPayout(2500),
  }),
  createCalculatedVariant({
    game: 'blocks',
    variantKey: 'blocks:mode:hard',
    variantLabel: 'Hard',
    value: 98.547435,
    calculationModel: CALCULATION_MODEL_BLOCKS,
    maxPayout: fixedMaxPayout(5000),
  }),
]);

const PRIMES_CALCULATED_VARIANTS = Object.freeze(
  Object.entries(PRIMES_MODE_TABLES).map(([mode, table]) => createCalculatedVariant({
    game: 'primes',
    variantKey: `primes:mode:${table.slug}`,
    variantLabel: table.label,
    value: PRIMES_EXACT_RTP_BY_MODE[mode],
    calculationModel: CALCULATION_MODEL_PRIMES,
    maxPayout: fixedJackpotMaxPayout(PRIMES_MAX_PAYOUT_BY_MODE[mode]),
  }))
);

const GAME_RTP_VARIANT_ENTRIES = Object.freeze([
  ...ROULETTE_CALCULATED_VARIANTS,
  ...KENO_CALCULATED_VARIANTS,
  ...SPEED_KENO_CALCULATED_VARIANTS,
  ...MONKEY_MATCH_CALCULATED_VARIANTS,
  ...JUNGLE_PLINKO_CALCULATED_VARIANTS,
  ...BLACKJACK_CALCULATED_VARIANTS,
  ...VIDEO_POKER_CALCULATED_VARIANTS,
  ...COSMIC_PLINKO_CALCULATED_VARIANTS,
  ...BLOCKS_CALCULATED_VARIANTS,
  ...PRIMES_CALCULATED_VARIANTS,
]);

const GAME_RTP_ENTRIES = [
  {
    key: 'ape-strong',
    expected: fixedExpected(97.5),
    calculated: fixedCalculated(97.5, {
      calculationKind: 'exact',
      calculationModel: CALCULATION_MODEL_APESTRONG,
    }),
    maxPayout: fixedMaxPayout(19.5),
    reported: 98.53,
    aliases: ['apestrong', 'ape strong', 'ApeStrong'],
  },
  {
    key: 'roulette',
    expected: fixedExpected(97.1, '97.10%'),
    calculated: fixedCalculated(ROULETTE_VARIANT_CALCULATED_RTP, {
      calculationKind: 'exact',
      calculationModel: CALCULATION_MODEL_ROULETTE,
    }),
    reported: 97.05,
    aliases: ['Roulette'],
  },
  {
    key: 'baccarat',
    expected: null,
    maxPayout: fixedMaxPayout(9),
    reported: 98.12,
    aliases: ['Baccarat'],
  },
  {
    key: 'jungle-plinko',
    expected: null,
    calculated: fixedCalculated(Math.min(...Object.values(JUNGLE_PLINKO_EXACT_RTP_BY_MODE)), {
      calculationKind: 'exact',
      calculationModel: CALCULATION_MODEL_JUNGLE_PLINKO,
    }),
    reported: 98.42,
    aliases: ['jungle', 'jungle plinko', 'Jungle Plinko'],
  },
  {
    key: 'keno',
    expected: null,
    calculated: fixedCalculated(Math.min(...Object.values(KENO_EXPECTED_RTP_BY_PICKS)), {
      calculationKind: 'exact',
      calculationModel: CALCULATION_MODEL_KENO,
    }),
    reported: 86.35,
    aliases: ['Keno'],
  },
  {
    key: 'speed-keno',
    expected: null,
    calculated: fixedCalculated(Math.min(...Object.values(SPEED_KENO_EXPECTED_RTP_BY_PICKS)), {
      calculationKind: 'exact',
      calculationModel: CALCULATION_MODEL_SPEED_KENO,
    }),
    reported: 93.36,
    aliases: ['speed keno', 'Speed Keno'],
  },
  {
    key: 'dino-dough',
    expected: fixedExpected(97.8, '97.80%'),
    maxPayout: fixedMaxPayout(333),
    reported: 97.8,
    aliases: ['dino dough', 'Dino Dough'],
  },
  {
    key: 'bubblegum-heist',
    expected: fixedExpected(97.8, '97.80%'),
    maxPayout: fixedMaxPayout(100),
    reported: 97.26,
    aliases: ['bubblegum heist', 'Bubblegum Heist'],
  },
  {
    key: 'monkey-match',
    expected: null,
    calculated: fixedCalculated(Math.min(...Object.values(MONKEY_MATCH_EXACT_RTP_BY_MODE)), {
      calculationKind: 'exact',
      calculationModel: CALCULATION_MODEL_MONKEY_MATCH,
    }),
    reported: 97.34,
    aliases: ['monkey match', 'Monkey Match'],
  },
  {
    key: 'bear-dice',
    expected: null,
    reported: 97.56,
    aliases: ['bear a dice', 'bear-a-dice', 'Bear-A-Dice'],
  },
  {
    key: 'blackjack',
    expected: null,
    calculated: fixedCalculated(BLACKJACK_MAIN_CALCULATED_RTP, {
      calculationKind: 'statistical',
      calculationModel: CALCULATION_MODEL_BLACKJACK,
    }),
    maxPayout: fixedMaxPayout(500),
    reported: 96.84,
    aliases: ['Blackjack', 'blackjack+'],
  },
  {
    key: 'video-poker',
    expected: null,
    calculated: fixedCalculated(VIDEO_POKER_BASE_CALCULATED_RTP, {
      calculationKind: 'exact',
      calculationModel: CALCULATION_MODEL_VIDEO_POKER,
    }),
    maxPayout: fixedJackpotMaxPayout(250),
    reported: 89.53,
    aliases: ['video poker', 'Video Poker', 'gimboz poker', 'Gimboz Poker', 'gimboz-poker'],
  },
  {
    key: 'cash-dash',
    expected: null,
    reported: 96.04,
    aliases: ['cash dash', 'Cash Dash'],
  },
  {
    key: 'gimboz-smash',
    expected: null,
    reported: 99.42,
    aliases: ['gimboz smash', 'Gimboz Smash'],
  },
  {
    key: 'hi-lo-nebula',
    expected: fixedExpected(97.5),
    maxPayout: fixedJackpotMaxPayout(12.5),
    reported: 97.84,
    aliases: ['hi-lo nebula', 'Hi-Lo Nebula', 'hilo nebula'],
  },
  {
    key: 'cosmic-plinko',
    expected: null,
    calculated: fixedCalculated(Math.min(...Object.values(COSMIC_PLINKO_EXACT_RTP_BY_MODE)), {
      calculationKind: 'exact',
      calculationModel: CALCULATION_MODEL_COSMIC_PLINKO,
    }),
    reported: 97.32,
    aliases: ['cosmic', 'cosmic plinko', 'Cosmic Plinko'],
  },
  {
    key: 'cult-quest',
    expected: null,
    reported: 96.67,
    aliases: ['cult quest', 'Cult Quest'],
  },
  {
    key: 'blocks',
    expected: null,
    calculated: fixedCalculated(98.405621, {
      calculationKind: 'exact',
      calculationModel: CALCULATION_MODEL_BLOCKS,
    }),
    reported: 93.92,
    aliases: ['Blocks'],
  },
  {
    key: 'glyde-or-crash',
    expected: null,
    reported: 105.59,
    aliases: ['glyde or crash', 'Glyde or Crash', 'glyder or crash', 'Glyder or Crash'],
  },
  {
    key: 'primes',
    expected: null,
    calculated: fixedCalculated(Math.min(...Object.values(PRIMES_EXACT_RTP_BY_MODE)), {
      calculationKind: 'exact',
      calculationModel: CALCULATION_MODEL_PRIMES,
    }),
    reported: 105.64,
    aliases: ['Primes'],
  },
  {
    key: 'reel-pirates',
    expected: null,
    reported: 99.81,
    aliases: ['reel pirates', 'Reel Pirates'],
  },
  {
    key: 'sushi-showdown',
    expected: fixedExpected(97.8, '97.80%'),
    maxPayout: fixedMaxPayout(500),
    reported: 95.99,
    aliases: ['sushi showdown', 'Sushi Showdown'],
  },
  {
    key: 'geez-diggerz',
    expected: fixedExpected(97.8, '97.80%'),
    maxPayout: fixedMaxPayout(50),
    reported: 97.25,
    aliases: ['geez diggerz', 'Geez Diggerz'],
  },
  {
    key: 'rico-revenge',
    expected: null,
    reported: 90.94,
    aliases: ["rico's revenge", 'Rico\'s Revenge', 'ricos revenge'],
  },
];

export const GAME_RTP_CONSTANTS = Object.freeze(
  Object.fromEntries(GAME_RTP_ENTRIES.map((entry) => [entry.key, Object.freeze({
    expected: entry.expected,
    calculated: entry.calculated ?? null,
    maxPayout: entry.maxPayout ?? null,
    reported: entry.reported,
    aliases: Object.freeze([entry.key, ...(entry.aliases || [])]),
  })]))
);

export const GAME_RTP_VARIANT_CONSTANTS = Object.freeze(
  Object.fromEntries(GAME_RTP_VARIANT_ENTRIES.map((entry) => [
    entry.variantKey,
    Object.freeze({
      game: entry.game,
      variantKey: entry.variantKey,
      variantLabel: entry.variantLabel,
      calculated: entry.calculated,
      maxPayout: entry.maxPayout ?? null,
    }),
  ]))
);

const variantEntriesByGame = new Map();
for (const entry of GAME_RTP_VARIANT_ENTRIES) {
  if (!variantEntriesByGame.has(entry.game)) {
    variantEntriesByGame.set(entry.game, []);
  }
  variantEntriesByGame.get(entry.game).push(Object.freeze({
    variantKey: entry.variantKey,
    variantLabel: entry.variantLabel,
    calculated: entry.calculated,
    maxPayout: entry.maxPayout ?? null,
  }));
}

export const GAME_RTP_VARIANTS_BY_GAME = Object.freeze(
  Object.fromEntries([...variantEntriesByGame.entries()].map(([game, entries]) => [
    game,
    Object.freeze(entries),
  ]))
);

export const GAME_RTP_STATUS_CATALOG = Object.freeze(
  GAME_RTP_ENTRIES.flatMap((entry) => {
    const gameName = toDisplayGameName(entry.key, entry.aliases || []);
    const variants = GAME_RTP_VARIANTS_BY_GAME[entry.key] || [];

    if (variants.length === 0) {
      return [Object.freeze({
        gameName,
        gameKey: entry.key,
        variantKey: entry.key,
        variantLabel: null,
        rtpGame: entry.key,
        rtpConfig: null,
      })];
    }

    if (entry.key === 'blackjack') {
      return [
        ...variants.map((variant) => Object.freeze({
          gameName,
          gameKey: entry.key,
          variantKey: variant.variantKey,
          variantLabel: variant.variantLabel,
          rtpGame: entry.key,
          rtpConfig: null,
        })),
        Object.freeze({
          gameName,
          gameKey: entry.key,
          variantKey: 'blackjack:mixed',
          variantLabel: 'Mixed',
          rtpGame: entry.key,
          rtpConfig: null,
        }),
      ];
    }

    return variants.map((variant) => Object.freeze({
      gameName,
      gameKey: entry.key,
      variantKey: variant.variantKey,
      variantLabel: variant.variantLabel,
      rtpGame: entry.key,
      rtpConfig: null,
    }));
  })
);

const GAME_RTP_ALIAS_TO_KEY = new Map();

for (const entry of GAME_RTP_ENTRIES) {
  for (const alias of [entry.key, ...(entry.aliases || [])]) {
    GAME_RTP_ALIAS_TO_KEY.set(String(alias).trim().toLowerCase(), entry.key);
  }
}

function toConfiguredPercentDisplay(value, digits = 2) {
  return `${Number(value).toFixed(digits)}%`;
}

function hasNumericRtpValue(value) {
  if (value === null || value === undefined || value === '') {
    return false;
  }

  return Number.isFinite(Number(value));
}

function toFallbackGameKey(game) {
  return String(game || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function normalizeVariantKeyPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toFiniteInteger(value) {
  const numeric = toFiniteNumber(value);
  return numeric === null ? null : Math.trunc(numeric);
}

function getPlinkoModeTables(gameKey) {
  switch (gameKey) {
    case 'jungle-plinko':
      return JUNGLE_PLINKO_MODE_TABLES;
    case 'cosmic-plinko':
      return COSMIC_PLINKO_MODE_TABLES;
    default:
      return null;
  }
}

function inferPlinkoMode(gameKey, { config = null, variantKey = null, variantLabel = null } = {}) {
  const configuredMode = toFiniteInteger(config?.mode);
  if (configuredMode !== null) {
    return configuredMode;
  }

  const keyMatch = String(variantKey || '').match(/(?:^|:)mode:(\d+)(?:$|:)/i);
  if (keyMatch) {
    return Number.parseInt(keyMatch[1], 10);
  }

  const labelMatch = String(variantLabel || '').match(/\bmode\s+(\d+)\b/i);
  if (labelMatch) {
    return Number.parseInt(labelMatch[1], 10);
  }

  const normalizedLabel = normalizeVariantKeyPart(variantLabel);
  if (!normalizedLabel) {
    return null;
  }

  const modeTables = getPlinkoModeTables(gameKey);
  if (!modeTables) {
    return null;
  }

  for (const [mode, table] of Object.entries(modeTables)) {
    if (normalizeVariantKeyPart(table.label) === normalizedLabel) {
      return Number.parseInt(mode, 10);
    }
  }

  return null;
}

function inferPrimesDifficulty({ config = null, variantKey = null, variantLabel = null } = {}) {
  const configuredDifficulty = toFiniteInteger(config?.difficulty ?? config?.mode);
  if (configuredDifficulty !== null) {
    return configuredDifficulty;
  }

  const keyMatch = String(variantKey || '').match(/(?:^|:)mode:(easy|medium|hard|extreme)(?:$|:)/i);
  if (keyMatch) {
    const normalized = keyMatch[1].toLowerCase();
    for (const [difficulty, table] of Object.entries(PRIMES_MODE_TABLES)) {
      if (table.slug === normalized) {
        return Number.parseInt(difficulty, 10);
      }
    }
  }

  const labelMatch = String(variantLabel || '').trim().toLowerCase();
  if (!labelMatch) {
    return null;
  }

  for (const [difficulty, table] of Object.entries(PRIMES_MODE_TABLES)) {
    if (labelMatch === table.label.toLowerCase() || labelMatch.includes(table.label.toLowerCase())) {
      return Number.parseInt(difficulty, 10);
    }
  }

  return null;
}

function getConfiguredExactVariantFallbackKey(game, config = {}) {
  const key = resolveGameRtpKey(game);
  if (!key) {
    return null;
  }

  switch (key) {
    case 'jungle-plinko':
    case 'cosmic-plinko': {
      const mode = toFiniteInteger(config?.mode);
      return mode !== null ? `${key}:mode:${mode}` : null;
    }
    case 'primes': {
      const difficulty = inferPrimesDifficulty({ config });
      if (difficulty === null) {
        return null;
      }
      const table = PRIMES_MODE_TABLES[difficulty];
      return table ? `primes:mode:${table.slug}` : null;
    }
    default:
      return null;
  }
}

function formatVariantBetAmount(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null || numeric <= 0) {
    return null;
  }

  if (Number.isInteger(numeric)) {
    return numeric.toString();
  }

  return numeric.toFixed(2).replace(/\.00$/, '');
}

function joinVariantComponents(parts = []) {
  return parts.filter(Boolean).join(' / ');
}

export function resolveGameRtpKey(game) {
  if (!game) return null;

  const raw = stripAbiVerifiedSymbol(String(game)).trim().toLowerCase();
  if (!raw) return null;

  return GAME_RTP_ALIAS_TO_KEY.get(raw)
    || GAME_RTP_ALIAS_TO_KEY.get(raw.replace(/\s+/g, '-'))
    || GAME_RTP_ALIAS_TO_KEY.get(raw.replace(/-/g, ' '))
    || null;
}

export function getGameRtpConstants(game) {
  const key = resolveGameRtpKey(game);
  return key ? GAME_RTP_CONSTANTS[key] || null : null;
}

export function getGameExpectedRtpReference(game) {
  const constants = getGameRtpConstants(game);
  return constants?.calculated || constants?.expected || null;
}

export function getGameTheoreticalRtpReference(game) {
  return getGameRtpConstants(game)?.expected || null;
}

export function getGameCalculatedRtpReference(game) {
  return getGameRtpConstants(game)?.calculated || null;
}

export function getGameMaxPayoutReference(game) {
  const key = resolveGameRtpKey(game);
  if (!key) return null;

  const direct = getGameRtpConstants(key)?.maxPayout || null;
  if (direct) {
    return direct;
  }

  const variants = GAME_RTP_VARIANTS_BY_GAME[key] || [];
  const knownVariants = variants
    .map((variant) => variant.maxPayout)
    .filter((reference) => reference && Number.isFinite(reference.value));

  if (knownVariants.length === 0) {
    return null;
  }

  return knownVariants.reduce((best, current) => (
    !best || current.value > best.value ? current : best
  ), null);
}

export function getGameCalculatedVariantReference(variantKey) {
  return GAME_RTP_VARIANT_CONSTANTS[String(variantKey || '').trim()] || null;
}

export function getGameCalculatedVariantReferences(game) {
  const key = resolveGameRtpKey(game);
  return key ? GAME_RTP_VARIANTS_BY_GAME[key] || [] : [];
}

export function getGameMaxPayoutVariantReference(variantKey) {
  return getGameCalculatedVariantReference(variantKey)?.maxPayout || null;
}

export function listGameStatusCatalogEntries() {
  return GAME_RTP_STATUS_CATALOG;
}

export function getConfiguredCalculatedVariantReference({ game, config = {} } = {}) {
  const resolvedVariant = resolveConfiguredGameVariant({ game, config });
  const directVariantReference = resolvedVariant?.variantKey
    ? getGameCalculatedVariantReference(resolvedVariant.variantKey)?.calculated || null
    : null;

  if (directVariantReference) {
    return directVariantReference;
  }

  const fallbackVariantKey = getConfiguredExactVariantFallbackKey(game, config);
  return fallbackVariantKey
    ? getGameCalculatedVariantReference(fallbackVariantKey)?.calculated || null
    : null;
}

export function getConfiguredGameMaxPayoutReference({ game, config = {} } = {}) {
  const key = resolveGameRtpKey(game);
  if (!key) return null;

  const resolvedVariant = resolveConfiguredGameVariant({ game: key, config });
  const fallbackVariantKey = getConfiguredExactVariantFallbackKey(key, config);
  const exactVariant = (
    resolvedVariant?.variantKey
      ? getGameMaxPayoutVariantReference(resolvedVariant.variantKey)
      : null
  ) || (
    fallbackVariantKey
      ? getGameMaxPayoutVariantReference(fallbackVariantKey)
      : null
  );

  switch (key) {
    case 'ape-strong': {
      const range = Math.max(toFiniteInteger(config?.range) || 0, 0);
      return range > 0 ? fixedMaxPayout(97.5 / range) : getGameMaxPayoutReference(key);
    }
    case 'roulette': {
      const bets = String(config?.bet || '')
        .split(',')
        .map((bet) => bet.trim().toUpperCase())
        .filter(Boolean);

      if (bets.length === 0) {
        return getGameMaxPayoutReference(key);
      }

      const redNumbers = new Set(['1', '3', '5', '7', '9', '12', '14', '16', '18', '19', '21', '23', '25', '27', '30', '32', '34', '36']);
      const blackNumbers = new Set(['2', '4', '6', '8', '10', '11', '13', '15', '17', '20', '22', '24', '26', '28', '29', '31', '33', '35']);
      const outcomes = ['0', '00', ...Array.from({ length: 36 }, (_, index) => String(index + 1))];
      const createSequenceSet = (start, end, step = 1) => new Set(
        Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, index) => String(start + (index * step)))
      );
      const firstThird = createSequenceSet(1, 12);
      const secondThird = createSequenceSet(13, 24);
      const thirdThird = createSequenceSet(25, 36);
      const firstHalf = createSequenceSet(1, 18);
      const secondHalf = createSequenceSet(19, 36);
      const firstCol = createSequenceSet(1, 34, 3);
      const secondCol = createSequenceSet(2, 35, 3);
      const thirdCol = createSequenceSet(3, 36, 3);

      const resolveRouletteBet = (bet) => {
        if (/^(0|00|[1-9]|[12][0-9]|3[0-6])$/.test(bet)) {
          return { payout: 36.9, pockets: new Set([bet]) };
        }

        switch (bet) {
          case 'RED': return { payout: 2.05, pockets: redNumbers };
          case 'BLACK': return { payout: 2.05, pockets: blackNumbers };
          case 'ODD': return { payout: 2.05, pockets: new Set(Array.from({ length: 18 }, (_, index) => String((index * 2) + 1))) };
          case 'EVEN': return { payout: 2.05, pockets: new Set(Array.from({ length: 18 }, (_, index) => String((index + 1) * 2))) };
          case 'FIRST_HALF': return { payout: 2.05, pockets: firstHalf };
          case 'SECOND_HALF': return { payout: 2.05, pockets: secondHalf };
          case 'FIRST_THIRD': return { payout: 3.075, pockets: firstThird };
          case 'SECOND_THIRD': return { payout: 3.075, pockets: secondThird };
          case 'THIRD_THIRD': return { payout: 3.075, pockets: thirdThird };
          case 'FIRST_COL': return { payout: 3.075, pockets: firstCol };
          case 'SECOND_COL': return { payout: 3.075, pockets: secondCol };
          case 'THIRD_COL': return { payout: 3.075, pockets: thirdCol };
          default: return null;
        }
      };

      const resolvedBets = bets.map(resolveRouletteBet).filter(Boolean);
      if (resolvedBets.length !== bets.length) {
        return exactVariant || getGameMaxPayoutReference(key);
      }

      const maxPayout = outcomes.reduce((best, outcome) => {
        const payout = resolvedBets.reduce((sum, bet) => (
          bet.pockets.has(outcome) ? sum + bet.payout : sum
        ), 0) / resolvedBets.length;
        return Math.max(best, payout);
      }, 0);

      return fixedMaxPayout(maxPayout);
    }
    case 'baccarat': {
      const playerBankerBet = Math.max(Number(config?.playerBankerBet) || 0, 0);
      const tieBet = Math.max(Number(config?.tieBet) || 0, 0);
      const totalBet = playerBankerBet + tieBet;
      const playerBankerPayout = String(config?.betType || '').includes('BANKER') ? 1.95 : 2;

      if (totalBet > 0) {
        return fixedMaxPayout(Math.max(
          playerBankerBet > 0 ? (playerBankerBet * playerBankerPayout) / totalBet : 0,
          tieBet > 0 ? ((tieBet * 9) + playerBankerBet) / totalBet : 0,
        ));
      }

      const betType = String(config?.betType || config?.bet || '').trim().toUpperCase();
      if (betType === 'PLAYER') return fixedMaxPayout(2);
      if (betType === 'BANKER') return fixedMaxPayout(1.95);
      if (betType === 'TIE' || betType.includes('TIE')) return fixedMaxPayout(9);
      return getGameMaxPayoutReference(key);
    }
    case 'blackjack': {
      const mainBetApe = Math.max(Number(config?.mainBetApe) || 0, 0);
      const playerSideApe = Math.max(Number(config?.playerSideApe ?? config?.sideApe) || 0, 0);
      const dealerSideApe = Math.max(Number(config?.dealerSideApe ?? config?.bankSideApe) || 0, 0);
      const activeLegs = [mainBetApe, playerSideApe, dealerSideApe].filter((value) => value > 0).length;
      return activeLegs > 1 ? null : (exactVariant || getGameMaxPayoutReference(key));
    }
    case 'video-poker': {
      const betAmountApe = Math.max(Number(config?.betAmountApe || config?.bet) || 0, 0);
      const jackpotApe = Math.max(Number(config?.jackpotApe) || 0, 0);
      if (betAmountApe >= 100) {
        return fixedJackpotMaxPayout(
          betAmountApe > 0 && jackpotApe > 0 ? 250 + (jackpotApe / betAmountApe) : 250
        );
      }
      return exactVariant || getGameMaxPayoutReference(key);
    }
    default:
      return exactVariant || getGameMaxPayoutReference(key);
  }
}

export function getGameReportedRtp(game) {
  const value = getGameRtpConstants(game)?.reported;
  return Number.isFinite(value) ? value : null;
}

export function resolveConfiguredGameVariant({ game, config = null, variantKey: rawVariantKey = null, variantLabel: rawVariantLabel = null } = {}) {
  const resolvedGameKey = resolveGameRtpKey(game) || toFallbackGameKey(game) || null;
  const rawConfig = config && typeof config === 'object' ? { ...config } : null;

  if (!resolvedGameKey) {
    return {
      gameKey: null,
      variantKey: null,
      variantLabel: null,
      rtpGame: null,
      rtpConfig: rawConfig,
    };
  }

  let variantKey = resolvedGameKey;
  let variantLabel = null;
  let rtpConfig = rawConfig;

  switch (resolvedGameKey) {
    case 'ape-strong': {
      const range = toFiniteInteger(rawConfig?.range);
      if (range !== null) {
        variantKey = `${resolvedGameKey}:range:${range}`;
        variantLabel = `Range ${range}`;
        rtpConfig = { ...rawConfig, range };
      }
      break;
    }
    case 'roulette': {
      const bet = String(rawConfig?.bet || '').trim().toUpperCase();
      if (bet) {
        variantKey = `${resolvedGameKey}:bet:${normalizeVariantKeyPart(bet)}`;
        variantLabel = bet;
      }
      break;
    }
    case 'baccarat': {
      const betType = String(rawConfig?.betType || rawConfig?.bet || '').trim().toUpperCase();
      if (betType) {
        variantKey = `${resolvedGameKey}:bet:${normalizeVariantKeyPart(betType)}`;
        variantLabel = betType;
      }
      break;
    }
    case 'keno':
    case 'speed-keno': {
      const picks = toFiniteInteger(rawConfig?.picks);
      if (picks !== null) {
        variantKey = `${resolvedGameKey}:picks:${picks}`;
        variantLabel = `Picks ${picks}`;
        rtpConfig = { ...rawConfig, picks };
      }
      break;
    }
    case 'monkey-match': {
      const mode = toFiniteInteger(rawConfig?.mode);
      const modeName = String(rawConfig?.modeName || '').trim();
      if (mode !== null) {
        variantKey = `${resolvedGameKey}:mode:${mode}`;
        variantLabel = modeName || MONKEY_MATCH_MODE_TABLES[mode]?.label || `Mode ${mode}`;
        rtpConfig = { ...rawConfig, mode };
      }
      break;
    }
    case 'bear-dice': {
      const difficulty = toFiniteInteger(rawConfig?.difficulty);
      const rolls = toFiniteInteger(rawConfig?.rolls);
      const difficultyName = String(rawConfig?.difficultyName || '').trim();
      if (difficulty !== null || rolls !== null) {
        const difficultyLabel = difficultyName || (difficulty !== null ? `Difficulty ${difficulty}` : null);
        const rollsLabel = rolls !== null ? `${rolls} roll${rolls === 1 ? '' : 's'}` : null;
        variantKey = [
          resolvedGameKey,
          difficulty !== null ? `difficulty:${difficulty}` : null,
          rolls !== null ? `rolls:${rolls}` : null,
        ].filter(Boolean).join(':');
        variantLabel = [difficultyLabel, rollsLabel].filter(Boolean).join(' / ') || null;
        rtpConfig = {
          ...rawConfig,
          ...(difficulty !== null ? { difficulty } : {}),
          ...(rolls !== null ? { rolls } : {}),
        };
      }
      break;
    }
    case 'primes': {
      const difficulty = inferPrimesDifficulty({
        config: rawConfig,
        variantKey: rawVariantKey,
        variantLabel: rawVariantLabel,
      });
      if (difficulty !== null) {
        const table = PRIMES_MODE_TABLES[difficulty];
        variantKey = `primes:mode:${table.slug}`;
        variantLabel = table.label;
        rtpConfig = { difficulty };
      }
      break;
    }
    case 'jungle-plinko':
    case 'cosmic-plinko': {
      const mode = inferPlinkoMode(resolvedGameKey, {
        config: rawConfig,
        variantKey: rawVariantKey,
        variantLabel: rawVariantLabel,
      });
      if (mode !== null) {
        variantKey = `${resolvedGameKey}:mode:${mode}`;
        variantLabel = getPlinkoModeTables(resolvedGameKey)?.[mode]?.label || `Mode ${mode}`;
        rtpConfig = { mode };
      }
      break;
    }
    case 'dino-dough':
    case 'bubblegum-heist':
    case 'sushi-showdown':
    case 'geez-diggerz': {
      const spins = toFiniteInteger(rawConfig?.spins);
      if (spins !== null) {
        variantKey = `${resolvedGameKey}:spins:${spins}`;
        variantLabel = `${spins} spin${spins === 1 ? '' : 's'}`;
        rtpConfig = { ...rawConfig, spins };
      }
      break;
    }
    case 'video-poker': {
      const betAmountApe = toFiniteNumber(rawConfig?.betAmountApe ?? rawConfig?.bet);
      const jackpotApe = toFiniteNumber(rawConfig?.jackpotApe);
      if (betAmountApe !== null && betAmountApe > 0) {
        const isJackpotTier = betAmountApe === 100;
        variantKey = isJackpotTier
          ? `${resolvedGameKey}:bet:100`
          : `${resolvedGameKey}:bet:base`;
        variantLabel = isJackpotTier ? 'Bet 100 APE' : 'Bet 1/5/10/25/50 APE';
        rtpConfig = {
          ...rawConfig,
          betAmountApe,
          ...(jackpotApe !== null ? { jackpotApe } : {}),
        };
      }
      break;
    }
    case 'blackjack': {
      const mainBetApe = toFiniteNumber(rawConfig?.mainBetApe);
      const playerSideApe = toFiniteNumber(rawConfig?.playerSideApe ?? rawConfig?.sideApe);
      const dealerSideApe = toFiniteNumber(rawConfig?.dealerSideApe ?? rawConfig?.bankSideApe);
      const hasMain = mainBetApe !== null && mainBetApe > 0;
      const hasPlayerSide = playerSideApe !== null && playerSideApe > 0;
      const hasDealerSide = dealerSideApe !== null && dealerSideApe > 0;

      if (hasMain || hasPlayerSide || hasDealerSide) {
        const mainLabel = formatVariantBetAmount(mainBetApe) || '0';
        const sideLabel = formatVariantBetAmount(playerSideApe) || '0';
        const dealerLabel = formatVariantBetAmount(dealerSideApe) || '0';

        if (hasMain && !hasPlayerSide && !hasDealerSide) {
          variantKey = `${resolvedGameKey}:main-only`;
          variantLabel = 'Main Only';
        } else if (!hasMain && hasPlayerSide && !hasDealerSide) {
          variantKey = `${resolvedGameKey}:player-side-only`;
          variantLabel = 'Side Only';
        } else if (!hasMain && !hasPlayerSide && hasDealerSide) {
          variantKey = `${resolvedGameKey}:dealer-side-only`;
          variantLabel = 'Dealer Side Only';
        } else {
          variantKey = `${resolvedGameKey}:mixed:main:${normalizeVariantKeyPart(mainLabel)}:side:${normalizeVariantKeyPart(sideLabel)}:dealer:${normalizeVariantKeyPart(dealerLabel)}`;
          variantLabel = `Mixed (${joinVariantComponents([
            hasMain ? `Main ${mainLabel}` : null,
            hasPlayerSide ? `Side ${sideLabel}` : null,
            hasDealerSide ? `Dealer ${dealerLabel}` : null,
          ])})`;
        }

        rtpConfig = {
          ...rawConfig,
          ...(mainBetApe !== null ? { mainBetApe } : {}),
          ...(playerSideApe !== null ? { playerSideApe } : {}),
          ...(dealerSideApe !== null ? { dealerSideApe } : {}),
        };
      }
      break;
    }
    default:
      break;
  }

  if (!variantLabel) {
    const exactVariant = GAME_RTP_VARIANT_CONSTANTS[variantKey];
    if (exactVariant?.variantLabel) {
      variantLabel = exactVariant.variantLabel;
    }
  }

  return {
    gameKey: resolvedGameKey,
    variantKey,
    variantLabel,
    rtpGame: resolvedGameKey,
    rtpConfig,
  };
}

export function formatGameVariantName(gameName, variantLabel = null) {
  const normalizedGameName = String(gameName || '').trim() || 'Unknown';
  const normalizedVariantLabel = String(variantLabel || '').trim();
  if (!normalizedVariantLabel) {
    return normalizedGameName;
  }
  const suffix = `(${normalizedVariantLabel})`;
  if (
    normalizedGameName === suffix
    || normalizedGameName.endsWith(` ${suffix}`)
  ) {
    return normalizedGameName;
  }
  return `${normalizedGameName} (${normalizedVariantLabel})`;
}

export function getConfiguredGameExpectedRtpReference({ game, config = {} } = {}) {
  const key = resolveGameRtpKey(game);
  if (!key) return null;
  const exactVariant = getConfiguredCalculatedVariantReference({ game: key, config });

  switch (key) {
    case 'blackjack': {
      const mainBetApe = Math.max(Number(config?.mainBetApe) || 0, 0);
      const playerSideApe = Math.max(Number(config?.playerSideApe ?? config?.sideApe) || 0, 0);
      const dealerSideApe = Math.max(Number(config?.dealerSideApe ?? config?.bankSideApe) || 0, 0);
      const totalBetApe = mainBetApe + playerSideApe + dealerSideApe;

      if (totalBetApe <= 0) {
        return getGameExpectedRtpReference(key);
      }

      if (mainBetApe > 0 && playerSideApe <= 0 && dealerSideApe <= 0) {
        return getGameCalculatedVariantReference('blackjack:main-only')?.calculated || getGameExpectedRtpReference(key);
      }

      if (mainBetApe <= 0 && playerSideApe > 0 && dealerSideApe <= 0) {
        return getGameCalculatedVariantReference('blackjack:player-side-only')?.calculated || getGameExpectedRtpReference(key);
      }

      if (mainBetApe <= 0 && playerSideApe <= 0 && dealerSideApe > 0) {
        return getGameCalculatedVariantReference('blackjack:dealer-side-only')?.calculated || getGameExpectedRtpReference(key);
      }

      const blended = (
        (mainBetApe * BLACKJACK_MAIN_CALCULATED_RTP) +
        (playerSideApe * BLACKJACK_PLAYER_SIDE_EXACT_RTP) +
        (dealerSideApe * BLACKJACK_DEALER_SIDE_EXACT_RTP)
      ) / totalBetApe;

      const includesStatisticalComponent = mainBetApe > 0;

      return fixedCalculated(blended, {
        display: toConfiguredPercentDisplay(blended),
        calculationKind: includesStatisticalComponent ? 'statistical' : 'exact',
        calculationModel: [
          includesStatisticalComponent ? CALCULATION_MODEL_BLACKJACK : null,
          playerSideApe > 0 ? `Player side exact RTP ${(BLACKJACK_PLAYER_SIDE_EXACT_RTP).toFixed(2)}%.` : null,
          dealerSideApe > 0 ? `Dealer side exact RTP ${(BLACKJACK_DEALER_SIDE_EXACT_RTP).toFixed(2)}%.` : null,
          'Weighted by configured bet amounts.',
        ].filter(Boolean).join(' '),
      });
    }
    case 'video-poker': {
      const betAmountApe = Math.max(Number(config?.betAmountApe) || 0, 0);
      const jackpotApe = Math.max(Number(config?.jackpotApe) || 0, 0);
      const exact = betAmountApe === 100 && jackpotApe > 0
        ? VIDEO_POKER_BASE_CALCULATED_RTP + (VIDEO_POKER_ROYAL_FLUSH_PROBABILITY * (jackpotApe / betAmountApe) * 100)
        : null;

      return Number.isFinite(exact)
        ? fixedCalculated(exact, {
            display: toConfiguredPercentDisplay(exact),
            calculationKind: 'exact',
            calculationModel: `${CALCULATION_MODEL_VIDEO_POKER} Includes max-bet jackpot uplift for the configured jackpot.`,
          })
        : exactVariant || getGameExpectedRtpReference(key);
    }
    default:
      return exactVariant || getGameExpectedRtpReference(key);
  }
}

export function compareRtpToExpected(value, expectedReference) {
  if (!expectedReference || !hasNumericRtpValue(value)) {
    return null;
  }
  const numericValue = Number(value);

  if (numericValue < expectedReference.min) {
    return 'below';
  }
  if (numericValue > expectedReference.max) {
    return 'above';
  }
  return 'within';
}

function formatUnavailable() {
  return theme.warning('…');
}

export function formatMaxPayoutReference(reference) {
  if (!reference) {
    return formatUnavailable();
  }

  return theme.value(reference.display);
}

function getExpectedReferenceBadge(reference) {
  if (!reference) {
    return '';
  }

  if (reference.referenceType === 'calculated') {
    return reference.calculationKind === 'statistical' ? ' 🔮' : ' 👌';
  }

  if (reference.referenceType === 'theoretical') {
    return ' 📄';
  }

  return '';
}

function formatExpectedReference(reference) {
  if (!reference) {
    return formatUnavailable();
  }

  return theme.value(`${reference.display}${getExpectedReferenceBadge(reference)}`);
}

function formatComparedRtpValue(value, comparison, digits = 2) {
  if (!hasNumericRtpValue(value)) {
    return formatUnavailable();
  }
  const numericValue = Number(value);

  const display = `${numericValue.toFixed(digits)}%`;
  if (comparison === 'above') {
    return theme.rtpAbove(display);
  }
  if (comparison === 'below') {
    return theme.rtpBelow(display);
  }
  return theme.value(display);
}

export function resolveRtpTripletParts({
  game = null,
  config = null,
  expectedReference = undefined,
  reportedRtp = undefined,
  currentRtp = null,
  preferConfiguredExpected = false,
  currentDigits = 2,
} = {}) {
  const resolvedExpected = expectedReference !== undefined
    ? expectedReference
    : ((preferConfiguredExpected || config) ? getConfiguredGameExpectedRtpReference({ game, config }) : getGameExpectedRtpReference(game));
  const resolvedReported = reportedRtp !== undefined ? reportedRtp : getGameReportedRtp(game);
  const reportedComparison = compareRtpToExpected(resolvedReported, resolvedExpected);
  const currentComparison = compareRtpToExpected(currentRtp, resolvedExpected);

  return {
    expectedReference: resolvedExpected,
    reportedRtp: resolvedReported,
    currentRtp,
    reportedComparison,
    currentComparison,
    currentDigits,
  };
}

export function formatRtpTripletCells(options = {}) {
  const {
    expectedReference,
    reportedRtp,
    currentRtp,
    reportedComparison,
    currentComparison,
    currentDigits,
  } = resolveRtpTripletParts(options);

  return {
    expected: formatExpectedReference(expectedReference),
    reported: formatComparedRtpValue(reportedRtp, reportedComparison),
    current: formatComparedRtpValue(currentRtp, currentComparison, currentDigits),
  };
}

export function formatRtpTripletValues(options = {}) {
  const cells = formatRtpTripletCells(options);

  return [
    cells.expected,
    cells.reported,
    cells.current,
  ].join(' / ');
}

export function formatRtpTripletLine(options = {}) {
  return `🎲 RTP ${theme.dim('(expected/reported/current)')}: ${formatRtpTripletValues(options)}`;
}

function formatRtpOutcomeLabel(netResultApe) {
  const numericValue = Number(netResultApe) || 0;
  const absoluteAmount = Math.abs(numericValue).toFixed(2);
  if (numericValue > 0) {
    return `win ${absoluteAmount} APE`;
  }
  if (numericValue < 0) {
    return `loss ${absoluteAmount} APE`;
  }
  return `even ${absoluteAmount} APE`;
}

export function formatRtpDetails({
  totalPayoutApe = 0,
  totalWageredApe = 0,
  netResultApe = 0,
} = {}) {
  return theme.dim(`(payout ${Number(totalPayoutApe).toFixed(2)} APE  wagered ${Number(totalWageredApe).toFixed(2)} APE  ${formatRtpOutcomeLabel(netResultApe)})`);
}
