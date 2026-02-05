/**
 * @fileoverview Martingale Betting Strategy
 *
 * Classic doubling strategy used in gambling since 18th century France.
 *
 * Rules:
 * - On loss: Double the bet
 * - On win: Reset to base bet
 *
 * Theory:
 * Eventually you'll win and recover all losses plus profit equal to base bet.
 * Mathematically sound in theory, but practically limited by:
 * - Table/bet limits
 * - Bankroll limits
 * - Long losing streaks (they happen more often than intuition suggests)
 *
 * Risk Profile:
 * - HIGH RISK strategy
 * - Can deplete bankroll extremely fast
 * - 10 losses in a row = 1024x base bet needed
 * - ALWAYS use --max-bet to cap progression
 *
 * Example with 10 APE base:
 * ```
 * L: 10 → L: 20 → L: 40 → W: 80 → Reset: 10
 * Total wagered: 150 APE
 * Net result: +10 APE (recovered all losses + base profit)
 * ```
 *
 * When to use:
 * - Short sessions with strict stop-loss
 * - Games with near 50% win rate (roulette RED/BLACK)
 * - When you have large bankroll relative to base bet
 *
 * When NOT to use:
 * - Long grinding sessions
 * - With small bankroll
 * - Without --max-bet safety cap
 *
 * @module lib/strategies/martingale
 */

export default {
  /**
   * Strategy name
   * @type {string}
   */
  name: 'martingale',

  /**
   * Human-readable description
   * @type {string}
   */
  description: 'Double bet on loss, reset on win',

  /**
   * Initialize strategy state
   *
   * @param {number} baseBet - Starting bet amount in APE
   * @param {Object} [opts={}] - Additional options (unused)
   * @returns {Object} Initial state
   *
   * @example
   * const state = martingale.init(10);
   * // state = { baseBet: 10, currentBet: 10, lossStreak: 0 }
   */
  init(baseBet, opts = {}) {
    return {
      baseBet,
      currentBet: baseBet,
      lossStreak: 0,
    };
  },

  /**
   * Calculate next bet based on last result
   *
   * - Win or first game: Reset to base bet
   * - Loss: Double current bet
   *
   * @param {Object} state - Current strategy state
   * @param {Object|null} lastResult - Last game result
   * @param {boolean} lastResult.won - Whether player won
   * @param {number} lastResult.bet - Amount bet
   * @param {number} lastResult.payout - Amount received
   * @returns {Object} { bet: number, state: Object }
   *
   * @example
   * // After a loss, doubles the bet
   * const { bet } = martingale.nextBet(
   *   { baseBet: 10, currentBet: 10, lossStreak: 0 },
   *   { won: false, bet: 10, payout: 0 }
   * );
   * // bet = 20
   *
   * // After a win, resets to base
   * const { bet } = martingale.nextBet(
   *   { baseBet: 10, currentBet: 40, lossStreak: 2 },
   *   { won: true, bet: 40, payout: 80 }
   * );
   * // bet = 10
   */
  nextBet(state, lastResult) {
    // First game or won last game: reset to base bet
    if (!lastResult || lastResult.won) {
      return {
        bet: state.baseBet,
        state: {
          ...state,
          currentBet: state.baseBet,
          lossStreak: 0,
        },
      };
    }

    // Lost: double the bet
    const nextBet = state.currentBet * 2;
    return {
      bet: nextBet,
      state: {
        ...state,
        currentBet: nextBet,
        lossStreak: state.lossStreak + 1,
      },
    };
  },
};
