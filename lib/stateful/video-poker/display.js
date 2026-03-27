/**
 * Video Poker Display
 * Card rendering, hand display, prompts
 */
import {
  GameState,
  HandStatus,
  HandStatusNames,
  PAYOUTS,
  RANKS,
  SUITS,
} from './constants.js';

const BOX_CONTENT_WIDTH = 26;
const CARD_CELL_WIDTH = 4;
const CARD_COUNT = 5;
const CARD_ROW_TOP = `┌${Array(CARD_COUNT).fill('─'.repeat(CARD_CELL_WIDTH)).join('┬')}┐`;
const CARD_ROW_MID = `├${Array(CARD_COUNT).fill('─'.repeat(CARD_CELL_WIDTH)).join('┼')}┤`;
const CARD_ROW_BOTTOM = `└${Array(CARD_COUNT).fill('─'.repeat(CARD_CELL_WIDTH)).join('┴')}┘`;

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
  
  switch (displayMode) {
    case 'json':
      return renderGameJson(state);
    case 'simple':
      return renderGameSimple(state, opts);
    case 'full':
    default:
      return renderGameFull(state, opts);
  }
}

function renderGameSimple(state, opts = {}) {
  const showHeader = opts.showHeader !== false;
  const lines = [];
  const cards = getVisibleCards(state);
  const handHint = state.awaitingDecision ? detectHandHint(cards) : null;

  lines.push('');
  if (showHeader) {
    const gameLabel = opts.gameLabel ? `  |  ${opts.gameLabel}` : '';
    const header = `  🃏 VIDEO POKER  │  Bet: ${state.betAmountApe} APE${gameLabel}`;
    const divider = '─'.repeat(Math.ceil(header.length * 1.2));
    lines.push(divider);
    lines.push(header);
    lines.push(divider);
    lines.push('');
  }

  if (state.awaitingDecision) {
    lines.push(formatDecisionCardsLine(cards, handHint));
    if (opts.suggestionLine) {
      lines.push('');
      lines.push(`  ? ${opts.suggestionLine}`);
    }
  } else {
    lines.push(`  ${formatHandInline(cards)}`);
  }

  lines.push('');

  if (state.awaitingRNG) {
    lines.push('  ⏳ Waiting for cards...');
  } else if (state.isComplete) {
    if (state.handStatus === HandStatus.NOTHING) {
      lines.push('  💀 No winning hand');
    } else {
      const payout = state.totalPayoutApe;
      lines.push(`  🎉 ${HandStatusNames[state.handStatus]}! → ${payout} APE (${PAYOUTS[state.handStatus]}x)`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function renderGameFull(state, opts = {}) {
  const lines = [
    createTopBorder('VIDEO POKER'),
    boxLine(''),
  ];

  const gameLabel = formatBoxGameLabel(opts.gameLabel);
  if (gameLabel) {
    lines.push(boxLine(gameLabel));
  }

  const cards = getVisibleCards(state);
  const hasCards = cards.some((card) => !card?.isEmpty);

  if (hasCards) {
    lines.push(...buildCardTableBoxLines(cards));
  }

  if (state.awaitingRNG) {
    lines.push(boxLine('→ Waiting for cards...'));
  } else if (state.awaitingDecision) {
    lines.push(boxLine(`→ ${detectHandHint(cards)}`));
    if (opts.suggestionLine) {
      lines.push(boxLine(`? ${opts.suggestionLine}`));
    }
  }

  lines.push(createBottomBorder());

  if (state.isComplete) {
    lines.push(formatOutcomeFooter(state));
  }

  return lines.join('\n');
}

export function renderGameFullDecisionStart(state, opts = {}) {
  const lines = [
    createTopBorder('VIDEO POKER'),
    boxLine(''),
  ];

  const gameLabel = formatBoxGameLabel(opts.gameLabel);
  if (gameLabel) {
    lines.push(boxLine(gameLabel));
  }

  const cards = getVisibleCards(state);
  lines.push(...buildCardTableBoxLines(cards));
  lines.push(boxLine(`→ ${detectHandHint(cards)}`));

  if (opts.suggestionLine) {
    lines.push(boxLine(`? ${opts.suggestionLine}`));
  }

  lines.push(createMiddleBorder());
  return lines.join('\n');
}

export function renderGameFullDecisionEndAuto(state, opts = {}) {
  const cards = getVisibleCards(state);
  const holdMarkers = Array.isArray(opts.hold)
    ? opts.hold.map((value) => Boolean(value))
    : Array(CARD_COUNT).fill(false);

  return [
    ...buildCardTableBoxLines(cards, { holdMarkers }),
    createBottomBorder(),
  ].join('\n');
}

export function renderGameFullDecisionEndInteractive(state, opts = {}) {
  const cards = getVisibleCards(state);
  const holdMarkers = Array.isArray(opts.hold)
    ? opts.hold.map((value) => Boolean(value))
    : Array(CARD_COUNT).fill(false);

  return [
    ...buildCardTableBoxLines(cards, { holdMarkers }),
    createBottomBorder(),
  ].join('\n');
}

export function renderGameFullPromptLine(promptText = 'Hold which? (e.g. "2 4")') {
  return boxLine(promptText);
}

export function formatOutcomeFooter(state) {
  if (!state?.isComplete || state.handStatus === HandStatus.NOTHING) {
    return '💀 No winning hand';
  }

  return `🎉 ${HandStatusNames[state.handStatus]}! → ${state.totalPayoutApe} APE (${PAYOUTS[state.handStatus]}x)`;
}

function formatDecisionCardsLine(cards, handHint) {
  const cardsLine = `  ${formatHandWithPositions(cards)}`;

  if (!handHint) {
    return cardsLine;
  }

  return `${cardsLine.padEnd(cardsLine.length + 2)}📊  ${handHint}`;
}

function renderGameJson(state) {
  return JSON.stringify(
    state,
    (_, value) => (typeof value === 'bigint' ? value.toString() : value),
    2
  );
}

function getVisibleCards(state) {
  if (state.gameState === GameState.HAND_COMPLETE) {
    return state.finalCards.some((card) => !card.isEmpty) ? state.finalCards : state.initialCards;
  }

  return state.initialCards;
}

function createTopBorder(title) {
  const titleText = ` ${title} `;
  const innerWidth = BOX_CONTENT_WIDTH + 2;
  const left = Math.floor((innerWidth - titleText.length) / 2);
  const right = innerWidth - titleText.length - left;
  return `╔${'═'.repeat(left)}${titleText}${'═'.repeat(right)}╗`;
}

function createMiddleBorder() {
  return `╠${'═'.repeat(BOX_CONTENT_WIDTH + 2)}╣`;
}

function createBottomBorder() {
  return `╚${'═'.repeat(BOX_CONTENT_WIDTH + 2)}╝`;
}

function boxLine(text = '') {
  return `║ ${fitBoxText(text)} ║`;
}

function fitBoxText(text) {
  return String(text || '').padEnd(BOX_CONTENT_WIDTH, ' ').slice(0, BOX_CONTENT_WIDTH);
}

function centerCell(text) {
  const value = String(text || '');
  return value.padStart(CARD_CELL_WIDTH - 1, ' ').padEnd(CARD_CELL_WIDTH, ' ').slice(0, CARD_CELL_WIDTH);
}

function normalizeCards(cards) {
  const normalized = Array.isArray(cards) ? cards.slice(0, CARD_COUNT) : [];
  while (normalized.length < CARD_COUNT) {
    normalized.push({ isEmpty: true });
  }
  return normalized;
}

function buildCardTableBoxLines(cards, opts = {}) {
  const normalizedCards = normalizeCards(cards);
  const lines = [CARD_ROW_TOP];

  if (opts.holdMarkers) {
    lines.push(buildCardTableRow(opts.holdMarkers.map((value) => (value ? '✔' : ''))));
    lines.push(CARD_ROW_MID);
  }

  lines.push(buildCardTableRow(normalizedCards.map(getSuitText)));
  lines.push(buildCardTableRow(normalizedCards.map(getRankText)));
  lines.push(CARD_ROW_BOTTOM);

  return lines.map(boxLine);
}

function buildCardTableRow(values) {
  return `│${values.map((value) => centerCell(value)).join('│')}│`;
}

function getRankText(card) {
  if (!card || card.isEmpty) return '';
  return card.rankName || RANKS[card.rank] || '';
}

function getSuitText(card) {
  if (!card || card.isEmpty) return '';
  return card.suitSymbol || SUITS[card.suit] || '';
}

function formatBoxGameLabel(gameLabel) {
  if (!gameLabel) return null;
  return gameLabel.toUpperCase().replace(/\s*\/\s*/g, '/');
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
  return `  Hold which? (e.g. "2 4" or "1 2 3 4 5" for all, ENTER = discard all): `;
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
 * ENTER = hold nothing = discard all
 */
export function parseHoldInput(input) {
  const trimmed = input.trim().toLowerCase();
  
  // ENTER or "none" = hold nothing = discard all 5 cards
  if (trimmed === '' || trimmed === 'none') {
    return [true, true, true, true, true];
  }
  
  // "all" = hold all cards (no redraws)
  if (trimmed === 'all') {
    return [false, false, false, false, false];
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
