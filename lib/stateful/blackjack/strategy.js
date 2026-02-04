/**
 * Blackjack Basic Strategy
 * Mathematically optimal play for standard rules (dealer stands on soft 17)
 */
import { Action } from './constants.js';

// Action shorthand for tables
const H = 'hit';
const S = 'stand';
const D = 'double';
const P = 'split';
const R = 'surrender';

/**
 * Hard totals strategy (no Ace counted as 11)
 * Rows: player total (5-17+), Cols: dealer upcard (2-A)
 * Index: [playerTotal - 5][dealerCard - 2] (A = index 9)
 */
const HARD_STRATEGY = {
  5:  [H, H, H, H, H, H, H, H, H, H],
  6:  [H, H, H, H, H, H, H, H, H, H],
  7:  [H, H, H, H, H, H, H, H, H, H],
  8:  [H, H, H, H, H, H, H, H, H, H],
  9:  [H, D, D, D, D, H, H, H, H, H],
  10: [D, D, D, D, D, D, D, D, H, H],
  11: [D, D, D, D, D, D, D, D, D, D],
  12: [H, H, S, S, S, H, H, H, H, H],
  13: [S, S, S, S, S, H, H, H, H, H],
  14: [S, S, S, S, S, H, H, H, H, H],
  15: [S, S, S, S, S, H, H, H, R, H],
  16: [S, S, S, S, S, H, H, R, R, R],
  17: [S, S, S, S, S, S, S, S, S, S],
  18: [S, S, S, S, S, S, S, S, S, S],
  19: [S, S, S, S, S, S, S, S, S, S],
  20: [S, S, S, S, S, S, S, S, S, S],
  21: [S, S, S, S, S, S, S, S, S, S],
};

/**
 * Soft totals strategy (Ace counted as 11)
 * Rows: non-ace card value, Cols: dealer upcard (2-A)
 */
const SOFT_STRATEGY = {
  2:  [H, H, H, D, D, H, H, H, H, H],  // A,2 = soft 13
  3:  [H, H, H, D, D, H, H, H, H, H],  // A,3 = soft 14
  4:  [H, H, D, D, D, H, H, H, H, H],  // A,4 = soft 15
  5:  [H, H, D, D, D, H, H, H, H, H],  // A,5 = soft 16
  6:  [H, D, D, D, D, H, H, H, H, H],  // A,6 = soft 17
  7:  [S, D, D, D, D, S, S, H, H, H],  // A,7 = soft 18
  8:  [S, S, S, S, S, S, S, S, S, S],  // A,8 = soft 19
  9:  [S, S, S, S, S, S, S, S, S, S],  // A,9 = soft 20
};

/**
 * Pair splitting strategy
 * Rows: card value of pair, Cols: dealer upcard (2-A)
 */
const PAIR_STRATEGY = {
  2:  [P, P, P, P, P, P, H, H, H, H],
  3:  [P, P, P, P, P, P, H, H, H, H],
  4:  [H, H, H, P, P, H, H, H, H, H],
  5:  [D, D, D, D, D, D, D, D, H, H],  // Never split 5s, treat as 10
  6:  [P, P, P, P, P, H, H, H, H, H],
  7:  [P, P, P, P, P, P, H, H, H, H],
  8:  [P, P, P, P, P, P, P, P, P, P],  // Always split 8s
  9:  [P, P, P, P, P, S, P, P, S, S],
  10: [S, S, S, S, S, S, S, S, S, S],  // Never split 10s
  11: [P, P, P, P, P, P, P, P, P, P],  // Always split Aces (value 11)
};

/**
 * Convert dealer upcard to strategy table index (0-9)
 * 2-10 map to 0-8, Ace (11) maps to 9
 */
function dealerIndex(dealerValue) {
  if (dealerValue === 11) return 9;  // Ace
  return dealerValue - 2;
}

/**
 * Analyze hand composition
 */
function analyzeHand(cards) {
  let total = 0;
  let aces = 0;
  let isSoft = false;
  
  for (const card of cards) {
    total += card.value;
    if (card.value === 11) aces++;
  }
  
  // Adjust for aces if bust
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  
  // Check if hand is soft (has Ace counted as 11)
  isSoft = aces > 0 && total <= 21;
  
  // For soft hands, get the "other" card value
  let softCard = null;
  if (isSoft && cards.length === 2) {
    for (const card of cards) {
      if (card.value !== 11) {
        softCard = card.value;
        break;
      }
    }
    // Two aces
    if (softCard === null) softCard = 11;
  }
  
  // Check for pair
  const isPair = cards.length === 2 && cards[0].value === cards[1].value;
  const pairValue = isPair ? cards[0].value : null;
  
  return { total, isSoft, softCard, isPair, pairValue };
}

/**
 * Get optimal action for a hand
 * @param {Array} playerCards - Array of card objects with { value }
 * @param {number} dealerUpcard - Dealer's visible card value (2-11, where 11=Ace)
 * @param {Object} options - Available actions { canDouble, canSplit, canSurrender }
 * @returns {{ action: string, reason: string }}
 */
export function getOptimalAction(playerCards, dealerUpcard, options = {}) {
  const { canDouble = true, canSplit = true, canSurrender = true } = options;
  const hand = analyzeHand(playerCards);
  const dIdx = dealerIndex(dealerUpcard);
  
  let action;
  let reason;
  
  // Check pairs first (if splittable)
  if (hand.isPair && canSplit) {
    action = PAIR_STRATEGY[hand.pairValue]?.[dIdx];
    if (action === P) {
      const cardName = hand.pairValue === 11 ? 'A' : hand.pairValue;
      return {
        action: 'split',
        reason: `pair of ${cardName}s vs ${dealerUpcard === 11 ? 'A' : dealerUpcard}`,
      };
    }
    // If not splitting, fall through to hard/soft
  }
  
  // Check soft hands
  if (hand.isSoft && hand.softCard !== null && SOFT_STRATEGY[hand.softCard]) {
    action = SOFT_STRATEGY[hand.softCard][dIdx];
    reason = `soft ${hand.total} vs ${dealerUpcard === 11 ? 'A' : dealerUpcard}`;
  } else {
    // Hard hands
    const lookupTotal = Math.min(Math.max(hand.total, 5), 21);
    action = HARD_STRATEGY[lookupTotal]?.[dIdx] || H;
    reason = `hard ${hand.total} vs ${dealerUpcard === 11 ? 'A' : dealerUpcard}`;
  }
  
  // Validate action availability
  if (action === D && !canDouble) {
    // Can't double, hit instead
    action = H;
    reason += ' (double unavailable, hit)';
  }
  
  if (action === R && !canSurrender) {
    // Can't surrender, hit instead
    action = H;
    reason += ' (surrender unavailable, hit)';
  }
  
  return { action, reason };
}

/**
 * Map strategy action string to game Action enum
 */
export function strategyToAction(strategyAction) {
  const map = {
    'hit': Action.HIT,
    'stand': Action.STAND,
    'double': Action.DOUBLE,
    'split': Action.SPLIT,
    'surrender': Action.SURRENDER,
  };
  return map[strategyAction] ?? Action.HIT;
}

/**
 * Get action key from strategy action
 */
export function strategyToKey(strategyAction) {
  const map = {
    'hit': 'h',
    'stand': 's',
    'double': 'd',
    'split': 'x',
    'surrender': 'r',
  };
  return map[strategyAction] ?? 'h';
}

/**
 * Format action name for display
 */
export function formatStrategyAction(strategyAction) {
  const map = {
    'hit': 'Hit',
    'stand': 'Stand',
    'double': 'Double',
    'split': 'Split',
    'surrender': 'Surrender',
  };
  return map[strategyAction] ?? strategyAction;
}
