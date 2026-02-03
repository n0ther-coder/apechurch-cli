#!/usr/bin/env node
import { Command } from 'commander';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  formatEther,
  http,
  parseEther,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const apechain = defineChain({
  id: 33139,
  name: 'ApeChain',
  nativeCurrency: { name: 'ApeCoin', symbol: 'APE', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.apechain.com/http'] },
  },
  blockExplorers: {
    default: { name: 'ApeScan', url: 'https://apescan.io' },
  },
});
import { SiweMessage } from 'siwe';
import { GAME_REGISTRY, listGames, resolveGame } from '../registry.js';

const program = new Command();
const PACKAGE_VERSION = (() => {
  try {
    const pkgUrl = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(fs.readFileSync(pkgUrl, 'utf8'));
    return pkg.version || '0.0.0';
  } catch (error) {
    return '0.0.0';
  }
})();

program.name('apechurch').version(PACKAGE_VERSION, '-v, --version', 'output the current version');
const HOME = os.homedir();
// All data stored in ~/.apechurch/
const APECHURCH_DIR = path.join(HOME, '.apechurch');
const SKILL_TARGET_DIR = path.join(APECHURCH_DIR, 'skill');
const WALLET_FILE = path.join(APECHURCH_DIR, 'wallet.json');
const STATE_FILE = path.join(APECHURCH_DIR, 'state.json');
const PROFILE_FILE = path.join(APECHURCH_DIR, 'profile.json');

const GAS_RESERVE_APE = 1;
const DEFAULT_COOLDOWN_MS = 30 * 1000; // 30 seconds default
const PROFILE_API_URL =
  process.env.APECHURCH_PROFILE_URL || 'https://www.ape.church/api/profile';
const SIWE_DOMAIN = 'ape.church';
const SIWE_URI = 'https://ape.church';
const SIWE_CHAIN_ID = 33139;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const GAME_LIST = listGames().join(' | ');

// Validate EVM address and return it or ZERO_ADDRESS
function getValidRefAddress(address) {
  if (!address || typeof address !== 'string') return ZERO_ADDRESS;
  const trimmed = address.trim();
  // Basic EVM address validation: 0x + 40 hex chars
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return trimmed;
  }
  return ZERO_ADDRESS;
}

const GAME_CONTRACT_ABI = [
  {
    type: 'function',
    name: 'play',
    stateMutability: 'payable',
    inputs: [
      { name: 'player', type: 'address' },
      { name: 'gameData', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'GameEnded',
    anonymous: false,
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'gameId', type: 'uint256', indexed: false },
      { name: 'buyIn', type: 'uint256', indexed: false },
      { name: 'payout', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'getEssentialGameInfo',
    stateMutability: 'view',
    inputs: [{ name: 'gameIds', type: 'uint256[]' }],
    outputs: [
      { name: 'players', type: 'address[]' },
      { name: 'buyInAmounts', type: 'uint256[]' },
      { name: 'totalPayouts', type: 'uint256[]' },
      { name: 'timestamps', type: 'uint256[]' },
      { name: 'hasEndeds', type: 'bool[]' },
    ],
  },
];

const PLINKO_VRF_ABI = [
  {
    type: 'function',
    name: 'getVRFFee',
    stateMutability: 'view',
    inputs: [{ name: 'customGasLimit', type: 'uint32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

const SLOTS_VRF_ABI = [
  {
    type: 'function',
    name: 'getVRFFee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

// --- Helper: Secure Wallet Loading ---
function getWallet() {
  if (!fs.existsSync(WALLET_FILE)) {
    // Return JSON error if agent tries to play before setup
    console.error(JSON.stringify({ error: 'No wallet found. Human must run install.' }));
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
  return privateKeyToAccount(data.privateKey);
}

function getTransport() {
  // Use viem's built-in ApeChain RPC (https://rpc.apechain.com/http)
  // HTTP transport works for everything including event polling
  return http();
}

function createClients(account) {
  const transport = getTransport();
  const publicClient = createPublicClient({ chain: apechain, transport });
  const walletClient = account
    ? createWalletClient({ account, chain: apechain, transport })
    : null;
  return { publicClient, walletClient };
}

function randomBytes32() {
  return `0x${crypto.randomBytes(32).toString('hex')}`;
}

// Sanitize error messages for clean JSON output (no stack traces)
function sanitizeError(error) {
  if (!error) return 'Unknown error';
  
  const msg = error.message || error.shortMessage || String(error);
  
  // Common viem/RPC error patterns
  if (msg.includes('could not coalesce') || msg.includes('failed to fetch')) {
    return 'RPC connection failed. Check APECHAIN_RPC_URL or try again.';
  }
  if (msg.includes('insufficient funds')) {
    return 'Insufficient funds for transaction.';
  }
  if (msg.includes('execution reverted')) {
    // Try to extract revert reason
    const match = msg.match(/execution reverted[:\s]*(.+?)(?:\n|$)/i);
    return match ? `Transaction reverted: ${match[1].trim()}` : 'Transaction reverted by contract.';
  }
  if (msg.includes('user rejected') || msg.includes('denied')) {
    return 'Transaction was rejected.';
  }
  if (msg.includes('nonce')) {
    return 'Nonce error. A previous transaction may be pending.';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'Request timed out. Try again.';
  }
  if (msg.includes('network') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
    return 'Network error. Check your connection and RPC URL.';
  }
  
  // Remove stack traces and long technical details
  const cleaned = msg.split('\n')[0].trim();
  
  // Limit length
  if (cleaned.length > 200) {
    return cleaned.substring(0, 197) + '...';
  }
  
  return cleaned;
}

function randomUint256() {
  return BigInt(`0x${crypto.randomBytes(32).toString('hex')}`);
}

function parsePositiveInt(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.error(JSON.stringify({ error: `${label} must be a positive integer.` }));
    process.exit(1);
  }
  return parsed;
}

function parseNonNegativeInt(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    console.error(JSON.stringify({ error: `${label} must be a non-negative integer.` }));
    process.exit(1);
  }
  return parsed;
}

function ensureIntRange(value, label, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

function clampRange(min, max, low, high) {
  const boundedMin = Math.max(min, low);
  const boundedMax = Math.min(max, high);
  return [boundedMin, boundedMax];
}

async function registerUsername({ account, username, persona }) {
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

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function loadProfile() {
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

function saveProfile(profile) {
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

function generateUsername() {
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `APE_BOT_${suffix}`;
}

function normalizeUsername(value) {
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

function loadState() {
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

function saveState(state) {
  ensureDir(APECHURCH_DIR);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// --- History tracking ---
const HISTORY_FILE = path.join(APECHURCH_DIR, 'history.json');
const MAX_HISTORY_ENTRIES = 1000;

function loadHistory() {
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

function saveHistory(history) {
  ensureDir(APECHURCH_DIR);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function saveGameToHistory({ contract, gameId, timestamp }) {
  const history = loadHistory();
  // Add new game at the beginning (newest first)
  history.games.unshift({ contract, gameId, timestamp });
  // Keep only the last MAX_HISTORY_ENTRIES
  if (history.games.length > MAX_HISTORY_ENTRIES) {
    history.games = history.games.slice(0, MAX_HISTORY_ENTRIES);
  }
  saveHistory(history);
}

function normalizeStrategy(value) {
  const normalized = String(value || '').toLowerCase();
  if (['conservative', 'balanced', 'aggressive', 'degen'].includes(normalized)) {
    return normalized;
  }
  return 'balanced';
}

function getStrategyConfig(strategy) {
  const normalized = normalizeStrategy(strategy);
  const defaultWeights = Object.fromEntries(
    GAME_REGISTRY.map((game) => [game.key, 1])
  );
  const configs = {
    conservative: {
      minBetApe: 1,
      targetBetPct: 0.05,
      maxBetPct: 0.1,
      baseCooldownMs: 60 * 1000, // 60 seconds
      plinko: { mode: [0, 1], balls: [80, 100] },
      slots: { spins: [10, 15] },
      roulette: { defaultBet: 'RED,BLACK' }, // 2.5% profit unless 0/00
      baccarat: { defaultBet: 'BANKER' }, // Banker has best odds
      gameWeights: defaultWeights,
    },
    balanced: {
      minBetApe: 1,
      targetBetPct: 0.08,
      maxBetPct: 0.15,
      baseCooldownMs: 30 * 1000, // 30 seconds
      plinko: { mode: [1, 2], balls: [50, 90] },
      slots: { spins: [7, 12] },
      roulette: { defaultBet: 'random' }, // RED or BLACK
      baccarat: { defaultBet: 'random' }, // PLAYER or BANKER
      gameWeights: defaultWeights,
    },
    aggressive: {
      minBetApe: 1,
      targetBetPct: 0.12,
      maxBetPct: 0.25,
      baseCooldownMs: 15 * 1000, // 15 seconds
      plinko: { mode: [2, 4], balls: [20, 70] },
      slots: { spins: [3, 10] },
      roulette: { defaultBet: 'random' }, // RED or BLACK
      baccarat: { defaultBet: 'random' }, // PLAYER or BANKER
      gameWeights: defaultWeights,
    },
    degen: {
      minBetApe: 1,
      targetBetPct: 0.2,
      maxBetPct: 0.35,
      baseCooldownMs: 10 * 1000, // 10 seconds
      plinko: { mode: [3, 4], balls: [10, 40] },
      slots: { spins: [2, 6] },
      roulette: { defaultBet: 'random' }, // RED or BLACK
      baccarat: { defaultBet: 'random' }, // PLAYER or BANKER
      gameWeights: defaultWeights,
    },
  };
  return configs[normalized];
}

function normalizeWeights(baseWeights, overrideWeights) {
  const weights = { ...baseWeights };
  if (overrideWeights && typeof overrideWeights === 'object') {
    for (const [key, value] of Object.entries(overrideWeights)) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        weights[key] = parsed;
      }
    }
  }
  return weights;
}

function normalizeRange(range, fallback) {
  if (!Array.isArray(range) || range.length !== 2) return fallback;
  const min = Number(range[0]);
  const max = Number(range[1]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return fallback;
  return [Math.min(min, max), Math.max(min, max)];
}

function applyProfileOverrides(strategyConfig, overrides) {
  const nextConfig = { ...strategyConfig };
  if (!overrides || typeof overrides !== 'object') return nextConfig;

  if (Number.isFinite(overrides.min_bet_ape)) {
    nextConfig.minBetApe = Math.max(Number(overrides.min_bet_ape), 0);
  }
  if (Number.isFinite(overrides.target_bet_pct)) {
    nextConfig.targetBetPct = Math.max(Number(overrides.target_bet_pct), 0);
  }
  if (Number.isFinite(overrides.max_bet_pct)) {
    nextConfig.maxBetPct = Math.max(Number(overrides.max_bet_pct), 0);
  }
  if (Number.isFinite(overrides.base_cooldown_ms)) {
    nextConfig.baseCooldownMs = Math.max(Number(overrides.base_cooldown_ms), 0);
  }

  if (overrides.game_weights) {
    nextConfig.gameWeights = normalizeWeights(nextConfig.gameWeights, overrides.game_weights);
  }

  if (overrides.plinko) {
    nextConfig.plinko = {
      ...nextConfig.plinko,
      mode: normalizeRange(overrides.plinko.mode, nextConfig.plinko.mode),
      balls: normalizeRange(overrides.plinko.balls, nextConfig.plinko.balls),
    };
  }

  if (overrides.slots) {
    nextConfig.slots = {
      ...nextConfig.slots,
      spins: normalizeRange(overrides.slots.spins, nextConfig.slots.spins),
    };
  }

  return nextConfig;
}

function randomIntInclusive(min, max) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function chooseWeighted(options) {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  const roll = Math.random() * total;
  let acc = 0;
  for (const option of options) {
    acc += option.weight;
    if (roll <= acc) return option.value;
  }
  return options[options.length - 1].value;
}

function formatApeAmount(value) {
  return Number(value).toFixed(6);
}

function calculateWager(availableApe, strategyConfig) {
  const maxAllowed = availableApe * strategyConfig.maxBetPct;
  if (maxAllowed < strategyConfig.minBetApe) return 0;
  const target = Math.max(strategyConfig.minBetApe, availableApe * strategyConfig.targetBetPct);
  return Math.min(target, maxAllowed);
}

function selectGameAndConfig(strategyConfig) {
  const options = GAME_REGISTRY.map((game) => ({
    value: game.key,
    weight: strategyConfig.gameWeights?.[game.key] ?? 1,
  }));
  const gameChoice = chooseWeighted(options);
  const gameEntry = resolveGame(gameChoice);
  if (!gameEntry) {
    return { game: GAME_REGISTRY[0]?.key || 'jungle-plinko' };
  }

  if (gameEntry.type === 'plinko') {
    const [modeMin, modeMax] = clampRange(
      strategyConfig.plinko.mode[0],
      strategyConfig.plinko.mode[1],
      gameEntry.config.mode.min,
      gameEntry.config.mode.max
    );
    const [ballMin, ballMax] = clampRange(
      strategyConfig.plinko.balls[0],
      strategyConfig.plinko.balls[1],
      gameEntry.config.balls.min,
      gameEntry.config.balls.max
    );
    const mode = randomIntInclusive(modeMin, modeMax);
    const balls = randomIntInclusive(ballMin, ballMax);
    return { game: gameEntry.key, mode, balls };
  }

  if (gameEntry.type === 'slots') {
    const [spinMin, spinMax] = clampRange(
      strategyConfig.slots.spins[0],
      strategyConfig.slots.spins[1],
      gameEntry.config.spins.min,
      gameEntry.config.spins.max
    );
    const spins = randomIntInclusive(spinMin, spinMax);
    return { game: gameEntry.key, spins };
  }

  if (gameEntry.type === 'roulette') {
    const rouletteConfig = strategyConfig.roulette || { defaultBet: 'random' };
    let bet = rouletteConfig.defaultBet;
    if (bet === 'random') {
      bet = Math.random() < 0.5 ? 'RED' : 'BLACK';
    }
    return { game: gameEntry.key, bet };
  }

  if (gameEntry.type === 'baccarat') {
    const baccaratConfig = strategyConfig.baccarat || { defaultBet: 'random' };
    let bet = baccaratConfig.defaultBet;
    if (bet === 'random') {
      bet = Math.random() < 0.5 ? 'PLAYER' : 'BANKER';
    }
    return { game: gameEntry.key, bet };
  }

  return { game: gameEntry.key };
}

function computeCooldownMs(strategyConfig, state) {
  const base = strategyConfig.baseCooldownMs || DEFAULT_COOLDOWN_MS;
  if (state.consecutiveWins >= 3) return Math.max(Math.floor(base * 0.25), 60_000);
  if (state.consecutiveWins >= 2) return Math.max(Math.floor(base * 0.5), 60_000);
  if (state.consecutiveLosses >= 3) return Math.min(Math.floor(base * 3), 2 * 60 * 60 * 1000);
  if (state.consecutiveLosses >= 2) return Math.min(Math.floor(base * 2), 2 * 60 * 60 * 1000);
  return base;
}

function addBigIntStrings(a, b) {
  return (BigInt(a) + BigInt(b)).toString();
}

// --- Roulette Bet Parsing ---
// Converts user-friendly bet strings to on-chain values
function parseRouletteBets(betString, gameEntry) {
  if (!betString || typeof betString !== 'string') {
    throw new Error('No bet specified for roulette. Use: RED, BLACK, 0, 00, 1-36, etc.');
  }

  const betTypes = gameEntry.betTypes || {};
  const bets = betString.split(',').map(b => b.trim().toUpperCase()).filter(b => b.length > 0);
  
  if (bets.length === 0) {
    throw new Error('No valid bets found. Use: RED, BLACK, 0, 00, 1-36, etc.');
  }

  const gameNumbers = [];
  
  for (const bet of bets) {
    // Check if it's a named bet type (RED, BLACK, etc.)
    if (betTypes[bet] !== undefined) {
      gameNumbers.push(betTypes[bet]);
      continue;
    }
    
    // Check if it's a number 1-36
    const num = parseInt(bet, 10);
    if (!isNaN(num) && num >= 1 && num <= 36) {
      // Numbers 1-36 map to on-chain values 2-37 (offset by +1)
      gameNumbers.push(num + 1);
      continue;
    }
    
    throw new Error(`Invalid bet: "${bet}". Valid bets: 0, 00, 1-36, RED, BLACK, ODD, EVEN, FIRST_THIRD, SECOND_THIRD, THIRD_THIRD, FIRST_HALF, SECOND_HALF, FIRST_COL, SECOND_COL, THIRD_COL`);
  }
  
  return gameNumbers;
}

// Calculate roulette bet amounts from total wager
// Splits evenly across all bets, handles the 1-wei bug for single bets
function calculateRouletteBetAmounts(totalWagerWei, gameNumbers) {
  const numBets = BigInt(gameNumbers.length);
  const amountPerBet = totalWagerWei / numBets;
  
  if (amountPerBet === BigInt(0)) {
    throw new Error('Wager too small to split across all bets.');
  }
  
  const amounts = [];
  for (let i = 0; i < gameNumbers.length; i++) {
    amounts.push(amountPerBet);
  }
  
  // Handle 1-wei bug: if single bet, subtract 1 wei
  if (gameNumbers.length === 1) {
    amounts[0] = amounts[0] - BigInt(1);
    if (amounts[0] <= BigInt(0)) {
      throw new Error('Wager too small (need more than 1 wei for single bet).');
    }
  }
  
  return amounts;
}

// Get default roulette bet based on strategy
function getRouletteDefaultBet(strategy) {
  // All strategies use RED or BLACK - just different bet sizing
  // Conservative uses both for 2.5% guaranteed profit (unless 0/00)
  if (strategy === 'conservative') {
    return 'RED,BLACK';
  }
  // Others pick one randomly
  return Math.random() < 0.5 ? 'RED' : 'BLACK';
}

// --- Baccarat Bet Parsing ---
// Parses bet config and returns { playerBankerBet, tieBet, isBanker }
// Supports:
//   "BANKER" or "PLAYER" or "TIE" - all on one
//   "140,BANKER,10,TIE" - explicit amounts (from positional: 140 BANKER 10 TIE)
function parseBaccaratBet(betConfig, totalWagerWei) {
  if (!betConfig || typeof betConfig !== 'string') {
    throw new Error('No bet specified for baccarat. Use: PLAYER, BANKER, TIE, or "<amount> BANKER <amount> TIE"');
  }

  const parts = betConfig.split(',').map(b => b.trim().toUpperCase()).filter(b => b.length > 0);
  
  if (parts.length === 0) {
    throw new Error('No valid bet found.');
  }

  let playerBankerBet = BigInt(0);
  let tieBet = BigInt(0);
  let isBanker = false;
  let playerBankerAmount = null;
  let tieAmount = null;

  // Simple case: just "PLAYER", "BANKER", or "TIE"
  if (parts.length === 1) {
    const bet = parts[0];
    if (bet === 'PLAYER') {
      return { playerBankerBet: totalWagerWei, tieBet: BigInt(0), isBanker: false };
    } else if (bet === 'BANKER') {
      return { playerBankerBet: totalWagerWei, tieBet: BigInt(0), isBanker: true };
    } else if (bet === 'TIE') {
      return { playerBankerBet: BigInt(0), tieBet: totalWagerWei, isBanker: false };
    } else {
      throw new Error(`Invalid bet: "${bet}". Use: PLAYER, BANKER, or TIE`);
    }
  }

  // Complex case: parse "amount BET amount BET" pattern
  // Expected: ["140", "BANKER", "10", "TIE"] or ["180", "PLAYER", "20", "TIE"]
  let i = 0;
  while (i < parts.length) {
    const current = parts[i];
    
    // Check if it's a number (amount)
    const amount = parseFloat(current);
    if (!isNaN(amount) && amount > 0) {
      // Next part should be the bet type
      const betType = parts[i + 1];
      if (!betType) {
        throw new Error(`Expected bet type after amount ${amount}`);
      }
      
      const amountWei = parseEther(String(amount));
      
      if (betType === 'PLAYER') {
        if (playerBankerAmount !== null) {
          throw new Error('Cannot specify PLAYER amount twice');
        }
        if (isBanker) {
          throw new Error('Cannot bet on both PLAYER and BANKER');
        }
        playerBankerAmount = amountWei;
        isBanker = false;
        i += 2;
      } else if (betType === 'BANKER') {
        if (playerBankerAmount !== null) {
          throw new Error('Cannot specify BANKER amount twice');
        }
        playerBankerAmount = amountWei;
        isBanker = true;
        i += 2;
      } else if (betType === 'TIE') {
        if (tieAmount !== null) {
          throw new Error('Cannot specify TIE amount twice');
        }
        tieAmount = amountWei;
        i += 2;
      } else {
        throw new Error(`Invalid bet type: "${betType}". Use: PLAYER, BANKER, or TIE`);
      }
    } else if (current === 'PLAYER' || current === 'BANKER' || current === 'TIE') {
      // Bare bet type without amount - invalid in complex mode
      throw new Error(`Missing amount before ${current}. Use: "<amount> ${current}"`);
    } else {
      throw new Error(`Invalid token: "${current}". Expected amount or bet type.`);
    }
  }

  playerBankerBet = playerBankerAmount || BigInt(0);
  tieBet = tieAmount || BigInt(0);

  // Validate total matches
  const specifiedTotal = playerBankerBet + tieBet;
  if (specifiedTotal !== totalWagerWei) {
    const specifiedApe = formatEther(specifiedTotal);
    const expectedApe = formatEther(totalWagerWei);
    throw new Error(`Bet amounts (${specifiedApe} APE) don't match total wager (${expectedApe} APE)`);
  }

  return { playerBankerBet, tieBet, isBanker };
}

// Get default baccarat bet based on strategy
function getBaccaratDefaultBet(strategy) {
  // Banker has slightly better odds (1.95x vs 2x accounts for house edge)
  // Conservative plays banker, others random
  if (strategy === 'conservative') {
    return 'BANKER';
  }
  return Math.random() < 0.5 ? 'PLAYER' : 'BANKER';
}

async function playGame({
  account,
  game,
  amountApe,
  mode,
  balls,
  spins,
  bet,        // Roulette: bet string like "RED" or "RED,BLACK,17"
  timeoutMs,
  referral,
}) {
  const refAddress = getValidRefAddress(referral);
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
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  let contractAddress = null;
  let gameName = null;
  let gameUrl = null;
  let vrfFee = null;
  let encodedData = null;
  let config = {};

  if (gameEntry.type === 'plinko') {
    const modeValue = ensureIntRange(
      mode ?? gameEntry.config.mode.default,
      'mode',
      gameEntry.config.mode.min,
      gameEntry.config.mode.max
    );
    const ballsValue = ensureIntRange(
      balls ?? gameEntry.config.balls.default,
      'balls',
      gameEntry.config.balls.min,
      gameEntry.config.balls.max
    );

    const customGasLimit = gameEntry.vrf.baseGas + (ballsValue * gameEntry.vrf.perUnitGas);
    try {
      vrfFee = await publicClient.readContract({
        address: gameEntry.contract,
        abi: PLINKO_VRF_ABI,
        functionName: 'getVRFFee',
        args: [customGasLimit],
      });
    } catch (error) {
      throw new Error(`Failed to read VRF fee (plinko): ${sanitizeError(error)}`);
    }

    encodedData = encodeAbiParameters(
      [
        { name: 'gameMode', type: 'uint8' },
        { name: 'numBalls', type: 'uint8' },
        { name: 'gameId', type: 'uint256' },
        { name: 'ref', type: 'address' },
        { name: 'userRandomWord', type: 'bytes32' },
      ],
      [modeValue, ballsValue, gameId, refAddress, userRandomWord]
    );

    contractAddress = gameEntry.contract;
    gameName = gameEntry.key;
    gameUrl = `https://www.ape.church/games/${gameEntry.slug}?id=${gameId.toString()}`;
    config = { mode: modeValue, balls: ballsValue };
  } else if (gameEntry.type === 'slots') {
    const spinsValue = ensureIntRange(
      spins ?? gameEntry.config.spins.default,
      'spins',
      gameEntry.config.spins.min,
      gameEntry.config.spins.max
    );

    try {
      vrfFee = await publicClient.readContract({
        address: gameEntry.contract,
        abi: SLOTS_VRF_ABI,
        functionName: 'getVRFFee',
      });
    } catch (error) {
      throw new Error(`Failed to read VRF fee (slots): ${sanitizeError(error)}`);
    }

    encodedData = encodeAbiParameters(
      [
        { name: 'gameId', type: 'uint256' },
        { name: 'numSpins', type: 'uint8' },
        { name: 'ref', type: 'address' },
        { name: 'userRandomWord', type: 'bytes32' },
      ],
      [gameId, spinsValue, refAddress, userRandomWord]
    );

    contractAddress = gameEntry.contract;
    gameName = gameEntry.key;
    gameUrl = `https://www.ape.church/games/${gameEntry.slug}?id=${gameId.toString()}`;
    config = { spins: spinsValue };
  } else if (gameEntry.type === 'roulette') {
    // Parse bet string into on-chain game numbers
    const gameNumbers = parseRouletteBets(bet, gameEntry);
    
    // Get VRF fee (static, no args)
    try {
      vrfFee = await publicClient.readContract({
        address: gameEntry.contract,
        abi: SLOTS_VRF_ABI, // Same ABI - getVRFFee() with no args
        functionName: 'getVRFFee',
      });
    } catch (error) {
      throw new Error(`Failed to read VRF fee (roulette): ${sanitizeError(error)}`);
    }

    // Calculate bet amounts (split evenly, handle 1-wei bug)
    const betAmounts = calculateRouletteBetAmounts(wager, gameNumbers);

    encodedData = encodeAbiParameters(
      [
        { name: 'gameNumbers', type: 'uint8[]' },
        { name: 'amounts', type: 'uint256[]' },
        { name: 'gameId', type: 'uint256' },
        { name: 'ref', type: 'address' },
        { name: 'userRandomWord', type: 'bytes32' },
      ],
      [gameNumbers, betAmounts, gameId, refAddress, userRandomWord]
    );

    contractAddress = gameEntry.contract;
    gameName = gameEntry.key;
    gameUrl = `https://www.ape.church/games/${gameEntry.slug}?id=${gameId.toString()}`;
    config = { bet, gameNumbers, numBets: gameNumbers.length };
  } else if (gameEntry.type === 'baccarat') {
    // Parse baccarat bet
    const { playerBankerBet, tieBet, isBanker } = parseBaccaratBet(bet, wager);

    // Get VRF fee (static, no args)
    try {
      vrfFee = await publicClient.readContract({
        address: gameEntry.contract,
        abi: SLOTS_VRF_ABI,
        functionName: 'getVRFFee',
      });
    } catch (error) {
      throw new Error(`Failed to read VRF fee (baccarat): ${sanitizeError(error)}`);
    }

    encodedData = encodeAbiParameters(
      [
        { name: 'gameId', type: 'uint256' },
        { name: 'playerBankerBet', type: 'uint256' },
        { name: 'tieBet', type: 'uint256' },
        { name: 'isBanker', type: 'bool' },
        { name: 'ref', type: 'address' },
        { name: 'userRandomWord', type: 'bytes32' },
      ],
      [gameId, playerBankerBet, tieBet, isBanker, refAddress, userRandomWord]
    );

    contractAddress = gameEntry.contract;
    gameName = gameEntry.key;
    gameUrl = `https://www.ape.church/games/${gameEntry.slug}?id=${gameId.toString()}`;
    
    // Build config for output
    const betType = isBanker ? 'BANKER' : (playerBankerBet > 0n ? 'PLAYER' : '');
    const hasTie = tieBet > 0n;
    config = { 
      bet,
      betType: hasTie && betType ? `${betType},TIE` : (hasTie ? 'TIE' : betType),
      playerBankerBet: formatEther(playerBankerBet),
      tieBet: formatEther(tieBet),
      isBanker,
    };
  } else {
    throw new Error(`Unsupported game type: ${gameEntry.type}`);
  }

  const totalValue = wager + vrfFee;

  let resolveEvent;
  let rejectEvent;
  const eventPromise = new Promise((resolve, reject) => {
    resolveEvent = resolve;
    rejectEvent = reject;
  });

  const unwatch = publicClient.watchContractEvent({
    address: contractAddress,
    abi: GAME_CONTRACT_ABI,
    eventName: 'GameEnded',
    args: { user: account.address },
    onLogs: (logs) => {
      for (const log of logs) {
        if (log?.args?.gameId === gameId) {
          resolveEvent(log.args);
          break;
        }
      }
    },
    onError: (error) => rejectEvent(error),
  });

  let timeoutId = null;
  if (safeTimeoutMs > 0) {
    timeoutId = setTimeout(() => {
      resolveEvent(null);
    }, safeTimeoutMs);
  }

  let txHash;
  try {
    txHash = await walletClient.writeContract({
      address: contractAddress,
      abi: GAME_CONTRACT_ABI,
      functionName: 'play',
      args: [account.address, encodedData],
      value: totalValue,
    });
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    unwatch();
    throw new Error(`Transaction failed: ${sanitizeError(error)}`);
  }

  let eventResult = null;
  try {
    eventResult = await eventPromise;
  } catch (error) {
    eventResult = null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    unwatch();
  }

  return {
    status: eventResult ? 'complete' : 'pending',
    action: 'bet',
    game: gameName,
    contract: contractAddress,
    tx: txHash,
    gameId: gameId.toString(),
    game_url: gameUrl,
    config,
    wager_wei: wager.toString(),
    wager_ape: formatEther(wager),
    vrf_fee_wei: vrfFee.toString(),
    vrf_fee_ape: formatEther(vrfFee),
    total_value_wei: totalValue.toString(),
    total_value_ape: formatEther(totalValue),
    result: eventResult
      ? {
          user: eventResult.user,
          buy_in_wei: eventResult.buyIn.toString(),
          buy_in_ape: formatEther(eventResult.buyIn),
          payout_wei: eventResult.payout.toString(),
          payout_ape: formatEther(eventResult.payout),
        }
      : null,
  };
}

// --- Helper: Interactive Prompts ---
async function prompt(question) {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// --- COMMAND: INSTALL (The Human Experience) ---
program
  .command('install')
  .description('Setup the Ape Church Agent')
  .option('--username <name>', 'Username for your bot')
  .option('--persona <name>', 'conservative | balanced | aggressive | degen')
  .option('--private-key <key>', 'Import existing private key')
  .option('-y, --quick', 'Skip interactive prompts, use defaults')
  .action(async (opts) => {
    const isInteractive = !opts.quick && !opts.privateKey && !opts.username;
    
    // Ensure ~/.apechurch/ directory exists
    ensureDir(APECHURCH_DIR);
    
    let address;
    let walletWasImported = false;
    let walletExisted = fs.existsSync(WALLET_FILE);

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: WALLET SETUP
    // ═══════════════════════════════════════════════════════════════
    
    if (walletExisted) {
      // Wallet already exists - use it
      const data = JSON.parse(fs.readFileSync(WALLET_FILE));
      address = privateKeyToAccount(data.privateKey).address;
      console.log(`\n✅ Using existing wallet: ${address}`);
    } else if (opts.privateKey) {
      // Private key provided via flag
      let pk = opts.privateKey.trim();
      if (!pk.startsWith('0x')) pk = '0x' + pk;
      try {
        const account = privateKeyToAccount(pk);
        address = account.address;
        fs.writeFileSync(WALLET_FILE, JSON.stringify({ privateKey: pk }));
        walletWasImported = true;
        console.log(`\n✅ Imported wallet: ${address}`);
      } catch (error) {
        console.error(`\n❌ Invalid private key: ${error.message}`);
        process.exit(1);
      }
    } else if (isInteractive) {
      // Interactive wallet setup
      console.log('\n🎰 Welcome to Ape Church!\n');
      console.log('┌─────────────────────────────────────────────────────────────────┐');
      console.log('│                        WALLET SETUP                             │');
      console.log('├─────────────────────────────────────────────────────────────────┤');
      console.log('│  (1) Generate a new wallet (recommended)                        │');
      console.log('│  (2) Import an existing private key                             │');
      console.log('└─────────────────────────────────────────────────────────────────┘');
      
      const walletChoice = await prompt('\nYour choice (1 or 2): ');
      
      if (walletChoice.trim() === '2') {
        // Import existing key
        const pkInput = await prompt('Enter your private key: ');
        let pk = pkInput.trim();
        if (!pk.startsWith('0x')) pk = '0x' + pk;
        try {
          const account = privateKeyToAccount(pk);
          address = account.address;
          fs.writeFileSync(WALLET_FILE, JSON.stringify({ privateKey: pk }));
          walletWasImported = true;
          console.log(`\n✅ Imported wallet: ${address}`);
        } catch (error) {
          console.error(`\n❌ Invalid private key: ${error.message}`);
          process.exit(1);
        }
      } else {
        // Generate new wallet
        const pk = generatePrivateKey();
        const account = privateKeyToAccount(pk);
        fs.writeFileSync(WALLET_FILE, JSON.stringify({ privateKey: pk }));
        address = account.address;
        console.log(`\n✅ Generated new wallet: ${address}`);
        console.log('   (Export anytime with: apechurch wallet export)');
      }
    } else {
      // Non-interactive, no key provided - generate
      const pk = generatePrivateKey();
      const account = privateKeyToAccount(pk);
      fs.writeFileSync(WALLET_FILE, JSON.stringify({ privateKey: pk }));
      address = account.address;
      console.log(`\n✅ Generated new wallet: ${address}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: INJECT SKILL FILES
    // ═══════════════════════════════════════════════════════════════
    
    if (!fs.existsSync(SKILL_TARGET_DIR)) {
      fs.mkdirSync(SKILL_TARGET_DIR, { recursive: true });
    }
    const assetsDir = path.join(path.dirname(new URL(import.meta.url).pathname), '../assets');
    const assetFiles = ['SKILL.md', 'HEARTBEAT.md', 'STRATEGY.md', 'skill.json'];
    for (const file of assetFiles) {
      const source = path.join(assetsDir, file);
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, path.join(SKILL_TARGET_DIR, file));
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: USERNAME SETUP
    // ═══════════════════════════════════════════════════════════════
    
    const localProfile = loadProfile();
    const persona = normalizeStrategy(opts.persona || localProfile.persona || 'balanced');
    let username;
    let usernameRegistered = false;

    if (opts.username) {
      // Username provided via flag
      try {
        username = normalizeUsername(opts.username);
      } catch (error) {
        console.error(`\n❌ Invalid username: ${error.message}`);
        username = generateUsername();
        console.log(`   Using auto-generated: ${username}`);
      }
    } else if (isInteractive && !walletWasImported) {
      // Interactive username setup
      console.log('\n┌─────────────────────────────────────────────────────────────────┐');
      console.log('│                       USERNAME SETUP                            │');
      console.log('├─────────────────────────────────────────────────────────────────┤');
      console.log('│  Choose a username for your bot on Ape Church.                  │');
      console.log('│  (Letters, numbers, underscores only. Max 32 characters)        │');
      console.log('│  Leave blank for auto-generated name.                           │');
      console.log('└─────────────────────────────────────────────────────────────────┘');
      
      let usernameValid = false;
      while (!usernameValid) {
        const usernameInput = await prompt('\nUsername: ');
        
        if (!usernameInput.trim()) {
          username = generateUsername();
          console.log(`Using auto-generated: ${username}`);
          usernameValid = true;
        } else {
          try {
            username = normalizeUsername(usernameInput);
            usernameValid = true;
          } catch (error) {
            console.log(`❌ ${error.message}`);
            console.log('   Try again (letters, numbers, underscores, max 32 chars)');
          }
        }
      }
      
      // Try to register the username
      console.log(`\nRegistering "${username}"...`);
      try {
        await registerUsername({ account: getWallet(), username, persona });
        console.log(`✅ Username "${username}" registered!`);
        usernameRegistered = true;
      } catch (error) {
        const errorMsg = error.message || 'Unknown error';
        if (errorMsg.includes('taken') || errorMsg.includes('exists')) {
          console.log(`❌ Username "${username}" is already taken.`);
          // Let them try again
          let retrying = true;
          while (retrying) {
            const retryInput = await prompt('Try another username (or press Enter for auto): ');
            if (!retryInput.trim()) {
              username = generateUsername();
              console.log(`Using auto-generated: ${username}`);
            } else {
              try {
                username = normalizeUsername(retryInput);
              } catch (e) {
                console.log(`❌ ${e.message}`);
                continue;
              }
            }
            console.log(`Registering "${username}"...`);
            try {
              await registerUsername({ account: getWallet(), username, persona });
              console.log(`✅ Username "${username}" registered!`);
              usernameRegistered = true;
              retrying = false;
            } catch (retryError) {
              console.log(`❌ ${retryError.message || 'Registration failed'}`);
            }
          }
        } else {
          console.log(`⚠️  Registration failed: ${errorMsg}`);
          console.log('   You can retry later with: apechurch register --username <NAME>');
        }
      }
    } else {
      // Non-interactive or imported wallet
      username = generateUsername();
      if (!walletWasImported) {
        try {
          await registerUsername({ account: getWallet(), username, persona });
          usernameRegistered = true;
        } catch (error) {
          // Silent fail for non-interactive
        }
      }
    }

    // Save profile and state
    saveProfile({ ...localProfile, persona, username });
    const state = loadState();
    state.strategy = persona;
    saveState(state);

    if (walletWasImported && !usernameRegistered) {
      console.log(`\nUsername: ${username} (local only)`);
      console.log('To register on Ape Church, run: apechurch register --username <NAME>');
    }

    // 4. The Handshake
    console.log('\n========================================');
    console.log('🎰 APE CHURCH - SETUP COMPLETE');
    console.log('========================================');
    console.log('');
    console.log('Ape Church is a FULLY on-chain, 100% decentralized casino on ApeChain.');
    console.log('Every bet is placed and settled on-chain. Zero servers.');
    console.log('');
    console.log('Player vs Player: The "house" is a public staking pool where anyone');
    console.log('can deposit or withdraw APE anytime. You\'re playing against other');
    console.log('players, not the house. Truly PvP.');
    console.log('');
    console.log('YOUR AGENT:');
    console.log(`  Address:  ${address}`);
    console.log(`  Username: ${username}`);
    console.log(`  Strategy: ${persona}`);
    console.log('');
    console.log('(Run "apechurch status" anytime to see your address and balance)');
    console.log('========================================');
    console.log('STEP 1: FUND YOUR AGENT');
    console.log('========================================');
    console.log('Send APE (on ApeChain) to the address above.');
    console.log('Bridge: https://relay.link/bridge/apechain');
    console.log('');
    console.log('========================================');
    console.log('STEP 2: START PLAYING');
    console.log('========================================');
    console.log('Easiest way - just run:');
    console.log('');
    console.log('  apechurch play --loop');
    console.log('');
    console.log('Or tell your AI agent (copy this message):');
    console.log('');
    console.log('---START MESSAGE---');
    console.log(`I've installed the Ape Church skill for you. Read the skill file at`);
    console.log(`~/.apechurch/skill/SKILL.md to understand how to play.`);
    console.log(`Then run: apechurch play --loop`);
    console.log(`This will play casino games continuously on ApeChain.`);
    console.log('---END MESSAGE---');
    console.log('');
    console.log('========================================');
    console.log('QUICK REFERENCE');
    console.log('========================================');
    console.log('PLAY:');
    console.log('  apechurch play roulette 50 RED    Play roulette');
    console.log('  apechurch play baccarat 50 BANKER Play baccarat');
    console.log('  apechurch play --loop             Play continuously');
    console.log('');
    console.log('GAMES:');
    console.log('  baccarat         PLAYER | BANKER | TIE');
    console.log('  roulette         Numbers, colors, sections');
    console.log('  jungle-plinko    Plinko (mode, balls)');
    console.log('  dino-dough       Slots (spins)');
    console.log('  bubblegum-heist  Slots (spins)');
    console.log('');
    console.log('WALLET:');
    console.log('  apechurch wallet show       View wallet address');
    console.log('  apechurch wallet export     Export private key');
    console.log('');
    console.log('STATUS & INFO:');
    console.log('  apechurch status            View balance & status');
    console.log('  apechurch games             List all games');
    console.log('  apechurch game <name>       Game details');
    console.log('');
    console.log('SETTINGS:');
    console.log('  apechurch register --username <NAME>');
    console.log('  apechurch profile set --persona <TYPE>');
    console.log('  apechurch pause / resume');
    console.log('========================================');
  });

// --- COMMAND: UNINSTALL ---
program
  .command('uninstall')
  .description('Remove Ape Church data (keeps wallet by default)')
  .option('--include-wallet', 'Also delete wallet (DANGEROUS - shows private key first)')
  .action(async (opts) => {
    const includeWallet = Boolean(opts.includeWallet);
    
    console.log('');
    
    if (includeWallet) {
      // Scary warning with private key display
      if (fs.existsSync(WALLET_FILE)) {
        let privateKey = '';
        try {
          const data = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
          privateKey = data.privateKey;
        } catch {
          console.log('⚠️  Could not read wallet file.');
        }
        
        console.log('⚠️  WARNING: This will permanently DELETE your wallet!');
        console.log('');
        console.log('Your private key (COPY THIS NOW if you have funds):');
        console.log('────────────────────────────────────────────────────────────────');
        console.log(privateKey);
        console.log('────────────────────────────────────────────────────────────────');
        console.log('');
        
        // Require confirmation
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        
        const answer = await new Promise((resolve) => {
          rl.question('Type DELETE to confirm, or Ctrl+C to cancel: ', resolve);
        });
        rl.close();
        
        if (answer !== 'DELETE') {
          console.log('\n❌ Cancelled. Nothing was deleted.');
          return;
        }
        
        console.log('');
      }
      
      // Delete everything
      const filesToDelete = [WALLET_FILE, PROFILE_FILE, STATE_FILE, HISTORY_FILE];
      for (const file of filesToDelete) {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      }
      
      // Delete skill directory
      if (fs.existsSync(SKILL_TARGET_DIR)) {
        fs.rmSync(SKILL_TARGET_DIR, { recursive: true });
      }
      
      // Try to remove the .apechurch directory if empty
      try {
        fs.rmdirSync(APECHURCH_DIR);
      } catch {
        // Directory not empty or doesn't exist, that's fine
      }
      
      console.log('✅ Uninstalled completely. Wallet and all data deleted.');
      console.log('');
      console.log('To remove the CLI itself, run:');
      console.log('  npm uninstall -g @ape-church/skill');
      
    } else {
      // Safe uninstall - keep wallet
      const filesToDelete = [PROFILE_FILE, STATE_FILE, HISTORY_FILE];
      let deletedCount = 0;
      
      for (const file of filesToDelete) {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          deletedCount++;
        }
      }
      
      // Delete skill directory
      if (fs.existsSync(SKILL_TARGET_DIR)) {
        fs.rmSync(SKILL_TARGET_DIR, { recursive: true });
        deletedCount++;
      }
      
      console.log('✅ Removed config, history, and skill files.');
      console.log('');
      console.log('🔐 Wallet preserved at: ~/.apechurch/wallet.json');
      console.log('   (Use --include-wallet to delete wallet too)');
      console.log('');
      console.log('To remove the CLI itself, run:');
      console.log('  npm uninstall -g @ape-church/skill');
    }
    console.log('');
  });

// --- COMMAND: WALLET (Manage wallet) ---
const walletCommand = program.command('wallet').description('Manage your wallet');

walletCommand
  .command('export')
  .description('Export your private key (SENSITIVE!)')
  .option('--json', 'Output JSON only')
  .action(async (opts) => {
    if (!fs.existsSync(WALLET_FILE)) {
      if (opts.json) {
        console.log(JSON.stringify({ error: 'No wallet found. Run install first.' }));
      } else {
        console.log('❌ No wallet found. Run `apechurch install` first.');
      }
      process.exit(1);
    }

    let privateKey = '';
    let address = '';
    try {
      const data = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
      privateKey = data.privateKey;
      address = privateKeyToAccount(privateKey).address;
    } catch (error) {
      if (opts.json) {
        console.log(JSON.stringify({ error: 'Failed to read wallet file.' }));
      } else {
        console.log('❌ Failed to read wallet file.');
      }
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify({ address, privateKey }));
    } else {
      console.log('');
      console.log('⚠️  WARNING: Your private key controls all funds in this wallet!');
      console.log('   Never share it. Never paste it into websites.');
      console.log('');
      console.log('┌─────────────────────────────────────────────────────────────────┐');
      console.log(`│ Address: ${address} │`);
      console.log('├─────────────────────────────────────────────────────────────────┤');
      console.log(`│ ${privateKey} │`);
      console.log('└─────────────────────────────────────────────────────────────────┘');
      console.log('');
    }
  });

walletCommand
  .command('show')
  .description('Show wallet address (no private key)')
  .option('--json', 'Output JSON only')
  .action(async (opts) => {
    if (!fs.existsSync(WALLET_FILE)) {
      if (opts.json) {
        console.log(JSON.stringify({ error: 'No wallet found. Run install first.' }));
      } else {
        console.log('❌ No wallet found. Run `apechurch install` first.');
      }
      process.exit(1);
    }

    const account = getWallet();
    if (opts.json) {
      console.log(JSON.stringify({ address: account.address }));
    } else {
      console.log(`Address: ${account.address}`);
    }
  });

// --- COMMAND: STATUS (The Agent Experience) ---
program
  .command('status')
  .option('--json', 'Output JSON for the Agent')
  .action(async (opts) => {
    const account = getWallet();
    const profile = loadProfile();
    const { publicClient } = createClients();

    let balance;
    try {
      balance = await publicClient.getBalance({ address: account.address });
    } catch (error) {
      console.error(JSON.stringify({ error: `Failed to fetch balance: ${sanitizeError(error)}` }));
      process.exit(1);
    }

    const formattedBalance = parseFloat(formatEther(balance));

    const availableApe = Math.max(formattedBalance - GAS_RESERVE_APE, 0);

    const data = {
      address: account.address,
      balance: formattedBalance.toFixed(4),
      available_ape: availableApe.toFixed(4),
      gas_reserve_ape: GAS_RESERVE_APE.toFixed(4),
      paused: profile.paused,
      persona: profile.persona,
      username: profile.username,
      can_play: availableApe > 0.005 && !profile.paused,
    };

    if (opts.json) console.log(JSON.stringify(data));
    else {
      console.log(`Address: ${data.address}`);
      console.log(`Username: ${data.username || '(not set)'}`);
      console.log(`Persona: ${data.persona}`);
      console.log(`Balance: ${data.balance} APE`);
      console.log(`Available to wager: ${data.available_ape} APE (1 APE reserved)`);
      console.log(`Paused: ${data.paused ? 'YES' : 'No'}`);
    }
  });

// --- COMMAND: PROFILE ---
const profileCommand = program.command('profile').description('Manage agent profile');

profileCommand
  .command('show')
  .option('--json', 'Output JSON only')
  .action((opts) => {
    const profile = loadProfile();
    if (opts.json) console.log(JSON.stringify(profile));
    else console.log(JSON.stringify(profile, null, 2));
  });

profileCommand
  .command('set')
  .option('--persona <name>', 'conservative | balanced | aggressive | degen')
  .option('--username <name>', 'Set local username')
  .option('--referral <address>', 'Set referral address (your Ape Church wallet to earn ref rewards)')
  .option('--json', 'Output JSON only')
  .action((opts) => {
    const profile = loadProfile();
    if (opts.persona) profile.persona = normalizeStrategy(opts.persona);
    if (opts.username) profile.username = normalizeUsername(opts.username);
    if (opts.referral !== undefined) {
      const validRef = getValidRefAddress(opts.referral);
      profile.referral = validRef === ZERO_ADDRESS ? null : validRef;
      if (opts.referral && validRef === ZERO_ADDRESS) {
        console.log('Warning: Invalid address provided, referral cleared.');
      }
    }
    const updated = saveProfile(profile);
    const state = loadState();
    state.strategy = normalizeStrategy(updated.persona);
    saveState(state);
    if (opts.json) console.log(JSON.stringify(updated));
    else console.log(JSON.stringify(updated, null, 2));
  });

// --- COMMAND: REGISTER ---
program
  .command('register')
  .option('--username <name>', 'Username (must end with _CLAWBOT)')
  .option('--persona <name>', 'conservative | balanced | aggressive | degen')
  .option('--json', 'Output JSON only')
  .action(async (opts) => {
    const account = getWallet();
    const profile = loadProfile();
    const persona = normalizeStrategy(opts.persona || profile.persona || 'balanced');

    let username;
    try {
      username = normalizeUsername(opts.username || profile.username || '');
    } catch (error) {
      console.error(JSON.stringify({ error: error.message }));
      process.exit(1);
    }

    try {
      const result = await registerUsername({ account, username, persona });
      const response = {
        status: 'registered',
        username,
        address: account.address,
        persona,
        api_url: PROFILE_API_URL,
        server: result.response,
      };
      if (opts.json) console.log(JSON.stringify(response));
      else console.log(JSON.stringify(response, null, 2));
    } catch (error) {
      console.error(JSON.stringify({ error: error.message }));
      process.exit(1);
    }
  });

// --- COMMAND: PAUSE (Stop autonomous play) ---
program
  .command('pause')
  .description('Pause autonomous play (heartbeat will skip)')
  .option('--json', 'Output JSON only')
  .action((opts) => {
    const profile = loadProfile();
    profile.paused = true;
    const updated = saveProfile(profile);
    const response = {
      status: 'paused',
      message: 'Autonomous play paused. Run `apechurch resume` to continue.',
      paused: true,
      updatedAt: updated.updatedAt,
    };
    if (opts.json) console.log(JSON.stringify(response));
    else console.log(JSON.stringify(response, null, 2));
  });

// --- COMMAND: RESUME (Resume autonomous play) ---
program
  .command('resume')
  .description('Resume autonomous play')
  .option('--json', 'Output JSON only')
  .action((opts) => {
    const profile = loadProfile();
    profile.paused = false;
    const updated = saveProfile(profile);
    const response = {
      status: 'resumed',
      message: 'Autonomous play resumed. Heartbeat will play on next run.',
      paused: false,
      updatedAt: updated.updatedAt,
    };
    if (opts.json) console.log(JSON.stringify(response));
    else console.log(JSON.stringify(response, null, 2));
  });

// --- COMMAND: BET (The Agent Action) ---
program
  .command('bet')
  .requiredOption('--game <type>', GAME_LIST)
  .requiredOption('--amount <ape>', 'Wager amount')
  .option('--mode <0-4>', 'Game mode (0-4). Higher is riskier.', '0')
  .option('--balls <1-100>', 'Number of balls to drop (1-100).', '50')
  .option('--spins <1-15>', 'Number of spins for slots (1-15).', '10')
  .option('--bet <bet>', 'Roulette bet (RED, BLACK, 17, RED,BLACK, etc.)')
  .option('--timeout <ms>', 'Max ms to wait for GameEnded event. Use 0 to wait indefinitely.', '0')
  .action(async (opts) => {
    const account = getWallet();
    const { publicClient } = createClients();
    
    // Safety check: ensure we have more than gas reserve
    let balance;
    try {
      balance = await publicClient.getBalance({ address: account.address });
    } catch (error) {
      console.error(JSON.stringify({ error: `Failed to fetch balance: ${sanitizeError(error)}` }));
      process.exit(1);
    }
    
    const balanceApe = parseFloat(formatEther(balance));
    const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);
    
    if (availableApe <= 0) {
      console.log(JSON.stringify({
        status: 'skipped',
        reason: 'insufficient_balance',
        balance_ape: balanceApe.toFixed(6),
        available_ape: '0.000000',
        gas_reserve_ape: GAS_RESERVE_APE.toFixed(6),
        message: 'Balance at or below gas reserve. Cannot play.',
      }));
      return; // Don't exit with error, just return gracefully
    }
    
    const timeoutMs = parseNonNegativeInt(opts.timeout, 'timeout');
    const profile = loadProfile();
    try {
      const response = await playGame({
        account,
        game: opts.game,
        amountApe: opts.amount,
        mode: opts.mode,
        balls: opts.balls,
        spins: opts.spins,
        bet: opts.bet,
        timeoutMs,
        referral: profile.referral,
      });
      console.log(JSON.stringify(response));
    } catch (error) {
      console.error(JSON.stringify({ error: error.message }));
      process.exit(1);
    }
  });

// --- COMMAND: HEARTBEAT (Autonomous Loop) ---
program
  .command('heartbeat')
  .option('--strategy <name>', 'conservative | balanced | aggressive | degen')
  .option('--cooldown <ms>', 'Minimum ms between plays (0 = use strategy cooldown)', '0')
  .option('--timeout <ms>', 'Max ms to wait for GameEnded event. Use 0 to wait indefinitely.', '0')
  .option('--loop', 'Run continuously until paused or stopped (Ctrl+C)')
  .option('--json', 'Output JSON only')
  .action(async (opts) => {
    const account = getWallet();
    const requestedCooldown = parseNonNegativeInt(opts.cooldown, 'cooldown');
    const timeoutMs = parseNonNegativeInt(opts.timeout, 'timeout');
    const loopMode = Boolean(opts.loop);

    if (loopMode && !opts.json) {
      console.log('🎰 Starting continuous play mode (Ctrl+C to stop)...\n');
    }

    // Main play function - returns cooldown to wait (0 = no wait needed)
    async function runHeartbeat() {
      const state = loadState();
      const profile = loadProfile();
      const now = Date.now();

      // Check if paused
      if (profile.paused) {
        state.lastHeartbeat = now;
        saveState(state);
        const response = {
          action: 'heartbeat',
          status: 'skipped',
          reason: 'paused',
          message: 'Autonomous play is paused. Run `apechurch resume` to continue.',
          address: account.address,
          paused: true,
        };
        if (opts.json) console.log(JSON.stringify(response));
        else console.log(JSON.stringify(response, null, 2));
        return { shouldStop: true, waitMs: 0 };
      }

      state.lastHeartbeat = now;
      if (opts.strategy) state.strategy = normalizeStrategy(opts.strategy);
      else if (profile.persona) state.strategy = normalizeStrategy(profile.persona);
      if (requestedCooldown > 0) state.cooldownMs = requestedCooldown;

      const { publicClient } = createClients();
      let balance;
      try {
        balance = await publicClient.getBalance({ address: account.address });
      } catch (error) {
        console.error(JSON.stringify({ error: `Failed to fetch balance: ${sanitizeError(error)}` }));
        return { shouldStop: true, waitMs: 0 };
      }

      const balanceApe = parseFloat(formatEther(balance));
      const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);
      const strategy = normalizeStrategy(state.strategy);
      const strategyConfig = applyProfileOverrides(
        getStrategyConfig(strategy),
        profile.overrides
      );
      const dynamicCooldownMs = computeCooldownMs(strategyConfig, state);
      const cooldownMs = requestedCooldown > 0 ? requestedCooldown : dynamicCooldownMs;

      const baseResponse = {
        action: 'heartbeat',
        strategy,
        address: account.address,
        balance_ape: balanceApe.toFixed(6),
        available_ape: availableApe.toFixed(6),
        gas_reserve_ape: GAS_RESERVE_APE.toFixed(6),
        paused: false,
        last_play: state.lastPlay,
        cooldown_ms: cooldownMs,
        consecutive_wins: state.consecutiveWins,
        consecutive_losses: state.consecutiveLosses,
      };

      if (availableApe <= 0 || availableApe < strategyConfig.minBetApe) {
        saveState(state);
        const response = {
          ...baseResponse,
          status: 'skipped',
          reason: 'insufficient_available_ape',
        };
        if (opts.json) console.log(JSON.stringify(response));
        else console.log(JSON.stringify(response, null, 2));
        return { shouldStop: true, waitMs: 0 };
      }

      if (state.lastPlay && cooldownMs > 0 && now - state.lastPlay < cooldownMs) {
        const waitMs = Math.max(cooldownMs - (now - state.lastPlay), 0);
        saveState(state);
        const response = {
          ...baseResponse,
          status: 'skipped',
          reason: 'cooldown',
          next_play_after_ms: waitMs,
        };
        if (opts.json) console.log(JSON.stringify(response));
        else console.log(JSON.stringify(response, null, 2));
        return { shouldStop: false, waitMs };
      }

      const wagerApe = calculateWager(availableApe, strategyConfig);
      if (wagerApe < strategyConfig.minBetApe) {
        saveState(state);
        const response = {
          ...baseResponse,
          status: 'skipped',
          reason: 'wager_below_minimum',
          wager_ape: formatApeAmount(wagerApe),
        };
        if (opts.json) console.log(JSON.stringify(response));
        else console.log(JSON.stringify(response, null, 2));
        return { shouldStop: true, waitMs: 0 };
      }

      const selection = selectGameAndConfig(strategyConfig);
      const wagerApeString = formatApeAmount(wagerApe);

      try {
        const playResponse = await playGame({
          account,
          game: selection.game,
          amountApe: wagerApeString,
          mode: selection.mode,
          balls: selection.balls,
          spins: selection.spins,
          bet: selection.bet,
          timeoutMs,
          referral: freshProfile.referral,
        });

        state.lastPlay = Date.now();
        if (playResponse?.result) {
          const pnlWei = (BigInt(playResponse.result.payout_wei) -
            BigInt(playResponse.result.buy_in_wei)).toString();
          state.totalPnLWei = addBigIntStrings(state.totalPnLWei, pnlWei);
          if (BigInt(pnlWei) >= 0n) {
            state.sessionWins += 1;
            state.consecutiveWins += 1;
            state.consecutiveLosses = 0;
          } else {
            state.sessionLosses += 1;
            state.consecutiveLosses += 1;
            state.consecutiveWins = 0;
          }
        }

        saveState(state);
        
        // Recalculate cooldown after state update (may change due to win/loss streaks)
        const newCooldownMs = requestedCooldown > 0 
          ? requestedCooldown 
          : computeCooldownMs(strategyConfig, state);

        const response = {
          ...baseResponse,
          cooldown_ms: newCooldownMs,
          consecutive_wins: state.consecutiveWins,
          consecutive_losses: state.consecutiveLosses,
          status: playResponse.status,
          wager_ape: wagerApeString,
          game: playResponse.game,
          config: playResponse.config,
          tx: playResponse.tx,
          gameId: playResponse.gameId,
          game_url: playResponse.game_url,
          result: playResponse.result,
        };

        if (opts.json) console.log(JSON.stringify(response));
        else console.log(JSON.stringify(response, null, 2));

        return { shouldStop: false, waitMs: newCooldownMs };
      } catch (error) {
        saveState(state);
        console.error(JSON.stringify({ error: error.message }));
        return { shouldStop: true, waitMs: 0 };
      }
    }

    // Run once or loop
    if (!loopMode) {
      const result = await runHeartbeat();
      if (result.shouldStop && result.waitMs === 0) {
        // Error or fatal skip - exit with appropriate code
        const state = loadState();
        const profile = loadProfile();
        if (profile.paused) process.exit(0);
      }
    } else {
      // Loop mode
      let running = true;
      process.on('SIGINT', () => {
        if (!opts.json) console.log('\n👋 Stopping continuous play...');
        running = false;
      });
      process.on('SIGTERM', () => {
        running = false;
      });

      while (running) {
        const result = await runHeartbeat();
        
        if (!running) break;
        
        if (result.shouldStop) {
          if (!opts.json) console.log('\n⏹️  Stopped: cannot continue playing.');
          break;
        }

        if (result.waitMs > 0) {
          if (!opts.json) {
            console.log(`\n⏳ Waiting ${(result.waitMs / 1000).toFixed(0)}s until next bet...\n`);
          }
          await new Promise((resolve) => {
            const timeout = setTimeout(resolve, result.waitMs);
            const checkStop = setInterval(() => {
              if (!running) {
                clearTimeout(timeout);
                clearInterval(checkStop);
                resolve();
              }
            }, 500);
          });
        }
      }
    }
  });

// --- COMMAND: PLAY (Unified play command - flexible params) ---
// Supports both positional and flag-based syntax:
//   apechurch play roulette 50 RED           (positional)
//   apechurch play --game roulette --amount 50 --bet RED (flags)
//   apechurch play jungle-plinko 10 2 50     (positional: game amount mode balls)
program
  .command('play [game] [amount] [configArgs...]')
  .description('Play a game (random or specified)')
  .option('--game <name>', 'Game to play (random if not specified)')
  .option('--amount <ape>', 'Amount to wager (strategy-based if not specified)')
  .option('--mode <0-4>', 'Plinko mode/risk level')
  .option('--balls <1-100>', 'Plinko balls to drop')
  .option('--spins <1-15>', 'Slots spins per bet')
  .option('--bet <bet>', 'Roulette bet (RED, BLACK, 17, RED,BLACK, etc.)')
  .option('--strategy <name>', 'conservative | balanced | aggressive | degen')
  .option('--loop', 'Play continuously with 3s between games')
  .option('--delay <seconds>', 'Seconds between games in loop mode', '3')
  .option('--json', 'Output JSON only')
  .action(async (gameArg, amountArg, configArgs, opts) => {
    const account = getWallet();
    const loopMode = Boolean(opts.loop);
    const delaySeconds = Math.max(parseFloat(opts.delay) || 3, 1);
    const delayMs = delaySeconds * 1000;

    // Merge positional args with flag options (positional takes precedence if both provided)
    const gameInput = gameArg || opts.game;
    const amountInput = amountArg || opts.amount;
    
    // Validate game if specified
    let fixedGame = null;
    if (gameInput) {
      fixedGame = resolveGame(gameInput);
      if (!fixedGame) {
        const availableGames = GAME_REGISTRY.map(g => g.key).join(', ');
        console.error(JSON.stringify({ error: `Unknown game: ${gameInput}`, available: availableGames }));
        process.exit(1);
      }
    }
    
    // Parse positional config args based on game type
    let positionalConfig = {};
    if (fixedGame && configArgs && configArgs.length > 0) {
      if (fixedGame.type === 'plinko') {
        // For plinko: configArgs = [mode, balls]
        if (configArgs[0]) positionalConfig.mode = parseInt(configArgs[0]);
        if (configArgs[1]) positionalConfig.balls = parseInt(configArgs[1]);
      } else if (fixedGame.type === 'slots') {
        // For slots: configArgs = [spins]
        if (configArgs[0]) positionalConfig.spins = parseInt(configArgs[0]);
      } else if (fixedGame.type === 'roulette') {
        // For roulette: configArgs = bet (may be comma-separated or space-separated)
        positionalConfig.bet = configArgs.join(',');
      } else if (fixedGame.type === 'baccarat') {
        // For baccarat: configArgs can be:
        //   ["BANKER"] - simple bet
        //   ["140", "BANKER", "10", "TIE"] - explicit amounts
        positionalConfig.bet = configArgs.join(',');
      }
    }

    // Check if paused
    const profile = loadProfile();
    if (profile.paused) {
      const response = {
        action: 'play',
        status: 'skipped',
        reason: 'paused',
        message: 'Play is paused. Run `apechurch resume` to continue.',
      };
      if (opts.json) console.log(JSON.stringify(response));
      else console.log(JSON.stringify(response, null, 2));
      return;
    }

    if (loopMode && !opts.json) {
      const gameInfo = fixedGame ? fixedGame.name : 'random games';
      console.log(`🎰 Starting continuous play: ${gameInfo} (${delaySeconds}s between games, Ctrl+C to stop)...\n`);
    }

    async function playOnce() {
      const state = loadState();
      const freshProfile = loadProfile();
      
      if (freshProfile.paused) {
        return { shouldStop: true, reason: 'paused' };
      }

      const strategy = normalizeStrategy(opts.strategy || freshProfile.persona);
      const strategyConfig = applyProfileOverrides(
        getStrategyConfig(strategy),
        freshProfile.overrides
      );

      const { publicClient } = createClients();
      let balance;
      try {
        balance = await publicClient.getBalance({ address: account.address });
      } catch (error) {
        console.error(JSON.stringify({ error: `Failed to fetch balance: ${sanitizeError(error)}` }));
        return { shouldStop: true, reason: 'balance_error' };
      }

      const balanceApe = parseFloat(formatEther(balance));
      const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);

      if (availableApe <= 0 || availableApe < strategyConfig.minBetApe) {
        const response = {
          action: 'play',
          status: 'skipped',
          reason: 'insufficient_balance',
          balance_ape: balanceApe.toFixed(6),
          available_ape: availableApe.toFixed(6),
        };
        if (opts.json) console.log(JSON.stringify(response));
        else console.log(JSON.stringify(response, null, 2));
        return { shouldStop: true, reason: 'insufficient_balance' };
      }

      // Determine wager: use positional/flag amount if provided, else calculate from strategy
      let wagerApe;
      if (amountInput) {
        wagerApe = parseFloat(amountInput);
        if (isNaN(wagerApe) || wagerApe <= 0) {
          console.error(JSON.stringify({ error: 'Invalid amount. Must be a positive number.' }));
          return { shouldStop: true, reason: 'invalid_amount' };
        }
        if (wagerApe > availableApe) {
          console.error(JSON.stringify({ error: `Insufficient balance. Available: ${availableApe.toFixed(4)} APE` }));
          return { shouldStop: true, reason: 'insufficient_balance' };
        }
      } else {
        wagerApe = calculateWager(availableApe, strategyConfig);
      }

      // Determine game: use positional/flag game if provided, else random from strategy
      let gameEntry;
      let gameConfig = {};
      
      if (fixedGame) {
        gameEntry = fixedGame;
        // Apply positional config if provided
        gameConfig = { ...positionalConfig };
      } else {
        // Pick random game using strategy weights
        const selection = selectGameAndConfig(strategyConfig);
        gameEntry = resolveGame(selection.game);
        // Use strategy-selected config as defaults
        gameConfig = { mode: selection.mode, balls: selection.balls, spins: selection.spins, bet: selection.bet };
      }

      // Determine game-specific params: use CLI opts/positional if provided, else strategy-based random or defaults
      if (gameEntry.type === 'plinko') {
        if (opts.mode !== undefined) {
          gameConfig.mode = parseInt(opts.mode);
        } else if (positionalConfig.mode !== undefined) {
          gameConfig.mode = positionalConfig.mode;
        } else if (gameConfig.mode === undefined) {
          // Random from strategy range
          const [modeMin, modeMax] = strategyConfig.plinko?.mode || [0, 4];
          gameConfig.mode = randomIntInclusive(modeMin, modeMax);
        }
        if (opts.balls !== undefined) {
          gameConfig.balls = parseInt(opts.balls);
        } else if (positionalConfig.balls !== undefined) {
          gameConfig.balls = positionalConfig.balls;
        } else if (gameConfig.balls === undefined) {
          const [ballMin, ballMax] = strategyConfig.plinko?.balls || [10, 100];
          gameConfig.balls = randomIntInclusive(ballMin, ballMax);
        }
      } else if (gameEntry.type === 'slots') {
        if (opts.spins !== undefined) {
          gameConfig.spins = parseInt(opts.spins);
        } else if (positionalConfig.spins !== undefined) {
          gameConfig.spins = positionalConfig.spins;
        } else if (gameConfig.spins === undefined) {
          const [spinMin, spinMax] = strategyConfig.slots?.spins || [1, 15];
          gameConfig.spins = randomIntInclusive(spinMin, spinMax);
        }
      } else if (gameEntry.type === 'roulette') {
        // Roulette: use --bet flag, positional config, or strategy default
        if (opts.bet) {
          gameConfig.bet = opts.bet;
        } else if (positionalConfig.bet) {
          gameConfig.bet = positionalConfig.bet;
        } else if (!gameConfig.bet) {
          // Strategy default
          const rouletteConfig = strategyConfig.roulette || { defaultBet: 'random' };
          gameConfig.bet = rouletteConfig.defaultBet === 'random' 
            ? (Math.random() < 0.5 ? 'RED' : 'BLACK')
            : rouletteConfig.defaultBet;
        }
      } else if (gameEntry.type === 'baccarat') {
        // Baccarat: use --bet flag, positional config, or strategy default
        if (opts.bet) {
          gameConfig.bet = opts.bet;
        } else if (positionalConfig.bet) {
          gameConfig.bet = positionalConfig.bet;
        } else if (!gameConfig.bet) {
          // Strategy default
          const baccaratConfig = strategyConfig.baccarat || { defaultBet: 'random' };
          gameConfig.bet = baccaratConfig.defaultBet === 'random'
            ? (Math.random() < 0.5 ? 'PLAYER' : 'BANKER')
            : baccaratConfig.defaultBet;
        }
      }

      const wagerApeString = formatApeAmount(wagerApe);

      try {
        const playResponse = await playGame({
          account,
          game: gameEntry.key,
          amountApe: wagerApeString,
          mode: gameConfig.mode,
          balls: gameConfig.balls,
          spins: gameConfig.spins,
          bet: gameConfig.bet,
          timeoutMs: 0,
          referral: freshProfile.referral,
        });

        // Update state
        if (playResponse?.result) {
          const pnlWei = (BigInt(playResponse.result.payout_wei) -
            BigInt(playResponse.result.buy_in_wei)).toString();
          state.totalPnLWei = addBigIntStrings(state.totalPnLWei, pnlWei);
          if (BigInt(pnlWei) >= 0n) {
            state.sessionWins += 1;
            state.consecutiveWins += 1;
            state.consecutiveLosses = 0;
          } else {
            state.sessionLosses += 1;
            state.consecutiveLosses += 1;
            state.consecutiveWins = 0;
          }
        }
        state.lastPlay = Date.now();
        saveState(state);

        // Calculate win/loss
        const pnl = playResponse.result 
          ? parseFloat(playResponse.result.payout_ape) - parseFloat(playResponse.result.buy_in_ape)
          : 0;
        const won = pnl >= 0;

        // Save to history
        saveGameToHistory({
          contract: playResponse.contract,
          gameId: playResponse.gameId,
          timestamp: Date.now(),
        });

        const response = {
          action: 'play',
          status: playResponse.status,
          outcome: won ? 'WIN' : 'LOSS',
          pnl_ape: pnl.toFixed(6),
          game: playResponse.game,
          wager_ape: wagerApeString,
          payout_ape: playResponse.result?.payout_ape || '0',
          tx: playResponse.tx,
          game_url: playResponse.game_url,
        };

        if (opts.json) {
          console.log(JSON.stringify(response));
        } else {
          // Human-friendly output
          const emoji = won ? '✅' : '❌';
          const pnlStr = pnl >= 0 ? `+${pnl.toFixed(4)}` : pnl.toFixed(4);
          console.log(`${emoji} ${response.outcome}: ${pnlStr} APE | Game: ${response.game} | Wager: ${wagerApeString} APE`);
          console.log(`   TX: ${response.tx}`);
          console.log(`   Replay: ${response.game_url}`);
        }

        return { shouldStop: false };
      } catch (error) {
        console.error(JSON.stringify({ error: error.message }));
        return { shouldStop: true, reason: 'play_error' };
      }
    }

    if (!loopMode) {
      await playOnce();
    } else {
      let running = true;
      process.on('SIGINT', () => {
        if (!opts.json) console.log('\n👋 Stopping...');
        running = false;
      });
      process.on('SIGTERM', () => {
        running = false;
      });

      while (running) {
        const result = await playOnce();
        
        if (!running) break;
        if (result.shouldStop) {
          if (!opts.json) console.log(`\n⏹️  Stopped: ${result.reason}`);
          break;
        }

        if (!opts.json) {
          console.log(`\n⏳ Next game in ${delaySeconds}s...\n`);
        }
        await new Promise((resolve) => {
          const timeout = setTimeout(resolve, delayMs);
          const checkStop = setInterval(() => {
            if (!running) {
              clearTimeout(timeout);
              clearInterval(checkStop);
              resolve();
            }
          }, 200);
        });
      }
    }
  });

// --- COMMAND: HISTORY (View game history from local storage + chain) ---
program
  .command('history')
  .description('View your game history')
  .option('--limit <n>', 'Number of games to show (max 200)', '20')
  .option('--json', 'Output JSON only')
  .action(async (opts) => {
    const limit = Math.min(Math.max(parseInt(opts.limit) || 20, 1), 200);
    const history = loadHistory();
    
    if (history.games.length === 0) {
      if (opts.json) {
        console.log(JSON.stringify({ games: [], message: 'No games in history' }));
      } else {
        console.log('📜 No games in history yet. Play some games first!');
      }
      return;
    }

    // Take the most recent N games
    const recentGames = history.games.slice(0, limit);
    
    // Group by contract
    const byContract = {};
    for (const game of recentGames) {
      if (!byContract[game.contract]) {
        byContract[game.contract] = [];
      }
      byContract[game.contract].push(game);
    }

    // Fetch data from each contract
    const { publicClient } = createClients();
    const results = [];

    for (const [contract, games] of Object.entries(byContract)) {
      const gameIds = games.map(g => BigInt(g.gameId));
      
      // Find game name from registry
      const gameEntry = GAME_REGISTRY.find(g => g.contract.toLowerCase() === contract.toLowerCase());
      const gameName = gameEntry ? gameEntry.name : 'Unknown';
      
      try {
        const [players, buyInAmounts, totalPayouts, timestamps, hasEndeds] = await publicClient.readContract({
          address: contract,
          abi: GAME_CONTRACT_ABI,
          functionName: 'getEssentialGameInfo',
          args: [gameIds],
        });

        for (let i = 0; i < games.length; i++) {
          const buyIn = formatEther(buyInAmounts[i]);
          const payout = formatEther(totalPayouts[i]);
          const pnl = parseFloat(payout) - parseFloat(buyIn);
          
          results.push({
            timestamp: games[i].timestamp,
            game: gameName,
            gameId: games[i].gameId,
            contract: games[i].contract,
            player: players[i],
            wager_ape: buyIn,
            payout_ape: payout,
            pnl_ape: pnl.toFixed(6),
            won: pnl >= 0,
            settled: hasEndeds[i],
            chain_timestamp: Number(timestamps[i]),
          });
        }
      } catch (error) {
        // If contract call fails, include games with minimal info
        for (const game of games) {
          results.push({
            timestamp: game.timestamp,
            game: gameName,
            gameId: game.gameId,
            contract: game.contract,
            error: 'Failed to fetch from chain',
          });
        }
      }
    }

    // Sort by timestamp descending (most recent first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    if (opts.json) {
      console.log(JSON.stringify({ games: results }));
    } else {
      console.log(`\n📜 GAME HISTORY (last ${results.length})\n`);
      for (const game of results) {
        if (game.error) {
          const date = new Date(game.timestamp).toLocaleString();
          console.log(`${date}  ${game.game}  [Error fetching data]`);
        } else {
          const date = new Date(game.timestamp).toLocaleString();
          const emoji = game.won ? '✅' : '❌';
          const pnlStr = game.won ? `+${parseFloat(game.pnl_ape).toFixed(2)}` : parseFloat(game.pnl_ape).toFixed(2);
          const settled = game.settled ? '' : ' [pending]';
          console.log(`${date}  ${game.game.padEnd(16)}  Wager: ${parseFloat(game.wager_ape).toFixed(2).padStart(8)} APE  Payout: ${parseFloat(game.payout_ape).toFixed(2).padStart(8)} APE  ${emoji} ${pnlStr.padStart(8)}${settled}`);
        }
      }
      console.log('');
    }
  });

// --- COMMAND: GAMES (Show available games and parameters) ---
program
  .command('games')
  .description('List all available games and their parameters')
  .option('--json', 'Output JSON only')
  .action((opts) => {
    if (opts.json) {
      const games = GAME_REGISTRY.map((game) => ({
        key: game.key,
        name: game.name,
        type: game.type,
        description: game.description,
        aliases: game.aliases || [],
        contract: game.contract,
        config: game.config,
      }));
      console.log(JSON.stringify({ games }, null, 2));
    } else {
      console.log('\n🎰 AVAILABLE GAMES\n');
      console.log('Use "apechurch game <name>" for detailed info on a specific game.\n');
      console.log('─'.repeat(70));
      
      for (const game of GAME_REGISTRY) {
        console.log(`\n${game.name.toUpperCase()} (${game.key})`);
        console.log(`  ${game.description}`);
        console.log(`  Aliases: ${game.aliases?.join(', ') || 'none'}`);
        console.log('');
        console.log('  Parameters:');
        
        for (const [paramName, paramConfig] of Object.entries(game.config)) {
          if (paramConfig.min !== undefined && paramConfig.max !== undefined) {
            const range = `<${paramConfig.min}-${paramConfig.max}>`;
            console.log(`    --${paramName} ${range.padEnd(10)} ${paramConfig.description || ''}`);
            if (paramConfig.options) {
              for (const opt of paramConfig.options) {
                console.log(`        ${opt.value} = ${opt.label}: ${opt.desc}`);
              }
            }
          } else if (paramConfig.examples) {
            console.log(`    --${paramName}            ${paramConfig.description || ''}`);
            console.log(`        Examples: ${paramConfig.examples.join(', ')}`);
          } else {
            console.log(`    --${paramName}            ${paramConfig.description || ''}`);
          }
        }
        
        // Show example
        console.log('');
        console.log('  Example:');
        if (game.type === 'plinko') {
          console.log(`    apechurch play ${game.key} 10 2 50`);
          console.log(`    apechurch play --game ${game.key} --amount 10 --mode 2 --balls 50`);
        } else if (game.type === 'slots') {
          console.log(`    apechurch play ${game.key} 5 10`);
          console.log(`    apechurch play --game ${game.key} --amount 5 --spins 10`);
        } else if (game.type === 'roulette') {
          console.log(`    apechurch play roulette 50 RED`);
          console.log(`    apechurch play roulette 100 RED,BLACK`);
          console.log(`    apechurch play roulette 10 17`);
          console.log(`    apechurch play --game roulette --amount 50 --bet RED`);
        } else if (game.type === 'baccarat') {
          console.log(`    apechurch play baccarat 50 BANKER`);
          console.log(`    apechurch play baccarat 150 140 BANKER 10 TIE`);
          console.log(`    apechurch play --game baccarat --amount 50 --bet PLAYER`);
        }
        console.log('─'.repeat(70));
      }
      
      console.log('\nQUICK PLAY (positional or flags):');
      console.log('  apechurch play                        # Random game');
      console.log('  apechurch play jungle-plinko 10 2 50  # Plinko: amount mode balls');
      console.log('  apechurch play roulette 50 RED        # Roulette: amount bet');
      console.log('  apechurch play baccarat 50 BANKER     # Baccarat: amount bet');
      console.log('  apechurch play dino-dough 5 10        # Slots: amount spins\n');
    }
  });

// --- COMMAND: GAME (Show detailed info for a specific game) ---
program
  .command('game <name>')
  .description('Show detailed info for a specific game')
  .option('--json', 'Output JSON only')
  .action((name, opts) => {
    const game = resolveGame(name);
    
    if (!game) {
      const availableGames = GAME_REGISTRY.map(g => g.key).join(', ');
      if (opts.json) {
        console.log(JSON.stringify({ error: `Unknown game: ${name}`, available: availableGames }));
      } else {
        console.log(`\n❌ Unknown game: "${name}"`);
        console.log(`\nAvailable games: ${availableGames}`);
        console.log('Run "apechurch games" for full list.\n');
      }
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify({
        key: game.key,
        name: game.name,
        type: game.type,
        description: game.description,
        aliases: game.aliases || [],
        contract: game.contract,
        config: game.config,
      }, null, 2));
    } else {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`  ${game.name.toUpperCase()}`);
      console.log(`${'═'.repeat(60)}`);
      console.log(`\n  ${game.description}\n`);
      console.log(`  Type:     ${game.type}`);
      console.log(`  Key:      ${game.key}`);
      console.log(`  Aliases:  ${game.aliases?.join(', ') || 'none'}`);
      console.log(`  Contract: ${game.contract}`);
      console.log(`\n${'─'.repeat(60)}`);
      console.log('  PARAMETERS');
      console.log(`${'─'.repeat(60)}\n`);
      
      for (const [paramName, paramConfig] of Object.entries(game.config)) {
        console.log(`  --${paramName}`);
        if (paramConfig.min !== undefined && paramConfig.max !== undefined) {
          console.log(`      Range:   ${paramConfig.min} - ${paramConfig.max}`);
          console.log(`      Default: ${paramConfig.default}`);
        }
        console.log(`      ${paramConfig.description || ''}`);
        
        if (paramConfig.options) {
          console.log('');
          console.log('      Values:');
          for (const opt of paramConfig.options) {
            console.log(`        ${opt.value} = ${opt.label}`);
            console.log(`            ${opt.desc}`);
          }
        }
        if (paramConfig.examples) {
          console.log('');
          console.log('      Examples:');
          for (const ex of paramConfig.examples) {
            console.log(`        ${ex}`);
          }
        }
        console.log('');
      }
      
      // Show roulette bet types if applicable
      if (game.type === 'roulette' && game.betTypes) {
        console.log(`${'─'.repeat(60)}`);
        console.log('  BET TYPES');
        console.log(`${'─'.repeat(60)}\n`);
        console.log('  Numbers:');
        console.log('      0, 00, 1-36 (single number bets, 36.9x multiplier)');
        console.log('');
        console.log('  Colors & Parity (2.05x):');
        console.log('      RED, BLACK, ODD, EVEN');
        console.log('');
        console.log('  Halves (2.05x):');
        console.log('      FIRST_HALF (1-18), SECOND_HALF (19-36)');
        console.log('');
        console.log('  Thirds (3.075x):');
        console.log('      FIRST_THIRD (1-12), SECOND_THIRD (13-24), THIRD_THIRD (25-36)');
        console.log('');
        console.log('  Columns (3.075x):');
        console.log('      FIRST_COL, SECOND_COL, THIRD_COL');
        console.log('');
        console.log('  💡 Pro tip: Bet RED,BLACK together for 2.5% profit (unless 0/00)');
        console.log('');
      }
      
      // Show baccarat bet types
      if (game.type === 'baccarat') {
        console.log(`${'─'.repeat(60)}`);
        console.log('  BET TYPES & PAYOUTS');
        console.log(`${'─'.repeat(60)}\n`);
        console.log('  PLAYER   - Pays 2.00x (bet on player hand winning)');
        console.log('  BANKER   - Pays 1.95x (bet on banker hand winning)');
        console.log('  TIE      - Pays 9.00x (bet on hands tying)');
        console.log('');
        console.log('  Combined bets (specify amounts explicitly):');
        console.log('  150 → 140 BANKER 10 TIE   (140 on banker, 10 on tie)');
        console.log('  200 → 180 PLAYER 20 TIE   (180 on player, 20 on tie)');
        console.log('');
        console.log('  ⚠️  Amounts must add up to total wager exactly.');
        console.log('');
        console.log('  💡 Pro tip: BANKER has slightly better odds due to game rules.');
        console.log('');
      }
      
      console.log(`${'─'.repeat(60)}`);
      console.log('  SYNTAX');
      console.log(`${'─'.repeat(60)}\n`);
      
      if (game.type === 'plinko') {
        console.log('  Positional:  apechurch play <game> <amount> <mode> <balls>');
        console.log('  Flags:       apechurch play --game <game> --amount <ape> --mode <0-4> --balls <1-100>');
        console.log('');
        console.log('  You can mix positional and flags. Positional order: amount, mode, balls.');
      } else if (game.type === 'slots') {
        console.log('  Positional:  apechurch play <game> <amount> <spins>');
        console.log('  Flags:       apechurch play --game <game> --amount <ape> --spins <1-15>');
        console.log('');
        console.log('  You can mix positional and flags. Positional order: amount, spins.');
      } else if (game.type === 'roulette') {
        console.log('  Positional:  apechurch play roulette <amount> <bet>');
        console.log('  Flags:       apechurch play --game roulette --amount <ape> --bet <bet>');
        console.log('');
        console.log('  You can mix positional and flags. Positional order: amount, bet.');
        console.log('');
        console.log('  Multi-bet: When betting on multiple spots (e.g., RED,BLACK,17), the');
        console.log('  total amount is split evenly across all bets using integer division.');
        console.log('  Example: 100 APE on RED,BLACK → 50 APE on RED + 50 APE on BLACK');
      } else if (game.type === 'baccarat') {
        console.log('  Simple:      apechurch play baccarat <total> <bet>');
        console.log('  Combined:    apechurch play baccarat <total> <amt1> <bet1> <amt2> <bet2>');
        console.log('');
        console.log('  Flags also work: --game baccarat --amount <ape> --bet <bet>');
        console.log('');
        console.log('  For combined bets, specify exact amounts for each (must sum to total).');
        console.log('  Example: apechurch play baccarat 150 140 BANKER 10 TIE');
        console.log('           → 140 APE on banker + 10 APE on tie = 150 total');
      }
      
      console.log('');
      console.log(`${'─'.repeat(60)}`);
      console.log('  EXAMPLES');
      console.log(`${'─'.repeat(60)}\n`);
      
      console.log('  # Quick play (random settings based on strategy):');
      console.log(`  apechurch play ${game.key}`);
      console.log('');
      console.log('  # With specific amount:');
      console.log(`  apechurch play ${game.key} 10`);
      console.log('');
      console.log('  # Full control (positional):');
      if (game.type === 'plinko') {
        console.log(`  apechurch play ${game.key} 10 2 50`);
        console.log('                             │  │  └─ balls (50)');
        console.log('                             │  └──── mode (2)');
        console.log('                             └─────── amount (10 APE)');
      } else if (game.type === 'slots') {
        console.log(`  apechurch play ${game.key} 10 8`);
        console.log('                          │  └─ spins (8)');
        console.log('                          └──── amount (10 APE)');
      } else if (game.type === 'roulette') {
        console.log(`  apechurch play roulette 50 RED`);
        console.log('                          │  └─ bet (RED)');
        console.log('                          └──── amount (50 APE)');
        console.log('');
        console.log(`  apechurch play roulette 100 RED,BLACK`);
        console.log('                          │   └─ bet (50 APE each)');
        console.log('                          └───── total amount');
      } else if (game.type === 'baccarat') {
        console.log(`  apechurch play baccarat 50 BANKER`);
        console.log('                          │  └─ bet (BANKER)');
        console.log('                          └──── amount (50 APE)');
        console.log('');
        console.log(`  apechurch play baccarat 150 140 BANKER 10 TIE`);
        console.log('                          │   │    │     │  └─ 10 on tie');
        console.log('                          │   │    │     └──── tie bet');
        console.log('                          │   │    └────────── 140 on banker');
        console.log('                          │   └───────────────  banker bet');
        console.log('                          └───────────────────  total (must = 140+10)');
      }
      console.log('');
      console.log('  # Full control (flags):');
      if (game.type === 'plinko') {
        console.log(`  apechurch play --game ${game.key} --amount 10 --mode 2 --balls 50`);
      } else if (game.type === 'slots') {
        console.log(`  apechurch play --game ${game.key} --amount 10 --spins 8`);
      } else if (game.type === 'roulette') {
        console.log(`  apechurch play --game roulette --amount 50 --bet RED`);
        console.log(`  apechurch play --game roulette --amount 100 --bet RED,BLACK,17`);
      } else if (game.type === 'baccarat') {
        console.log(`  apechurch play --game baccarat --amount 50 --bet BANKER`);
        console.log(`  apechurch play --game baccarat --amount 150 --bet "140 BANKER 10 TIE"`);
      }
      console.log('');
      console.log('  # Continuous play:');
      console.log(`  apechurch play ${game.key} --loop`);
      console.log('');
      console.log(`${'═'.repeat(60)}\n`);
    }
  });

// --- COMMAND: COMMANDS (Show all commands overview) ---
program
  .command('commands')
  .alias('help')
  .description('Show all available commands with examples')
  .action(() => {
    console.log(`
========================================
🎰 APE CHURCH CLI - FULL REFERENCE
========================================

ABOUT
  Ape Church is a FULLY on-chain, 100% decentralized casino on ApeChain.
  Every bet is placed and settled on-chain. Zero servers.
  
  Player vs Player: The "house" is a public staking pool - anyone can
  deposit or withdraw APE anytime. You're playing against other players,
  not the house. Truly PvP. Games use VRF for provably fair randomness.

========================================
GETTING STARTED
========================================

  apechurch install
    Interactive setup - guides you through wallet and username creation.
    
    Options:
      --username <name>    Pre-set username (skip prompt)
      --private-key <key>  Import existing wallet (skip prompt)
      --persona <type>     Set betting strategy
      -y, --quick          Skip all prompts, use defaults

  apechurch status [--json]
    Check your wallet balance and current status.

========================================
WALLET
========================================

  apechurch wallet show       Show wallet address
  apechurch wallet export     Export private key (with warning)

========================================
PLAYING GAMES
========================================

  apechurch play [game] [amount] [config...]
    Play a game. Supports positional args OR flags.
    
    Positional syntax (natural):
      apechurch play roulette 50 RED           # Roulette: game amount bet
      apechurch play roulette 100 RED,BLACK    # Multi-bet (splits evenly)
      apechurch play jungle-plinko 10 2 50     # Plinko: game amount mode balls
      apechurch play dino-dough 5 10           # Slots: game amount spins
    
    Flag syntax (also works):
      --game <name>    Game to play (random if not specified)
      --amount <ape>   Wager amount (strategy-based if not specified)
      --mode <0-4>     Plinko risk level
      --balls <1-100>  Plinko balls to drop
      --spins <1-15>   Slots spins
      --bet <bet>      Roulette bet (RED, BLACK, 17, RED,BLACK, etc.)
      --strategy <type> conservative | balanced | aggressive | degen
      --loop           Play continuously
      --delay <sec>    Delay between games in loop mode (default: 3)

    Examples:
      apechurch play                           # Random everything
      apechurch play roulette 50 RED           # 50 APE on red
      apechurch play baccarat 50 BANKER        # 50 APE on banker
      apechurch play baccarat 150 140 BANKER 10 TIE  # Combined bet
      apechurch play jungle-plinko 10 2 50     # 10 APE, mode 2, 50 balls
      apechurch play --loop                    # Continuous random games

  apechurch games [--json]
    List all available games with parameters.

  apechurch game <name> [--json]
    Show detailed info for a specific game (params, examples).

========================================
STRATEGIES (controls how much your agent bets)
========================================

  conservative   5% of balance per bet, low-risk game configs
  balanced       8% of balance per bet (default)
  aggressive     12% of balance per bet, high-risk game configs
  degen          20% of balance per bet, max risk

  Change your strategy anytime:
    apechurch profile set --persona aggressive
  
  Or specify per-session:
    apechurch play --loop --strategy degen

========================================
CONTROL
========================================

  apechurch pause       Stop playing (loop will exit)
  apechurch resume      Resume playing
  Ctrl+C                Stop the current loop

========================================
PROFILE & SETTINGS
========================================

  apechurch profile show [--json]
    View your current profile.

  apechurch profile set [--persona TYPE] [--username NAME]
    Update your strategy or username.

  apechurch register --username <NAME>
    Change your on-chain username.

========================================
EXAMPLES
========================================

  # Quick start - play continuously
  apechurch play --loop

  # Play roulette
  apechurch play roulette 50 RED              # 50 APE on red
  apechurch play roulette 100 RED,BLACK       # Hedge: 2.5% profit unless 0/00
  apechurch play roulette 10 17               # 10 APE on number 17

  # Play plinko
  apechurch play jungle-plinko 10 2 50        # 10 APE, mode 2, 50 balls

  # Play slots
  apechurch play dino-dough 5 10              # 5 APE, 10 spins

  # Continuous play
  apechurch play roulette 50 RED --loop       # Loop roulette on red
  apechurch play --loop --strategy aggressive # Loop random games

  # Check status
  apechurch status

========================================
FOR AI AGENTS
========================================

  To activate this skill, tell your agent:

  "Read ~/.apechurch/skill/SKILL.md and run: apechurch play --loop"

  All commands support --json for machine-readable output.
`);
  });

program.parse(process.argv);
