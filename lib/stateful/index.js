/**
 * @fileoverview Stateful Games Registry
 *
 * Stateful games are fundamentally different from simple fire-and-forget games:
 *
 * Simple Games (Roulette, Plinko, etc.):
 * - Single transaction: bet → VRF → result
 * - No player decisions after betting
 * - State exists only during VRF resolution
 *
 * Stateful Games (Blackjack, Video Poker):
 * - Multiple transactions per game
 * - Decision points requiring player input (hit/stand, hold/draw)
 * - Game state stored on-chain between actions
 * - Can be paused and resumed (game ID tracking)
 * - Support both interactive REPL mode and JSON flag mode
 *
 * Architecture:
 * Each stateful game module provides:
 * - start(): Begin a new game (initial bet transaction)
 * - resume(): Continue an unfinished game
 * - action(): Execute a game action (hit, stand, etc.)
 * - getState(): Fetch current game state from chain
 * - formatState(): Display state for humans or JSON
 *
 * @module lib/stateful/index
 */

// ============================================================================
// REGISTRY
// ============================================================================

/**
 * Registry of stateful games
 *
 * Each entry contains:
 * - name: Display name
 * - slug: URL/command slug
 * - description: Short description
 * - type: Always 'stateful' for this registry
 * - contract: On-chain contract address
 * - aliases: Alternative command names
 * - module: Game module with handlers (start, resume, action, etc.)
 *
 * Note: Blackjack and Video Poker are implemented directly in their
 * respective modules rather than registered here, as they have
 * complex command structures that don't fit the simple registry pattern.
 *
 * @type {Object<string, Object>}
 */
export const STATEFUL_GAME_REGISTRY = {
  // Stateful games are registered here as they're added
  // Currently, blackjack and video-poker have dedicated CLI commands
  // rather than going through this generic registry
};

// ============================================================================
// LOOKUP FUNCTIONS
// ============================================================================

/**
 * List all registered stateful games
 *
 * @returns {string[]} Array of game keys
 *
 * @example
 * listStatefulGames() // ['blackjack', 'video-poker']
 */
export function listStatefulGames() {
  return Object.keys(STATEFUL_GAME_REGISTRY);
}

/**
 * Resolve a game name or alias to its registry entry
 *
 * @param {string|null} input - Game name or alias
 * @returns {Object|null} Registry entry with added 'key' field, or null if not found
 *
 * @example
 * resolveStatefulGame('bj')     // Returns blackjack entry
 * resolveStatefulGame('21')     // Returns blackjack entry (alias)
 * resolveStatefulGame('invalid') // Returns null
 */
export function resolveStatefulGame(input) {
  if (!input) return null;
  const lower = input.toLowerCase().trim();

  // Direct key match
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
 * Check if a game name refers to a stateful game
 *
 * @param {string} input - Game name or alias
 * @returns {boolean} True if game is stateful
 *
 * @example
 * isStatefulGame('blackjack') // true
 * isStatefulGame('roulette')  // false
 */
export function isStatefulGame(input) {
  return resolveStatefulGame(input) !== null;
}
