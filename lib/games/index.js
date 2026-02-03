/**
 * Game router - exports unified playGame function
 */
import { parseEther } from 'viem';
import { resolveGame, listGames } from '../../registry.js';
import { createClients } from '../wallet.js';
import { sanitizeError } from '../utils.js';

// Import game handlers
import { playPlinko, getPlinkoConfig } from './plinko.js';
import { playSlots, getSlotsConfig } from './slots.js';
import { playRoulette, getRouletteConfig } from './roulette.js';
import { playBaccarat, getBaccaratConfig } from './baccarat.js';
import { playApestrong, getApestrongConfig } from './apestrong.js';
import { playKeno, getKenoConfig } from './keno.js';
import { playSpeedKeno, getSpeedKenoConfig } from './speedkeno.js';

const GAME_LIST = listGames().join(' | ');

// Map game types to handlers
const gameHandlers = {
  plinko: playPlinko,
  slots: playSlots,
  roulette: playRoulette,
  baccarat: playBaccarat,
  apestrong: playApestrong,
  keno: playKeno,
  speedkeno: playSpeedKeno,
};

// Map game types to config getters
export const configGetters = {
  plinko: getPlinkoConfig,
  slots: getSlotsConfig,
  roulette: getRouletteConfig,
  baccarat: getBaccaratConfig,
  apestrong: getApestrongConfig,
  keno: getKenoConfig,
  speedkeno: getSpeedKenoConfig,
};

/**
 * Play a game
 */
export async function playGame({
  account,
  game,
  amountApe,
  mode,
  balls,
  spins,
  bet,
  range,
  picks,
  numbers,
  games,
  timeoutMs,
  referral,
}) {
  const gameKey = String(game || '').toLowerCase();
  const safeTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs >= 0 ? timeoutMs : 0;

  const gameEntry = resolveGame(gameKey);
  if (!gameEntry) {
    throw new Error(`Unknown game. Use: ${GAME_LIST}`);
  }

  let wager;
  try {
    wager = parseEther(String(amountApe));
  } catch (error) {
    throw new Error(`Invalid amount: ${sanitizeError(error)}`);
  }

  const { publicClient, walletClient } = createClients(account);

  const handler = gameHandlers[gameEntry.type];
  if (!handler) {
    throw new Error(`Unsupported game type: ${gameEntry.type}`);
  }

  // Call the appropriate handler
  return handler({
    account,
    publicClient,
    walletClient,
    gameEntry,
    wager,
    mode,
    balls,
    spins,
    bet,
    range,
    picks,
    numbers,
    games,
    referral,
    timeoutMs: safeTimeoutMs,
  });
}

// Re-export for convenience
export { resolveGame, listGames };
export { getPlinkoConfig } from './plinko.js';
export { getSlotsConfig } from './slots.js';
export { getRouletteConfig } from './roulette.js';
export { getBaccaratConfig } from './baccarat.js';
export { getApestrongConfig } from './apestrong.js';
export { getKenoConfig } from './keno.js';
export { getSpeedKenoConfig } from './speedkeno.js';
