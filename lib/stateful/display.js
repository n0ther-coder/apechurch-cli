/**
 * Display utilities for stateful games
 * ASCII art rendering for cards, tables, and game state
 */

// Card suits (using Unicode symbols)
// Suit index = floor(rawCard / 13)
export const SUITS = {
  0: '♦', // Diamonds
  1: '♥', // Hearts
  2: '♣', // Clubs
  3: '♠', // Spades
};

export const SUIT_NAMES = {
  0: 'Diamonds',
  1: 'Hearts',
  2: 'Clubs',
  3: 'Spades',
};

// Card ranks (1-13 from contract: cardNumber = (rawCard % 13) + 1)
// 1=Ace, 2-10, 11=Jack, 12=Queen, 13=King
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

/**
 * Parse card from contract rawCard format
 * rawCard is 0-51 (standard 52-card deck)
 * cardNumber = (rawCard % 13) + 1  → 1=A, 2-10, 11=J, 12=Q, 13=K
 * suit = floor(rawCard / 13)       → 0=♦, 1=♥, 2=♣, 3=♠
 */
export function parseCard(rawCard) {
  const rank = (rawCard % 13) + 1;  // 1-13
  const suit = Math.floor(rawCard / 13);  // 0-3
  return { rank, suit, rawCard };
}

/**
 * Parse card from contract Card struct
 * Card struct has { value: uint8, rawCard: uint8 }
 */
export function parseCardStruct(card) {
  return {
    rank: (card.rawCard % 13) + 1,
    suit: Math.floor(card.rawCard / 13),
    value: card.value,  // Blackjack value (2-11)
    rawCard: card.rawCard,
  };
}

/**
 * Get card display string (e.g., "A♦", "10♥")
 * Accepts rawCard number or parsed card object
 */
export function cardToString(card) {
  const parsed = typeof card === 'number' ? parseCard(card) : card;
  return `${RANKS[parsed.rank]}${SUITS[parsed.suit]}`;
}

/**
 * Get blackjack value of a card
 * Contract already provides this in Card.value, but useful for raw cards
 * Rank 1=Ace(11), 2-9=face, 10-13=10
 */
export function getBlackjackValue(card) {
  // If card struct with value, use it directly
  if (card && typeof card.value === 'number' && card.value > 0) {
    return card.value;
  }
  // Parse from rawCard
  const parsed = typeof card === 'number' ? parseCard(card) : card;
  if (parsed.rank === 1) return 11; // Ace
  if (parsed.rank >= 10) return 10; // 10, J, Q, K
  return parsed.rank; // 2-9
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
 * Accepts rawCard number, Card struct, or parsed card object
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
  
  // Pad rank for alignment (10 is 2 chars)
  const topRank = rankStr.padEnd(2, ' ');
  
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
