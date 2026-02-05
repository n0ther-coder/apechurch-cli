/**
 * Martingale Betting Strategy
 * 
 * Classic doubling strategy:
 * - On loss: Double the bet
 * - On win: Reset to base bet
 * 
 * Theory: Eventually you'll win and recover all losses + profit of base bet.
 * Risk: Can hit table limits or bankroll limits quickly on losing streaks.
 * 
 * Example with 10 APE base:
 * L: 10 → L: 20 → L: 40 → W: 80 → Reset: 10
 */

export default {
  name: 'martingale',
  description: 'Double bet on loss, reset on win',
  
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
      lossStreak: 0,
    };
  },
  
  /**
   * Calculate next bet
   * @param {object} state - Current strategy state
   * @param {object|null} lastResult - Last game result { won, bet, payout } or null
   * @returns {{ bet: number, state: object }}
   */
  nextBet(state, lastResult) {
    // First game or won last game: use base bet
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
