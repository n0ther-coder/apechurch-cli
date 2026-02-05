/**
 * Flat Betting Strategy (Default)
 * 
 * Same bet amount every time, regardless of wins/losses.
 * This is the default strategy when none is specified.
 */

export default {
  name: 'flat',
  description: 'Same bet every time (default)',
  
  /**
   * Initialize strategy state
   * @param {number} baseBet - Starting bet amount
   * @param {object} opts - Additional options
   * @returns {object} Initial state
   */
  init(baseBet, opts = {}) {
    return {
      baseBet,
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
    // Always return the same bet
    return {
      bet: state.baseBet,
      state,
    };
  },
};
