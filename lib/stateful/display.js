/**
 * Display utilities for stateful games
 * ASCII art rendering for cards, tables, and game state
 */

// Card suits (using Unicode symbols)
export const SUITS = {
  0: '♠', // Spades
  1: '♥', // Hearts
  2: '♦', // Diamonds
  3: '♣', // Clubs
};

export const SUIT_NAMES = {
  0: 'Spades',
  1: 'Hearts',
  2: 'Diamonds',
  3: 'Clubs',
};

// Card ranks (0-12 maps to A,2,3,...,10,J,Q,K)
export const RANKS = {
  0: 'A',
  1: '2',
  2: '3',
  3: '4',
  4: '5',
  5: '6',
  6: '7',
  7: '8',
  8: '9',
  9: '10',
  10: 'J',
  11: 'Q',
  12: 'K',
};

export const RANK_NAMES = {
  0: 'Ace',
  1: 'Two',
  2: 'Three',
  3: 'Four',
  4: 'Five',
  5: 'Six',
  6: 'Seven',
  7: 'Eight',
  8: 'Nine',
  9: 'Ten',
  10: 'Jack',
  11: 'Queen',
  12: 'King',
};

/**
 * Parse card from contract format
 * Contract typically encodes as: rank (0-12) + suit (0-3)
 * Exact encoding depends on contract - adjust as needed
 */
export function parseCard(cardValue) {
  // Assuming card = rank * 4 + suit (common encoding)
  // Or card = suit * 13 + rank
  // Will adjust based on actual contract format
  const rank = cardValue % 13;
  const suit = Math.floor(cardValue / 13) % 4;
  return { rank, suit, value: cardValue };
}

/**
 * Get card display string (e.g., "A♠", "10♥")
 */
export function cardToString(card) {
  const { rank, suit } = typeof card === 'number' ? parseCard(card) : card;
  return `${RANKS[rank]}${SUITS[suit]}`;
}

/**
 * Get blackjack value of a card
 */
export function getBlackjackValue(card) {
  const { rank } = typeof card === 'number' ? parseCard(card) : card;
  if (rank === 0) return 11; // Ace (can be 1 or 11)
  if (rank >= 9) return 10; // 10, J, Q, K
  return rank + 1; // 2-9
}

/**
 * Calculate blackjack hand value
 * Returns { value, soft } where soft indicates if ace is counted as 11
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
    soft: aces > 0 && value <= 21, // Soft if still using an ace as 11
    bust: value > 21,
    blackjack: value === 21 && cards.length === 2,
  };
}

/**
 * Render a single card in ASCII (3-line compact format)
 */
export function renderCard(card, faceDown = false) {
  if (faceDown) {
    return [
      '┌─────┐',
      '│░░░░░│',
      '└─────┘',
    ];
  }
  
  const { rank, suit } = typeof card === 'number' ? parseCard(card) : card;
  const rankStr = RANKS[rank];
  const suitStr = SUITS[suit];
  
  // Pad rank for alignment (10 is 2 chars)
  const topRank = rankStr.padEnd(2, ' ');
  const botRank = rankStr.padStart(2, ' ');
  
  return [
    '┌─────┐',
    `│${topRank}${suitStr}  │`,
    '└─────┘',
  ];
}

/**
 * Render multiple cards side by side
 */
export function renderCards(cards, faceDownIndices = []) {
  if (cards.length === 0) return ['', '', ''];
  
  const rendered = cards.map((card, i) => 
    renderCard(card, faceDownIndices.includes(i))
  );
  
  // Combine horizontally with space between
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
 * Render a hand with value display
 */
export function renderHand(cards, label, faceDownIndices = [], showValue = true) {
  const cardLines = renderCards(cards, faceDownIndices);
  const output = [];
  
  output.push(`  ${label}`);
  output.push(`  ${cardLines[0]}`);
  output.push(`  ${cardLines[1]}`);
  output.push(`  ${cardLines[2]}`);
  
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

/**
 * Create a box around content
 */
export function boxContent(lines, title = '', width = 60) {
  const output = [];
  const innerWidth = width - 2;
  
  // Top border with optional title
  if (title) {
    const titlePadded = ` ${title} `;
    const leftPad = Math.floor((innerWidth - titlePadded.length) / 2);
    const rightPad = innerWidth - leftPad - titlePadded.length;
    output.push('╔' + '═'.repeat(leftPad) + titlePadded + '═'.repeat(rightPad) + '╗');
  } else {
    output.push('╔' + '═'.repeat(innerWidth) + '╗');
  }
  
  // Content lines
  for (const line of lines) {
    const padded = line.padEnd(innerWidth, ' ').slice(0, innerWidth);
    output.push('║' + padded + '║');
  }
  
  // Bottom border
  output.push('╚' + '═'.repeat(innerWidth) + '╝');
  
  return output;
}

/**
 * Create action prompt bar
 */
export function renderActions(actions, width = 60) {
  const actionStrs = actions.map(a => `[${a.key}]${a.label}`);
  const line = actionStrs.join('  ');
  return boxContent([line], '', width);
}

/**
 * Format APE amount for display
 */
export function formatApe(amount) {
  if (typeof amount === 'bigint') {
    return (Number(amount) / 1e18).toFixed(4);
  }
  return Number(amount).toFixed(4);
}

/**
 * Clear screen (for REPL mode)
 */
export function clearScreen() {
  process.stdout.write('\x1Bc');
}

/**
 * Color helpers (ANSI codes)
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
 * Colorize text (no-op if NO_COLOR env is set)
 */
export function colorize(text, color) {
  if (process.env.NO_COLOR) return text;
  return `${colors[color] || ''}${text}${colors.reset}`;
}
