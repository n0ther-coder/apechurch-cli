/**
 * Profile, state, and history management for Ape Church CLI
 */
import crypto from 'crypto';
import fs from 'fs';
import { SiweMessage } from 'siwe';
import {
  APECHURCH_DIR,
  PROFILE_FILE,
  STATE_FILE,
  HISTORY_FILE,
  ACTIVE_GAMES_FILE,
  PROFILE_API_URL,
  SIWE_DOMAIN,
  SIWE_URI,
  SIWE_CHAIN_ID,
  ZERO_ADDRESS,
  DEFAULT_COOLDOWN_MS,
} from './constants.js';
import { ensureDir } from './utils.js';
import { createClients } from './wallet.js';

const MAX_HISTORY_ENTRIES = 1000;

/**
 * Normalize strategy name to valid value
 */
export function normalizeStrategy(value) {
  const normalized = String(value || '').toLowerCase();
  if (['conservative', 'balanced', 'aggressive', 'degen'].includes(normalized)) {
    return normalized;
  }
  return 'balanced';
}

/**
 * Generate a random username
 */
export function generateUsername() {
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `APE_BOT_${suffix}`;
}

/**
 * Normalize and validate username
 */
export function normalizeUsername(value) {
  let name = String(value || '').trim();
  if (!name) {
    name = generateUsername();
  }
  const valid = /^[A-Za-z0-9_]+$/.test(name);
  if (!valid) {
    throw new Error('Username must contain only letters, numbers, and underscores.');
  }
  if (name.length > 32) {
    throw new Error('Username must be 32 characters or fewer.');
  }
  return name;
}

/**
 * Register username via SIWE
 */
export async function registerUsername({ account, username, persona }) {
  const { walletClient } = createClients(account);
  if (!walletClient) throw new Error('Wallet client unavailable.');

  const siweMessage = new SiweMessage({
    domain: SIWE_DOMAIN,
    address: account.address,
    statement: username,
    uri: SIWE_URI,
    version: '1',
    chainId: SIWE_CHAIN_ID,
    nonce: crypto.randomBytes(8).toString('hex'),
    issuedAt: new Date().toISOString(),
  });

  const message = siweMessage.prepareMessage();
  const signature = await walletClient.signMessage({ account, message });

  const payload = {
    message,
    signature,
    user_address: account.address,
    username,
    profile_picture_ipfs: null,
    referred_by_address: ZERO_ADDRESS,
    isAI: true,
  };

  const response = await fetch(PROFILE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = body?.error || `Registration failed (${response.status}).`;
    throw new Error(errorMsg);
  }

  const profile = saveProfile({
    ...loadProfile(),
    username,
    persona,
  });

  const state = loadState();
  state.strategy = normalizeStrategy(persona);
  saveState(state);

  return { profile, response: body };
}

// --- Profile Management ---

/**
 * Load profile from file
 */
export function loadProfile() {
  ensureDir(APECHURCH_DIR);
  if (!fs.existsSync(PROFILE_FILE)) {
    const initial = {
      version: 1,
      persona: 'balanced',
      username: null,
      paused: false,
      referral: null,
      overrides: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
    return {
      version: 1,
      persona: normalizeStrategy(raw.persona || 'balanced'),
      username: raw.username || null,
      paused: Boolean(raw.paused),
      referral: raw.referral || null,
      overrides: raw.overrides || {},
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
  } catch (error) {
    const fallback = {
      version: 1,
      persona: 'balanced',
      username: null,
      paused: false,
      referral: null,
      overrides: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

/**
 * Save profile to file
 */
export function saveProfile(profile) {
  ensureDir(APECHURCH_DIR);
  const updated = {
    ...profile,
    persona: normalizeStrategy(profile.persona || 'balanced'),
    paused: Boolean(profile.paused),
    overrides: profile.overrides || {},
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(updated, null, 2));
  return updated;
}

// --- State Management ---

/**
 * Load state from file
 */
export function loadState() {
  ensureDir(APECHURCH_DIR);
  if (!fs.existsSync(STATE_FILE)) {
    const initial = {
      version: 1,
      strategy: 'balanced',
      lastHeartbeat: 0,
      lastPlay: 0,
      cooldownMs: DEFAULT_COOLDOWN_MS,
      sessionWins: 0,
      sessionLosses: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      totalPnLWei: '0',
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      version: 1,
      strategy: raw.strategy || 'balanced',
      lastHeartbeat: Number(raw.lastHeartbeat || 0),
      lastPlay: Number(raw.lastPlay || 0),
      cooldownMs: Number(raw.cooldownMs || DEFAULT_COOLDOWN_MS),
      sessionWins: Number(raw.sessionWins || 0),
      sessionLosses: Number(raw.sessionLosses || 0),
      consecutiveWins: Number(raw.consecutiveWins || 0),
      consecutiveLosses: Number(raw.consecutiveLosses || 0),
      totalPnLWei: raw.totalPnLWei || '0',
    };
  } catch (error) {
    const fallback = {
      version: 1,
      strategy: 'balanced',
      lastHeartbeat: 0,
      lastPlay: 0,
      cooldownMs: DEFAULT_COOLDOWN_MS,
      sessionWins: 0,
      sessionLosses: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      totalPnLWei: '0',
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

/**
 * Save state to file
 */
export function saveState(state) {
  ensureDir(APECHURCH_DIR);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// --- History Management ---

/**
 * Load history from file
 */
export function loadHistory() {
  ensureDir(APECHURCH_DIR);
  if (!fs.existsSync(HISTORY_FILE)) {
    return { games: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    return { games: Array.isArray(data.games) ? data.games : [] };
  } catch {
    return { games: [] };
  }
}

/**
 * Save history to file
 */
export function saveHistory(history) {
  ensureDir(APECHURCH_DIR);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

/**
 * Save a game to history
 */
export function saveGameToHistory({ contract, gameId, timestamp }) {
  const history = loadHistory();
  history.games.unshift({ contract, gameId, timestamp });
  if (history.games.length > MAX_HISTORY_ENTRIES) {
    history.games = history.games.slice(0, MAX_HISTORY_ENTRIES);
  }
  saveHistory(history);
}

// --- Active Games Management (Stateful Games) ---

/**
 * Load active games from file
 * Returns object with game type keys and arrays of gameId strings
 */
export function loadActiveGames() {
  ensureDir(APECHURCH_DIR);
  if (!fs.existsSync(ACTIVE_GAMES_FILE)) {
    return {};
  }
  try {
    const data = JSON.parse(fs.readFileSync(ACTIVE_GAMES_FILE, 'utf8'));
    // Ensure all values are arrays
    const cleaned = {};
    for (const [key, value] of Object.entries(data)) {
      cleaned[key] = Array.isArray(value) ? value : [];
    }
    return cleaned;
  } catch {
    return {};
  }
}

/**
 * Save active games to file
 */
export function saveActiveGames(games) {
  ensureDir(APECHURCH_DIR);
  fs.writeFileSync(ACTIVE_GAMES_FILE, JSON.stringify(games, null, 2));
}

/**
 * Add a game ID to active games for a game type
 */
export function addActiveGame(gameType, gameId) {
  const games = loadActiveGames();
  games[gameType] = games[gameType] || [];
  const idStr = gameId.toString();
  if (!games[gameType].includes(idStr)) {
    games[gameType].push(idStr);
  }
  saveActiveGames(games);
}

/**
 * Remove a game ID from active games
 */
export function removeActiveGame(gameType, gameId) {
  const games = loadActiveGames();
  const idStr = gameId.toString();
  games[gameType] = (games[gameType] || []).filter(id => id !== idStr);
  saveActiveGames(games);
}

/**
 * Check if there are any active games for a game type
 */
export function hasActiveGame(gameType) {
  const games = loadActiveGames();
  return (games[gameType] || []).length > 0;
}

/**
 * Get the oldest (first) active game ID for a game type
 * Returns null if no active games
 */
export function getOldestActiveGame(gameType) {
  const games = loadActiveGames();
  const arr = games[gameType] || [];
  return arr.length > 0 ? arr[0] : null;
}

/**
 * Get all active game IDs for a game type
 */
export function getActiveGames(gameType) {
  const games = loadActiveGames();
  return games[gameType] || [];
}

/**
 * Get count of active games for a game type
 */
export function getActiveGameCount(gameType) {
  const games = loadActiveGames();
  return (games[gameType] || []).length;
}
