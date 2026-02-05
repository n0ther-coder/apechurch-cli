/**
 * D'Alembert Betting Strategy
 * 
 * Linear progression system:
 * - On loss: Increase bet by one unit
 * - On win: Decrease bet by one unit (minimum base bet)
 * 
 * Theory: Safer than Martingale due to linear vs exponential growth.
 * Risk: Can still accumulate losses on long losing streaks.
 * 
 * Example with 10 APE base (unit = base bet):
 * L: 10 → L: 20 → L: 30 → W: 40 → W: 30 → L: 20 → W: 30
 */

export default {
  name: 'dalembert',
  description: 'Add one unit on loss, subtract on win',
  
  /**
   * Initialize strategy state
   * @param {number} baseBet - Starting bet amount (also used as unit size)
   * @param {object} opts - Additional options
   * @returns {object} Initial state
   */
  init(baseBet, opts = {}) {
    return {
      baseBet,
      unit: baseBet, // Unit size for increment/decrement
      currentBet: baseBet,
    };
  },
  
  /**
   * Calculate next bet
   * @param {object} state - Current strategy state
   * @param {object|null} lastResult - Last game result { won, bet, payout } or null
   * @returns {{ bet: number, state: object }}
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
