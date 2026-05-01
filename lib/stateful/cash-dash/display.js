/**
 * Cash Dash display helpers.
 */
import { resolveGameDisplayName } from '../../../registry.js';
import { fitAnsiText, getVisibleWidth } from '../../ansi.js';
import { formatNetProfitLabel, formatOutcomeIcon } from '../../theme.js';
import { BASIS_POINTS, CASH_DASH_CONTRACT, DEFAULT_ROW_PAYOUT_BPS, MAX_TILES, MIN_TILES } from './constants.js';
import { formatMultiplier, formatTileLabel, getNetProfitApe, getRowsForRoundLocal } from './state.js';

const BOX_CONTENT_WIDTH = 68;
const CASH_DASH_DISPLAY_NAME = resolveGameDisplayName({
  gameKey: 'cash-dash',
  contract: CASH_DASH_CONTRACT,
  fallbackName: 'Cash Dash',
});
const CASH_DASH_DISPLAY_NAME_UPPER = CASH_DASH_DISPLAY_NAME.toUpperCase();

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

export function renderPayoutTable(runtimeConfig = null) {
  const rowPayoutBps = runtimeConfig?.rowPayoutBps || DEFAULT_ROW_PAYOUT_BPS;
  const lines = [
    '',
    '┌───────┬──────────┬────────────┬────────────┬────────────┐',
    '│ Tiles │ Safe     │ Multiplier │ One-step EV │ House Edge │',
    '├───────┼──────────┼────────────┼────────────┼────────────┤',
  ];

  for (let tileCount = MIN_TILES; tileCount <= MAX_TILES; tileCount += 1) {
    const payoutBps = Number(rowPayoutBps[tileCount] ?? DEFAULT_ROW_PAYOUT_BPS[tileCount]);
    const multiplier = payoutBps / BASIS_POINTS;
    const survival = (tileCount - 1) / tileCount;
    const ev = survival * multiplier;
    const edge = 1 - ev;
    lines.push(
      `│ ${String(tileCount).padEnd(5)} │ ${formatPercent(survival).padEnd(8)} │ ${formatMultiplier(multiplier).padEnd(10)} │ ${formatMultiplier(ev).padEnd(10)} │ ${formatPercent(edge).padEnd(10)} │`
    );
  }

  lines.push('└───────┴──────────┴────────────┴────────────┴────────────┘');
  lines.push('');
  lines.push('Seed 0 row order starts 7, 6, 5, 4, 3, then repeats; every 20th resolved row uses 2 tiles.');
  lines.push('');
  return lines.join('\n');
}

export function renderActionPrompt(state = {}) {
  const tileCount = Number(state.currentTileCount || MAX_TILES);
  return `Choose tile 1-${tileCount}, random, or cashout (c, q to quit): `;
}

export function renderOpeningActionPrompt() {
  return `Choose opening tile 1-${MAX_TILES} or random (q to quit): `;
}

export function renderOpeningGrid(opts = {}) {
  const displayMode = opts.displayMode || 'full';
  const availableTiles = Array.from({ length: MAX_TILES }, (_, index) => index + 1);

  if (displayMode === 'json') {
    return JSON.stringify({
      status: 'awaiting_opening_tile',
      availableTiles,
    }, null, 2);
  }

  if (displayMode === 'simple') {
    return [
      '',
      `  ${CASH_DASH_DISPLAY_NAME_UPPER} OPENING ROW`,
      '  ' + '-'.repeat(64),
      `  Row 1   ${renderTileRow(MAX_TILES)}  choose one`,
      `  Tiles: ${availableTiles.join(' ')}`,
      '',
    ].join('\n');
  }

  const lines = [
    createTopBorder(CASH_DASH_DISPLAY_NAME_UPPER),
    boxLine(''),
    boxLine(centerText('OPENING ROW READY')),
    boxLine(''),
    boxLine(`Row 1   ${renderTileRow(MAX_TILES)}  choose one`),
    boxLine(''),
    boxLine(`Pick a tile: ${availableTiles.join(' ')}`),
    createBottomBorder(),
  ];

  return `\n${lines.join('\n')}`;
}

export function formatOutcomeFooter(state) {
  const netProfitApe = getNetProfitApe(state);
  const icon = formatOutcomeIcon(netProfitApe);

  if (!state?.isComplete || state.outcome === 'loss') {
    return `${icon} Full loss ${formatNetProfitLabel(netProfitApe)}`;
  }
  if (state.outcome === 'cashout') {
    return `${icon} Cashout -> ${formatApe(state.payoutApe)} APE ${formatNetProfitLabel(netProfitApe)}`;
  }

  return `${icon} Win -> ${formatApe(state.payoutApe)} APE ${formatNetProfitLabel(netProfitApe)}`;
}

function renderGameSimple(state, opts = {}) {
  const lines = [];
  const gameLabel = opts.gameLabel ? `  |  ${opts.gameLabel}` : '';

  lines.push('');
  lines.push(`  ${CASH_DASH_DISPLAY_NAME_UPPER}  |  Bet: ${formatApe(state.initialBetAmountApe)}${gameLabel}`);
  lines.push('  ' + '-'.repeat(64));

  if (state.awaitingInitialReveal) {
    lines.push(`  Opening ${formatTileLabel(state.pendingGuessIndex)} on a ${state.currentTileCount}-tile row...`);
  } else if (state.awaitingGuessResult) {
    lines.push(`  Pending: ${formatTileLabel(state.pendingGuessIndex)} on row ${state.currentRoundIndex + 1}`);
  } else if (state.awaitingDecision) {
    lines.push(`  Active row: ${state.currentRoundIndex + 1} (${state.currentTileCount} tiles)`);
  }

  lines.push(`  Rows won: ${state.roundsWon}`);
  lines.push(`  Cashout: ${state.canCashOut ? `${formatApe(state.currentPayoutApe)} APE (${formatMultiplier(state.currentMultiplier)})` : 'N/A'}`);
  lines.push(`  Next safe: ${state.awaitingDecision ? `${formatApe(state.nextPayoutApe)} APE (${formatMultiplier(state.nextMultiplier)})` : 'N/A'}`);

  const recent = formatRecentRound(state);
  if (recent) {
    lines.push(`  Recent: ${recent}`);
  }

  if (opts.suggestionLine) {
    lines.push(`  Suggestion: ${opts.suggestionLine}`);
  }

  if (state.awaitingDecision) {
    lines.push(`  Tiles: ${state.availableTiles.map((index) => String(index + 1)).join(' ')}  |  Cashout: c`);
  }

  if (state.isComplete) {
    lines.push('');
    lines.push(`  ${formatOutcomeFooter(state)}`);
  }

  lines.push('');
  return lines.join('\n');
}

function renderGameFull(state, opts = {}) {
  const lines = [
    createTopBorder(CASH_DASH_DISPLAY_NAME_UPPER),
    boxLine(''),
    boxLine(centerText(buildStatusLine(state, opts))),
    boxLine(''),
  ];

  lines.push(...buildBoardLines(state));
  lines.push(boxLine(''));
  lines.push(...buildInfoLines(state, opts));
  lines.push(createBottomBorder());

  if (state.isComplete) {
    lines.push(formatOutcomeFooter(state));
  }

  return `\n${lines.join('\n')}`;
}

function buildBoardLines(state) {
  const rounds = Array.isArray(state.rounds) ? state.rounds : [];
  const rows = [];
  const start = Math.max(0, rounds.length - 5);
  const visibleRounds = rounds.slice(start);

  if (!state.isComplete && !state.awaitingGuessResult) {
    rows.push(boxLine(formatUpcomingRoundLine(state)));
  } else if (state.awaitingGuessResult) {
    rows.push(boxLine(formatPendingRoundLine(state)));
  }

  for (const round of visibleRounds.slice().reverse()) {
    rows.push(boxLine(formatRoundLine(round)));
  }

  if (rows.length === 0) {
    rows.push(boxLine(formatUpcomingRoundLine(state)));
  }

  return rows;
}

function buildInfoLines(state, opts = {}) {
  const lines = [];
  const left = [
    `Bet: ${formatApe(state.initialBetAmountApe)} APE`,
    `Rows won: ${state.roundsWon}`,
    `Current: ${formatMultiplier(state.currentMultiplier)}`,
  ];
  const right = [
    `Cashout: ${state.canCashOut ? `${formatApeCompact(state.currentPayoutApe)} APE` : 'N/A'}`,
    `Next: ${state.awaitingDecision ? `${formatApeCompact(state.nextPayoutApe)} APE` : 'N/A'}`,
    `Seed: ${state.tilesetSeedLabel}`,
  ];

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    lines.push(boxLine(`${(left[index] || '').padEnd(32)}${right[index] || ''}`));
  }

  if (opts.suggestionLine) {
    lines.push(boxLine(''));
    lines.push(boxLine(`Suggestion: ${opts.suggestionLine}`));
  }

  if (state.awaitingDecision) {
    lines.push(boxLine(''));
    lines.push(boxLine(`Pick a tile: ${state.availableTiles.map((index) => index + 1).join(' ')}    Cash out: c`));
  } else if (state.awaitingGuessResult) {
    lines.push(boxLine(''));
    lines.push(boxLine('Waiting for VRF result...'));
  }

  return lines;
}

function buildStatusLine(state, opts = {}) {
  const label = opts.gameLabel ? ` ${opts.gameLabel}` : '';
  if (state.isComplete) {
    return `GAME ${state.gameId}${label} COMPLETE`;
  }
  if (state.awaitingInitialReveal) {
    return `OPENING ROW PENDING${label}`;
  }
  if (state.awaitingGuessResult) {
    return `GUESS PENDING${label}`;
  }
  return `ROW ${state.currentRoundIndex + 1} READY${label}`;
}

function formatRoundLine(round) {
  const prefix = `Row ${round.index + 1}`.padEnd(7);
  const tiles = renderTileRow(round.tileCount, {
    guessIndex: round.guessIndex,
    deathIndex: round.deathIndex,
    pending: round.pending,
  });
  const status = round.pending
    ? 'PENDING'
    : round.safe
      ? `SAFE ${formatMultiplier(round.multiplierAfter)}`
      : 'LOSS';
  return `${prefix} ${tiles}  ${status}`;
}

function formatUpcomingRoundLine(state) {
  const rowIndex = Number(state.currentRoundIndex || 0);
  const tileCount = Number(state.currentTileCount || getRowsForRoundLocal(rowIndex, state.tilesetSeed));
  return `Row ${rowIndex + 1}`.padEnd(7) + ` ${renderTileRow(tileCount)}  choose one`;
}

function formatPendingRoundLine(state) {
  const rowIndex = Number(state.currentRoundIndex || 0);
  const tileCount = Number(state.currentTileCount || getRowsForRoundLocal(rowIndex, state.tilesetSeed));
  return `Row ${rowIndex + 1}`.padEnd(7) + ` ${renderTileRow(tileCount, { guessIndex: state.pendingGuessIndex, pending: true })}  pending`;
}

function renderTileRow(tileCount, { guessIndex = null, deathIndex = null, pending = false } = {}) {
  return Array.from({ length: Number(tileCount) || 0 }, (_, index) => {
    if (deathIndex === index) {
      return '[💀]';
    }
    if (guessIndex === index) {
      return '[💵]';
    }
    return '[ ]';
  }).join('');
}

function formatRecentRound(state) {
  const rounds = Array.isArray(state.rounds) ? state.rounds : [];
  const lastResolved = rounds.filter((round) => round.resolved).at(-1);
  if (!lastResolved) {
    return null;
  }

  const guessed = formatTileLabel(lastResolved.guessIndex);
  const death = formatTileLabel(lastResolved.deathIndex);
  return lastResolved.safe
    ? `${guessed} safe, death was ${death}`
    : `${guessed} hit the death tile`;
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

function centerText(text) {
  const width = getVisibleWidth(text);
  if (width >= BOX_CONTENT_WIDTH) {
    return text;
  }
  const left = Math.floor((BOX_CONTENT_WIDTH - width) / 2);
  return `${' '.repeat(left)}${text}`;
}

function formatApe(value) {
  const numeric = Number(value) || 0;
  if (Math.abs(numeric) >= 100) {
    return numeric.toFixed(2);
  }
  if (Math.abs(numeric) >= 1) {
    return numeric.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }
  return numeric.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function formatApeCompact(value) {
  const numeric = Number(value) || 0;
  return numeric >= 100 ? numeric.toFixed(2) : numeric.toFixed(4);
}

function formatPercent(value) {
  return `${((Number(value) || 0) * 100).toFixed(2)}%`;
}
