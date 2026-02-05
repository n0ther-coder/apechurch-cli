/**
 * @fileoverview Reverse Martingale (Anti-Martingale) Betting Strategy
 *
 * The opposite of traditional Martingale - doubles on wins instead of losses.
 *
 * Rules:
 * - On win: Double the bet (ride the winning streak)
 * - On loss: Reset to base bet
 *
 * Theory:
 * Capitalize on winning streaks while strictly limiting losses.
 * Each loss only costs the base bet, while wins compound.
 *
 * Risk Profile:
 * - MODERATE RISK strategy
 * - Losses are always limited to base bet
 * - But one loss wipes out all accumulated streak winnings
 * - Requires discipline to cash out during streaks
 *
 * Example with 10 APE base:
 * ```
 * W: 10 (+10) → W: 20 (+20) → W: 40 (+40) → L: 80 (-80) → Reset: 10
 * Total P&L: +10+20+40-80 = -10 APE (one loss erased the streak)
 * ```
 *
 * Better example (knowing when to reset):
 * ```
 * W: 10 (+10) → W: 20 (+20) → W: 40 (+40) → Manual reset → Start: 10
 * Total P&L: +70 APE (locked in profits)
 * ```
 *
 * When to use:
 * - When you believe in "hot streaks"
 * - Short aggressive sessions
 * - Combined with a win-limit (e.g., reset after 3 wins)
 *
 * When NOT to use:
 * - Long grinding sessions (variance will eat profits)
 * - If you can't handle giving back winnings
 *
 * @module lib/strategies/reverse-martingale
 */

export default {
  /**
   * Strategy name
   * @type {string}
   */
  name: 'reverse-martingale',

  /**
   * Human-readable description
   * @type {string}
   */
  description: 'Double bet on win, reset on loss',

  /**
   * Initialize strategy state
   *
   * @param {number} baseBet - Starting bet amount in APE
   * @param {Object} [opts={}] - Additional options (unused)
   * @returns {Object} Initial state
   *
   * @example
   * const state = reverseMartingale.init(10);
   * // state = { baseBet: 10, currentBet: 10, winStreak: 0 }
   */
  init(baseBet, opts = {}) {
    return {
      baseBet,
      currentBet: baseBet,
      winStreak: 0,
    };
  },

  /**
   * Calculate next bet based on last result
   *
   * - Loss or first game: Reset to base bet
   * - Win: Double current bet
   *
   * @param {Object} state - Current strategy state
   * @param {Object|null} lastResult - Last game result
   * @param {boolean} lastResult.won - Whether player won
   * @param {number} lastResult.bet - Amount bet
   * @param {number} lastResult.payout - Amount received
   * @returns {Object} { bet: number, state: Object }
   *
   * @example
   * // After a win, doubles the bet
   * const { bet } = reverseMartingale.nextBet(
   *   { baseBet: 10, currentBet: 10, winStreak: 0 },
   *   { won: true, bet: 10, payout: 20 }
   * );
   * // bet = 20
   *
   * // After a loss, resets to base
   * const { bet } = reverseMartingale.nextBet(
   *   { baseBet: 10, currentBet: 40, winStreak: 2 },
   *   { won: false, bet: 40, payout: 0 }
   * );
   * // bet = 10
   */
  nextBet(state, lastResult) {
    // First game or lost last game: reset to base bet
    if (!lastResult || !lastResult.won) {
      return {
        bet: state.baseBet,
        state: {
          ...state,
          currentBet: state.baseBet,
          winStreak: 0,
        },
      };
    }

    // Won: double the bet (ride the streak)
    const nextBet = state.currentBet * 2;
    return {
      bet: nextBet,
      state: {
        ...state,
        currentBet: nextBet,
        winStreak: state.winStreak + 1,
      },
    };
  },
};
