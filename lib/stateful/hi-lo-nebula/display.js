/**
 * Hi-Lo Nebula display helpers.
 */
import { resolveGameDisplayName } from '../../../registry.js';
import { fitAnsiText, getVisibleWidth, truncateAnsi } from '../../ansi.js';
import { formatNetProfitLabel, formatOutcomeIcon } from '../../theme.js';
import { formatGuessLabel, formatGuessShortLabel, formatMultiplier, getNetProfitApe } from './state.js';
import { HI_LO_NEBULA_CONTRACT } from './constants.js';

const BOX_CONTENT_WIDTH = 63;
const COLUMN_WIDTHS = [22, 15, 22];
const HI_LO_NEBULA_DISPLAY_NAME = resolveGameDisplayName({
  gameKey: 'hi-lo-nebula',
  contract: HI_LO_NEBULA_CONTRACT,
  fallbackName: 'Hi-Lo Nebula',
});
const HI_LO_NEBULA_DISPLAY_NAME_UPPER = HI_LO_NEBULA_DISPLAY_NAME.toUpperCase();
const SUIT_SYMBOLS = Object.freeze(['♥', '♦', '♣', '♠']);

export function renderGame(state, opts = {}) {
  const displayMode = opts.displayMode || 'full';
  switch (displayMode) {
    case 'json':
      return JSON.stringify(
        state,
        (_, value) => (typeof value === 'bigint' ? value.toString() : value),
        2
      );
    case 'simple':
      return renderGameSimple(state, opts);
    case 'full':
    default:
      return renderGameFull(state, opts);
  }
}

export function renderPayoutTable() {
  return `
┌──────────────┬────────────┬────────────┬────────────┐
│ Current Card │ Higher     │ Lower      │ Same       │
├──────────────┼────────────┼────────────┼────────────┤
│ 2            │ 1.0600x    │ N/A        │ 12.5000x   │
│ 3            │ 1.1363x    │ 12.5000x   │ 12.5000x   │
│ 4            │ 1.2500x    │ 6.2500x    │ 12.5000x   │
│ 5            │ 1.3888x    │ 4.1666x    │ 12.5000x   │
│ 6            │ 1.5625x    │ 3.1250x    │ 12.5000x   │
│ 7            │ 1.7857x    │ 2.5000x    │ 12.5000x   │
│ 8            │ 2.0833x    │ 2.0833x    │ 12.5000x   │
│ 9            │ 2.5000x    │ 1.7857x    │ 12.5000x   │
│ 10           │ 3.1250x    │ 1.5625x    │ 12.5000x   │
│ J            │ 4.1666x    │ 1.3888x    │ 12.5000x   │
│ Q            │ 6.2500x    │ 1.2500x    │ 12.5000x   │
│ K            │ 12.5000x   │ 1.1363x    │ 12.5000x   │
│ A            │ N/A        │ 1.0600x    │ 12.5000x   │
└──────────────┴────────────┴────────────┴────────────┘
`;
}

export function renderActionPrompt() {
  return 'Choose high/lower/same/cashout (h/l/s/c, q to quit): ';
}

function renderGameSimple(state, opts = {}) {
  const lines = [];
  const gameLabel = opts.gameLabel ? `  |  ${opts.gameLabel}` : '';

  lines.push('');
  lines.push(`  ${HI_LO_NEBULA_DISPLAY_NAME_UPPER}  |  Bet: ${formatApe(state.initialBetAmountApe)}${gameLabel}`);
  lines.push('  ' + '─'.repeat(60));
  lines.push(`  Current card: ${state.currentCardLabel}`);

  if (state.recentTransition) {
    lines.push(`  Recent: ${state.recentTransition}`);
  }

  if (state.awaitingDecision && state.currentOptions.length > 0) {
    lines.push(`  Options: ${state.currentOptions.map((option) => `${option.label.toUpperCase()} ${formatMultiplier(option.multiplier)}`).join('  |  ')}`);
  }

  lines.push(`  Cashout: ${state.canCashOut ? `${formatApe(state.currentCashoutApe)} APE` : 'N/A'}`);
  lines.push(`  Jackpot: ${formatApe(state.currentJackpotAmountApe)} APE`);
  lines.push(`  Cards Drawn: ${state.cardsDrawn}/${state.roundsForJackpot}`);

  if (opts.suggestionLine) {
    lines.push(`  Suggestion: ${opts.suggestionLine}`);
  }

  if (state.awaitingInitialDeal) {
    lines.push('  Waiting for initial card...');
  } else if (state.awaitingGuessResult) {
    lines.push(`  Guessing ${state.pendingGuessLabel?.toUpperCase() || '...'}...`);
  } else if (state.awaitingDecision) {
    lines.push('  Choose HIGH, LOWER, SAME, or CASHOUT.');
  }

  if (state.isComplete) {
    lines.push('');
    lines.push(`  ${formatOutcomeFooter(state)}`);
  }

  lines.push('');
  return lines.join('\n');
}

function renderGameFull(state, opts = {}) {
  if (state.awaitingInitialDeal) {
    return 'Waiting for the initial rank reveal...';
  }

  const lines = [
    createTopBorder(HI_LO_NEBULA_DISPLAY_NAME_UPPER),
    boxLine(''),
  ];
  const gameLabel = formatBoxGameLabel(opts.gameLabel);
  if (gameLabel) {
    lines.push(boxLine(gameLabel));
  }

  lines.push(...buildMainGridLines(state));
  const footerLines = buildFooterLines(state, opts);
  if (footerLines.length > 0) {
    lines.push(createMiddleBorder());
    for (const footerLine of footerLines) {
      lines.push(boxLine(footerLine));
    }
  }
  lines.push(createBottomBorder());

  if (state.isComplete) {
    lines.push(formatOutcomeFooter(state));
  }

  return lines.join('\n');
}

export function formatOutcomeFooter(state) {
  const netProfitApe = getNetProfitApe(state);
  const icon = formatOutcomeIcon(netProfitApe);

  if (!state?.isComplete || state.outcome === 'loss') {
    return `${icon} Full loss ${formatNetProfitLabel(netProfitApe)}`;
  }
  if (state.outcome === 'jackpot') {
    return `${icon} Jackpot! → ${formatApe(state.payoutApe)} APE ${formatNetProfitLabel(netProfitApe)}`;
  }
  if (state.outcome === 'cashout') {
    return `${icon} Cashout → ${formatApe(state.payoutApe)} APE ${formatNetProfitLabel(netProfitApe)}`;
  }

  return `${icon} Win → ${formatApe(state.payoutApe)} APE ${formatNetProfitLabel(netProfitApe)}`;
}

function buildMainGridLines(state) {
  const leftLines = buildActionColumn(state);
  const centerLines = buildCardColumn(state);
  const rightLines = buildInfoColumn(state);
  const maxLength = Math.max(leftLines.length, centerLines.length, rightLines.length);
  const rows = [];

  for (let index = 0; index < maxLength; index += 1) {
    rows.push(boxLine(composeColumns([
      leftLines[index] || '',
      centerLines[index] || '',
      rightLines[index] || '',
    ])));
  }

  return rows;
}

function buildActionColumn(state) {
  const lines = ['Actions'];
  if (state.awaitingDecision) {
    for (const option of state.currentOptions) {
      lines.push(`[${option.shortLabel.charAt(0)}] ${option.label} ${formatMultiplier(option.multiplier)}`);
    }
    lines.push(state.canCashOut ? '[C] Cash Out' : '[C] Cash Out (locked)');
  } else if (state.awaitingGuessResult) {
    lines.push(`Guess: ${state.pendingGuessLabel || '...'}`);
    lines.push('VRF resolving...');
  } else if (state.awaitingInitialDeal) {
    lines.push('Dealing first card...');
  } else if (state.isComplete) {
    lines.push(state.outcome === 'loss' ? 'Round ended' : 'Payout settled');
  }
  lines.push('[Q] Quit');
  return lines.slice(0, 6);
}

function buildCardColumn(state) {
  const currentCardDisplay = formatCosmeticCard({
    gameId: state.gameId,
    rank: state.currentCard,
    label: state.currentCardLabel,
    slot: `current:${state.currentRoundIndex ?? 'none'}:${state.cardsDrawn}`,
  });
  const header = state.awaitingGuessResult
    ? `${formatGuessShortLabel(state.currentRound?.direction)} -> ?`
    : (formatRecentTransitionDisplay(state) || 'Waiting');
  return [
    '┌─────────────┐',
    `│ ${fitAnsiText(state.awaitingGuessResult ? 'CURRENT' : 'CARD', 11).padEnd(11, ' ')} │`,
    `│ ${centerCell(currentCardDisplay, 9)} │`,
    `│ ${fitAnsiText(header, 11).padEnd(11, ' ')} │`,
    `│ ${fitAnsiText(`DRAW ${state.cardsDrawn}/${state.roundsForJackpot}`, 11).padEnd(11, ' ')} │`,
    '└─────────────┘',
  ];
}

function buildInfoColumn(state) {
  return [
    'Round Info',
    `Bet: ${formatApe(state.initialBetAmountApe)} APE`,
    `Cashout: ${state.canCashOut ? `${formatApe(state.currentCashoutApe)} APE` : 'N/A'}`,
    `Jackpot: ${formatApe(state.currentJackpotAmountApe)} APE`,
    `Streak: ${state.roundsWon}/${state.roundsForJackpot}`,
    `Fees: ${(state.totalFeeBps / 100).toFixed(2)}%`,
  ];
}

function buildStatusLine(state) {
  if (state.awaitingGuessResult) {
    return `Waiting for ${state.pendingGuessLabel?.toUpperCase() || 'the'} result...`;
  }
  if (state.isComplete) {
    return state.outcome === 'loss'
      ? 'Round ended with a full loss.'
      : 'Round settled on-chain.';
  }

  return '';
}

function composeColumns(columns) {
  return columns
    .map((text, index) => fitAnsiText(String(text || ''), COLUMN_WIDTHS[index]).padEnd(COLUMN_WIDTHS[index], ' '))
    .join('  ');
}

function createTopBorder(title) {
  const titleText = ` ${title} `;
  const innerWidth = BOX_CONTENT_WIDTH + 2;
  const titleWidth = getVisibleWidth(titleText);
  const left = Math.floor((innerWidth - titleWidth) / 2);
  const right = innerWidth - titleWidth - left;
  return `╔${'═'.repeat(left)}${titleText}${'═'.repeat(right)}╗`;
}

function createMiddleBorder() {
  return `╠${'═'.repeat(BOX_CONTENT_WIDTH + 2)}╣`;
}

function createBottomBorder() {
  return `╚${'═'.repeat(BOX_CONTENT_WIDTH + 2)}╝`;
}

function boxLine(text = '') {
  return `║ ${fitAnsiText(text, BOX_CONTENT_WIDTH).padEnd(BOX_CONTENT_WIDTH, ' ')} ║`;
}

function centerCell(text, width = 11) {
  const raw = String(text || '');
  const value = getVisibleWidth(raw) > width
    ? truncateAnsi(raw, width)
    : raw;
  const visibleWidth = getVisibleWidth(value);
  const left = Math.floor((width - visibleWidth) / 2);
  const right = Math.max(width - visibleWidth - left, 0);
  return `${' '.repeat(left)}${value}${' '.repeat(right)}`;
}

function buildFooterLines(state, opts = {}) {
  const lines = [];
  const statusLine = buildStatusLine(state);

  if (statusLine) {
    lines.push(statusLine);
  }

  return lines;
}

function formatRecentTransitionDisplay(state) {
  const round = state?.lastResolvedRound;
  if (!round?.resolved) {
    return null;
  }

  const from = formatCosmeticCard({
    gameId: state.gameId,
    rank: round.startingCard,
    label: round.startingCardLabel,
    slot: `round:${round.index}:from`,
  });
  const to = formatCosmeticCard({
    gameId: state.gameId,
    rank: round.nextCard,
    label: round.nextCardLabel,
    slot: `round:${round.index}:to`,
  });

  return `${from}->${to}`;
}

function formatCosmeticCard({ gameId, rank, label, slot }) {
  if (!rank || !label || label === '?') {
    return String(label || '?');
  }

  const suit = SUIT_SYMBOLS[hashSeed(`${gameId}:${slot}:${rank}`) % SUIT_SYMBOLS.length];
  return `${label}${suit}`;
}

function hashSeed(text) {
  let hash = 0;
  for (const char of String(text || '')) {
    hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function formatBoxGameLabel(gameLabel) {
  if (!gameLabel) {
    return null;
  }
  return gameLabel.toUpperCase().replace(/\s*\/\s*/g, '/');
}

function formatApe(value) {
  const numeric = Number(value) || 0;
  if (Math.abs(numeric) >= 1000) {
    return numeric.toFixed(2);
  }
  if (Math.abs(numeric) >= 100) {
    return numeric.toFixed(3);
  }
  return numeric.toFixed(4).replace(/\.?0+$/, (match) => (match.startsWith('.') ? '' : match));
}
