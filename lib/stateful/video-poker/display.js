/**
 * Video Poker Display
 * Card rendering, hand display, prompts
 */
import {
  GameState,
  HandStatus,
  HandStatusNames,
  PAYOUTS,
  BET_AMOUNTS,
  RANKS,
  SUITS,
} from './constants.js';
import { formatEther } from 'viem';

/**
 * Format a single card in bracket notation: [Q♣]
 */
export function formatCard(card) {
  if (card.isEmpty) return '[??]';
  return `[${card.rankName}${card.suitSymbol}]`;
}

/**
 * Format card with position number: 1:[Q♣]
 */
export function formatCardWithPosition(card, position) {
  if (card.isEmpty) return `${position}:[??]`;
  return `${position}:[${card.rankName}${card.suitSymbol}]`;
}

/**
 * Format hand inline: [Q♣] [J♥] [7♦] [7♠] [3♣]
 */
export function formatHandInline(cards) {
  return cards.map(formatCard).join(' ');
}

/**
 * Format hand with position numbers for selection
 * 1:[Q♣]  2:[J♥]  3:[7♦]  4:[7♠]  5:[3♣]
 */
export function formatHandWithPositions(cards) {
  return cards.map((card, i) => formatCardWithPosition(card, i + 1)).join('  ');
}

/**
 * Render full game state
 */
export function renderGame(state, opts = {}) {
  const displayMode = opts.displayMode || 'full';
  
  if (displayMode === 'json') {
    return JSON.stringify(state, null, 2);
  }
  
  const lines = [];
  
  // Header (don't show gameId - too long)
  lines.push('');
  lines.push('─'.repeat(40));
  lines.push(`  🃏 VIDEO POKER  │  Bet: ${state.betAmountApe} APE`);
  lines.push('─'.repeat(40));
  lines.push('');
  
  // Cards - determine which to show
  const cards = state.gameState === GameState.HAND_COMPLETE
    ? (state.finalCards.some(c => !c.isEmpty) ? state.finalCards : state.initialCards)
    : state.initialCards;
  
  // Show cards with positions if awaiting decision, otherwise just cards
  if (state.awaitingDecision) {
    lines.push(`  ${formatHandWithPositions(cards)}`);
  } else {
    lines.push(`  ${formatHandInline(cards)}`);
  }
  
  lines.push('');
  
  // Status
  if (state.awaitingRNG) {
    lines.push('  ⏳ Waiting for cards...');
  } else if (state.awaitingDecision) {
    // Show hint about current hand
    const handHint = detectHandHint(cards);
    if (handHint) {
      lines.push(`  📊 Current: ${handHint}`);
    }
  } else if (state.isComplete) {
    const handName = HandStatusNames[state.handStatus];
    if (state.handStatus === HandStatus.NOTHING) {
      lines.push('  ❌ No winning hand');
    } else {
      const payout = state.totalPayoutApe;
      lines.push(`  🎉 ${handName}! → ${payout} APE (${PAYOUTS[state.handStatus]}x)`);
    }
  }
  
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Detect current hand for hint display with payout info
 */
function detectHandHint(cards) {
  // Count ranks and suits
  const ranks = {};
  const suits = {};
  
  for (const card of cards) {
    if (card.isEmpty) continue;
    ranks[card.rank] = (ranks[card.rank] || 0) + 1;
    suits[card.suit] = (suits[card.suit] || 0) + 1;
  }
  
  const counts = Object.values(ranks).sort((a, b) => b - a);
  const maxSuit = Math.max(...Object.values(suits));
  
  // Check for straight (need sorted unique ranks)
  const rankNums = cards.map(c => c.rank).sort((a, b) => a - b);
  const isSequential = rankNums.every((r, i) => i === 0 || r === rankNums[i-1] + 1);
  // Also check ace-low straight: A,2,3,4,5
  const isLowStraight = rankNums.join(',') === '1,2,3,4,5';
  // And ace-high straight: 10,J,Q,K,A
  const isHighStraight = rankNums.join(',') === '1,10,11,12,13';
  const isStraight = isSequential || isLowStraight || isHighStraight;
  
  // Check for royal flush (10,J,Q,K,A of same suit)
  if (maxSuit === 5 && isHighStraight) {
    return 'Royal Flush (250x)';
  }
  
  // Straight flush
  if (maxSuit === 5 && isStraight) {
    return 'Straight Flush (50x)';
  }
  
  // Four of a kind
  if (counts[0] === 4) return 'Four of a Kind (25x)';
  
  // Full house
  if (counts[0] === 3 && counts[1] === 2) return 'Full House (9x)';
  
  // Flush
  if (maxSuit === 5) return 'Flush (6x)';
  
  // Straight
  if (isStraight) return 'Straight (4x)';
  
  // Three of a kind
  if (counts[0] === 3) return 'Three of a Kind (3x)';
  
  // Two pair
  if (counts[0] === 2 && counts[1] === 2) return 'Two Pair (2x)';
  
  // Pair - check if Jacks or better
  if (counts[0] === 2) {
    for (const [rank, count] of Object.entries(ranks)) {
      const r = parseInt(rank);
      // Jacks (11), Queens (12), Kings (13), Aces (1)
      if (count === 2 && (r >= 11 || r === 1)) {
        const pairName = r === 1 ? 'Aces' : r === 11 ? 'Jacks' : r === 12 ? 'Queens' : 'Kings';
        return `Pair of ${pairName} (1x)`;
      }
    }
    return 'Low Pair (no payout)';
  }
  
  // Check for draws (helpful info)
  if (maxSuit === 4) return '4 to Flush (no payout)';
  
  // High card
  const hasHighCard = rankNums.some(r => r >= 11 || r === 1);
  if (hasHighCard) return 'High Card (no payout)';
  
  return 'Nothing (no payout)';
}

/**
 * Render hold prompt (select cards to KEEP, rest are discarded)
 */
export function renderHoldPrompt() {
  return `  Hold which? (e.g. "2 4" keeps cards 2 & 4, or ENTER for all): `;
}

/**
 * Format the hold/discard confirmation message
 */
export function formatHoldConfirmation(cards, cardsToRedraw) {
  const holding = [];
  const discarding = [];
  
  cards.forEach((card, i) => {
    const formatted = `[${card.rankName}${card.suitSymbol}]`;
    if (cardsToRedraw[i]) {
      discarding.push(formatted);
    } else {
      holding.push(formatted);
    }
  });
  
  const lines = [];
  if (holding.length > 0) {
    lines.push(`  ✓ Holding: ${holding.join(' ')}`);
  }
  if (discarding.length > 0) {
    lines.push(`  ✗ Discarding: ${discarding.join(' ')}`);
  }
  return lines.join('\n');
}

/**
 * Check if hand is a winner (Jacks or better)
 */
export function isWinningHand(handStatus) {
  return handStatus >= 1; // HandStatus.JACKS_OR_BETTER = 1
}

/**
 * Parse hold input - user selects cards to KEEP, rest are discarded
 * Returns array of booleans: true = redraw this card, false = keep it
 */
export function parseHoldInput(input) {
  const trimmed = input.trim().toLowerCase();
  
  // ENTER or "all" = keep all cards (no redraws)
  if (trimmed === '' || trimmed === 'all' || trimmed === 'keep') {
    return [false, false, false, false, false];
  }
  
  // "none" = discard all (redraw everything)
  if (trimmed === 'none') {
    return [true, true, true, true, true];
  }
  
  // Parse numbers - these are cards to HOLD
  // Start with all cards marked for redraw
  const cardsToRedraw = [true, true, true, true, true];
  const numbers = trimmed.split(/[\s,]+/).filter(Boolean);
  
  for (const num of numbers) {
    const index = parseInt(num, 10) - 1; // Convert to 0-indexed
    if (index >= 0 && index < 5) {
      cardsToRedraw[index] = false; // DON'T redraw cards they want to hold
    }
  }
  
  return cardsToRedraw;
}

/**
 * Render payout table
 */
export function renderPayoutTable() {
  return `
┌────────────────────┬────────┐
│ Hand               │ Payout │
├────────────────────┼────────┤
│ Royal Flush        │  250x  │
│ Straight Flush     │   50x  │
│ Four of a Kind     │   25x  │
│ Full House         │    9x  │
│ Flush              │    6x  │
│ Straight           │    4x  │
│ Three of a Kind    │    3x  │
│ Two Pair           │    2x  │
│ Jacks or Better    │    1x  │
└────────────────────┴────────┘
  * Max bet (100 APE) = Jackpot eligible on Royal Flush
`;
}
