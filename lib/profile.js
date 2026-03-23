/**
 * @fileoverview Profile, state, and history management for Ape Church CLI
 *
 * Manages persistent user data across sessions:
 * - Profile: User preferences, username, referral, persona
 * - State: Session statistics, win/loss tracking, betting strategy state
 * - History: Record of played games for verification
 * - Active Games: Tracks in-progress multi-step games (Blackjack, Video Poker)
 *
 * All data stored in ~/.apechurch-cli-gx54/ as JSON files.
 *
 * @module lib/profile
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

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum number of games to store in history
 * Prevents unbounded file growth
 * @type {number}
 */
const MAX_HISTORY_ENTRIES = 1000;

/**
 * Valid strategy/persona values
 * Used for validation and normalization
 * @type {string[]}
 */
const VALID_STRATEGIES = ['conservative', 'balanced', 'aggressive', 'degen'];

/**
 * Valid card display modes for Blackjack/Video Poker
 * - full: ASCII art cards
 * - simple: Text-only card names
 * - json: Raw JSON output
 * @type {string[]}
 */
const VALID_CARD_DISPLAYS = ['full', 'simple', 'json'];

// ============================================================================
// VALIDATION & NORMALIZATION
// ============================================================================

/**
 * Normalize strategy name to a valid value
 *
 * Strategies control risk level and bet sizing:
 * - conservative: 5% of bankroll, safer bets
 * - balanced: 8% of bankroll, moderate risk
 * - aggressive: 12% of bankroll, higher variance
 * - degen: 20% of bankroll, maximum risk
 *
 * @param {string|null|undefined} value - Strategy name to normalize
 * @returns {string} Valid strategy name (defaults to 'balanced')
 */
export function normalizeStrategy(value) {
  const normalized = String(value || '').toLowerCase();
  if (VALID_STRATEGIES.includes(normalized)) {
    return normalized;
  }
  return 'balanced';
}

/**
 * Normalize card display preference
 *
 * Controls how cards are rendered in Blackjack/Video Poker:
 * - full: ASCII art with suit symbols (🂡 style)
 * - simple: Text like "A♠ K♥"
 * - json: Raw JSON (for scripting/automation)
 *
 * @param {string|null|undefined} value - Display preference
 * @returns {string} Valid display mode (defaults to 'full')
 */
export function normalizeCardDisplay(value) {
  const normalized = String(value || '').toLowerCase();
  if (VALID_CARD_DISPLAYS.includes(normalized)) {
    return normalized;
  }
  return 'full';
}

/**
 * Generate a random username
 *
 * Format: APE_BOT_XXXXXXXX (8 hex chars)
 * Used when user doesn't provide a custom username.
 *
 * @returns {string} Generated username
 */
export function generateUsername() {
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `APE_BOT_${suffix}`;
}

/**
 * Normalize and validate a username
 *
 * Rules:
 * - Only alphanumeric and underscores allowed
 * - Maximum 32 characters
 * - If empty/null, generates a random username
 *
 * @param {string|null|undefined} value - Username to validate
 * @returns {string} Valid username
 * @throws {Error} If username contains invalid characters or is too long
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

// ============================================================================
// USERNAME REGISTRATION (SIWE)
// ============================================================================

/**
 * Register username via SIWE (Sign-In With Ethereum)
 *
 * SIWE flow:
 * 1. Create a message containing the username in the statement field
 * 2. Sign the message with the user's private key
 * 3. POST to ape.church API to register the association
 *
 * This proves ownership of the wallet address without exposing the private key.
 *
 * @param {Object} params - Registration parameters
 * @param {import('viem/accounts').PrivateKeyAccount} params.account - User's account
 * @param {string} params.username - Desired username
 * @param {string} params.persona - Strategy persona
 * @returns {Promise<Object>} { profile, response } on success
 * @throws {Error} If registration fails
 */
export async function registerUsername({ account, username, persona }) {
  const { walletClient } = createClients(account);
  if (!walletClient) throw new Error('Wallet client unavailable.');

  // Build SIWE message with username in statement
  const siweMessage = new SiweMessage({
    domain: SIWE_DOMAIN,           // ape.church
    address: account.address,      // Wallet address being registered
    statement: username,           // Username goes in statement
    uri: SIWE_URI,                 // https://ape.church
    version: '1',                  // SIWE version
    chainId: SIWE_CHAIN_ID,        // ApeChain (33139)
    nonce: crypto.randomBytes(8).toString('hex'),  // Replay protection
    issuedAt: new Date().toISOString(),
  });

  const message = siweMessage.prepareMessage();
  const signature = await walletClient.signMessage({ account, message });

  // POST to registration API
  const payload = {
    message,
    signature,
    user_address: account.address,
    username,
    profile_picture_ipfs: null,      // No avatar support yet
    referred_by_address: ZERO_ADDRESS, // Referral set separately via profile
    isAI: true,                      // Mark as AI/agent
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

  // Update local profile with registered username
  const profile = saveProfile({
    ...loadProfile(),
    username,
    persona,
  });

  // Sync strategy to state
  const state = loadState();
  state.strategy = normalizeStrategy(persona);
  saveState(state);

  return { profile, response: body };
}

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================

/**
 * Load profile from file
 *
 * Creates default profile if none exists.
 * Handles corrupted files by resetting to defaults.
 *
 * Profile fields:
 * - version: Schema version for future migrations
 * - persona: Strategy preset (conservative/balanced/aggressive/degen)
 * - username: Registered on-chain username (null if not registered)
 * - paused: Whether autonomous play is paused
 * - referral: Referral address for game transactions
 * - overrides: Custom settings that override defaults
 * - cardDisplay: How to render cards (full/simple/json)
 * - createdAt/updatedAt: Timestamps
 *
 * @returns {Object} Profile object
 */
export function loadProfile() {
  ensureDir(APECHURCH_DIR);

  // Create default profile if none exists
  if (!fs.existsSync(PROFILE_FILE)) {
    const initial = {
      version: 1,
      persona: 'balanced',
      username: null,
      paused: false,
      referral: null,
      overrides: {},
      cardDisplay: 'full',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }

  // Load and normalize existing profile
  try {
    const raw = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
    return {
      version: 1,
      persona: normalizeStrategy(raw.persona || 'balanced'),
      username: raw.username || null,
      paused: Boolean(raw.paused),
      referral: raw.referral || null,
      overrides: raw.overrides || {},
      cardDisplay: normalizeCardDisplay(raw.cardDisplay),
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
  } catch {
    // Corrupted file - reset to defaults
    const fallback = {
      version: 1,
      persona: 'balanced',
      username: null,
      paused: false,
      referral: null,
      overrides: {},
      cardDisplay: 'full',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

/**
 * Save profile to file
 *
 * Normalizes values and updates timestamp.
 *
 * @param {Object} profile - Profile object to save
 * @returns {Object} Saved profile (with normalized values)
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

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Load session state from file
 *
 * State tracks ephemeral session data used for:
 * - Betting strategy calculations (win/loss streaks)
 * - Rate limiting (cooldown between games)
 * - Session P&L tracking
 *
 * State fields:
 * - strategy: Current betting strategy
 * - lastHeartbeat: Timestamp of last heartbeat check
 * - lastPlay: Timestamp of last game played
 * - cooldownMs: Delay between games
 * - sessionWins/sessionLosses: Current session counts
 * - consecutiveWins/consecutiveLosses: Streak tracking
 * - totalPnLWei: Session P&L in wei (string to avoid precision loss)
 *
 * @returns {Object} State object
 */
export function loadState() {
  ensureDir(APECHURCH_DIR);

  // Create default state if none exists
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

  // Load and normalize existing state
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
  } catch {
    // Corrupted file - reset to defaults
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
 * Save session state to file
 *
 * @param {Object} state - State object to save
 */
export function saveState(state) {
  ensureDir(APECHURCH_DIR);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ============================================================================
// HISTORY MANAGEMENT
// ============================================================================

/**
 * Load game history from file
 *
 * History stores a record of played games for:
 * - Verification (can query on-chain with game IDs)
 * - Statistics and analytics
 * - Debugging/troubleshooting
 *
 * @returns {Object} { games: Array<{contract, gameId, timestamp}> }
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
 * Save game history to file
 *
 * @param {Object} history - History object with games array
 */
export function saveHistory(history) {
  ensureDir(APECHURCH_DIR);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

/**
 * Add a game to history
 *
 * Inserts at the front (newest first) and trims to MAX_HISTORY_ENTRIES.
 *
 * @param {Object} game - Game record to add
 * @param {string} game.contract - Contract address where game was played
 * @param {string} game.gameId - Unique game ID (used for on-chain queries)
 * @param {number} game.timestamp - Unix timestamp when game was played
 */
export function saveGameToHistory({ contract, gameId, timestamp }) {
  const history = loadHistory();
  history.games.unshift({ contract, gameId, timestamp });

  // Trim to max entries
  if (history.games.length > MAX_HISTORY_ENTRIES) {
    history.games = history.games.slice(0, MAX_HISTORY_ENTRIES);
  }

  saveHistory(history);
}

// ============================================================================
// ACTIVE GAMES MANAGEMENT (Stateful Multi-Step Games)
// ============================================================================

/**
 * Load active games from file
 *
 * Active games are in-progress multi-step games (Blackjack, Video Poker)
 * that can be resumed if interrupted.
 *
 * Structure: { "blackjack": ["gameId1", "gameId2"], "video-poker": ["gameId3"] }
 *
 * @returns {Object} Map of game type to array of game ID strings
 */
export function loadActiveGames() {
  ensureDir(APECHURCH_DIR);
  if (!fs.existsSync(ACTIVE_GAMES_FILE)) {
    return {};
  }
  try {
    const data = JSON.parse(fs.readFileSync(ACTIVE_GAMES_FILE, 'utf8'));
    // Normalize: ensure all values are arrays
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
 *
 * @param {Object} games - Map of game type to game IDs
 */
export function saveActiveGames(games) {
  ensureDir(APECHURCH_DIR);
  fs.writeFileSync(ACTIVE_GAMES_FILE, JSON.stringify(games, null, 2));
}

/**
 * Add a game ID to active games for a specific game type
 *
 * Called when starting a new multi-step game.
 *
 * @param {string} gameType - Game type key (e.g., 'blackjack', 'video-poker')
 * @param {string|bigint} gameId - Game ID to track
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
 *
 * Called when a game completes (win, lose, or clear).
 *
 * @param {string} gameType - Game type key
 * @param {string|bigint} gameId - Game ID to remove
 */
export function removeActiveGame(gameType, gameId) {
  const games = loadActiveGames();
  const idStr = gameId.toString();
  games[gameType] = (games[gameType] || []).filter(id => id !== idStr);
  saveActiveGames(games);
}

/**
 * Check if there are any active games for a game type
 *
 * Used to warn user about unfinished games before starting new ones.
 *
 * @param {string} gameType - Game type key
 * @returns {boolean} True if at least one active game exists
 */
export function hasActiveGame(gameType) {
  const games = loadActiveGames();
  return (games[gameType] || []).length > 0;
}

/**
 * Get the oldest (first) active game ID for a game type
 *
 * Used for resuming interrupted games - processes in FIFO order.
 *
 * @param {string} gameType - Game type key
 * @returns {string|null} Oldest game ID, or null if none
 */
export function getOldestActiveGame(gameType) {
  const games = loadActiveGames();
  const arr = games[gameType] || [];
  return arr.length > 0 ? arr[0] : null;
}

/**
 * Get all active game IDs for a game type
 *
 * @param {string} gameType - Game type key
 * @returns {string[]} Array of game ID strings
 */
export function getActiveGames(gameType) {
  const games = loadActiveGames();
  return games[gameType] || [];
}

/**
 * Get count of active games for a game type
 *
 * @param {string} gameType - Game type key
 * @returns {number} Number of active games
 */
export function getActiveGameCount(gameType) {
  const games = loadActiveGames();
  return (games[gameType] || []).length;
}
