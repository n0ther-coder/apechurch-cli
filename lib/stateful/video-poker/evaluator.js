/**
 * Pure video poker hand evaluator and payout helpers.
 */
import {
  BET_AMOUNTS,
  HandStatus,
  HandStatusNames,
  MAX_BET_INDEX,
  PAYOUTS,
} from './constants.js';

const HIGH_PAIR_RANKS = new Set([1, 11, 12, 13]);
const ROYAL_RANKS_KEY = '1,10,11,12,13';

export function isRoyalRanks(ranks) {
  return [...new Set(ranks)].sort((a, b) => a - b).join(',') === ROYAL_RANKS_KEY;
}

export function isStraightRanks(ranks) {
  const sorted = [...new Set(ranks)].sort((a, b) => a - b);
  if (sorted.length !== 5) return false;

  if (sorted[4] - sorted[0] === 4) return true;
  if (sorted.join(',') === '1,2,3,4,5') return true;
  if (sorted.join(',') === ROYAL_RANKS_KEY) return true;

  return false;
}

/**
 * Evaluate a final five-card hand.
 */
export function evaluateHand(cards) {
  const rankCounts = new Uint8Array(14);
  const suitCounts = new Uint8Array(4);
  let uniqueRanks = 0;
  let highPair = false;

  for (let i = 0; i < cards.length; i++) {
    const rank = cards[i].rank;
    const suit = cards[i].suit;
    if (rankCounts[rank] === 0) uniqueRanks++;
    rankCounts[rank]++;
    suitCounts[suit]++;
  }

  let pairCount = 0;
  let hasTrips = false;
  let hasQuads = false;

  for (let rank = 1; rank <= 13; rank++) {
    switch (rankCounts[rank]) {
      case 4:
        hasQuads = true;
        break;
      case 3:
        hasTrips = true;
        break;
      case 2:
        pairCount++;
        if (HIGH_PAIR_RANKS.has(rank)) {
          highPair = true;
        }
        break;
      default:
        break;
    }
  }

  let isFlush = false;
  for (let suit = 0; suit < suitCounts.length; suit++) {
    if (suitCounts[suit] === 5) {
      isFlush = true;
      break;
    }
  }

  const isRoyal =
    uniqueRanks === 5 &&
    rankCounts[1] === 1 &&
    rankCounts[10] === 1 &&
    rankCounts[11] === 1 &&
    rankCounts[12] === 1 &&
    rankCounts[13] === 1;

  let isStraight = false;
  if (uniqueRanks === 5) {
    if (
      rankCounts[1] === 1 &&
      rankCounts[2] === 1 &&
      rankCounts[3] === 1 &&
      rankCounts[4] === 1 &&
      rankCounts[5] === 1
    ) {
      isStraight = true;
    } else if (isRoyal) {
      isStraight = true;
    } else {
      let minRank = 14;
      let maxRank = 0;

      for (let rank = 1; rank <= 13; rank++) {
        if (rankCounts[rank] > 0) {
          if (rank < minRank) minRank = rank;
          if (rank > maxRank) maxRank = rank;
        }
      }

      isStraight = maxRank - minRank === 4;
    }
  }

  let handStatus = HandStatus.NOTHING;

  if (isFlush && isRoyal) {
    handStatus = HandStatus.ROYAL_FLUSH;
  } else if (isFlush && isStraight) {
    handStatus = HandStatus.STRAIGHT_FLUSH;
  } else if (hasQuads) {
    handStatus = HandStatus.FOUR_OF_A_KIND;
  } else if (hasTrips && pairCount === 1) {
    handStatus = HandStatus.FULL_HOUSE;
  } else if (isFlush) {
    handStatus = HandStatus.FLUSH;
  } else if (isStraight) {
    handStatus = HandStatus.STRAIGHT;
  } else if (hasTrips) {
    handStatus = HandStatus.THREE_OF_A_KIND;
  } else if (pairCount === 2) {
    handStatus = HandStatus.TWO_PAIR;
  } else if (pairCount === 1 && highPair) {
    handStatus = HandStatus.JACKS_OR_BETTER;
  }

  return {
    handStatus,
    handName: HandStatusNames[handStatus],
    payoutMultiplier: PAYOUTS[handStatus] || 0,
  };
}

export function isMaxBetAmount(betAmountApe) {
  return Number(betAmountApe) === BET_AMOUNTS[MAX_BET_INDEX];
}

/**
 * Convert a hand result into payout in APE for the current bet.
 */
export function getPayoutApe(handStatus, { betAmountApe, jackpotApe = 0 } = {}) {
  const basePayoutApe = (PAYOUTS[handStatus] || 0) * betAmountApe;

  if (handStatus === HandStatus.ROYAL_FLUSH && isMaxBetAmount(betAmountApe)) {
    return basePayoutApe + jackpotApe;
  }

  return basePayoutApe;
}
