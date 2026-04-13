/**
 * Hi-Lo Nebula display helpers.
 */
import { resolveGameDisplayName } from '../../../registry.js';
import { fitAnsiText, getVisibleWidth } from '../../ansi.js';
import { formatNetProfitLabel, formatOutcomeIcon } from '../../theme.js';
import { formatMultiplier, getNetProfitApe } from './state.js';
import { HI_LO_NEBULA_CONTRACT } from './constants.js';

const BOX_CONTENT_WIDTH = 62;
const PANEL_COLUMN_WIDTHS = [30, 30];
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

  lines.push(boxLine(centerText(buildDrawLine(state))));
  lines.push(boxLine(''));

  if (state.awaitingDecision) {
    const guide = buildRangeGuide(state.currentCard);
    if (guide.top) {
      lines.push(boxLine(centerText(guide.top)));
      lines.push(boxLine(centerText(guide.bottom)));
      lines.push(boxLine(''));
    }
  }

  lines.push(...buildActionInfoPanel(state));
  lines.push(createBottomBorder());

  if (state.isComplete) {
    lines.push(formatOutcomeFooter(state));
  }

  return `\n${lines.join('\n')}`;
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

function buildActionInfoPanel(state) {
  const leftLines = buildActionColumn(state);
  const rightLines = buildInfoColumn(state);
  const rows = [boxLine(composePanelColumns(['ACTIONS:', 'ROUND INFO:']))];

  for (let index = 0; index < Math.max(leftLines.length, rightLines.length); index += 1) {
    rows.push(boxLine(composePanelColumns([
      leftLines[index] || '',
      rightLines[index] || '',
    ])));
  }

  return rows;
}

function buildActionColumn(state) {
  const lines = [];
  if (state.awaitingDecision) {
    lines.push(formatActionOption(state.currentOptions.find((option) => option.label === 'Lower'), 'l'));
    lines.push(formatActionOption(state.currentOptions.find((option) => option.label === 'Higher'), 'h'));
    lines.push(formatActionOption(state.currentOptions.find((option) => option.label === 'Same'), 's'));
    lines.push(state.canCashOut ? '[c] Cash Out' : '[c] Cash Out (locked)');
  } else if (state.isComplete) {
    lines.push(state.outcome === 'loss' ? 'Round 1 ended' : 'Round settled');
  }
  return lines.slice(0, 4);
}

function buildInfoColumn(state) {
  return [
    `Bet: ${formatApeCompact(state.initialBetAmountApe)} APE`,
    `Cashout: ${state.canCashOut ? `${formatApeCompact(state.currentCashoutApe)} APE` : 'N/A'}`,
    `Jackpot: ${formatApeCompact(state.currentJackpotAmountApe)} APE`,
    `Fees: ${(state.totalFeeBps / 100).toFixed(2)}%`,
  ];
}

function createTopBorder(title) {
  const titleText = ` ${title} `;
  const innerWidth = BOX_CONTENT_WIDTH + 2;
  const titleWidth = getVisibleWidth(titleText);
  const left = Math.floor((innerWidth - titleWidth) / 2);
  const right = innerWidth - titleWidth - left;
  return `╔${'═'.repeat(left)}${titleText}${'═'.repeat(right)}╗`;
}

function createBottomBorder() {
  return `╚${'═'.repeat(BOX_CONTENT_WIDTH + 2)}╝`;
}

function boxLine(text = '') {
  return `║ ${fitAnsiText(text, BOX_CONTENT_WIDTH).padEnd(BOX_CONTENT_WIDTH, ' ')} ║`;
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

function buildDrawLine(state) {
  const currentCardDisplay = formatCosmeticCard({
    gameId: state.gameId,
    rank: state.currentCard,
    label: state.currentCardLabel,
    slot: `current:${state.currentRoundIndex ?? 'none'}:${state.cardsDrawn}`,
  });
  return `DRAW: ${currentCardDisplay} ${buildProgressBar(state.roundsWon, state.roundsForJackpot)}`;
}

function buildProgressBar(roundsWon = 0, roundsForJackpot = 15) {
  return Array.from({ length: Number(roundsForJackpot) || 15 }, (_, index) => (
    index < (Number(roundsWon) || 0) ? '(•)' : '( )'
  )).join('');
}

function buildRangeGuide(currentCard) {
  const rank = Number(currentCard) || 0;
  if (!(rank >= 2 && rank <= 14)) {
    return { top: '', bottom: '' };
  }

  const segments = [
    buildGuideSegment(2, rank - 1, 'l'),
    buildGuideSegment(rank, rank, 's'),
    buildGuideSegment(rank + 1, 14, 'h'),
  ].filter(Boolean);

  return {
    top: segments.map((segment) => segment.top).join(' '),
    bottom: segments.map((segment) => segment.bottom).join(' '),
  };
}

function buildGuideSegment(start, end, key) {
  if (start > end) {
    return null;
  }

  const labelText = Array.from({ length: end - start + 1 }, (_, index) => formatRankLabel(start + index)).join(' ');
  const top = `| ${labelText} |`;
  const innerWidth = top.length - 2;
  const left = Math.ceil((innerWidth - 1) / 2);
  const right = innerWidth - 1 - left;
  const bottom = `└${'─'.repeat(left)}${key}${'─'.repeat(right)}┘`;

  return { top, bottom };
}

function formatRankLabel(rank) {
  if (rank === 11) {
    return 'J';
  }
  if (rank === 12) {
    return 'Q';
  }
  if (rank === 13) {
    return 'K';
  }
  if (rank === 14) {
    return 'A';
  }
  return String(rank);
}

function formatActionOption(option, key) {
  if (!option) {
    return '';
  }

  return `[${key}] ${option.label} ${formatMultiplier(option.multiplier)}`;
}

function composePanelColumns(columns) {
  return columns
    .map((text, index) => fitAnsiText(String(text || ''), PANEL_COLUMN_WIDTHS[index]).padEnd(PANEL_COLUMN_WIDTHS[index], ' '))
    .join('  ');
}

function centerText(text) {
  const visibleWidth = getVisibleWidth(text);
  if (visibleWidth >= BOX_CONTENT_WIDTH) {
    return fitAnsiText(text, BOX_CONTENT_WIDTH);
  }

  const left = Math.floor((BOX_CONTENT_WIDTH - visibleWidth) / 2);
  const right = Math.max(BOX_CONTENT_WIDTH - visibleWidth - left, 0);
  return `${' '.repeat(left)}${text}${' '.repeat(right)}`;
}

function formatApeCompact(value) {
  const numeric = Number(value) || 0;
  return numeric.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
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
