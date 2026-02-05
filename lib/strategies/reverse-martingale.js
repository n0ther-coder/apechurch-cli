/**
 * Reverse Martingale (Anti-Martingale) Betting Strategy
 * 
 * Opposite of Martingale:
 * - On win: Double the bet (ride the streak)
 * - On loss: Reset to base bet
 * 
 * Theory: Capitalize on winning streaks while limiting losses.
 * Risk: One loss wipes out accumulated winnings from the streak.
 * 
 * Example with 10 APE base:
 * W: 10 → W: 20 → W: 40 → L: 80 → Reset: 10
 */

export default {
  name: 'reverse-martingale',
  description: 'Double bet on win, reset on loss',
  
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
      winStreak: 0,
    };
  },
  
  /**
   * Calculate next bet
   * @param {object} state - Current strategy state
   * @param {object|null} lastResult - Last game result { won, bet, payout } or null
   * @returns {{ bet: number, state: object }}
   */
  nextBet(state, lastResult) {
    // First game or lost last game: use base bet
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
    
    // Won: double the bet
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
