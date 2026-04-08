/**
 * @fileoverview Profile, state, and history management for Ape Church CLI
 *
 * Manages persistent user data across sessions:
 * - Profile: Per-wallet user preferences, username, referral, persona
 * - State: Per-wallet session statistics, win/loss tracking, betting strategy state
 * - History: Per-wallet cached recent/downloaded games and sync metadata
 * - Active Games: Tracks per-wallet in-progress multi-step games (Blackjack, Video Poker)
 *
 * All data stored in the local CLI data directory as JSON files.
 *
 * @module lib/profile
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SiweMessage } from 'siwe';
import {
  APECHURCH_DIR,
  PROFILES_DIR,
  STATES_DIR,
  HISTORY_DIR,
  HISTORY_SCHEMA_VERSION,
  apechain,
  ACTIVE_GAMES_DIR,
  PROFILE_API_URL,
  SIWE_DOMAIN,
  SIWE_URI,
  SIWE_CHAIN_ID,
  ZERO_ADDRESS,
  DEFAULT_COOLDOWN_MS,
} from './constants.js';
import { ensureDir } from './utils.js';
import { createClients, getWalletAddress } from './wallet.js';

// ============================================================================
// CONSTANTS
// ============================================================================

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
const DEFAULT_SCOPED_FILE_SUFFIX = '.json';
const PROFILE_FILE_SUFFIX = '_profile.json';
const STATE_FILE_SUFFIX = '_state.json';
const ACTIVE_GAMES_FILE_SUFFIX = '_games.json';
const HISTORY_FILE_SUFFIX = '_history.json';

function normalizeWalletScopedAddress(walletAddress) {
  if (walletAddress) {
    return String(walletAddress).trim().toLowerCase();
  }

  const localWalletAddress = getWalletAddress();
  return localWalletAddress ? localWalletAddress.toLowerCase() : null;
}

function resolveWalletScopedFilePath(directory, walletAddress, fileSuffix = DEFAULT_SCOPED_FILE_SUFFIX) {
  const normalizedWallet = normalizeWalletScopedAddress(walletAddress);
  if (!normalizedWallet) {
    return null;
  }

  ensureDir(directory);
  return path.join(directory, `${normalizedWallet}${fileSuffix}`);
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readScopedJsonFile({
  walletAddress,
  scopedDir,
  scopedFileSuffix = DEFAULT_SCOPED_FILE_SUFFIX,
  createDefault,
  normalize,
}) {
  ensureDir(APECHURCH_DIR);

  const normalizedWallet = normalizeWalletScopedAddress(walletAddress);
  if (normalizedWallet) {
    const scopedPath = resolveWalletScopedFilePath(scopedDir, normalizedWallet, scopedFileSuffix);

    if (!fs.existsSync(scopedPath)) {
      const initial = normalize(createDefault(normalizedWallet), normalizedWallet);
      writeJsonFile(scopedPath, initial);
      return initial;
    }

    try {
      const raw = JSON.parse(fs.readFileSync(scopedPath, 'utf8'));
      return normalize(raw, normalizedWallet);
    } catch {
      const fallback = normalize(createDefault(normalizedWallet), normalizedWallet);
      writeJsonFile(scopedPath, fallback);
      return fallback;
    }
  }

  return normalize(createDefault(null), null);
}

function writeScopedJsonFile({
  walletAddress,
  scopedDir,
  scopedFileSuffix = DEFAULT_SCOPED_FILE_SUFFIX,
  data,
  normalize,
}) {
  ensureDir(APECHURCH_DIR);

  const normalizedWallet = normalizeWalletScopedAddress(walletAddress);
  const normalizedData = normalize(data, normalizedWallet);

  if (normalizedWallet) {
    const scopedPath = resolveWalletScopedFilePath(scopedDir, normalizedWallet, scopedFileSuffix);
    writeJsonFile(scopedPath, normalizedData);
    return normalizedData;
  }

  return normalizedData;
}

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

function createDefaultProfile() {
  return {
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
}

function normalizeProfileData(profile) {
  return {
    version: 1,
    persona: normalizeStrategy(profile?.persona || 'balanced'),
    username: profile?.username || null,
    paused: Boolean(profile?.paused),
    referral: profile?.referral || null,
    overrides: profile?.overrides || {},
    cardDisplay: normalizeCardDisplay(profile?.cardDisplay),
    createdAt: profile?.createdAt || new Date().toISOString(),
    updatedAt: profile?.updatedAt || new Date().toISOString(),
  };
}

function createDefaultState() {
  return {
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
}

function normalizeStateData(state) {
  return {
    version: 1,
    strategy: normalizeStrategy(state?.strategy || 'balanced'),
    lastHeartbeat: Number(state?.lastHeartbeat || 0),
    lastPlay: Number(state?.lastPlay || 0),
    cooldownMs: Number(state?.cooldownMs || DEFAULT_COOLDOWN_MS),
    sessionWins: Number(state?.sessionWins || 0),
    sessionLosses: Number(state?.sessionLosses || 0),
    consecutiveWins: Number(state?.consecutiveWins || 0),
    consecutiveLosses: Number(state?.consecutiveLosses || 0),
    totalPnLWei: state?.totalPnLWei || '0',
  };
}

function normalizeActiveGamesData(games) {
  const cleaned = {};
  for (const [key, value] of Object.entries(games || {})) {
    cleaned[key] = Array.isArray(value) ? value.map(item => String(item)) : [];
  }
  return cleaned;
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
export function loadProfile(walletAddress) {
  return readScopedJsonFile({
    walletAddress,
    scopedDir: PROFILES_DIR,
    scopedFileSuffix: PROFILE_FILE_SUFFIX,
    createDefault: createDefaultProfile,
    normalize: normalizeProfileData,
  });
}

/**
 * Save profile to file
 *
 * Normalizes values and updates timestamp.
 *
 * @param {Object} profile - Profile object to save
 * @returns {Object} Saved profile (with normalized values)
 */
export function saveProfile(profile, walletAddress) {
  const updated = {
    ...profile,
    updatedAt: new Date().toISOString(),
  };

  return writeScopedJsonFile({
    walletAddress,
    scopedDir: PROFILES_DIR,
    scopedFileSuffix: PROFILE_FILE_SUFFIX,
    data: updated,
    normalize: normalizeProfileData,
  });
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
export function loadState(walletAddress) {
  return readScopedJsonFile({
    walletAddress,
    scopedDir: STATES_DIR,
    scopedFileSuffix: STATE_FILE_SUFFIX,
    createDefault: createDefaultState,
    normalize: normalizeStateData,
  });
}

/**
 * Save session state to file
 *
 * @param {Object} state - State object to save
 */
export function saveState(state, walletAddress) {
  writeScopedJsonFile({
    walletAddress,
    scopedDir: STATES_DIR,
    scopedFileSuffix: STATE_FILE_SUFFIX,
    data: state,
    normalize: normalizeStateData,
  });
}

// ============================================================================
// HISTORY MANAGEMENT
// ============================================================================

function normalizeHistoryWalletAddress(walletAddress) {
  return normalizeWalletScopedAddress(walletAddress);
}

/**
 * Create the default top-level history shape for a wallet-specific cache file.
 */
function createEmptyHistory(walletAddress = null) {
  return {
    version: HISTORY_SCHEMA_VERSION,
    wallet: walletAddress,
    chain_id: apechain.id,
    last_synced_block: null,
    last_download_on: null,
    games: [],
  };
}

/**
 * Normalize a single stored history entry.
 *
 * The minimal local shape is always contract + gameId + timestamp, while
 * download/enrichment steps may attach economic fields later.
 */
function normalizeHistoryGame(game) {
  return {
    contract: game?.contract || null,
    gameId: game?.gameId != null ? String(game.gameId) : '',
    timestamp: Number(game?.timestamp || 0) || 0,
    last_sync_on: typeof game?.last_sync_on === 'string' ? game.last_sync_on : null,
    last_sync_msg: typeof game?.last_sync_msg === 'string' ? game.last_sync_msg : null,
    ...game,
  };
}

export function getHistoryFilePath(walletAddress) {
  return resolveWalletScopedFilePath(HISTORY_DIR, walletAddress, HISTORY_FILE_SUFFIX);
}

/**
 * Normalize persisted history data so every caller sees the same schema,
 * regardless of whether the file only contains locally-recorded minimal
 * entries or fully downloaded on-chain enrichment.
 */
function normalizeHistoryData(data, walletAddress) {
  const normalizedWallet = normalizeHistoryWalletAddress(walletAddress);
  const base = createEmptyHistory(normalizedWallet);
  const normalizedGames = Array.isArray(data?.games)
    ? data.games.map(normalizeHistoryGame).sort((left, right) => right.timestamp - left.timestamp)
    : [];

  return {
    ...base,
    ...data,
    wallet: normalizedWallet,
    chain_id: apechain.id,
    games: normalizedGames,
  };
}

/**
 * Load per-wallet game history from file
 *
 * History is stored per wallet under ~/.apechurch-cli/history/.
 *
 * @param {string} [walletAddress] - Optional explicit wallet address
 * @returns {Object} Normalized history object
 */
export function loadHistory(walletAddress) {
  const normalizedWallet = normalizeHistoryWalletAddress(walletAddress);
  const historyFilePath = getHistoryFilePath(normalizedWallet);

  if (!historyFilePath || !fs.existsSync(historyFilePath)) {
    return createEmptyHistory(normalizedWallet);
  }

  try {
    const data = JSON.parse(fs.readFileSync(historyFilePath, 'utf8'));
    return normalizeHistoryData(data, normalizedWallet);
  } catch {
    return createEmptyHistory(normalizedWallet);
  }
}

/**
 * Save per-wallet game history to file
 *
 * @param {Object} history - History object with games array
 * @param {string} [walletAddress] - Optional explicit wallet address
 */
export function saveHistory(history, walletAddress) {
  const normalizedWallet = normalizeHistoryWalletAddress(walletAddress || history?.wallet);
  const historyFilePath = getHistoryFilePath(normalizedWallet);

  if (!historyFilePath || !normalizedWallet) {
    throw new Error('Cannot save history without a wallet address.');
  }

  const normalizedHistory = normalizeHistoryData(history, normalizedWallet);
  fs.writeFileSync(historyFilePath, JSON.stringify(normalizedHistory, null, 2));
}

/**
 * Add a game to history
 *
 * This keeps a minimal local record immediately after play so later
 * `wallet download` / `history --refresh` calls can merge exact on-chain
 * economics into the same per-wallet file.
 *
 * @param {Object} game - Game record to add
 * @param {string} game.contract - Contract address where game was played
 * @param {string} game.gameId - Unique game ID (used for on-chain queries)
 * @param {number} game.timestamp - Unix timestamp when game was played
 * @param {string} [game.tx] - Play transaction hash for later refresh diagnostics
 * @param {string} [game.game] - Human-readable game name
 * @param {string} [game.game_key] - Base game key
 * @param {Object} [game.config] - Saved play configuration
 * @param {string} [game.variant_key] - Variant grouping key
 * @param {string} [game.variant_label] - Variant display label
 * @param {string} [game.rtp_game] - Base RTP game key
 * @param {Object} [game.rtp_config] - RTP-relevant variant config
 * @param {string} [game.walletAddress] - Wallet owner of the history file
 */
export function saveGameToHistory({
  contract,
  gameId,
  timestamp,
  tx,
  game = null,
  game_key = null,
  config = null,
  variant_key = null,
  variant_label = null,
  rtp_game = null,
  rtp_config = null,
  walletAddress,
}) {
  const normalizedWallet = normalizeHistoryWalletAddress(walletAddress);
  if (!normalizedWallet) {
    return;
  }

  const history = loadHistory(normalizedWallet);
  const normalizedContract = contract ? String(contract) : null;
  const normalizedGameId = String(gameId);
  const normalizedTimestamp = Number(timestamp || Date.now()) || Date.now();
  const existingIndex = history.games.findIndex((entry) =>
    String(entry.contract || '').toLowerCase() === String(normalizedContract || '').toLowerCase()
    && String(entry.gameId || '') === normalizedGameId
  );
  const nextEntry = {
    ...(existingIndex >= 0 ? history.games[existingIndex] : {}),
    contract: normalizedContract,
    gameId: normalizedGameId,
    timestamp: normalizedTimestamp,
    tx: typeof tx === 'string' ? tx : (existingIndex >= 0 ? history.games[existingIndex].tx ?? null : null),
    game: typeof game === 'string' && game.trim() ? game.trim() : (existingIndex >= 0 ? history.games[existingIndex].game ?? null : null),
    game_key: typeof game_key === 'string' && game_key.trim() ? game_key.trim() : (existingIndex >= 0 ? history.games[existingIndex].game_key ?? null : null),
    config: config && typeof config === 'object' ? config : (existingIndex >= 0 ? history.games[existingIndex].config ?? null : null),
    variant_key: typeof variant_key === 'string' && variant_key.trim() ? variant_key.trim() : (existingIndex >= 0 ? history.games[existingIndex].variant_key ?? null : null),
    variant_label: typeof variant_label === 'string' && variant_label.trim() ? variant_label.trim() : (existingIndex >= 0 ? history.games[existingIndex].variant_label ?? null : null),
    rtp_game: typeof rtp_game === 'string' && rtp_game.trim() ? rtp_game.trim() : (existingIndex >= 0 ? history.games[existingIndex].rtp_game ?? null : null),
    rtp_config: rtp_config && typeof rtp_config === 'object' ? rtp_config : (existingIndex >= 0 ? history.games[existingIndex].rtp_config ?? null : null),
    last_sync_on: existingIndex >= 0 ? history.games[existingIndex].last_sync_on ?? null : null,
    last_sync_msg: existingIndex >= 0 ? history.games[existingIndex].last_sync_msg ?? null : null,
  };

  if (existingIndex >= 0) {
    history.games.splice(existingIndex, 1);
  }

  history.games.unshift(nextEntry);
  saveHistory(history, normalizedWallet);
}

export function ensureWalletScopedData(walletAddress) {
  const normalizedWallet = normalizeWalletScopedAddress(walletAddress);
  if (!normalizedWallet) {
    return null;
  }

  return {
    wallet: normalizedWallet,
    profile: loadProfile(normalizedWallet),
    state: loadState(normalizedWallet),
    activeGames: loadActiveGames(normalizedWallet),
  };
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
export function loadActiveGames(walletAddress) {
  return readScopedJsonFile({
    walletAddress,
    scopedDir: ACTIVE_GAMES_DIR,
    scopedFileSuffix: ACTIVE_GAMES_FILE_SUFFIX,
    createDefault: () => ({}),
    normalize: normalizeActiveGamesData,
  });
}

/**
 * Save active games to file
 *
 * @param {Object} games - Map of game type to game IDs
 */
export function saveActiveGames(games, walletAddress) {
  writeScopedJsonFile({
    walletAddress,
    scopedDir: ACTIVE_GAMES_DIR,
    scopedFileSuffix: ACTIVE_GAMES_FILE_SUFFIX,
    data: games,
    normalize: normalizeActiveGamesData,
  });
}

/**
 * Add a game ID to active games for a specific game type
 *
 * Called when starting a new multi-step game.
 *
 * @param {string} gameType - Game type key (e.g., 'blackjack', 'video-poker')
 * @param {string|bigint} gameId - Game ID to track
 */
export function addActiveGame(gameType, gameId, walletAddress) {
  const games = loadActiveGames(walletAddress);
  games[gameType] = games[gameType] || [];
  const idStr = gameId.toString();
  if (!games[gameType].includes(idStr)) {
    games[gameType].push(idStr);
  }
  saveActiveGames(games, walletAddress);
}

/**
 * Remove a game ID from active games
 *
 * Called when a game completes (win, lose, or clear).
 *
 * @param {string} gameType - Game type key
 * @param {string|bigint} gameId - Game ID to remove
 */
export function removeActiveGame(gameType, gameId, walletAddress) {
  const games = loadActiveGames(walletAddress);
  const idStr = gameId.toString();
  games[gameType] = (games[gameType] || []).filter(id => id !== idStr);
  saveActiveGames(games, walletAddress);
}

/**
 * Check if there are any active games for a game type
 *
 * Used to warn user about unfinished games before starting new ones.
 *
 * @param {string} gameType - Game type key
 * @returns {boolean} True if at least one active game exists
 */
export function hasActiveGame(gameType, walletAddress) {
  const games = loadActiveGames(walletAddress);
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
export function getOldestActiveGame(gameType, walletAddress) {
  const games = loadActiveGames(walletAddress);
  const arr = games[gameType] || [];
  return arr.length > 0 ? arr[0] : null;
}

/**
 * Get all active game IDs for a game type
 *
 * @param {string} gameType - Game type key
 * @returns {string[]} Array of game ID strings
 */
export function getActiveGames(gameType, walletAddress) {
  const games = loadActiveGames(walletAddress);
  return games[gameType] || [];
}

/**
 * Get count of active games for a game type
 *
 * @param {string} gameType - Game type key
 * @returns {number} Number of active games
 */
export function getActiveGameCount(gameType, walletAddress) {
  const games = loadActiveGames(walletAddress);
  return (games[gameType] || []).length;
}
