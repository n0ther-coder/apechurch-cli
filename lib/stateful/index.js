/**
 * Stateful Games Registry
 * 
 * Stateful games differ from simple games:
 * - Multiple transactions per game (not fire-and-forget)
 * - Decision points requiring user input (hit, stand, etc.)
 * - Game state stored on-chain, fetched via gameId
 * - Can have unfinished games that need resuming
 * - Interactive REPL mode for humans, flags for agents
 */

// Import stateful game modules
// import * as blackjack from './blackjack/index.js';
// import * as videopoker from './videopoker/index.js';

/**
 * Registry of stateful games
 * Each entry contains:
 * - name: Display name
 * - slug: URL/command slug
 * - description: Short description
 * - type: 'stateful'
 * - contract: Contract address
 * - module: Game module with start, resume, action handlers
 */
export const STATEFUL_GAME_REGISTRY = {
  // blackjack: {
  //   name: 'Blackjack',
  //   slug: 'blackjack',
  //   description: 'Classic 21 with splits, doubles, insurance & side bets',
  //   type: 'stateful',
  //   contract: '0x...', // TODO: Add contract address
  //   aliases: ['bj', '21'],
  //   module: blackjack,
  // },
  // videopoker: {
  //   name: 'Video Poker',
  //   slug: 'video-poker',
  //   description: 'Jacks or Better video poker',
  //   type: 'stateful',
  //   contract: '0x...',
  //   aliases: ['vp', 'poker'],
  //   module: videopoker,
  // },
};

/**
 * List all stateful games
 */
export function listStatefulGames() {
  return Object.keys(STATEFUL_GAME_REGISTRY);
}

/**
 * Resolve a game name/alias to its registry entry
 */
export function resolveStatefulGame(input) {
  if (!input) return null;
  const lower = input.toLowerCase().trim();
  
  // Direct match
  if (STATEFUL_GAME_REGISTRY[lower]) {
    return { key: lower, ...STATEFUL_GAME_REGISTRY[lower] };
  }
  
  // Alias match
  for (const [key, entry] of Object.entries(STATEFUL_GAME_REGISTRY)) {
    if (entry.aliases && entry.aliases.includes(lower)) {
      return { key, ...entry };
    }
  }
  
  return null;
}

/**
 * Check if a game is a stateful game
 */
export function isStatefulGame(input) {
  return resolveStatefulGame(input) !== null;
}
