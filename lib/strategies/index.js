/**
 * Betting Strategy System
 * 
 * Strategies control wager sizing based on win/loss history.
 * They work alongside loop controls (--target, --stop-loss, --max-games).
 * 
 * Strategy Interface:
 * {
 *   name: string,
 *   description: string,
 *   init(baseBet, opts) => state,
 *   nextBet(state, lastResult) => { bet: number, state: newState }
 * }
 * 
 * lastResult: null (first game) | { won: boolean, bet: number, payout: number }
 */

import flat from './flat.js';
import martingale from './martingale.js';
import reverseMartingale from './reverse-martingale.js';
import fibonacci from './fibonacci.js';
import dalembert from './dalembert.js';

// Built-in strategies
const STRATEGIES = {
  flat,
  martingale,
  'reverse-martingale': reverseMartingale,
  'anti-martingale': reverseMartingale, // Alias
  fibonacci,
  dalembert,
  "d'alembert": dalembert, // Alias
};

/**
 * Get a strategy by name
 * @param {string} name - Strategy name
 * @returns {object|null} Strategy object or null if not found
 */
export function getStrategy(name) {
  if (!name) return STRATEGIES.flat;
  const normalized = name.toLowerCase().trim();
  return STRATEGIES[normalized] || null;
}

/**
 * List all available strategies
 * @returns {Array} Array of { name, description }
 */
export function listStrategies() {
  const seen = new Set();
  const list = [];
  
  for (const [name, strategy] of Object.entries(STRATEGIES)) {
    if (!seen.has(strategy.name)) {
      seen.add(strategy.name);
      list.push({
        name: strategy.name,
        description: strategy.description,
        aliases: Object.entries(STRATEGIES)
          .filter(([k, v]) => v.name === strategy.name && k !== strategy.name)
          .map(([k]) => k),
      });
    }
  }
  
  return list;
}

/**
 * Get strategy names as comma-separated string (for help text)
 */
export function getStrategyNames() {
  return [...new Set(Object.values(STRATEGIES).map(s => s.name))].join(', ');
}

/**
 * Calculate next bet with safety caps
 * @param {object} strategy - Strategy object
 * @param {object} state - Current strategy state
 * @param {object|null} lastResult - Last game result
 * @param {object} opts - Options { maxBet, availableBalance }
 * @returns {{ bet: number, state: object, capped: boolean }}
 */
export function calculateNextBet(strategy, state, lastResult, opts = {}) {
  const { maxBet, availableBalance } = opts;
  
  // Get raw bet from strategy
  const result = strategy.nextBet(state, lastResult);
  let bet = result.bet;
  let capped = false;
  
  // Apply max bet cap
  if (maxBet && bet > maxBet) {
    bet = maxBet;
    capped = true;
  }
  
  // Apply available balance cap
  if (availableBalance && bet > availableBalance) {
    bet = availableBalance;
    capped = true;
  }
  
  return {
    bet,
    state: result.state,
    capped,
  };
}

export default {
  getStrategy,
  listStrategies,
  getStrategyNames,
  calculateNextBet,
};
