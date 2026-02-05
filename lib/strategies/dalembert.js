/**
 * @fileoverview D'Alembert Betting Strategy
 *
 * Linear progression system named after 18th century mathematician Jean le Rond d'Alembert.
 *
 * Rules:
 * - On loss: Increase bet by one unit
 * - On win: Decrease bet by one unit (minimum base bet)
 *
 * Theory:
 * Based on the (flawed) "equilibrium" theory that wins and losses should
 * eventually balance out. By increasing bets after losses and decreasing
 * after wins, you profit when wins equal losses.
 *
 * Risk Profile:
 * - LOW-MODERATE RISK strategy
 * - Linear growth (much safer than exponential Martingale)
 * - 10 losses = 11x base bet (vs 1024x for Martingale)
 * - Slowest progression of negative systems
 *
 * Example with 10 APE base (unit = 10 APE):
 * ```
 * L: 10 → L: 20 → L: 30 → W: 40 → W: 30 → L: 20 → W: 30
 *
 * Losses: -10-20-30-20 = -80 APE
 * Wins: +40+30+30 = +100 APE
 * Net: +20 APE
 * ```
 *
 * Key insight: When wins = losses, you profit because wins happen
 * at higher bet sizes than earlier losses.
 *
 * When to use:
 * - Conservative players who want some progression
 * - Long grinding sessions
 * - Near 50% win rate games
 * - When you want progression without Martingale's risk
 *
 * When NOT to use:
 * - If you expect extended losing streaks
 * - Games with win rate significantly below 50%
 *
 * @module lib/strategies/dalembert
 */

export default {
  /**
   * Strategy name
   * @type {string}
   */
  name: 'dalembert',

  /**
   * Human-readable description
   * @type {string}
   */
  description: 'Add one unit on loss, subtract on win',

  /**
   * Initialize strategy state
   *
   * The base bet also serves as the "unit" for progression.
   * Each loss adds one unit, each win subtracts one unit.
   *
   * @param {number} baseBet - Starting bet amount in APE (also unit size)
   * @param {Object} [opts={}] - Additional options (unused)
   * @returns {Object} Initial state
   *
   * @example
   * const state = dalembert.init(10);
   * // state = { baseBet: 10, unit: 10, currentBet: 10 }
   */
  init(baseBet, opts = {}) {
    return {
      baseBet,
      unit: baseBet, // Unit size for increment/decrement
      currentBet: baseBet,
    };
  },

  /**
   * Calculate next bet based on last result
   *
   * - First game: Use base bet
   * - Win: Decrease by one unit (minimum base bet)
   * - Loss: Increase by one unit
   *
   * @param {Object} state - Current strategy state
   * @param {Object|null} lastResult - Last game result
   * @param {boolean} lastResult.won - Whether player won
   * @param {number} lastResult.bet - Amount bet
   * @param {number} lastResult.payout - Amount received
   * @returns {Object} { bet: number, state: Object }
   *
   * @example
   * // After a loss at 20, increases to 30
   * const { bet } = dalembert.nextBet(
   *   { baseBet: 10, unit: 10, currentBet: 20 },
   *   { won: false, bet: 20, payout: 0 }
   * );
   * // bet = 30
   *
   * // After a win at 30, decreases to 20
   * const { bet } = dalembert.nextBet(
   *   { baseBet: 10, unit: 10, currentBet: 30 },
   *   { won: true, bet: 30, payout: 60 }
   * );
   * // bet = 20
   *
   * // After a win at base bet, stays at base (can't go lower)
   * const { bet } = dalembert.nextBet(
   *   { baseBet: 10, unit: 10, currentBet: 10 },
   *   { won: true, bet: 10, payout: 20 }
   * );
   * // bet = 10 (minimum)
   */
  nextBet(state, lastResult) {
    // First game: use base bet
    if (!lastResult) {
      return {
        bet: state.baseBet,
        state,
      };
    }

    let nextBet;
    if (lastResult.won) {
      // Win: decrease by one unit (minimum base bet)
      nextBet = Math.max(state.baseBet, state.currentBet - state.unit);
    } else {
      // Loss: increase by one unit
      nextBet = state.currentBet + state.unit;
    }

    return {
      bet: nextBet,
      state: {
        ...state,
        currentBet: nextBet,
      },
    };
  },
};
