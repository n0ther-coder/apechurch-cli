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

// Card display with box drawing
const CARD_TOP = '┌─────┐';
const CARD_MID = '│     │';
const CARD_BOT = '└─────┘';

/**
 * Render a single card as ASCII art
 */
export function renderCardArt(card, selected = false) {
  if (card.isEmpty) {
    return [
      '┌─────┐',
      '│  ?  │',
      '│     │',
      '│  ?  │',
      '└─────┘',
    ];
  }
  
  const rank = card.rankName.padEnd(2);
  const suit = card.suitSymbol;
  const isRed = card.suit === 0 || card.suit === 1; // Hearts or Diamonds
  
  const lines = [
    selected ? '┌──▼──┐' : '┌─────┐',
    `│${rank}   │`,
    `│  ${suit}  │`,
    `│   ${rank}│`,
    selected ? '└──▲──┘' : '└─────┘',
  ];
  
  return lines;
}

/**
 * Render a hand of cards as ASCII art
 */
export function renderHandArt(cards, selectedIndices = []) {
  const cardArts = cards.map((card, i) => renderCardArt(card, selectedIndices.includes(i)));
  
  // Combine horizontally
  const lines = [];
  for (let row = 0; row < 5; row++) {
    lines.push(cardArts.map(art => art[row]).join(' '));
  }
  
  // Add index labels below
  const labels = cards.map((_, i) => `   ${i + 1}   `).join(' ');
  lines.push(labels);
  
  return lines.join('\n');
}

/**
 * Simple inline card display
 */
export function formatCard(card) {
  if (card.isEmpty) return '🂠';
  return `${card.rankName}${card.suitSymbol}`;
}

/**
 * Format hand inline
 */
export function formatHandInline(cards) {
  return cards.map(formatCard).join(' ');
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
  lines.push('═'.repeat(50));
  lines.push('  🃏 VIDEO POKER');
  lines.push('═'.repeat(50));
  lines.push('');
  
  // Game info
  lines.push(`  Game ID: ${state.gameId}`);
  lines.push(`  Bet: ${state.betAmountApe} APE`);
  
  if (state.isComplete && state.totalPayoutApe > 0) {
    lines.push(`  Payout: ${state.totalPayoutApe} APE`);
  }
  
  lines.push('');
  
  // Cards
  const cards = state.gameState === GameState.HAND_COMPLETE
    ? (state.finalCards.some(c => !c.isEmpty) ? state.finalCards : state.initialCards)
    : state.initialCards;
  
  if (displayMode === 'simple') {
    lines.push(`  Hand: ${formatHandInline(cards)}`);
  } else {
    lines.push(renderHandArt(cards));
  }
  
  lines.push('');
  
  // Status
  if (state.awaitingRNG) {
    lines.push('  ⏳ Waiting for cards...');
  } else if (state.awaitingDecision) {
    lines.push('  🎯 Choose cards to discard (or keep all)');
  } else if (state.isComplete) {
    const handName = HandStatusNames[state.handStatus];
    if (state.handStatus === HandStatus.NOTHING) {
      lines.push('  ❌ No winning hand');
    } else {
      lines.push(`  🎉 ${handName}! (${PAYOUTS[state.handStatus]}x)`);
    }
  }
  
  lines.push('');
  lines.push('─'.repeat(50));
  
  return lines.join('\n');
}

/**
 * Render discard prompt
 */
export function renderDiscardPrompt() {
  return `
  Enter card positions to discard (1-5), or ENTER to keep all.
  Examples: "1 3 5" discards cards 1, 3, and 5
            "all" discards all cards
            "" (empty) keeps all cards

  Discard: `;
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
