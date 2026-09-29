/** Canonical checked-in payout values and rules for supported games.
 * Dynamic contract values and incomplete games are explicitly handled by consumers.
 */

export function maxTablePayout(values) {
  return Math.max(...values.map(Number));
}

export const APESTRONG_PAYOUT_NUMERATOR_BPS = 975000;
export const APESTRONG_LIVE_PAYOUT_OVERRIDES = Object.freeze({ 75: 12999, 95: 10250 });
export const GIMBOZ_SMASH_PAYOUT_NUMERATOR_BPS = 975000;
export const BACCARAT_PAYOUT_NUMERATORS = Object.freeze({ player: 200, banker: 195, tie: 900 });
export const BACCARAT_PAYOUTS = Object.freeze(Object.fromEntries(
  Object.entries(BACCARAT_PAYOUT_NUMERATORS).map(([bet, numerator]) => [bet, numerator / 100]),
));
export const BLACKJACK_PAYOUTS = Object.freeze({
  mainWin: 2,
  natural: 2.5,
  playerSideNatural: 5,
  playerSidePerfectPair: 20,
  playerSideDiamondSevens: 500,
  insurance: 1.5,
});

// American wheel: 37 represents 00, as in the on-chain bet identifiers.
export const ROULETTE_POCKETS = Object.freeze([0, 37, ...Array.from({ length: 36 }, (_, index) => index + 1)]);
const ROULETTE_RED_POCKETS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const ROULETTE_BLACK_POCKETS = new Set([2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]);
export const ROULETTE_PAYOUT_UNITS = Object.freeze({ single: 36900, dozen: 3075, evenMoney: 2050 });

export function getRouletteBetPayoutUnits(gameNumber) {
  if (gameNumber >= 1 && gameNumber <= 38) return ROULETTE_PAYOUT_UNITS.single;
  if (gameNumber >= 39 && gameNumber <= 44) return ROULETTE_PAYOUT_UNITS.dozen;
  if (gameNumber >= 45 && gameNumber <= 50) return ROULETTE_PAYOUT_UNITS.evenMoney;
  return 0;
}

export function isRouletteWinningPocket(gameNumber, pocket) {
  if (gameNumber === 1) return pocket === 0;
  if (gameNumber === 38) return pocket === 37;
  if (gameNumber >= 2 && gameNumber <= 37) return pocket === gameNumber - 1;
  if (pocket === 0 || pocket === 37) return false;
  switch (gameNumber) {
    case 39: return pocket >= 1 && pocket <= 12;
    case 40: return pocket >= 13 && pocket <= 24;
    case 41: return pocket >= 25 && pocket <= 36;
    case 42: return pocket % 3 === 1;
    case 43: return pocket % 3 === 2;
    case 44: return pocket % 3 === 0;
    case 45: return pocket >= 1 && pocket <= 18;
    case 46: return pocket >= 19 && pocket <= 36;
    case 47: return pocket % 2 === 0;
    case 48: return pocket % 2 === 1;
    case 49: return ROULETTE_BLACK_POCKETS.has(pocket);
    case 50: return ROULETTE_RED_POCKETS.has(pocket);
    default: return false;
  }
}

// Keno
export const KENO_PAYOUTS_BY_PICKS = Object.freeze({
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

// Speed Keno
export const SPEED_KENO_PAYOUTS_BY_PICKS = Object.freeze({
  1: Object.freeze({ 0: 0.5, 1: 2.4 }),
  2: Object.freeze({ 0: 0.25, 1: 1.45, 2: 5 }),
  3: Object.freeze({ 0: 0.5, 1: 0.5, 2: 2.5, 3: 25 }),
  4: Object.freeze({ 0: 0.5, 1: 0.5, 2: 1.5, 3: 5.5, 4: 100 }),
  5: Object.freeze({ 0: 1.25, 1: 0.2, 2: 0.5, 3: 3, 4: 35, 5: 2000 }),
});

// Slot-family snapshot from the public contracts at ApeChain block 50311380.
// Ordered triple (a,b,c) uses index ((a * n) + b) * n + c.
export const SLOT_REEL_WEIGHTS_BY_GAME = Object.freeze({
  'dino-dough': Object.freeze([Object.freeze([10, 15, 30, 40, 45, 50]), Object.freeze([5, 10, 40, 40, 45, 50]), Object.freeze([5, 10, 40, 40, 40, 55])]),
  'bubblegum-heist': Object.freeze([Object.freeze([10, 15, 15, 25, 35]), Object.freeze([5, 10, 20, 25, 40]), Object.freeze([5, 15, 20, 25, 35])]),
  'geez-diggerz': Object.freeze([Object.freeze([10, 11, 13, 14, 16, 18]), Object.freeze([10, 11, 13, 14, 16, 18]), Object.freeze([10, 11, 13, 14, 16, 18])]),
  'sushi-showdown': Object.freeze([Object.freeze([9, 20, 30, 40, 40, 40, 50]), Object.freeze([9, 20, 40, 40, 35, 40, 50]), Object.freeze([9, 20, 40, 40, 40, 40, 60])]),
});

export const SLOT_PAYOUT_BPS_BY_GAME = Object.freeze({
  'dino-dough': Object.freeze([
    3330000, 600000, 350000, 300000, 250000, 200000, 600000, 400000, 150000, 150000, 150000, 100000,
    200000, 100000, 25000, 25000, 25000, 0, 200000, 100000, 25000, 25000, 0, 0,
    177777, 88888, 22222, 22222, 22222, 0, 160000, 80000, 20000, 20000, 0, 12500,
    600000, 400000, 120000, 120000, 120000, 80000, 400000, 500000, 70000, 70000, 70000, 40000,
    133333, 66666, 17500, 17500, 0, 0, 133333, 66666, 17500, 17500, 0, 0,
    118518, 59259, 0, 12500, 12500, 0, 106666, 53333, 12500, 0, 0, 7500,
    533333, 266666, 66666, 66666, 66666, 48484, 266666, 133333, 33333, 33333, 33333, 24242,
    66666, 33333, 50000, 7500, 7500, 5000, 66666, 33333, 0, 0, 0, 0,
    59259, 29629, 5000, 0, 0, 0, 53333, 26666, 5000, 0, 0, 0,
    400000, 200000, 50000, 50000, 50000, 0, 200000, 100000, 25000, 25000, 25000, 18181,
    50000, 25000, 5000, 5000, 0, 0, 50000, 25000, 5000, 40000, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    355555, 177777, 44444, 44444, 44444, 0, 177777, 88888, 0, 0, 22222, 0,
    44444, 22222, 0, 0, 0, 0, 44444, 22222, 0, 0, 0, 0,
    39506, 19753, 0, 0, 30000, 0, 35555, 0, 0, 0, 0, 0,
    320000, 160000, 40000, 40000, 40000, 29090, 160000, 80000, 20000, 20000, 0, 0,
    40000, 20000, 5000, 0, 5000, 0, 40000, 20000, 0, 0, 0, 0,
    35555, 17777, 0, 0, 0, 0, 32000, 17500, 5000, 5000, 5000, 20000,
  ]),
  'bubblegum-heist': Object.freeze([
    1000000, 250000, 100000, 80000, 40000, 250000, 120000, 45000, 36000, 25714, 100000, 30000,
    22500, 18000, 12857, 80000, 24000, 18000, 14400, 10285, 40000, 15000, 11250, 10000,
    7500, 250000, 120000, 60000, 48000, 34285, 120000, 110000, 30000, 24000, 17142, 60000,
    20000, 15000, 12000, 10000, 48000, 16000, 12000, 10000, 7500, 30000, 10000, 10000,
    7500, 5000, 100000, 80000, 60000, 48000, 34285, 120000, 40000, 30000, 24000, 17142,
    60000, 20000, 40000, 0, 0, 48000, 16000, 0, 0, 0, 30000, 10000,
    0, 0, 0, 80000, 48000, 0, 28800, 0, 72000, 24000, 0, 14400,
    0, 36000, 12000, 0, 0, 0, 28800, 10000, 0, 20000, 0, 18000,
    7500, 0, 0, 0, 40000, 34285, 0, 0, 14693, 51428, 17142, 0,
    0, 7500, 25714, 10000, 0, 0, 0, 20571, 7500, 0, 0, 0,
    12857, 5000, 0, 0, 10000,
  ]),
  'geez-diggerz': Object.freeze([
    500000, 100000, 60000, 50000, 50000, 50000, 100000, 80000, 0, 0, 0, 0,
    60000, 0, 50000, 0, 0, 0, 50000, 0, 0, 35000, 0, 0,
    50000, 0, 0, 0, 20000, 0, 50000, 0, 0, 0, 0, 20000,
    100000, 80000, 0, 0, 0, 0, 80000, 100000, 30000, 20000, 20000, 20000,
    0, 30000, 25000, 0, 0, 0, 0, 20000, 0, 20000, 0, 0,
    0, 20000, 0, 0, 12500, 0, 0, 20000, 0, 0, 0, 10000,
    60000, 0, 50000, 0, 0, 0, 0, 30000, 25000, 0, 0, 0,
    50000, 25000, 50000, 15000, 15000, 15000, 0, 0, 15000, 15000, 0, 0,
    0, 0, 15000, 0, 5000, 0, 0, 0, 15000, 0, 0, 0,
    50000, 0, 0, 35000, 0, 0, 0, 20000, 0, 20000, 0, 0,
    0, 0, 15000, 15000, 0, 0, 35000, 20000, 15000, 40000, 12500, 12500,
    0, 0, 0, 12500, 5000, 0, 0, 0, 0, 12500, 0, 0,
    50000, 0, 0, 0, 20000, 0, 0, 20000, 0, 0, 12500, 0,
    0, 0, 15000, 0, 5000, 0, 0, 0, 0, 12500, 5000, 0,
    20000, 12500, 5000, 5000, 30000, 5000, 0, 0, 0, 0, 5000, 2500,
    50000, 0, 0, 0, 0, 20000, 0, 20000, 0, 0, 0, 10000,
    0, 0, 15000, 0, 0, 0, 0, 0, 0, 12500, 0, 0,
    0, 0, 0, 0, 5000, 2500, 20000, 10000, 0, 0, 2500, 20000,
  ]),
  'sushi-showdown': Object.freeze([
    5000000, 1000000, 300000, 300000, 300000, 300000, 200000, 1000000, 500000, 150000, 150000, 150000,
    150000, 100000, 169753, 76388, 38194, 38194, 0, 38194, 0, 169753, 76388, 38194,
    38194, 0, 0, 0, 194003, 87301, 43650, 0, 43650, 0, 0, 169753,
    76388, 38194, 38194, 0, 38194, 0, 135802, 61111, 30555, 30555, 0, 0,
    20370, 1000000, 500000, 120000, 120000, 120000, 120000, 80000, 500000, 550000, 70000, 70000,
    70000, 70000, 40000, 76388, 34375, 17500, 17500, 0, 0, 0, 76388, 34375,
    17500, 17500, 0, 0, 0, 87301, 39285, 0, 0, 19642, 0, 0,
    76388, 34375, 0, 17500, 0, 17500, 0, 61111, 27500, 12500, 0, 0,
    0, 7500, 226337, 101851, 50925, 50925, 50925, 50925, 33950, 101851, 45833, 22916,
    22916, 0, 22916, 17500, 50925, 22916, 50000, 12500, 12500, 12500, 7500, 50925,
    22916, 0, 0, 0, 0, 0, 58201, 26190, 0, 0, 0, 0,
    0, 50925, 22916, 12500, 0, 0, 0, 0, 40740, 18333, 7500, 0,
    0, 0, 0, 169753, 76388, 38194, 38194, 0, 38194, 0, 76388, 34375,
    17500, 17500, 17500, 17500, 12500, 38194, 17500, 7500, 7500, 0, 0, 0,
    38194, 17500, 7500, 40000, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 169753, 76388, 38194, 38194, 38194, 38194, 0, 76388,
    34375, 17500, 17500, 17500, 17500, 0, 38194, 17500, 7500, 0, 7500, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 43650, 19642, 0, 0,
    30000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 169753, 76388, 38194, 38194, 38194, 38194, 0,
    76388, 34375, 0, 0, 0, 17500, 0, 38194, 17500, 0, 0, 0,
    0, 0, 38194, 17500, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 38194, 17500, 0, 0, 0, 30000, 0, 30555,
    0, 0, 0, 0, 0, 0, 135802, 61111, 30555, 30555, 30555, 30555,
    20370, 61111, 27500, 12500, 12500, 0, 0, 0, 30555, 12500, 5000, 0,
    0, 5000, 0, 30555, 12500, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 30555, 12500, 0, 0, 0, 0, 0,
    24444, 12500, 5000, 5000, 0, 5000, 20000,
  ]),
});

function slotOutcomes(game) {
  const reels = SLOT_REEL_WEIGHTS_BY_GAME[game];
  const payouts = SLOT_PAYOUT_BPS_BY_GAME[game];
  const width = reels[0].length;
  const totalStops = reels.map((reel) => reel.reduce((sum, stops) => sum + stops, 0))
    .reduce((product, stops) => product * stops, 1);
  const weightsByPayout = new Map();
  let index = 0;
  for (let a = 0; a < width; a += 1) {
    for (let b = 0; b < width; b += 1) {
      for (let c = 0; c < width; c += 1) {
        const payout = payouts[index++];
        const weight = reels[0][a] * reels[1][b] * reels[2][c];
        weightsByPayout.set(payout, (weightsByPayout.get(payout) || 0) + weight);
      }
    }
  }
  return Object.freeze([...weightsByPayout].map(([payoutBps, weight]) => Object.freeze({
    probability: weight / totalStops,
    payoutMultiplier: payoutBps / 10000,
  })).sort((left, right) => right.payoutMultiplier - left.payoutMultiplier));
}

export const SLOT_OUTCOME_TABLES = Object.freeze(Object.fromEntries(
  Object.keys(SLOT_PAYOUT_BPS_BY_GAME).map((game) => [game, slotOutcomes(game)]),
));

// Bear Dice
export const BEAR_DICE_MODE_TABLES = Object.freeze({
  0: Object.freeze({
    label: 'Easy',
    payoutsByRuns: Object.freeze({
      1: Object.freeze({ 2: 183, 3: 139, 4: 120, 5: 109, 6: 101, 8: 101, 9: 109, 10: 120, 11: 139, 12: 183 }),
      2: Object.freeze({ 2: 183, 3: 141, 4: 122, 5: 110, 6: 102, 8: 102, 9: 110, 10: 122, 11: 141, 12: 183 }),
      3: Object.freeze({ 2: 184, 3: 141, 4: 122, 5: 110, 6: 103, 8: 103, 9: 110, 10: 122, 11: 141, 12: 184 }),
      4: Object.freeze({ 2: 187, 3: 141, 4: 122, 5: 110, 6: 103, 8: 103, 9: 110, 10: 122, 11: 141, 12: 187 }),
      5: Object.freeze({ 2: 184, 3: 141, 4: 122, 5: 110, 6: 104, 8: 104, 9: 110, 10: 122, 11: 141, 12: 184 }),
    }),
  }),
  1: Object.freeze({
    label: 'Medium',
    payoutsByRuns: Object.freeze({
      1: Object.freeze({ 2: 380, 3: 225, 4: 155, 5: 117, 9: 117, 10: 155, 11: 225, 12: 380 }),
      2: Object.freeze({ 2: 384, 3: 227, 4: 157, 5: 118, 9: 118, 10: 157, 11: 227, 12: 384 }),
      3: Object.freeze({ 2: 385, 3: 227, 4: 158, 5: 118, 9: 118, 10: 158, 11: 227, 12: 385 }),
      4: Object.freeze({ 2: 385, 3: 229, 4: 157, 5: 119, 9: 119, 10: 157, 11: 229, 12: 385 }),
      5: Object.freeze({ 2: 386, 3: 227, 4: 158, 5: 119, 9: 119, 10: 158, 11: 227, 12: 386 }),
    }),
  }),
  2: Object.freeze({
    label: 'Hard',
    payoutsByRuns: Object.freeze({
      1: Object.freeze({ 2: 630, 3: 300, 4: 177, 10: 177, 11: 300, 12: 630 }),
      2: Object.freeze({ 2: 637, 3: 303, 4: 179, 10: 179, 11: 303, 12: 637 }),
      3: Object.freeze({ 2: 640, 3: 305, 4: 179, 10: 179, 11: 305, 12: 640 }),
      4: Object.freeze({ 2: 643, 3: 305, 4: 179, 10: 179, 11: 305, 12: 643 }),
      5: Object.freeze({ 2: 643, 3: 306, 4: 179, 10: 179, 11: 306, 12: 643 }),
    }),
  }),
  3: Object.freeze({
    label: 'Expert',
    payoutsByRuns: Object.freeze({
      1: Object.freeze({ 2: 972, 3: 395, 11: 395, 12: 972 }),
      2: Object.freeze({ 2: 980, 3: 400, 11: 400, 12: 980 }),
      3: Object.freeze({ 2: 982, 3: 401, 11: 401, 12: 982 }),
      4: Object.freeze({ 2: 984, 3: 403, 11: 403, 12: 984 }),
      5: Object.freeze({ 2: 986, 3: 403, 11: 403, 12: 986 }),
    }),
  }),
  4: Object.freeze({
    label: 'Master',
    payoutsByRuns: Object.freeze({
      1: Object.freeze({ 2: 1762, 12: 1762 }),
      2: Object.freeze({ 2: 1780, 12: 1780 }),
      3: Object.freeze({ 2: 1787, 12: 1787 }),
      4: Object.freeze({ 2: 1789, 12: 1789 }),
      5: Object.freeze({ 2: 1792, 12: 1792 }),
    }),
  }),
});

// Monkey Match
export const MONKEY_MATCH_MODE_TABLES = Object.freeze({
  1: Object.freeze({
    label: 'Low',
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
    label: 'High',
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

// Jungle Plinko
export const JUNGLE_PLINKO_MODE_TABLES = Object.freeze({
  0: Object.freeze({
    label: 'Low',
    aliases: Object.freeze(['Safe']),
    cumulativeWeights: Object.freeze([8, 28, 38, 48, 57, 67, 77, 97, 105]),
    payouts: Object.freeze([22000, 12000, 5000, 3500, 3000, 3500, 5000, 12000, 22000]),
  }),
  1: Object.freeze({
    label: 'Moderate',
    aliases: Object.freeze(['Low', 'Medium']),
    cumulativeWeights: Object.freeze([5, 25, 75, 109, 149, 225, 265, 300, 350, 370, 375]),
    payouts: Object.freeze([50000, 25000, 12500, 6000, 4000, 2500, 4000, 6000, 12500, 25000, 50000]),
  }),
  2: Object.freeze({
    label: 'High',
    aliases: Object.freeze(['Medium']),
    cumulativeWeights: Object.freeze([1, 11, 41, 91, 171, 254, 336, 419, 499, 549, 579, 589, 590]),
    payouts: Object.freeze([150000, 62000, 25000, 12000, 6000, 3000, 1000, 3000, 6000, 12000, 25000, 62000, 150000]),
  }),
  3: Object.freeze({
    label: 'Degen',
    aliases: Object.freeze(['High', 'Extreme']),
    cumulativeWeights: Object.freeze([1, 5, 13, 29, 69, 179, 359, 659, 1009, 1359, 1719, 2069, 2419, 2719, 2899, 3009, 3049, 3065, 3073, 3077, 3078]),
    payouts: Object.freeze([1000000, 330000, 175000, 88000, 42000, 21000, 15000, 5000, 2500, 2000, 1000, 2000, 2500, 5000, 15000, 21000, 42000, 88000, 175000, 330000, 1000000]),
  }),
  4: Object.freeze({
    label: 'Ultra Degen',
    aliases: Object.freeze(['Extreme', 'UltraDegen']),
    cumulativeWeights: Object.freeze([1, 6, 16, 66, 216, 616, 1616, 3116, 5616, 9616, 14716, 20966, 29676, 35926, 41026, 45026, 47526, 49026, 50026, 50426, 50576, 50626, 50636, 50641, 50642]),
    payouts: Object.freeze([10000000, 2500000, 1000000, 350000, 150000, 90000, 40000, 20000, 14000, 4000, 2000, 1000, 500, 1000, 2000, 4000, 14000, 20000, 40000, 90000, 150000, 350000, 1000000, 2500000, 10000000]),
  }),
});

// Cosmic Plinko
export const COSMIC_PLINKO_MODE_TABLES = Object.freeze({
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

// Primes
export const PRIMES_MODE_TABLES = Object.freeze({
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

// Blocks
export const BLOCKS_PAYOUTS_BY_GRID = Object.freeze({
  0: Object.freeze({
    0: Object.freeze({ 3: 1.01, 4: 1.2, 5: 2, 6: 4.25, 7: 20, 8: 250, 9: 2500 }),
    1: Object.freeze({ 4: 2.25, 5: 6.5, 6: 15, 7: 80, 8: 600, 9: 5000 }),
  }),
  1: Object.freeze({
    0: Object.freeze({ 5: 1.2, 6: 1.75, 7: 3, 8: 5, 9: 12, 10: 30, 11: 100, 12: 500, 13: 10000, 14: 25000, 15: 25000, 16: 25000 }),
    1: Object.freeze({ 6: 2.6, 7: 6.6, 8: 15, 9: 30, 10: 60, 11: 150, 12: 700, 13: 10000, 14: 25000, 15: 25000, 16: 25000 }),
  }),
  2: Object.freeze({
    0: Object.freeze({ 2: 1.2, 3: 1.85, 4: 12 }),
    1: Object.freeze({ 3: 8, 4: 51 }),
  }),
});

// Cash Dash
export const DEFAULT_ROW_PAYOUT_BPS = Object.freeze({
  2: 19200,
  3: 14400,
  4: 12800,
  5: 12000,
  6: 11500,
  7: 11000,
});

// Video Poker
// Payout multipliers
export const VIDEO_POKER_PAYOUTS = Object.freeze({
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 6,
  6: 9,
  7: 25,
  8: 50,
  9: 250,
 });

// Hi-Lo Nebula
export const HI_LO_PAYOUT_TABLE_BPS = Object.freeze({
  2: Object.freeze({
    2: 10600,
  }),
  3: Object.freeze({
    2: 11363,
    1: 125000,
  }),
  4: Object.freeze({
    2: 12500,
    1: 62500,
  }),
  5: Object.freeze({
    2: 13888,
    1: 41666,
  }),
  6: Object.freeze({
    2: 15625,
    1: 31250,
  }),
  7: Object.freeze({
    2: 17857,
    1: 25000,
  }),
  8: Object.freeze({
    2: 20833,
    1: 20833,
  }),
  9: Object.freeze({
    2: 25000,
    1: 17857,
  }),
  10: Object.freeze({
    2: 31250,
    1: 15625,
  }),
  11: Object.freeze({
    2: 41666,
    1: 13888,
  }),
  12: Object.freeze({
    2: 62500,
    1: 12500,
  }),
  13: Object.freeze({
    2: 125000,
    1: 11363,
  }),
  14: Object.freeze({
    1: 10600,
  }),
});

// Hi-Lo Nebula push
export const HI_LO_PUSH_PAYOUT_BPS = 125000;

function groupedPlinkoOutcomes(table) {
  const weights = new Map();
  let previous = 0;
  table.cumulativeWeights.forEach((cumulative, index) => {
    const multiplier = table.payouts[index] / 10000;
    weights.set(multiplier, (weights.get(multiplier) || 0) + cumulative - previous);
    previous = cumulative;
  });
  return Object.freeze([...weights].map(([payoutMultiplier, weight]) => Object.freeze({
    probability: weight / previous,
    payoutMultiplier,
  })).sort((left, right) => right.probability - left.probability || left.payoutMultiplier - right.payoutMultiplier));
}

export const JUNGLE_PLINKO_OUTCOME_TABLES = Object.freeze(Object.fromEntries(
  Object.entries(JUNGLE_PLINKO_MODE_TABLES).map(([mode, table]) => [mode, groupedPlinkoOutcomes(table)]),
));

export const COSMIC_PLINKO_OUTCOME_TABLES = Object.freeze(Object.fromEntries(
  Object.entries(COSMIC_PLINKO_MODE_TABLES).map(([mode, table]) => [mode, groupedPlinkoOutcomes(table)]),
));

function monkeyOutcome(mode, probability, payoutKey) {
  const table = MONKEY_MATCH_MODE_TABLES[mode];
  return Object.freeze({
    probability,
    payoutMultiplier: payoutKey ? table[payoutKey] / table.payoutDenom : 0,
  });
}

export const MONKEY_MATCH_OUTCOME_TABLES = Object.freeze({
  1: Object.freeze([
    monkeyOutcome(1, 25 / 54, 'onePair'),
    monkeyOutcome(1, 25 / 108, 'twoPair'),
    monkeyOutcome(1, 25 / 162, 'threeOfKind'),
    monkeyOutcome(1, 25 / 648, 'fullHouse'),
    monkeyOutcome(1, 25 / 1296, 'fourOfKind'),
    monkeyOutcome(1, 1 / 1296, 'fiveOfKind'),
    monkeyOutcome(1, 5 / 54, null),
  ]),
  2: Object.freeze([
    monkeyOutcome(2, 1200 / 2401, 'onePair'),
    monkeyOutcome(2, 450 / 2401, 'twoPair'),
    monkeyOutcome(2, 300 / 2401, 'threeOfKind'),
    monkeyOutcome(2, 60 / 2401, 'fullHouse'),
    monkeyOutcome(2, 30 / 2401, 'fourOfKind'),
    monkeyOutcome(2, 1 / 2401, 'fiveOfKind'),
    monkeyOutcome(2, 360 / 2401, null),
  ]),
});
