/**
 * @fileoverview Game Router - Unified entry point for all game types
 *
 * This module provides a single playGame() function that routes to
 * the appropriate game handler based on game type.
 *
 * Architecture:
 * - Each game type has its own handler module (plinko.js, roulette.js, etc.)
 * - Handlers export play*() and get*Config() functions
 * - This router maps game types to handlers and validates input
 *
 * Adding a New Game:
 * 1. Create lib/games/<type>.js with play<Type>() and get<Type>Config()
 * 2. Import the handler here
 * 3. Add to gameHandlers and configGetters maps
 * 4. See docs/ADDING_GAMES.md for the full guide
 *
 * @module lib/games/index
 */
import { parseEther } from 'viem';
import { resolveGame, listGames } from '../../registry.js';
import { createClients } from '../wallet.js';
import { sanitizeError } from '../utils.js';
import { parseGameConfigValue } from '../game-config.js';

// ============================================================================
// GAME HANDLER IMPORTS
// ============================================================================

import { playPlinko, getPlinkoConfig } from './plinko.js';
import { playSlots, getSlotsConfig } from './slots.js';
import { playRoulette, getRouletteConfig } from './roulette.js';
import { playBaccarat, getBaccaratConfig } from './baccarat.js';
import { playApestrong, getApestrongConfig } from './apestrong.js';
import { playKeno, getKenoConfig } from './keno.js';
import { playSpeedKeno, getSpeedKenoConfig } from './speedkeno.js';
import { playBearDice, getBearDiceConfig } from './beardice.js';
import { playMonkeyMatch, getMonkeyMatchConfig } from './monkeymatch.js';
import { playPrimes, getPrimesConfig } from './primes.js';
import { playBlocks, getBlocksConfig } from './blocks.js';

// ============================================================================
// HANDLER REGISTRY
// ============================================================================

/**
 * Human-readable list of available games for error messages
 * @type {string}
 */
const GAME_LIST = listGames().join(' | ');

/**
 * Map of game types to their play handler functions
 *
 * Each handler takes standardized parameters and returns a response object.
 * Handler signature: async function(params) => response
 *
 * @type {Object<string, Function>}
 */
const gameHandlers = {
  plinko: playPlinko,       // Jungle/Cosmic Plinko (ball drop)
  slots: playSlots,         // Dino Dough, Bubblegum Heist (slot machines)
  roulette: playRoulette,   // American roulette
  baccarat: playBaccarat,   // Classic baccarat
  apestrong: playApestrong, // Pick-your-odds dice
  keno: playKeno,           // Standard keno (1-10 picks from 1-40)
  speedkeno: playSpeedKeno, // Fast keno (1-5 picks from 1-20, batched)
  beardice: playBearDice,   // Bear-A-Dice (avoid unlucky numbers)
  monkeymatch: playMonkeyMatch, // Monkey Match (poker hands from barrels)
  primes: playPrimes,       // Prime-or-zero batched number game
  blocks: playBlocks,       // Blocks (3x3 cluster board, consecutive all-or-nothing rolls)
};

/**
 * Map of game types to their config getter functions
 *
 * Config getters extract game-specific parameters from CLI options
 * and return a normalized config object.
 *
 * @type {Object<string, Function>}
 */
export const configGetters = {
  plinko: getPlinkoConfig,
  slots: getSlotsConfig,
  roulette: getRouletteConfig,
  baccarat: getBaccaratConfig,
  apestrong: getApestrongConfig,
  keno: getKenoConfig,
  speedkeno: getSpeedKenoConfig,
  beardice: getBearDiceConfig,
  monkeymatch: getMonkeyMatchConfig,
  primes: getPrimesConfig,
  blocks: getBlocksConfig,
};

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Play a game - unified entry point for all game types
 *
 * This is the main function called by the CLI play command.
 * It validates input, resolves the game, and routes to the appropriate handler.
 *
 * @param {Object} params - Game parameters
 * @param {import('viem/accounts').PrivateKeyAccount} params.account - Player's account
 * @param {string} params.game - Game key or alias (e.g., 'jungle', 'roulette')
 * @param {number|string} params.amountApe - Wager amount in APE
 * @param {number|string} [params.risk] - Public risk level (risk-based games)
 * @param {number} [params.mode] - Internal mode value (legacy surface)
 * @param {number} [params.balls] - Number of balls (plinko)
 * @param {number} [params.spins] - Number of spins (slots)
 * @param {string} [params.bet] - Bet type (roulette, baccarat)
 * @param {number} [params.range] - Win probability % (apestrong)
 * @param {number} [params.picks] - Number of picks (keno)
 * @param {string} [params.numbers] - Specific numbers to pick (keno)
 * @param {number} [params.games] - Number of batched games (speed keno)
 * @param {number} [params.difficulty] - Internal difficulty value (legacy surface)
 * @param {number} [params.rolls] - Number of rolls (bear dice)
 * @param {number} [params.runs] - Number of batched runs (primes)
 * @param {number} [params.timeoutMs] - How long to wait for result (0 = don't wait)
 * @param {string} [params.referral] - Referral address
 *
 * @returns {Promise<Object>} Response object with status, tx, and result
 * @throws {Error} If game is unknown or parameters are invalid
 *
 * @example
 * // Play Jungle Plinko
 * const result = await playGame({
 *   account,
 *   game: 'jungle',
 *   amountApe: 10,
 *   mode: 2,
 *   balls: 50,
 *   timeoutMs: 30000,
 * });
 *
 * // Play Roulette
 * const result = await playGame({
 *   account,
 *   game: 'roulette',
 *   amountApe: 5,
 *   bet: 'RED',
 *   timeoutMs: 30000,
 * });
 */
export async function playGame({
  account,
  game,
  amountApe,
  risk,
  mode,
  balls,
  spins,
  bet,
  range,
  picks,
  numbers,
  games,
  difficulty,
  rolls,
  runs,
  timeoutMs,
  referral,
  gpPerApe,
}) {
  // Normalize game key
  const gameKey = String(game || '').toLowerCase();

  // Validate timeout (default to 0 = don't wait)
  const safeTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs >= 0 ? timeoutMs : 0;

  // Resolve game from registry
  const gameEntry = resolveGame(gameKey);
  if (!gameEntry) {
    throw new Error(`Unknown game. Use: ${GAME_LIST}`);
  }

  // Parse wager amount
  let wager;
  try {
    wager = parseEther(String(amountApe));
  } catch (error) {
    throw new Error(`Invalid amount: ${sanitizeError(error)}`);
  }

  // Create blockchain clients
  const { publicClient, walletClient } = createClients(account);

  // Get handler for this game type
  const handler = gameHandlers[gameEntry.type];
  if (!handler) {
    throw new Error(`Unsupported game type: ${gameEntry.type}`);
  }

  let resolvedMode = mode;
  let resolvedDifficulty = difficulty;

  if (risk !== undefined) {
    if (gameEntry.config?.mode?.cliName === 'risk') {
      resolvedMode = parseGameConfigValue(gameEntry, 'mode', risk, { numericKind: 'public' });
    } else if (gameEntry.config?.difficulty?.cliName === 'risk') {
      resolvedDifficulty = parseGameConfigValue(gameEntry, 'difficulty', risk, { numericKind: 'public' });
    }
  }

  // Delegate to game-specific handler
  return handler({
    account,
    publicClient,
    walletClient,
    gameEntry,
    wager,
    // Game-specific parameters (handlers extract what they need)
    risk,
    mode: resolvedMode,
    balls,
    spins,
    bet,
    range,
    picks,
    numbers,
    games,
    difficulty: resolvedDifficulty,
    rolls,
    runs,
    referral,
    gpPerApe,
    timeoutMs: safeTimeoutMs,
  });
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

/**
 * Re-export registry functions for convenience
 *
 * Allows consumers to import everything from lib/games
 */
export { resolveGame, listGames };

/**
 * Re-export individual config getters
 *
 * Used by strategy selection to get game parameters from CLI options
 */
export { getPlinkoConfig } from './plinko.js';
export { getSlotsConfig } from './slots.js';
export { getRouletteConfig } from './roulette.js';
export { getBaccaratConfig } from './baccarat.js';
export { getApestrongConfig } from './apestrong.js';
export { getKenoConfig } from './keno.js';
export { getSpeedKenoConfig } from './speedkeno.js';
export { getBearDiceConfig } from './beardice.js';
export { getMonkeyMatchConfig } from './monkeymatch.js';
export { getPrimesConfig } from './primes.js';
export { getBlocksConfig } from './blocks.js';
