/**
 * @fileoverview Fibonacci Betting Strategy
 *
 * Uses the Fibonacci sequence (1, 1, 2, 3, 5, 8, 13, 21...) for bet progression.
 *
 * Rules:
 * - On loss: Move forward one step in sequence
 * - On win: Move back two steps (or reset if at start)
 *
 * Theory:
 * Slower progression than Martingale (linear growth of sequence position
 * vs exponential growth of bet size). A win recovers multiple losses
 * by jumping back 2 positions.
 *
 * Risk Profile:
 * - MODERATE-HIGH RISK strategy
 * - Gentler on bankroll than Martingale
 * - Still grows exponentially (Fibonacci IS exponential, just slower)
 * - Position 10 = 55x base, Position 15 = 610x base
 *
 * Example with 10 APE base:
 * ```
 * Position: 0   1   2   3   4   5   6   7
 * Fib mult: 1   1   2   3   5   8  13  21
 *
 * L: 10 (pos 0→1) → L: 10 (pos 1→2) → L: 20 (pos 2→3) →
 * L: 30 (pos 3→4) → W: 50 (pos 4→2) → Back to 20 APE bet
 * ```
 *
 * The key insight: After the win at position 4, we go back to position 2,
 * which means we've recovered losses from positions 3 and 4.
 *
 * When to use:
 * - Prefer slower progression than Martingale
 * - Medium-length sessions
 * - Near 50% win rate games
 *
 * When NOT to use:
 * - Very long sessions (will still hit limits)
 * - Small bankrolls
 *
 * @module lib/strategies/fibonacci
 */

/**
 * Pre-computed Fibonacci multipliers
 *
 * 15 values covers practical use cases (position 14 = 610x base bet).
 * Beyond this, you've likely hit bankroll or bet limits anyway.
 *
 * @type {number[]}
 */
const FIB = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610];

export default {
  /**
   * Strategy name
   * @type {string}
   */
  name: 'fibonacci',

  /**
   * Human-readable description
   * @type {string}
   */
  description: 'Fibonacci sequence on loss, step back on win',

  /**
   * Initialize strategy state
   *
   * @param {number} baseBet - Starting bet amount in APE (also the "unit")
   * @param {Object} [opts={}] - Additional options (unused)
   * @returns {Object} Initial state
   *
   * @example
   * const state = fibonacci.init(10);
   * // state = { baseBet: 10, index: 0 }
   * // First bet will be 10 * FIB[0] = 10 APE
   */
  init(baseBet, opts = {}) {
    return {
      baseBet,
      index: 0, // Position in Fibonacci sequence
    };
  },

  /**
   * Calculate next bet based on last result
   *
   * - First game: Use position 0 (1x multiplier)
   * - Win: Move back 2 positions (minimum 0)
   * - Loss: Move forward 1 position (capped at sequence length)
   *
   * @param {Object} state - Current strategy state
   * @param {Object|null} lastResult - Last game result
   * @param {boolean} lastResult.won - Whether player won
   * @param {number} lastResult.bet - Amount bet
   * @param {number} lastResult.payout - Amount received
   * @returns {Object} { bet: number, state: Object }
   *
   * @example
   * // After a loss at position 3, moves to position 4
   * const { bet } = fibonacci.nextBet(
   *   { baseBet: 10, index: 3 },
   *   { won: false, bet: 30, payout: 0 }
   * );
   * // bet = 10 * FIB[4] = 50 APE
   *
   * // After a win at position 4, moves back to position 2
   * const { bet } = fibonacci.nextBet(
   *   { baseBet: 10, index: 4 },
   *   { won: true, bet: 50, payout: 100 }
   * );
   * // bet = 10 * FIB[2] = 20 APE
   */
  nextBet(state, lastResult) {
    let newIndex = state.index;

    if (lastResult) {
      if (lastResult.won) {
        // Win: move back 2 steps in sequence (minimum position 0)
        newIndex = Math.max(0, state.index - 2);
      } else {
        // Loss: move forward 1 step (cap at sequence end)
        newIndex = Math.min(state.index + 1, FIB.length - 1);
      }
    }

    // Calculate bet as baseBet * Fibonacci multiplier
    const multiplier = FIB[newIndex];
    const bet = state.baseBet * multiplier;

    return {
      bet,
      state: {
        ...state,
        index: newIndex,
      },
    };
  },
};
