/**
 * @fileoverview Flat Betting Strategy (Default)
 *
 * The simplest and safest betting strategy: bet the same amount every time.
 * No progression based on wins or losses.
 *
 * Characteristics:
 * - Lowest variance of all strategies
 * - Bankroll lasts longest on average
 * - No recovery mechanism (losses are just losses)
 * - Best for casual play or when you want predictable session lengths
 *
 * When to use:
 * - New players learning the games
 * - Long grind sessions
 * - When you want to minimize risk
 * - As a baseline to compare other strategies
 *
 * @module lib/strategies/flat
 */

export default {
  /**
   * Strategy name (used for lookup and display)
   * @type {string}
   */
  name: 'flat',

  /**
   * Human-readable description for help text
   * @type {string}
   */
  description: 'Same bet every time (default)',

  /**
   * Initialize strategy state
   *
   * @param {number} baseBet - Starting bet amount in APE
   * @param {Object} [opts={}] - Additional options (unused for flat)
   * @returns {Object} Initial state { baseBet, currentBet }
   *
   * @example
   * const state = flat.init(10);
   * // state = { baseBet: 10, currentBet: 10 }
   */
  init(baseBet, opts = {}) {
    return {
      baseBet,
      currentBet: baseBet,
    };
  },

  /**
   * Calculate next bet
   *
   * For flat strategy, this always returns the base bet regardless
   * of previous results.
   *
   * @param {Object} state - Current strategy state
   * @param {Object|null} lastResult - Last game result (ignored)
   * @returns {Object} { bet: number, state: Object }
   *
   * @example
   * const { bet, state } = flat.nextBet(state, { won: false, bet: 10, payout: 0 });
   * // bet = 10 (always the same)
   */
  nextBet(state, lastResult) {
    // Always return the same bet - wins and losses don't matter
    return {
      bet: state.baseBet,
      state, // State is unchanged
    };
  },
};
