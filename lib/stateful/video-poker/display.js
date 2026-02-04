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
  
  // Header
  lines.push('');
  lines.push('─'.repeat(50));
  lines.push(`  🃏 VIDEO POKER  │  Bet: ${state.betAmountApe} APE  │  Game #${state.gameId}`);
  lines.push('─'.repeat(50));
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
 * Detect current hand for hint display
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
  
  // Detect patterns
  if (counts[0] === 4) return 'Four of a Kind';
  if (counts[0] === 3 && counts[1] === 2) return 'Full House';
  if (maxSuit === 5) return 'Flush';
  if (counts[0] === 3) return 'Three of a Kind';
  if (counts[0] === 2 && counts[1] === 2) return 'Two Pair';
  if (counts[0] === 2) {
    // Check if pair is Jacks or better
    for (const [rank, count] of Object.entries(ranks)) {
      if (count === 2 && (parseInt(rank) >= 11 || parseInt(rank) === 1)) {
        return 'Pair (Jacks+)';
      }
    }
    return 'Low Pair';
  }
  
  // Check for straight draw
  const rankNums = cards.map(c => c.rank).sort((a, b) => a - b);
  const isConsecutive = rankNums.every((r, i) => i === 0 || r === rankNums[i-1] + 1);
  if (isConsecutive) return 'Straight';
  
  // Check for 4 to a flush
  if (maxSuit === 4) return '4 to Flush';
  
  return null;
}

/**
 * Render discard prompt
 */
export function renderDiscardPrompt() {
  return `  Discard which? (1-5, space-separated, or ENTER to keep all): `;
}

/**
 * Format the discard confirmation message
 */
export function formatDiscardConfirmation(cards, cardsToRedraw) {
  const keeping = [];
  const discarding = [];
  
  cards.forEach((card, i) => {
    const formatted = `[${card.rankName}${card.suitSymbol}]`;
    if (cardsToRedraw[i]) {
      discarding.push(formatted);
    } else {
      keeping.push(formatted);
    }
  });
  
  const lines = [];
  if (keeping.length > 0) {
    lines.push(`  ✓ Keeping: ${keeping.join(' ')}`);
  }
  if (discarding.length > 0) {
    lines.push(`  ✗ Discarding: ${discarding.join(' ')}`);
  }
  return lines.join('\n');
}

/**
 * Parse discard input
 */
export function parseDiscardInput(input) {
  const trimmed = input.trim().toLowerCase();
  
  // Keep all
  if (trimmed === '' || trimmed === 'none' || trimmed === 'keep') {
    return [false, false, false, false, false];
  }
  
  // Discard all
  if (trimmed === 'all') {
    return [true, true, true, true, true];
  }
  
  // Parse numbers
  const cardsToRedraw = [false, false, false, false, false];
  const numbers = trimmed.split(/[\s,]+/).filter(Boolean);
  
  for (const num of numbers) {
    const index = parseInt(num, 10) - 1; // Convert to 0-indexed
    if (index >= 0 && index < 5) {
      cardsToRedraw[index] = true;
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
