/**
 * @fileoverview Display utilities for stateful games
 *
 * Provides ASCII art rendering for card games:
 * - Card parsing (from contract rawCard format)
 * - Card rendering (single cards and hands)
 * - Hand value calculation (blackjack rules)
 * - Box layouts and action prompts
 * - Terminal colors and formatting
 *
 * Card Encoding (from contract):
 * - rawCard is 0-51 (standard 52-card deck)
 * - cardNumber = (rawCard % 13) + 1 → 1=A, 2-10, 11=J, 12=Q, 13=K
 * - suit = floor(rawCard / 13) → 0=♦, 1=♥, 2=♣, 3=♠
 *
 * @module lib/stateful/display
 */

// ============================================================================
// CARD CONSTANTS
// ============================================================================

/**
 * Suit symbols indexed by contract suit value (0-3)
 * Order matches contract: Diamonds, Hearts, Clubs, Spades
 * @type {Object<number, string>}
 */
export const SUITS = {
  0: '♦', // Diamonds (red)
  1: '♥', // Hearts (red)
  2: '♣', // Clubs (black)
  3: '♠', // Spades (black)
};

/**
 * Full suit names for verbose output
 * @type {Object<number, string>}
 */
export const SUIT_NAMES = {
  0: 'Diamonds',
  1: 'Hearts',
  2: 'Clubs',
  3: 'Spades',
};

/**
 * Rank symbols indexed by card number (1-13)
 * 1=Ace through 13=King
 * @type {Object<number, string>}
 */
export const RANKS = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
};

/**
 * Full rank names for verbose output
 * @type {Object<number, string>}
 */
export const RANK_NAMES = {
  1: 'Ace',
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
  10: 'Ten',
  11: 'Jack',
  12: 'Queen',
  13: 'King',
};

// ============================================================================
// CARD PARSING
// ============================================================================

/**
 * Parse card from contract rawCard format
 *
 * @param {number} rawCard - Raw card value 0-51
 * @returns {Object} { rank: 1-13, suit: 0-3, rawCard }
 *
 * @example
 * parseCard(0)   // { rank: 1, suit: 0, rawCard: 0 }  → A♦
 * parseCard(13)  // { rank: 1, suit: 1, rawCard: 13 } → A♥
 * parseCard(51)  // { rank: 13, suit: 3, rawCard: 51 } → K♠
 */
export function parseCard(rawCard) {
  const rank = (rawCard % 13) + 1;     // 1-13 (Ace=1, King=13)
  const suit = Math.floor(rawCard / 13); // 0-3
  return { rank, suit, rawCard };
}

/**
 * Parse card from contract Card struct
 *
 * Contract structs include a pre-calculated blackjack value.
 * struct Card { uint8 value; uint8 rawCard; }
 *
 * @param {Object} card - Card struct from contract
 * @param {number} card.value - Blackjack value (2-11)
 * @param {number} card.rawCard - Raw card encoding (0-51)
 * @returns {Object} { rank, suit, value, rawCard }
 */
export function parseCardStruct(card) {
  return {
    rank: (card.rawCard % 13) + 1,
    suit: Math.floor(card.rawCard / 13),
    value: card.value,   // Contract-provided blackjack value
    rawCard: card.rawCard,
  };
}

/**
 * Get card display string (e.g., "A♦", "10♥", "K♠")
 *
 * @param {number|Object} card - rawCard number or parsed card object
 * @returns {string} Card string like "A♦" or "10♥"
 *
 * @example
 * cardToString(0)                    // "A♦"
 * cardToString({ rank: 10, suit: 1 }) // "10♥"
 */
export function cardToString(card) {
  const parsed = typeof card === 'number' ? parseCard(card) : card;
  return `${RANKS[parsed.rank]}${SUITS[parsed.suit]}`;
}

// ============================================================================
// BLACKJACK VALUE CALCULATION
// ============================================================================

/**
 * Get blackjack value of a single card
 *
 * Blackjack values:
 * - Ace (rank 1) = 11 (can be reduced to 1 if hand busts)
 * - 2-9 = face value
 * - 10, J, Q, K = 10
 *
 * @param {number|Object} card - rawCard or card object
 * @returns {number} Blackjack value (2-11)
 *
 * @example
 * getBlackjackValue({ rank: 1 })  // 11 (Ace)
 * getBlackjackValue({ rank: 11 }) // 10 (Jack)
 */
export function getBlackjackValue(card) {
  // If contract struct with pre-calculated value, use it
  if (card && typeof card.value === 'number' && card.value > 0) {
    return card.value;
  }

  // Calculate from rank
  const parsed = typeof card === 'number' ? parseCard(card) : card;
  if (parsed.rank === 1) return 11;   // Ace
  if (parsed.rank >= 10) return 10;   // 10, J, Q, K
  return parsed.rank;                  // 2-9
}

/**
 * Calculate blackjack hand value with soft/bust detection
 *
 * Implements standard blackjack counting:
 * - Sum all card values (Aces as 11)
 * - If bust (>21), reduce Aces from 11 to 1 until not bust or no Aces
 *
 * @param {Array} cards - Array of card objects or rawCard numbers
 * @returns {Object} { value, soft, bust, blackjack }
 *
 * @example
 * calculateHandValue([{ rank: 1 }, { rank: 10 }])
 * // { value: 21, soft: true, bust: false, blackjack: true }
 *
 * calculateHandValue([{ rank: 7 }, { rank: 8 }, { rank: 9 }])
 * // { value: 24, soft: false, bust: true, blackjack: false }
 */
export function calculateHandValue(cards) {
  let value = 0;
  let aces = 0;

  for (const card of cards) {
    const cardVal = getBlackjackValue(card);
    if (cardVal === 11) aces++;
    value += cardVal;
  }

  // Reduce aces from 11 to 1 if over 21
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }

  return {
    value,
    soft: aces > 0 && value <= 21,          // Using an Ace as 11
    bust: value > 21,
    blackjack: value === 21 && cards.length === 2, // Natural 21
  };
}

// ============================================================================
// CARD RENDERING (ASCII ART)
// ============================================================================

/**
 * Render a single card in compact ASCII format (3 lines)
 *
 * @param {number|Object} card - rawCard or card object
 * @param {boolean} [faceDown=false] - Render face-down (hidden)
 * @returns {string[]} Array of 3 strings for each line of the card
 *
 * @example
 * renderCard({ rank: 1, suit: 3 })
 * // ['┌─────┐', '│A ♠  │', '└─────┘']
 *
 * renderCard(null, true) // Face-down
 * // ['┌─────┐', '│░░░░░│', '└─────┘']
 */
export function renderCard(card, faceDown = false) {
  if (faceDown) {
    return [
      '┌─────┐',
      '│░░░░░│',
      '└─────┘',
    ];
  }

  // Handle different input types
  let parsed;
  if (typeof card === 'number') {
    parsed = parseCard(card);
  } else if (card.rawCard !== undefined) {
    parsed = parseCardStruct(card);
  } else {
    parsed = card;
  }

  const rankStr = RANKS[parsed.rank];
  const suitStr = SUITS[parsed.suit];

  // Pad rank for alignment (10 is 2 chars, others are 1)
  const topRank = rankStr.padEnd(2, ' ');

  return [
    '┌─────┐',
    `│${topRank}${suitStr}  │`,
    '└─────┘',
  ];
}

/**
 * Render multiple cards side by side
 *
 * @param {Array} cards - Array of cards to render
 * @param {number[]} [faceDownIndices=[]] - Indices of cards to render face-down
 * @returns {string[]} Array of 3 strings for horizontal card layout
 *
 * @example
 * renderCards([{ rank: 1, suit: 0 }, { rank: 10, suit: 2 }])
 * // ['┌─────┐ ┌─────┐', '│A ♦  │ │10♣  │', '└─────┘ └─────┘']
 */
export function renderCards(cards, faceDownIndices = []) {
  if (cards.length === 0) return ['', '', ''];

  const rendered = cards.map((card, i) =>
    renderCard(card, faceDownIndices.includes(i))
  );

  // Combine horizontally with space between cards
  const lines = ['', '', ''];
  for (let i = 0; i < rendered.length; i++) {
    const sep = i > 0 ? ' ' : '';
    lines[0] += sep + rendered[i][0];
    lines[1] += sep + rendered[i][1];
    lines[2] += sep + rendered[i][2];
  }

  return lines;
}

/**
 * Render a labeled hand with optional value display
 *
 * @param {Array} cards - Array of cards in the hand
 * @param {string} label - Hand label (e.g., "Player", "Dealer")
 * @param {number[]} [faceDownIndices=[]] - Cards to hide
 * @param {boolean} [showValue=true] - Show calculated hand value
 * @returns {string[]} Array of strings for complete hand display
 */
export function renderHand(cards, label, faceDownIndices = [], showValue = true) {
  const cardLines = renderCards(cards, faceDownIndices);
  const output = [];

  output.push(`  ${label}`);
  output.push(`  ${cardLines[0]}`);
  output.push(`  ${cardLines[1]}`);
  output.push(`  ${cardLines[2]}`);

  // Add value display if all cards visible
  if (showValue && faceDownIndices.length === 0) {
    const handInfo = calculateHandValue(cards);
    let valueStr = `= ${handInfo.value}`;
    if (handInfo.blackjack) valueStr += ' (Blackjack!)';
    else if (handInfo.soft) valueStr += ' (soft)';
    else if (handInfo.bust) valueStr += ' (BUST)';
    output[2] = output[2] + `  ${valueStr}`;
  }

  return output;
}

// ============================================================================
// LAYOUT UTILITIES
// ============================================================================

/**
 * Create a box around content with optional title
 *
 * Uses Unicode box-drawing characters for clean display.
 *
 * @param {string[]} lines - Content lines to box
 * @param {string} [title=''] - Optional title for top border
 * @param {number} [width=60] - Total box width
 * @returns {string[]} Boxed content
 *
 * @example
 * boxContent(['Hello', 'World'], 'GREETING', 20)
 * // ['╔══ GREETING ═══╗', '║Hello           ║', '║World           ║', '╚════════════════╝']
 */
export function boxContent(lines, title = '', width = 60) {
  const output = [];
  const innerWidth = width - 2;

  // Top border with optional centered title
  if (title) {
    const titlePadded = ` ${title} `;
    const leftPad = Math.floor((innerWidth - titlePadded.length) / 2);
    const rightPad = innerWidth - leftPad - titlePadded.length;
    output.push('╔' + '═'.repeat(leftPad) + titlePadded + '═'.repeat(rightPad) + '╗');
  } else {
    output.push('╔' + '═'.repeat(innerWidth) + '╗');
  }

  // Content lines (padded/truncated to fit)
  for (const line of lines) {
    const padded = line.padEnd(innerWidth, ' ').slice(0, innerWidth);
    output.push('║' + padded + '║');
  }

  // Bottom border
  output.push('╚' + '═'.repeat(innerWidth) + '╝');

  return output;
}

/**
 * Render action prompt bar
 *
 * Displays available actions in a boxed format.
 *
 * @param {Array<{key: string, label: string}>} actions - Available actions
 * @param {number} [width=60] - Box width
 * @returns {string[]} Boxed action bar
 *
 * @example
 * renderActions([{ key: 'H', label: 'it' }, { key: 'S', label: 'tand' }])
 * // Displays: "[H]it  [S]tand"
 */
export function renderActions(actions, width = 60) {
  const actionStrs = actions.map(a => `[${a.key}]${a.label}`);
  const line = actionStrs.join('  ');
  return boxContent([line], '', width);
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format APE amount for display (4 decimal places)
 *
 * @param {bigint|number|string} amount - Amount to format
 * @returns {string} Formatted string like "10.0000"
 */
export function formatApe(amount) {
  if (typeof amount === 'bigint') {
    return (Number(amount) / 1e18).toFixed(4);
  }
  return Number(amount).toFixed(4);
}

/**
 * Clear terminal screen (for REPL mode refresh)
 *
 * Uses ANSI escape code to reset terminal.
 */
export function clearScreen() {
  process.stdout.write('\x1Bc');
}

// ============================================================================
// TERMINAL COLORS (now via theme.js)
// ============================================================================

import { theme, chalk, colorsEnabled } from '../theme.js';

/**
 * Legacy ANSI color codes - kept for backward compatibility.
 * Prefer using theme.* from lib/theme.js for new code.
 * @type {Object<string, string>}
 * @deprecated Use theme.* instead
 */
export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

/**
 * Apply color to text (respects NO_COLOR env var)
 * @deprecated Use theme.* functions instead
 */
export function colorize(text, color) {
  if (process.env.NO_COLOR) return text;
  return `${colors[color] || ''}${text}${colors.reset}`;
}

/**
 * Render a card with colored suit (red for hearts/diamonds)
 *
 * @param {number|Object} card - rawCard or card object
 * @param {boolean} [faceDown=false] - Render face-down
 * @returns {string[]} Card lines with ANSI colors
 */
export function renderColoredCard(card, faceDown = false) {
  if (faceDown) {
    return [
      theme.cardBack('┌─────┐'),
      theme.cardBack('│░░░░░│'),
      theme.cardBack('└─────┘'),
    ];
  }

  let parsed;
  if (typeof card === 'number') {
    parsed = parseCard(card);
  } else if (card.rawCard !== undefined) {
    parsed = parseCardStruct(card);
  } else {
    parsed = card;
  }

  const rankStr = RANKS[parsed.rank];
  const suitStr = SUITS[parsed.suit];
  const isRed = parsed.suit === 0 || parsed.suit === 1; // ♦ ♥
  const colorFn = isRed ? theme.cardRed : theme.cardBlack;

  const topRank = rankStr.padEnd(2, ' ');

  return [
    '┌─────┐',
    `│${colorFn(topRank + suitStr)}  │`,
    '└─────┘',
  ];
}

/**
 * Render multiple cards with colors
 */
export function renderColoredCards(cards, faceDownIndices = []) {
  if (cards.length === 0) return ['', '', ''];

  const rendered = cards.map((card, i) =>
    renderColoredCard(card, faceDownIndices.includes(i))
  );

  const lines = ['', '', ''];
  for (let i = 0; i < rendered.length; i++) {
    const sep = i > 0 ? ' ' : '';
    lines[0] += sep + rendered[i][0];
    lines[1] += sep + rendered[i][1];
    lines[2] += sep + rendered[i][2];
  }

  return lines;
}

// Re-export theme for convenience
export { theme, chalk };
