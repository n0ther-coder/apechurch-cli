/**
 * @fileoverview Betting Strategy System
 *
 * Strategies control wager sizing based on win/loss history during loop play.
 * They determine how much to bet on each game based on previous outcomes.
 *
 * Available Strategies:
 * - flat: Same bet every time (default, safest)
 * - martingale: Double on loss, reset on win (aggressive)
 * - reverse-martingale: Double on win, reset on loss (ride winning streaks)
 * - fibonacci: Increase bets following Fibonacci sequence on losses
 * - dalembert: +1 unit on loss, -1 on win (moderate)
 * - bankroll-fraction=<n>: Bet a fraction of remaining bankroll
 *
 * How Strategies Work:
 * 1. User specifies base bet and strategy via CLI
 * 2. Strategy init() creates initial state
 * 3. After each game, nextBet() calculates next wager based on result
 * 4. Safety caps (--max-bet, balance) prevent excessive bets
 *
 * Strategy Interface:
 * ```javascript
 * {
 *   name: string,
 *   description: string,
 *   init(baseBet, opts) => state,
 *   nextBet(state, lastResult) => { bet: number, state: newState }
 * }
 * ```
 *
 * lastResult format: null (first game) or { won: boolean, bet: number, payout: number }
 *
 * @module lib/strategies/index
 */

import flat from './flat.js';
import martingale from './martingale.js';
import reverseMartingale from './reverse-martingale.js';
import fibonacci from './fibonacci.js';
import dalembert from './dalembert.js';
import bankrollFraction from './bankroll-fraction.js';

const BANKROLL_FRACTION_PREFIX = 'bankroll-fraction=';

// ============================================================================
// STRATEGY REGISTRY
// ============================================================================

/**
 * Map of strategy names (including aliases) to strategy objects
 *
 * Each strategy implements the standard interface:
 * - name: Human-readable name
 * - description: Brief explanation
 * - init(baseBet, opts): Initialize state
 * - nextBet(state, lastResult): Calculate next bet
 *
 * @type {Object<string, Object>}
 */
const STRATEGIES = {
  // Base strategies
  flat,                                    // Same bet every time
  martingale,                              // Double on loss
  'reverse-martingale': reverseMartingale, // Double on win
  fibonacci,                               // Fibonacci sequence on losses
  dalembert,                               // +1 unit on loss, -1 on win

  // Aliases for user convenience
  'anti-martingale': reverseMartingale,    // Alternative name
  "d'alembert": dalembert,                 // French spelling
};

function normalizeStrategyName(name) {
  return String(name || '').toLowerCase().trim();
}

function formatFractionForName(fraction) {
  return String(fraction).replace(/\.?0+$/, '');
}

function parseBankrollFractionValue(rawValue, optionName = '--bet-strategy') {
  const valueText = String(rawValue ?? '').trim();
  const fraction = Number(valueText);
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction >= 1) {
    throw new Error(`Invalid ${optionName} value: "bankroll-fraction=${valueText}". bankroll-fraction must be a decimal strictly between 0 and 1.`);
  }
  return fraction;
}

function createBankrollFractionStrategy(fraction) {
  return {
    ...bankrollFraction,
    name: `bankroll-fraction=${formatFractionForName(fraction)}`,
    displayName: bankrollFraction.name,
    fraction,
  };
}

export function isBankrollFractionStrategyName(name) {
  return normalizeStrategyName(name).startsWith(BANKROLL_FRACTION_PREFIX);
}

export function isBankrollFractionStrategy(strategy) {
  return Boolean(strategy?.requiresBankroll && strategy?.displayName === bankrollFraction.name);
}

export function getBetStrategyUsageError(strategy, {
  loopMode = false,
  hasBaseBet = false,
  stopLoss = null,
  maxLoss = null,
} = {}) {
  if (!isBankrollFractionStrategy(strategy)) {
    return null;
  }

  if (!loopMode) {
    return '--bet-strategy bankroll-fraction=<fraction> requires --loop.';
  }
  if (hasBaseBet) {
    return '--bet-strategy bankroll-fraction=<fraction> conflicts with an explicit wager amount; omit <amount> and --amount.';
  }
  if (stopLoss === null && maxLoss === null) {
    return '--bet-strategy bankroll-fraction=<fraction> requires --bankroll/--max-loss or --stop-loss.';
  }

  return null;
}

export function getBankrollFractionRuntimeError(strategy, {
  maxLoss = null,
} = {}) {
  if (!isBankrollFractionStrategy(strategy)) {
    return null;
  }

  const bankroll = Number(maxLoss);
  if (!Number.isFinite(bankroll) || bankroll <= 0) {
    return '--bet-strategy bankroll-fraction=<fraction> requires a positive remaining bankroll after resolving --bankroll/--max-loss and --stop-loss.';
  }

  return null;
}

export function resolveStrategy(name, optionName = '--bet-strategy') {
  if (!name) {
    return STRATEGIES.flat;
  }

  const normalized = normalizeStrategyName(name);
  if (normalized.startsWith(BANKROLL_FRACTION_PREFIX)) {
    const fraction = parseBankrollFractionValue(
      normalized.slice(BANKROLL_FRACTION_PREFIX.length),
      optionName
    );
    return createBankrollFractionStrategy(fraction);
  }

  return STRATEGIES[normalized] || null;
}

// ============================================================================
// STRATEGY LOOKUP
// ============================================================================

/**
 * Get a strategy by name
 *
 * Case-insensitive lookup. Returns flat strategy if name is null/undefined.
 *
 * @param {string|null} name - Strategy name or alias
 * @returns {Object|null} Strategy object, or null if not found
 *
 * @example
 * getStrategy('martingale')    // Returns martingale strategy
 * getStrategy('MARTINGALE')    // Same (case-insensitive)
 * getStrategy(null)            // Returns flat strategy
 * getStrategy('invalid')       // Returns null
 */
export function getStrategy(name) {
  try {
    return resolveStrategy(name);
  } catch {
    return null;
  }
}

/**
 * List all available strategies with descriptions
 *
 * De-duplicates strategies (aliases point to same object).
 * Returns array suitable for help text display.
 *
 * @returns {Array<{name: string, description: string, aliases: string[]}>}
 *
 * @example
 * listStrategies()
 * // Returns:
 * // [
 * //   { name: 'flat', description: '...', aliases: [] },
 * //   { name: 'martingale', description: '...', aliases: [] },
 * //   { name: 'reverse-martingale', description: '...', aliases: ['anti-martingale'] },
 * //   ...
 * // ]
 */
export function listStrategies() {
  const seen = new Set();
  const list = [];

  for (const [name, strategy] of Object.entries(STRATEGIES)) {
    // Skip if we've already processed this strategy (alias dedup)
    if (!seen.has(strategy.name)) {
      seen.add(strategy.name);

      // Find all aliases for this strategy
      const aliases = Object.entries(STRATEGIES)
        .filter(([k, v]) => v.name === strategy.name && k !== strategy.name)
        .map(([k]) => k);

      list.push({
        name: strategy.name,
        description: strategy.description,
        aliases,
      });
    }
  }

  list.push({
    name: 'bankroll-fraction=<fraction>',
    description: bankrollFraction.description,
    aliases: [],
  });

  return list;
}

/**
 * Get strategy names as comma-separated string
 *
 * Useful for CLI help text. Returns unique names only (no aliases).
 *
 * @returns {string} Comma-separated list of strategy names
 *
 * @example
 * getStrategyNames()
 * // Returns: 'flat, martingale, reverse-martingale, fibonacci, dalembert, bankroll-fraction=<fraction>'
 */
export function getStrategyNames() {
  return [
    ...new Set(Object.values(STRATEGIES).map(s => s.name)),
    'bankroll-fraction=<fraction>',
  ].join(', ');
}

// ============================================================================
// BET CALCULATION
// ============================================================================

/**
 * Calculate next bet with safety caps
 *
 * Wraps strategy.nextBet() and applies safety limits:
 * 1. Max bet cap (--max-bet): Prevents runaway martingale
 * 2. Balance cap: Can't bet more than you have
 *
 * @param {Object} strategy - Strategy object
 * @param {Object} state - Current strategy state from previous iteration
 * @param {Object|null} lastResult - Last game result (null for first game)
 * @param {Object} [opts={}] - Safety options
 * @param {number} [opts.maxBet] - Maximum bet allowed (in APE)
 * @param {number} [opts.availableBalance] - Current balance (in APE)
 * @returns {Object} { bet: number, state: Object, capped: boolean }
 *
 * @example
 * // First game with martingale
 * const { bet, state } = calculateNextBet(
 *   martingale,
 *   martingale.init(10),
 *   null,
 *   { maxBet: 100, availableBalance: 50 }
 * );
 * // bet = 10, capped = false
 *
 * // After a loss (martingale doubles)
 * const { bet, state, capped } = calculateNextBet(
 *   martingale,
 *   state,
 *   { won: false, bet: 10, payout: 0 },
 *   { maxBet: 15, availableBalance: 50 }
 * );
 * // bet = 15 (capped from 20), capped = true
 */
export function calculateNextBet(strategy, state, lastResult, opts = {}) {
  const { maxBet, minBet, availableBalance } = opts;
  const maxBetNumber = Number(maxBet);
  const minBetNumber = Number(minBet);
  const availableBalanceNumber = Number(availableBalance);

  // Get raw bet from strategy logic
  const result = strategy.nextBet(state, lastResult, opts);
  let bet = result.bet;
  let capped = false;

  // Apply max bet cap (from --max-bet flag)
  if (Number.isFinite(maxBetNumber) && maxBetNumber > 0 && bet > maxBetNumber) {
    bet = maxBetNumber;
    capped = true;
  }

  // Apply min bet floor (from --min-bet flag)
  if (Number.isFinite(minBetNumber) && minBetNumber > 0 && bet < minBetNumber) {
    bet = minBetNumber;
    capped = true;
  }

  // Apply available balance cap (can't bet more than you have)
  if (Number.isFinite(availableBalanceNumber) && availableBalanceNumber >= 0 && bet > availableBalanceNumber) {
    bet = availableBalanceNumber;
    capped = true;
  }

  return {
    bet,
    state: result.state,
    capped,
  };
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

/**
 * Default export containing all public functions
 *
 * @example
 * import strategies from './strategies/index.js';
 * const strat = strategies.getStrategy('martingale');
 */
export default {
  getStrategy,
  resolveStrategy,
  listStrategies,
  getStrategyNames,
  calculateNextBet,
  isBankrollFractionStrategy,
  isBankrollFractionStrategyName,
  getBetStrategyUsageError,
  getBankrollFractionRuntimeError,
};
