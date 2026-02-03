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
// Standard OpenClaw skills directory
const SKILL_TARGET_DIR = path.join(HOME, '.openclaw', 'skills', 'ape-church');
const WALLET_FILE = path.join(HOME, '.apechurch-wallet.json');
const APECHURCH_DIR = path.join(HOME, '.apechurch');
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
      gameWeights: defaultWeights,
    },
    balanced: {
      minBetApe: 1,
      targetBetPct: 0.08,
      maxBetPct: 0.15,
      baseCooldownMs: 30 * 1000, // 30 seconds
      plinko: { mode: [1, 2], balls: [50, 90] },
      slots: { spins: [7, 12] },
      gameWeights: defaultWeights,
    },
    aggressive: {
      minBetApe: 1,
      targetBetPct: 0.12,
      maxBetPct: 0.25,
      baseCooldownMs: 15 * 1000, // 15 seconds
      plinko: { mode: [2, 4], balls: [20, 70] },
      slots: { spins: [3, 10] },
      gameWeights: defaultWeights,
    },
    degen: {
      minBetApe: 1,
      targetBetPct: 0.2,
      maxBetPct: 0.35,
      baseCooldownMs: 10 * 1000, // 10 seconds
      plinko: { mode: [3, 4], balls: [10, 40] },
      slots: { spins: [2, 6] },
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

async function playGame({
  account,
  game,
  amountApe,
  mode,
  balls,
  spins,
  timeoutMs,
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
      [modeValue, ballsValue, gameId, ZERO_ADDRESS, userRandomWord]
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
      [gameId, spinsValue, ZERO_ADDRESS, userRandomWord]
    );

    contractAddress = gameEntry.contract;
    gameName = gameEntry.key;
    gameUrl = `https://www.ape.church/games/${gameEntry.slug}?id=${gameId.toString()}`;
    config = { spins: spinsValue };
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

// --- COMMAND: INSTALL (The Human Experience) ---
program
  .command('install')
  .description('Setup the Ape Church Agent')
  .option('--username <name>', 'Username (must end with _CLAWBOT)')
  .option('--persona <name>', 'conservative | balanced | aggressive | degen')
  .action(async (opts) => {
    console.log('Initializing Ape Church Protocol...');

    // 1. Generate Wallet (Self-Sovereign)
    let address;
    if (fs.existsSync(WALLET_FILE)) {
      const data = JSON.parse(fs.readFileSync(WALLET_FILE));
      address = privateKeyToAccount(data.privateKey).address;
      console.log('Wallet already exists.');
    } else {
      const pk = generatePrivateKey();
      const account = privateKeyToAccount(pk);
      fs.writeFileSync(WALLET_FILE, JSON.stringify({ privateKey: pk }));
      address = account.address;
      console.log('Generated new Agent Wallet.');
    }

    // 2. Inject the Brain (SKILL.md)
    if (!fs.existsSync(SKILL_TARGET_DIR)) {
      fs.mkdirSync(SKILL_TARGET_DIR, { recursive: true });
    }
    // Robust path finding for ESM modules
    const assetsDir = path.join(path.dirname(new URL(import.meta.url).pathname), '../assets');
    const assetFiles = ['SKILL.md', 'HEARTBEAT.md', 'STRATEGY.md', 'skill.json'];
    for (const file of assetFiles) {
      const source = path.join(assetsDir, file);
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, path.join(SKILL_TARGET_DIR, file));
      }
    }
    console.log('Injected skill files into Agent brain.');

    // 3. Register username (optional, auto if missing)
    const localProfile = loadProfile();
    const persona = normalizeStrategy(opts.persona || localProfile.persona || 'balanced');
    let username;
    try {
      username = normalizeUsername(opts.username || localProfile.username || '');
    } catch (error) {
      console.error(`Invalid username provided; generating one. Reason: ${error.message}`);
      username = normalizeUsername('');
    }
    saveProfile({ ...localProfile, persona, username });
    const state = loadState();
    state.strategy = persona;
    saveState(state);

    const usernameWasProvided = opts.username && opts.username.trim().length > 0;
    console.log(`Username: ${username}${usernameWasProvided ? '' : ' (auto-generated)'}`);
    try {
      await registerUsername({ account: getWallet(), username, persona });
      console.log('Username registered via SIWE.');
    } catch (error) {
      console.error(`Username registration failed: ${error.message}`);
      console.log('You can retry later with: apechurch register --username <NAME>');
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
    console.log(`~/.openclaw/skills/ape-church/SKILL.md to understand how to play.`);
    console.log(`Then run: apechurch play --loop`);
    console.log(`This will play casino games continuously on ApeChain.`);
    console.log('---END MESSAGE---');
    console.log('');
    console.log('========================================');
    console.log('QUICK REFERENCE');
    console.log('========================================');
    console.log('PLAY:');
    console.log('  apechurch play              Play one game');
    console.log('  apechurch play --loop       Play continuously (2s between games)');
    console.log('');
    console.log('GAMES (auto-selected, or use --game):');
    console.log('  jungle-plinko    Plinko (--mode 0-4, --balls 1-100)');
    console.log('  dino-dough       Slots (--spins 1-15)');
    console.log('  bubblegum-heist  Slots (--spins 1-15)');
    console.log('');
    console.log('STRATEGIES (controls bet sizing):');
    console.log('  conservative     5% of balance per bet');
    console.log('  balanced         8% of balance per bet (default)');
    console.log('  aggressive       12% of balance per bet');
    console.log('  degen            20% of balance per bet');
    console.log('');
    console.log('CONTROL:');
    console.log('  apechurch status            Check balance');
    console.log('  apechurch pause             Pause play');
    console.log('  apechurch resume            Resume play');
    console.log('  apechurch games             List all games');
    console.log('  apechurch commands          Full command reference');
    console.log('  apechurch help              Show help');
    console.log('');
    console.log('CHANGE SETTINGS:');
    console.log('  apechurch register --username <NAME>');
    console.log('  apechurch profile set --persona <STRATEGY>');
    console.log('========================================');
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
  .option('--username <name>', 'Set local username (must end with _CLAWBOT)')
  .option('--json', 'Output JSON only')
  .action((opts) => {
    const profile = loadProfile();
    if (opts.persona) profile.persona = normalizeStrategy(opts.persona);
    if (opts.username) profile.username = normalizeUsername(opts.username);
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
    try {
      const response = await playGame({
        account,
        game: opts.game,
        amountApe: opts.amount,
        mode: opts.mode,
        balls: opts.balls,
        spins: opts.spins,
        timeoutMs,
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
          timeoutMs,
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

// --- COMMAND: PLAY (Simple play command - no cooldowns) ---
program
  .command('play')
  .description('Play a game immediately (no cooldowns)')
  .option('--strategy <name>', 'conservative | balanced | aggressive | degen', 'balanced')
  .option('--loop', 'Play continuously with 2s between games')
  .option('--delay <seconds>', 'Seconds between games in loop mode', '2')
  .option('--json', 'Output JSON only')
  .action(async (opts) => {
    const account = getWallet();
    const loopMode = Boolean(opts.loop);
    const delaySeconds = Math.max(parseFloat(opts.delay) || 2, 1);
    const delayMs = delaySeconds * 1000;

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
      console.log(`🎰 Starting continuous play (${delaySeconds}s between games, Ctrl+C to stop)...\n`);
    }

    async function playOnce() {
      const state = loadState();
      const freshProfile = loadProfile();
      
      if (freshProfile.paused) {
        return { shouldStop: true, reason: 'paused' };
      }

      const strategy = normalizeStrategy(opts.strategy);
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

      const wagerApe = calculateWager(availableApe, strategyConfig);
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
          timeoutMs: 0,
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

        const response = {
          action: 'play',
          status: playResponse.status,
          strategy,
          balance_ape: balanceApe.toFixed(6),
          wager_ape: wagerApeString,
          game: playResponse.game,
          config: playResponse.config,
          tx: playResponse.tx,
          gameId: playResponse.gameId,
          game_url: playResponse.game_url,
          result: playResponse.result,
          session: {
            wins: state.sessionWins,
            losses: state.sessionLosses,
            total_pnl_ape: formatEther(BigInt(state.totalPnLWei)),
          },
        };

        if (opts.json) console.log(JSON.stringify(response));
        else console.log(JSON.stringify(response, null, 2));

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

// --- COMMAND: GAMES (Show available games and parameters) ---
program
  .command('games')
  .description('List all available games and their parameters')
  .option('--json', 'Output JSON only')
  .action((opts) => {
    const games = GAME_REGISTRY.map((game) => {
      const params = [];
      if (game.type === 'plinko') {
        params.push({
          name: 'mode',
          type: 'integer',
          min: game.config.mode.min,
          max: game.config.mode.max,
          default: game.config.mode.default,
          description: 'Risk level (higher = riskier, bigger payouts)',
        });
        params.push({
          name: 'balls',
          type: 'integer',
          min: game.config.balls.min,
          max: game.config.balls.max,
          default: game.config.balls.default,
          description: 'Number of balls to drop',
        });
      } else if (game.type === 'slots') {
        params.push({
          name: 'spins',
          type: 'integer',
          min: game.config.spins.min,
          max: game.config.spins.max,
          default: game.config.spins.default,
          description: 'Number of spins per bet',
        });
      }
      return {
        key: game.key,
        name: game.name,
        type: game.type,
        aliases: game.aliases || [],
        contract: game.contract,
        parameters: params,
      };
    });

    if (opts.json) {
      console.log(JSON.stringify({ games }, null, 2));
    } else {
      console.log('\n🎰 AVAILABLE GAMES\n');
      for (const game of games) {
        console.log(`${game.name} (${game.key})`);
        console.log(`  Type: ${game.type}`);
        console.log(`  Aliases: ${game.aliases.join(', ') || 'none'}`);
        console.log('  Parameters:');
        for (const param of game.parameters) {
          console.log(`    --${param.name} <${param.min}-${param.max}>  ${param.description} (default: ${param.default})`);
        }
        console.log('');
      }
      console.log('EXAMPLE BETS:');
      console.log('  apechurch bet --game jungle-plinko --amount 5 --mode 2 --balls 50');
      console.log('  apechurch bet --game dino-dough --amount 10 --spins 8');
      console.log('  apechurch bet --game bubblegum-heist --amount 5 --spins 12');
      console.log('');
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

  apechurch install [--username NAME] [--persona TYPE]
    Set up your agent wallet and register on Ape Church.

  apechurch status [--json]
    Check your wallet balance and current status.

========================================
PLAYING GAMES
========================================

  apechurch play [--strategy TYPE] [--loop] [--json]
    Play games automatically. Picks a random game, bets based on strategy.
    --loop         Play continuously (2s between games)
    --delay <sec>  Custom delay between games (default: 2)
    --strategy     conservative | balanced | aggressive | degen

  apechurch bet --game <NAME> --amount <APE> [options]
    Place a manual bet on a specific game.
    --game         jungle-plinko | dino-dough | bubblegum-heist
    --amount       APE to wager
    --mode <0-4>   Plinko risk level (higher = riskier)
    --balls <1-100> Plinko balls to drop
    --spins <1-15> Slots spins per bet

  apechurch games [--json]
    List all available games with parameters.

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

  # Play aggressively
  apechurch play --loop --strategy aggressive

  # Single manual bet
  apechurch bet --game jungle-plinko --amount 10 --mode 3 --balls 50

  # Check status
  apechurch status

========================================
FOR AI AGENTS
========================================

  To activate this skill, tell your agent:

  "Read ~/.openclaw/skills/ape-church/SKILL.md and run: apechurch play --loop"

  All commands support --json for machine-readable output.
`);
  });

program.parse(process.argv);
