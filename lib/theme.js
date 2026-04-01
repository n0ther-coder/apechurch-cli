/**
 * @fileoverview Unified color theme for Ape Church CLI
 *
 * Provides semantic colors and formatters for consistent terminal output.
 * All colors are defined here — change once, update everywhere.
 *
 * Usage:
 *   import { theme, formatPnL, formatBalance } from './theme.js';
 *   console.log(theme.success('✅ Done'));
 *   console.log(formatPnL(10.5));  // "+10.5000 APE" in green
 *
 * Respects NO_COLOR environment variable automatically (via chalk).
 *
 * @module lib/theme
 */

import chalk from 'chalk';
import { fitAnsiText, getVisibleWidth } from './ansi.js';

// ============================================================================
// SEMANTIC COLOR THEME
// ============================================================================

/**
 * Semantic color functions for consistent styling across the CLI.
 *
 * Categories:
 * - Results: win/loss/push outcomes
 * - Money: positive/negative amounts, balances
 * - Status: success/error/warning/info messages
 * - Cards: red and black suits for card games
 * - Structure: headers, labels, values, emphasis
 * - Games: game names, multipliers, special elements
 *
 * @example
 * theme.win('You won!')           // Bold green
 * theme.error('Failed to connect') // Bold red
 * theme.balance('100.0000 APE')   // Cyan bold
 */
export const theme = {
  // ─────────────────────────────────────────────────────────────────────────
  // RESULTS - Game outcomes
  // ─────────────────────────────────────────────────────────────────────────
  win: chalk.green.bold,        // Victory, successful outcome
  loss: chalk.red,              // Defeat, losing outcome
  push: chalk.yellow,           // Tie, push, no change
  pending: chalk.gray,          // Awaiting result, unsettled

  // ─────────────────────────────────────────────────────────────────────────
  // MONEY - Financial amounts
  // ─────────────────────────────────────────────────────────────────────────
  positive: chalk.green,        // Gains: +10.50 APE
  negative: chalk.red,          // Losses: -5.00 APE
  zero: chalk.gray,             // No change: 0.00 APE
  balance: chalk.cyan.bold,     // Wallet/account balance
  amount: chalk.white,          // Neutral amounts (wagers, transfers)
  fee: chalk.yellow,            // Fees, costs

  // ─────────────────────────────────────────────────────────────────────────
  // STATUS - Feedback messages
  // ─────────────────────────────────────────────────────────────────────────
  success: chalk.green,         // ✅ Operation succeeded
  error: chalk.red.bold,        // ❌ Operation failed
  warning: chalk.yellow,        // ⚠️  Caution, attention needed
  info: chalk.blue,             // ℹ️  Informational

  // ─────────────────────────────────────────────────────────────────────────
  // CARDS - Suit colors for blackjack/poker
  // ─────────────────────────────────────────────────────────────────────────
  cardRed: chalk.red,           // ♥ Hearts, ♦ Diamonds
  cardBlack: chalk.white,       // ♠ Spades, ♣ Clubs
  cardBack: chalk.gray,         // Face-down cards

  // ─────────────────────────────────────────────────────────────────────────
  // STRUCTURE - Layout and organization
  // ─────────────────────────────────────────────────────────────────────────
  header: chalk.cyan.bold,      // Section headers, command titles
  subheader: chalk.cyan,        // Sub-sections
  label: chalk.gray,            // Field labels: "Balance:", "Address:"
  value: chalk.white,           // Field values (default)
  dim: chalk.dim,               // Secondary info, less important
  highlight: chalk.yellow.bold, // Important callouts, action required
  accent: chalk.magenta,        // Accent color for variety

  // ─────────────────────────────────────────────────────────────────────────
  // GAMES - Game-specific elements
  // ─────────────────────────────────────────────────────────────────────────
  gameName: chalk.magenta.bold, // Game titles: "Jungle Plinko"
  multiplier: chalk.cyan,       // Payout multipliers: "2.5x"
  jackpot: chalk.yellow.bold,   // Jackpot, big wins
  streak: chalk.blue,           // Win/loss streaks

  // ─────────────────────────────────────────────────────────────────────────
  // HOUSE - Staking/house-related
  // ─────────────────────────────────────────────────────────────────────────
  staked: chalk.blue,           // Staked amounts
  yield: chalk.green,           // Profits, yields
  locked: chalk.yellow,         // Lock periods, unavailable

  // ─────────────────────────────────────────────────────────────────────────
  // MISC
  // ─────────────────────────────────────────────────────────────────────────
  address: chalk.dim,           // Wallet addresses (long, less important)
  txHash: chalk.dim,            // Transaction hashes
  timestamp: chalk.gray,        // Times, dates
  command: chalk.cyan,          // Command suggestions

  // ─────────────────────────────────────────────────────────────────────────
  // BASIC COLORS (for ad-hoc use when semantic doesn't fit)
  // ─────────────────────────────────────────────────────────────────────────
  red: chalk.red,
  green: chalk.green,
  yellow: chalk.yellow,
  blue: chalk.blue,
  magenta: chalk.magenta,
  cyan: chalk.cyan,
  white: chalk.white,
  gray: chalk.gray,
  bold: chalk.bold,
};

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format a P&L (profit/loss) amount with appropriate color.
 *
 * - Positive: green with + prefix
 * - Negative: red (- prefix automatic)
 * - Zero: gray
 *
 * @param {number|string} apeAmount - Amount in APE
 * @param {number} [decimals=4] - Decimal places to show
 * @returns {string} Colored string like "+10.5000 APE"
 *
 * @example
 * formatPnL(10.5)   // green "+10.5000 APE"
 * formatPnL(-5.25)  // red "-5.2500 APE"
 * formatPnL(0)      // gray "0.0000 APE"
 */
export function formatPnL(apeAmount, decimals = 4) {
  const num = parseFloat(apeAmount);
  const formatted = num.toFixed(decimals);
  const withSign = num > 0 ? `+${formatted}` : formatted;

  if (num > 0) return theme.positive(`${withSign} APE`);
  if (num < 0) return theme.negative(`${withSign} APE`);
  return theme.zero(`${withSign} APE`);
}

/**
 * Format a balance amount (always cyan, no sign).
 *
 * @param {number|string} apeAmount - Amount in APE
 * @param {number} [decimals=4] - Decimal places
 * @returns {string} Colored balance string
 *
 * @example
 * formatBalance(150.5) // cyan "150.5000 APE"
 */
export function formatBalance(apeAmount, decimals = 4) {
  const num = parseFloat(apeAmount);
  return theme.balance(`${num.toFixed(decimals)} APE`);
}

/**
 * Format a neutral amount (white, no sign).
 *
 * @param {number|string} apeAmount - Amount in APE
 * @param {number} [decimals=4] - Decimal places
 * @returns {string} White amount string
 */
export function formatAmount(apeAmount, decimals = 4) {
  const num = parseFloat(apeAmount);
  return theme.amount(`${num.toFixed(decimals)} APE`);
}

/**
 * Format the outcome icon from realized net profit/loss.
 *
 * @param {number|string} pnl - Net result in APE
 * @param {boolean} [settled=true] - Whether the result is final
 * @returns {string} Colored icon
 */
export function formatOutcomeIcon(pnl, settled = true) {
  if (!settled) {
    return theme.pending('⏳');
  }

  const num = parseFloat(pnl);
  if (num > 0) return theme.win('🎉');
  if (num < 0) return theme.loss('💀');
  return theme.push('🤝');
}

/**
 * Format a trailing net profit label for result summaries.
 *
 * @param {number|string} apeAmount - Net result in APE
 * @param {number} [decimals=4] - Decimal places to show
 * @returns {string} Formatted label like "(net profit +10.5000 APE)"
 */
export function formatNetProfitLabel(apeAmount, decimals = 4) {
  return `${theme.dim('(net profit ')}${formatPnL(apeAmount, decimals)}${theme.dim(')')}`;
}

/**
 * Format a game result line with icon and P&L.
 *
 * @param {boolean} won - Whether the game was won
 * @param {number|string} pnl - Profit/loss amount
 * @param {boolean} [settled=true] - Whether the result is final
 * @returns {string} Formatted result like "🎉 +10.5000 APE"
 *
 * @example
 * formatResult(true, 10.5)   // "🎉 +10.5000 APE" (green)
 * formatResult(false, -5)    // "💀 -5.0000 APE" (red)
 * formatResult(null, 0, false) // "⏳ pending" (gray)
 */
export function formatResult(won, pnl, settled = true) {
  if (!settled) {
    return theme.pending('⏳ pending');
  }

  return `${formatOutcomeIcon(pnl, settled)} ${formatPnL(pnl)}`;
}

/**
 * Format a multiplier value.
 *
 * @param {number} mult - Multiplier value
 * @returns {string} Formatted like "2.50x"
 */
export function formatMultiplier(mult) {
  return theme.multiplier(`${parseFloat(mult).toFixed(2)}x`);
}

/**
 * Format a percentage change.
 *
 * @param {number} pct - Percentage value
 * @returns {string} Colored percentage with sign
 */
export function formatPercent(pct) {
  const num = parseFloat(pct);
  const formatted = `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;

  if (num > 0) return theme.positive(formatted);
  if (num < 0) return theme.negative(formatted);
  return theme.zero(formatted);
}

/**
 * Format a wallet address (dimmed, optionally truncated).
 *
 * @param {string} address - Full wallet address
 * @param {boolean} [truncate=false] - Shorten to 0x1234...abcd
 * @returns {string} Formatted address
 */
export function formatAddress(address, truncate = false) {
  if (truncate && address.length > 12) {
    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return theme.address(short);
  }
  return theme.address(address);
}

/**
 * Format a labeled field (label: value).
 *
 * @param {string} label - Field name
 * @param {string} value - Field value (already formatted or plain)
 * @param {number} [labelWidth=12] - Pad label to this width
 * @returns {string} Formatted "Label:     value"
 *
 * @example
 * formatField('Balance', formatBalance(100))
 * // "Balance:    100.0000 APE" (with colors)
 */
export function formatField(label, value, labelWidth = 12) {
  const paddedLabel = `${label}:`.padEnd(labelWidth);
  return `${theme.label(paddedLabel)} ${value}`;
}

/**
 * Format a status indicator (Yes/No with color).
 *
 * @param {boolean} value - True for Yes, false for No
 * @returns {string} Colored "Yes" or "No"
 */
export function formatYesNo(value) {
  return value ? theme.success('Yes') : theme.error('No');
}

/**
 * Format a header/title line.
 *
 * @param {string} text - Header text
 * @param {string} [emoji=''] - Optional emoji prefix
 * @returns {string} Formatted header
 */
export function formatHeader(text, emoji = '') {
  const prefix = emoji ? `${emoji} ` : '';
  return theme.header(`${prefix}${text}`);
}

// ============================================================================
// BOX DRAWING WITH COLORS
// ============================================================================

/**
 * Create a colored box around content.
 *
 * @param {string[]} lines - Content lines
 * @param {Object} [opts={}] - Options
 * @param {string} [opts.title] - Box title
 * @param {number} [opts.width=60] - Box width
 * @param {Function} [opts.borderColor=theme.dim] - Border color function
 * @returns {string[]} Boxed lines
 */
export function colorBox(lines, opts = {}) {
  const { title = '', width = 60, borderColor = theme.dim } = opts;
  const innerWidth = width - 2;
  const output = [];

  // Top border
  if (title) {
    const titlePadded = ` ${title} `;
    const leftPad = Math.floor((innerWidth - titlePadded.length) / 2);
    const rightPad = innerWidth - leftPad - titlePadded.length;
    output.push(borderColor('╔' + '═'.repeat(leftPad)) + theme.header(titlePadded) + borderColor('═'.repeat(rightPad) + '╗'));
  } else {
    output.push(borderColor('╔' + '═'.repeat(innerWidth) + '╗'));
  }

  // Content
  for (const line of lines) {
    output.push(borderColor('║') + fitAnsiText(line, innerWidth) + borderColor('║'));
  }

  // Bottom border
  output.push(borderColor('╚' + '═'.repeat(innerWidth) + '╝'));

  return output;
}

// ============================================================================
// GAME-SPECIFIC FORMATTERS
// ============================================================================

/**
 * Format a game history line.
 *
 * @param {Object} game - Game result object
 * @param {string} game.game - Game name
 * @param {string} game.wager_ape - Wager amount
 * @param {string} game.pnl_ape - Profit/loss
 * @param {boolean} game.won - Win/loss
 * @param {boolean} game.settled - Whether settled
 * @param {Object} [opts={}] - Rendering options
 * @param {boolean} [opts.showIds=false] - Whether to append the game ID
 * @returns {string} Formatted history line
 */
export function formatHistoryLine(game, opts = {}) {
  const showIds = Boolean(opts.showIds);
  const pnl = parseFloat(game.pnl_ape);
  const hasEconomicData = Number.isFinite(pnl) && Number.isFinite(parseFloat(game.wager_ape));
  const status = hasEconomicData ? formatOutcomeIcon(pnl, game.settled) : theme.warning('🚫');
  const gameIdLabel = `<${String(game.gameId || 'unknown')}>`;
  const timestampLabel = formatUtcTimestampLabel(game.chain_timestamp || game.timestamp || 0);
  const gameLabel = fitAnsiText(theme.gameName(game.game), 16);
  const sourceTimestampLabel = formatUtcTimestampLabel(game.last_sync_on);
  const unsyncedMessage = typeof game?.last_sync_msg === 'string' ? game.last_sync_msg.trim() : '';
  const netResultLabel = !hasEconomicData
    ? theme.value(formatHistoryUnavailableAmount())
    : !game.settled
    ? padHistoryColumn(theme.pending('pending'), 15)
    : pnl > 0
      ? padHistoryColumn(theme.positive(formatHistoryResultAmount(pnl)), 15)
      : pnl < 0
        ? padHistoryColumn(theme.negative(formatHistoryResultAmount(pnl)), 15)
        : padHistoryColumn(theme.zero(formatHistoryResultAmount(0)), 15);
  const wagerLabel = hasEconomicData
    ? padHistoryColumn(theme.amount(formatHistoryWagerAmount(game.wager_ape)), 16)
    : ' '.repeat(16);
  const sourceLabel = hasEconomicData
    ? sourceTimestampLabel !== 'unknown UTC'
      ? theme.dim(`(verified on-chain, ${sourceTimestampLabel})`)
      : theme.dim('(verified on-chain)')
    : unsyncedMessage && unsyncedMessage !== 'unsupported game fetch'
      ? theme.warning(
          sourceTimestampLabel !== 'unknown UTC'
            ? `(${unsyncedMessage}, ${sourceTimestampLabel})`
            : `(${unsyncedMessage})`
        )
      : theme.warning('(local-only record)');

  const parts = [
    theme.value(timestampLabel),
    status,
    gameLabel,
    netResultLabel,
    wagerLabel,
    sourceLabel,
  ];
  if (showIds) {
    parts.push(theme.dim(gameIdLabel));
  }

  return parts.join(' ');
}

function formatHistoryResultAmount(apeAmount) {
  const absolute = Math.abs(Number(apeAmount) || 0);
  const [whole, fraction] = absolute.toFixed(2).split('.');
  return `${whole.padStart(8, ' ')}.${fraction} APE`;
}

function formatHistoryUnavailableAmount() {
  return `${' '.repeat(8)}N/A${' '.repeat(4)}`;
}

function formatHistoryWagerAmount(apeAmount) {
  const absolute = Math.abs(Number(apeAmount) || 0);
  const [whole, fraction] = absolute.toFixed(2).split('.');
  return `${whole.padStart(8, ' ')}.${fraction} wAPE`;
}

function padHistoryColumn(text, minWidth) {
  const width = getVisibleWidth(text);
  if (width >= minWidth) {
    return text;
  }

  return text + ' '.repeat(minWidth - width);
}

function formatUtcTimestampLabel(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return 'unknown UTC';
  }

  if (typeof rawValue === 'string' && Number.isNaN(Number(rawValue))) {
    const parsed = Date.parse(rawValue);
    return Number.isFinite(parsed) && parsed > 0
      ? new Date(parsed).toISOString().replace(/\.\d{3}Z$/, ' UTC').replace('T', ' ')
      : 'unknown UTC';
  }

  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 'unknown UTC';
  }

  const timestampMs = numericValue < 1e12 ? numericValue * 1000 : numericValue;
  return new Date(timestampMs).toISOString().replace(/\.\d{3}Z$/, ' UTC').replace('T', ' ');
}

/**
 * Format a card with suit color.
 *
 * @param {string} rank - Card rank (A, 2-10, J, Q, K)
 * @param {string} suit - Suit symbol (♥, ♦, ♣, ♠)
 * @returns {string} Colored card string
 */
export function formatCard(rank, suit) {
  const isRed = suit === '♥' || suit === '♦';
  const colorFn = isRed ? theme.cardRed : theme.cardBlack;
  return colorFn(`${rank}${suit}`);
}

// ============================================================================
// EXPORTS FOR DISPLAY.JS COMPATIBILITY
// ============================================================================

/**
 * Raw chalk instance for advanced usage.
 * Prefer theme.* for consistency.
 */
export { chalk };

/**
 * Check if colors are enabled.
 * @returns {boolean}
 */
export function colorsEnabled() {
  return chalk.level > 0;
}
