/**
 * Fibonacci Betting Strategy
 * 
 * Uses Fibonacci sequence for bet progression:
 * - On loss: Move forward in sequence (1, 1, 2, 3, 5, 8, 13, 21...)
 * - On win: Move back 2 steps in sequence (or reset if at start)
 * 
 * Theory: Slower progression than Martingale, gentler on bankroll.
 * Risk: Still grows exponentially, just slower.
 * 
 * Example with 10 APE base (multiplier):
 * L: 10 (1x) → L: 10 (1x) → L: 20 (2x) → L: 30 (3x) → W: 50 (5x) → Back: 20 (2x)
 */

// Pre-computed Fibonacci multipliers (enough for practical use)
const FIB = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610];

export default {
  name: 'fibonacci',
  description: 'Fibonacci sequence on loss, step back on win',
  
  /**
   * Initialize strategy state
   * @param {number} baseBet - Starting bet amount
   * @param {object} opts - Additional options
   * @returns {object} Initial state
   */
  init(baseBet, opts = {}) {
    return {
      baseBet,
      index: 0, // Position in Fibonacci sequence
    };
  },
  
  /**
   * Calculate next bet
   * @param {object} state - Current strategy state
   * @param {object|null} lastResult - Last game result { won, bet, payout } or null
   * @returns {{ bet: number, state: object }}
   */
  nextBet(state, lastResult) {
    let newIndex = state.index;
    
    if (lastResult) {
      if (lastResult.won) {
        // Win: move back 2 steps (minimum 0)
        newIndex = Math.max(0, state.index - 2);
      } else {
        // Loss: move forward 1 step (cap at sequence length)
        newIndex = Math.min(state.index + 1, FIB.length - 1);
      }
    }
    
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
