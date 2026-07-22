/**
 * Per-wallet history download and stats helpers.
 *
 * Scope:
 * - Powers `wallet download` and `history --refresh`.
 * - Enumerates supported single-tx games via indexed GameEnded logs.
 * - Enriches downloaded history with tx, receipt, gas, fees, GP, and wAPE.
 * - Persists a per-wallet local history file that can be rendered offline.
 * - Merges incremental syncs/backfills without duplicating existing games.
 * - Builds aggregate and per-game history stats from that cached file.
 *
 * Limits:
 * - Stateful games are discovered from wallet-indexed play/finalization logs
 *   when available, then rehydrated through game-specific `getGameInfo` calls.
 */
import { decodeAbiParameters, decodeEventLog, decodeFunctionData, formatEther } from 'viem';
import { getLogs as getLogsAction } from 'viem/actions';
import {
  APESTRONG_CONTRACT,
  apechain,
  BACCARAT_CONTRACT,
  BEAR_DICE_CONTRACT,
  BLACKJACK_CONTRACT,
  BLIZZARD_BLITZ_CONTRACT,
  BUBBLEGUM_HEIST_CONTRACT,
  CASH_DASH_CONTRACT,
  COSMIC_PLINKO_CONTRACT,
  CULT_QUEST_CONTRACT,
  DINO_DOUGH_CONTRACT,
  ERC20_ABI,
  GAME_CONTRACT_ABI,
  GEEZ_DIGGERZ_CONTRACT,
  GIMBOZ_GALAXY_CONTRACT,
  GLYDE_OR_CRASH_CONTRACT,
  GIMBOZ_SMASH_CONTRACT,
  GP_REWARD_TOKEN_CONTRACTS,
  GP_TOKEN_ABI,
  GP_TOKEN_CONTRACT,
  HISTORY_SCHEMA_VERSION,
  HI_LO_NEBULA_CONTRACT,
  JUNGLE_PLINKO_CONTRACT,
  KENO_CONTRACT,
  MONKEY_MATCH_CONTRACT,
  ROULETTE_CONTRACT,
  RICOS_REVENGE_CONTRACT,
  SPEED_KENO_CONTRACT,
  SUSHI_SHOWDOWN_CONTRACT,
  USER_INFO_ABI,
  USER_INFO_CONTRACT,
  VIDEO_POKER_CONTRACT,
  WAPE_TOKEN_CONTRACT,
} from './constants.js';
import {
  deriveCurrentGpPerApeFromHistoryGames,
  getHistoryFilePath,
  loadHistory,
  loadProfile,
  saveHistory,
  saveProfile,
} from './profile.js';
import { resolveHistoryGameName } from './history.js';
import { GAME_REGISTRY, resolveGameDisplayName } from '../registry.js';
import { getGameOptionLabel } from './game-config.js';
import {
  formatGameVariantName,
  getGimbozSmashPayoutMultiplier,
  resolveConfiguredGameVariant,
  shouldUseResolvedCanonicalVariant,
} from './rtp.js';
import { sanitizeError } from './utils.js';
import {
  BLACKJACK_ABI,
  GameState as BlackjackGameState,
} from './stateful/blackjack/constants.js';
import {
  VIDEO_POKER_ABI,
  GameState as VideoPokerGameState,
} from './stateful/video-poker/constants.js';
import { HI_LO_NEBULA_ABI } from './stateful/hi-lo-nebula/constants.js';
import { CASH_DASH_ABI } from './stateful/cash-dash/constants.js';
import { BEAR_DICE_GAME_INFO_ABI } from './games/beardice.js';
import {
  buildGlydeOrCrashConfig,
  GLYDE_OR_CRASH_GAME_INFO_ABI,
} from './games/glydeorcrash.js';
import {
  GIMBOZ_SMASH_GAME_INFO_ABI,
  formatGimbozSmashTargets,
  mergeGimbozSmashIntervals,
} from './games/gimbozsmash.js';

const APESTRONG_GAME_INFO_ABI = [
  {
    type: 'function',
    name: 'getGameInfo',
    stateMutability: 'view',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'player', type: 'address' },
        { name: 'betAmount', type: 'uint256' },
        { name: 'edgeFlipRange', type: 'uint8' },
        { name: 'winningNumber', type: 'uint8' },
        { name: 'totalPayout', type: 'uint256' },
        { name: 'hasEnded', type: 'bool' },
        { name: 'timestamp', type: 'uint256' },
      ],
    }],
  },
];

const BACCARAT_GAME_INFO_ABI = [
  {
    type: 'function',
    name: 'getGameInfo',
    stateMutability: 'view',
    inputs: [{ name: '_gameId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'playerBankerBet', type: 'uint256' },
        { name: 'tieBet', type: 'uint256' },
        { name: 'payout', type: 'uint256' },
        { name: 'user', type: 'address' },
        { name: 'betOnBanker', type: 'bool' },
        { name: 'playerCards', type: 'uint8[]' },
        { name: 'bankerCards', type: 'uint8[]' },
        { name: 'hasEnded', type: 'bool' },
        { name: 'timestamp', type: 'uint256' },
      ],
    }],
  },
];

const ROULETTE_GAME_INFO_ABI = [
  {
    type: 'function',
    name: 'getGameInfo',
    stateMutability: 'view',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'player', type: 'address' },
        { name: 'betAmount', type: 'uint256' },
        { name: 'totalPayout', type: 'uint256' },
        { name: 'hasEnded', type: 'bool' },
        { name: 'chosenNumber', type: 'uint8' },
        { name: 'gameNumbers', type: 'uint8[]' },
        { name: 'betsPerNumbers', type: 'uint256[]' },
        { name: 'timestamp', type: 'uint256' },
      ],
    }],
  },
];

const KENO_GAME_INFO_ABI = [
  {
    type: 'function',
    name: 'getGameInfo',
    stateMutability: 'view',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'player', type: 'address' },
        { name: 'betAmount', type: 'uint256' },
        { name: 'totalPayout', type: 'uint256' },
        { name: 'hasEnded', type: 'bool' },
        { name: 'winningNumbers', type: 'uint8[10]' },
        { name: 'gameNumbers', type: 'uint8[]' },
        { name: 'timestamp', type: 'uint256' },
      ],
    }],
  },
];

const BLOCKS_GAME_INFO_ABI = [
  {
    type: 'function',
    name: 'getGameInfo',
    stateMutability: 'view',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'player', type: 'address' },
        { name: 'betAmount', type: 'uint256' },
        { name: 'numRuns', type: 'uint8' },
        { name: 'riskMode', type: 'uint8' },
        { name: 'boards', type: 'uint8[]' },
        { name: 'maxCounts', type: 'uint8[]' },
        { name: 'totalPayout', type: 'uint256' },
        { name: 'hasEnded', type: 'bool' },
        { name: 'timestamp', type: 'uint256' },
      ],
    }],
  },
];

const PRIMES_GAME_INFO_ABI = [
  {
    type: 'function',
    name: 'getGameInfo',
    stateMutability: 'view',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'player', type: 'address' },
        { name: 'betAmount', type: 'uint256' },
        { name: 'numRuns', type: 'uint8' },
        { name: 'difficulty', type: 'uint8' },
        { name: 'results', type: 'uint256[]' },
        { name: 'totalPayout', type: 'uint256' },
        { name: 'hasEnded', type: 'bool' },
        { name: 'timestamp', type: 'uint256' },
      ],
    }],
  },
];

const SPEED_KENO_GAME_INFO_ABI = [
  {
    type: 'function',
    name: 'getGameInfo',
    stateMutability: 'view',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'player', type: 'address' },
        { name: 'betAmount', type: 'uint256' },
        { name: 'numGames', type: 'uint8' },
        { name: 'totalPayout', type: 'uint256' },
        { name: 'hasEnded', type: 'bool' },
        { name: 'winningNumbers', type: 'uint8[5][20]' },
        { name: 'gameNumbers', type: 'uint8[]' },
        { name: 'timestamp', type: 'uint256' },
      ],
    }],
  },
];

const PLINKO_GAME_INFO_ABI = [
  {
    type: 'function',
    name: 'getGameInfo',
    stateMutability: 'view',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'player', type: 'address' },
        { name: 'gameMode', type: 'uint8' },
        { name: 'numBalls', type: 'uint8' },
        { name: 'betAmount', type: 'uint256' },
        { name: 'bucketIndexes', type: 'uint8[]' },
        { name: 'totalPayout', type: 'uint256' },
        { name: 'hasEnded', type: 'bool' },
        { name: 'timestamp', type: 'uint256' },
      ],
    }],
  },
];

const SLOTS_GAME_INFO_ABI = [
  {
    type: 'function',
    name: 'getGameInfo',
    stateMutability: 'view',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'player', type: 'address' },
        { name: 'betAmountPerSpin', type: 'uint256' },
        { name: 'totalBetAmount', type: 'uint256' },
        { name: 'num0', type: 'uint8[]' },
        { name: 'num1', type: 'uint8[]' },
        { name: 'num2', type: 'uint8[]' },
        { name: 'totalPayout', type: 'uint256' },
        { name: 'hasEnded', type: 'bool' },
        { name: 'timestamp', type: 'uint256' },
      ],
    }],
  },
];

const MONKEY_MATCH_GAME_INFO_ABI = [
  {
    type: 'function',
    name: 'getGameInfo',
    stateMutability: 'view',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'player', type: 'address' },
        { name: 'betAmount', type: 'uint256' },
        { name: 'gameMode', type: 'uint8' },
        { name: 'monkeys', type: 'uint8[]' },
        { name: 'totalPayout', type: 'uint256' },
        { name: 'hasEnded', type: 'bool' },
        { name: 'timestamp', type: 'uint256' },
      ],
    }],
  },
];

const GAME_ENDED_EVENT = GAME_CONTRACT_ABI.find((item) => item.type === 'event' && item.name === 'GameEnded');

export const DEFAULT_ANALYSIS_CHUNK_SIZE = 50_000n;
export const DEFAULT_HISTORY_SYNC_CHUNK_SIZE = DEFAULT_ANALYSIS_CHUNK_SIZE;
export const DEFAULT_HISTORY_RPC_ENRICHMENT_BACKLOG_LIMIT = 250;
export const DEFAULT_STATEFUL_HISTORY_REFRESH_LIMIT = 250;

export const HISTORY_ENRICHMENT_MODES = Object.freeze({
  LOCAL: 'local',
  RPC_MISSING: 'rpc-missing',
});

const DEFAULT_BATCH_SIZE = 10;
const ESSENTIAL_GAME_INFO_BATCH_SIZE = 100;
const OK_SYNC_MSG = 'ok';
const UNSUPPORTED_SYNC_MSG = 'unsupported game fetch';
const EXECUTION_REVERTED_SYNC_MSG = 'execution reverted';
const MISSING_SETTLEMENT_SYNC_MSG = 'no settlement event found';
const MISSING_PLAY_TX_SYNC_MSG = 'missing play transaction hash';
const RECEIPT_LOOKUP_FAILED_SYNC_MSG = 'transaction receipt unavailable';
const UNSETTLED_HISTORY_SYNC_MSG = 'game not settled';
const STATEFUL_FETCH_FAILED_SYNC_MSG = 'stateful game fetch failed';
const STATEFUL_WRONG_OWNER_SYNC_MSG = 'stateful game belongs to a different wallet';
const STATEFUL_INCOMPLETE_SYNC_MSG = 'stateful game not settled';
const STATEFUL_DISCOVERY_PAGE_SIZE = 250n;
const STATEFUL_DISCOVERY_INFO_BATCH_SIZE = 25;

const SUPPORTED_GAMES = GAME_REGISTRY.map((game) => ({
  key: game.key,
  name: game.name,
  slug: game.slug,
  contract: game.contract,
  type: game.type,
  config: game.config,
  betTypes: game.betTypes || null,
}));

const HISTORY_ONLY_GAMES = [
  {
    key: 'blizzard-blitz',
    name: 'Blizzard Blitz',
    slug: 'blizzard-blitz',
    contract: BLIZZARD_BLITZ_CONTRACT,
    type: 'history-cascade-slots',
    config: {
      spins: { min: 1, max: 20, default: 5 },
      minBetPerSpinApe: 2.5,
      bonusRound: { fixedSpins: 5, minBetApe: 100 },
    },
  },
  {
    key: 'gimboz-galaxy',
    name: 'Gimboz of the Galaxy',
    slug: 'gimboz-galaxy',
    contract: GIMBOZ_GALAXY_CONTRACT,
    type: 'history-cascade-slots',
    config: {
      spins: { min: 1, max: 10, default: 3 },
      minBetPerSpinApe: 3,
      bonusRound: { fixedSpins: 3, minBetApe: 100 },
    },
  },
  {
    key: 'ricos-revenge',
    name: "Rico's Revenge",
    slug: 'ricos-revenge',
    contract: RICOS_REVENGE_CONTRACT,
    type: 'history-arcade-slots',
    config: {
      mode: {
        options: [
          { value: 0, label: 'Pump N Dump' },
          { value: 1, label: 'Top Dev' },
        ],
      },
      spins: { min: 1, max: 30, default: 1 },
    },
  },
  {
    key: 'cult-quest',
    name: 'Cult Quest',
    slug: 'cult-quest',
    contract: CULT_QUEST_CONTRACT,
    type: 'history-grid',
    config: {
      gems: { min: 1, max: 12, default: 3 },
    },
  },
];

const HISTORY_SUPPORTED_GAMES = [
  ...SUPPORTED_GAMES,
  ...HISTORY_ONLY_GAMES,
];

const SUPPORTED_CONTRACTS = HISTORY_SUPPORTED_GAMES.map((game) => game.contract);
const SUPPORTED_GAMES_BY_KEY = new Map(
  HISTORY_SUPPORTED_GAMES.map((game) => [String(game.key).toLowerCase(), game])
);
const SUPPORTED_GAMES_BY_CONTRACT = new Map(
  HISTORY_SUPPORTED_GAMES.map((game) => [String(game.contract).toLowerCase(), game])
);

export const UNSUPPORTED_HISTORY_GAMES = [
  {
    key: 'blackjack',
    name: resolveGameDisplayName({ gameKey: 'blackjack', contract: BLACKJACK_CONTRACT, fallbackName: 'Blackjack' }),
    contract: BLACKJACK_CONTRACT,
    reason: 'No indexed per-user settlement event is available in the local contract ABI; saved local game IDs can still be refreshed via getGameInfo.',
  },
  {
    key: 'hi-lo-nebula',
    name: resolveGameDisplayName({ gameKey: 'hi-lo-nebula', contract: HI_LO_NEBULA_CONTRACT, fallbackName: 'Hi-Lo Nebula' }),
    contract: HI_LO_NEBULA_CONTRACT,
    reason: 'No indexed per-user settlement event is available in the local contract ABI; saved local game IDs can still be refreshed via getGameInfo.',
  },
  {
    key: 'cash-dash',
    name: resolveGameDisplayName({ gameKey: 'cash-dash', contract: CASH_DASH_CONTRACT, fallbackName: 'Cash Dash' }),
    contract: CASH_DASH_CONTRACT,
    reason: 'No indexed per-user settlement event is available in the local contract ABI; saved local game IDs can still be refreshed via getGameInfo.',
  },
  {
    key: 'video-poker',
    name: resolveGameDisplayName({ gameKey: 'video-poker', contract: VIDEO_POKER_CONTRACT, fallbackName: 'Video Poker' }),
    contract: VIDEO_POKER_CONTRACT,
    reason: 'No indexed per-user settlement event is available in the local contract ABI; saved local game IDs can still be refreshed via getGameInfo.',
  },
];

const STATEFUL_HISTORY_DISCOVERY_GAMES = UNSUPPORTED_HISTORY_GAMES.map((game) => ({
  key: game.key,
  name: game.name,
  contract: game.contract,
}));

const STATEFUL_HISTORY_CONTRACTS = new Set(
  STATEFUL_HISTORY_DISCOVERY_GAMES.map((game) => String(game.contract || '').toLowerCase())
);
const HISTORY_EVENT_CONTRACTS = [...new Set([
  ...SUPPORTED_CONTRACTS,
  ...STATEFUL_HISTORY_DISCOVERY_GAMES.map((game) => game.contract),
])];

const STATEFUL_HISTORY_DISCOVERY_ABI = [
  {
    type: 'function',
    name: 'numUsedGameIDs',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'paginateUsedGameIDs',
    stateMutability: 'view',
    inputs: [
      { name: 'start', type: 'uint256' },
      { name: 'end', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256[]' }],
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

const USER_GAME_ID_LOG_TOPIC0 = '0xea32a03505fd9f04d664676d72295a86c5fb0465e69654751907ca305bc1d1c7';

const USER_GAME_ID_LOG_FALLBACKS = [
  {
    contract: BACCARAT_CONTRACT,
    topic0: USER_GAME_ID_LOG_TOPIC0,
  },
  ...STATEFUL_HISTORY_DISCOVERY_GAMES.map((game) => ({
    contract: game.contract,
    topic0: USER_GAME_ID_LOG_TOPIC0,
  })),
  {
    contract: BEAR_DICE_CONTRACT,
    topic0: USER_GAME_ID_LOG_TOPIC0,
  },
  {
    contract: BLIZZARD_BLITZ_CONTRACT,
    topic0: USER_GAME_ID_LOG_TOPIC0,
  },
  {
    contract: GIMBOZ_GALAXY_CONTRACT,
    topic0: USER_GAME_ID_LOG_TOPIC0,
  },
  {
    contract: RICOS_REVENGE_CONTRACT,
    topic0: USER_GAME_ID_LOG_TOPIC0,
  },
  {
    contract: CULT_QUEST_CONTRACT,
    topic0: USER_GAME_ID_LOG_TOPIC0,
  },
];
const USER_GAME_ID_LOG_FALLBACK_CONTRACTS = [...new Set(
  USER_GAME_ID_LOG_FALLBACKS.map((fallback) => fallback.contract)
)];

function compareBigInts(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sortLogsNewestFirst(logs) {
  logs.sort((left, right) => {
    const byBlock = compareBigInts(right.blockNumber ?? 0n, left.blockNumber ?? 0n);
    if (byBlock !== 0) return byBlock;

    const leftLogIndex = BigInt(left.logIndex ?? 0);
    const rightLogIndex = BigInt(right.logIndex ?? 0);
    return compareBigInts(rightLogIndex, leftLogIndex);
  });
}

function sortSettlementRecordsNewestFirst(records) {
  records.sort((left, right) => {
    const byBlock = compareBigInts(BigInt(right.blockNumber ?? 0), BigInt(left.blockNumber ?? 0));
    if (byBlock !== 0) return byBlock;

    const leftLogIndex = BigInt(left.logIndex ?? 0);
    const rightLogIndex = BigInt(right.logIndex ?? 0);
    return compareBigInts(rightLogIndex, leftLogIndex);
  });
}

function sortGamesNewestFirst(games) {
  games.sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0));
}

function sumBigInts(items, field) {
  return items.reduce((total, item) => total + (item[field] ?? 0n), 0n);
}

function toApeString(value) {
  return formatEther(value ?? 0n);
}

function toPercentNumber(numeratorWei, denominatorWei, digits = 1) {
  if (!denominatorWei) return 0;

  const numerator = Number.parseFloat(formatEther(numeratorWei));
  const denominator = Number.parseFloat(formatEther(denominatorWei));
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(digits));
}

function toMultiplierNumber(numeratorWei, denominatorWei, digits = 3) {
  if (!denominatorWei) return null;

  const numerator = Number.parseFloat(formatEther(numeratorWei));
  const denominator = Number.parseFloat(formatEther(denominatorWei));
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  return Number((numerator / denominator).toFixed(digits));
}

function toGpPerApeNumber(gpRaw, wagerWei, digits = 3) {
  if (!wagerWei) {
    return null;
  }

  const gp = Number(gpRaw ?? 0n);
  const wagerApe = Number.parseFloat(formatEther(wagerWei));
  if (!Number.isFinite(gp) || !Number.isFinite(wagerApe) || wagerApe <= 0) {
    return null;
  }

  return Number((gp / wagerApe).toFixed(digits));
}

function toMsTimestamp(secondsOrMs) {
  const value = Number(secondsOrMs || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value < 1e12 ? value * 1000 : value;
}

function gameKey(contract, gameId) {
  return `${String(contract || '').toLowerCase()}:${String(gameId || '')}`;
}

function historyGameId(game) {
  return String(game?.game_id ?? game?.gameId ?? '');
}

function toTopicAddress(address) {
  return `0x000000000000000000000000${String(address || '').toLowerCase().replace(/^0x/, '')}`;
}

function isUnsupportedHistoryContract(contract) {
  return STATEFUL_HISTORY_CONTRACTS.has(String(contract || '').toLowerCase());
}

function isStatefulHistoryContract(contract) {
  return STATEFUL_HISTORY_CONTRACTS.has(String(contract || '').toLowerCase());
}

function normalizeSyncMessage(message) {
  return String(message || '').trim().toLowerCase();
}

function isExecutionRevertedHistoryGame(game) {
  return normalizeSyncMessage(game?.last_sync_msg) === EXECUTION_REVERTED_SYNC_MSG;
}

function shouldCountHistoryGame(game) {
  return !isExecutionRevertedHistoryGame(game);
}

function parseBigIntField(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value !== '') {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function isEconomicallySyncedGame(game) {
  return shouldCountHistoryGame(game)
    && game
    && game.last_sync_on
    && typeof game.wager_wei === 'string'
    && typeof game.payout_wei === 'string';
}

function buildRouletteBetString(gameEntry, rawGameNumbers = []) {
  const labelByValue = new Map();
  for (const [label, value] of Object.entries(gameEntry?.betTypes || {})) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && !labelByValue.has(numericValue)) {
      labelByValue.set(numericValue, label);
    }
  }

  return rawGameNumbers
    .map((rawValue) => {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) {
        return null;
      }
      if (value === 1) return '0';
      if (value === 38) return '00';
      if (value >= 2 && value <= 37) return String(value - 1);
      return labelByValue.get(value) || String(value);
    })
    .filter(Boolean)
    .join(',');
}

function toNumericArray(values) {
  return Array.isArray(values)
    ? values.map((value) => Number(value)).filter(Number.isFinite)
    : [];
}

function buildBaccaratConfig(playerBankerBet, tieBet, isBanker) {
  const mainBetType = isBanker ? 'BANKER' : (playerBankerBet > 0n ? 'PLAYER' : '');
  const hasTie = tieBet > 0n;
  const betType = hasTie && mainBetType
    ? `${mainBetType},TIE`
    : (hasTie ? 'TIE' : mainBetType);
  const bet = hasTie && mainBetType
    ? `${formatEther(playerBankerBet)} ${mainBetType} ${formatEther(tieBet)} TIE`
    : betType;

  return {
    bet,
    betType,
    playerBankerBet: formatEther(playerBankerBet),
    tieBet: formatEther(tieBet),
    isBanker,
  };
}

function formatGimbozSmashPayoutDisplay(multiplier) {
  const numeric = Number(multiplier);
  return Number.isFinite(numeric)
    ? `${numeric.toFixed(4).replace(/\.?0+$/, '')}x`
    : null;
}

function buildGimbozSmashConfigFromHumanIntervals(intervals = []) {
  const normalizedIntervals = mergeGimbozSmashIntervals(intervals);
  if (normalizedIntervals.length === 0) {
    return null;
  }

  const winCount = normalizedIntervals.reduce((total, interval) => total + (interval.end - interval.start + 1), 0);
  const payoutMultiplier = getGimbozSmashPayoutMultiplier(winCount);

  return {
    targets: formatGimbozSmashTargets(normalizedIntervals),
    intervals: normalizedIntervals.map((interval) => ({ ...interval })),
    numWinIntervals: normalizedIntervals.length,
    winCount,
    winChance: `${winCount}%`,
    payout: formatGimbozSmashPayoutDisplay(payoutMultiplier),
  };
}

function buildGimbozSmashConfigFromContractData(numWinIntervals, winStarts = [], winEnds = []) {
  const declaredIntervals = Math.min(Math.max(Number(numWinIntervals) || 0, 0), 2);
  const intervals = [];

  for (let index = 0; index < declaredIntervals; index += 1) {
    const start = Number(winStarts[index]);
    const end = Number(winEnds[index]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 99 || start > end) {
      continue;
    }
    intervals.push({ start: start + 1, end: end + 1 });
  }

  return buildGimbozSmashConfigFromHumanIntervals(intervals);
}

function getSlotsSpinCountFromGameInfo(rawGameInfo) {
  const reelLengths = [rawGameInfo?.num0, rawGameInfo?.num1, rawGameInfo?.num2]
    .map((reel) => (Array.isArray(reel) ? reel.length : null))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (reelLengths.length > 0) {
    return Math.max(...reelLengths);
  }

  const totalBetAmount = parseBigIntField(rawGameInfo?.totalBetAmount);
  const betAmountPerSpin = parseBigIntField(rawGameInfo?.betAmountPerSpin);
  if (totalBetAmount > 0n && betAmountPerSpin > 0n && totalBetAmount % betAmountPerSpin === 0n) {
    const spins = Number(totalBetAmount / betAmountPerSpin);
    return Number.isFinite(spins) && spins > 0 ? spins : null;
  }

  return null;
}

function getTransactionInputData(tx) {
  const candidate = tx?.input ?? tx?.data ?? null;
  return typeof candidate === 'string' && candidate.startsWith('0x')
    ? candidate
    : null;
}

function buildCascadeSlotHistoryConfig(gameKey, rawSpins, rawMode) {
  const modeValue = Number(rawMode);
  const baseSpins = Number(rawSpins);
  const isBonusRound = modeValue === 1;
  const bonusSpins = gameKey === 'gimboz-galaxy' ? 3 : 5;

  return {
    mode: isBonusRound ? 'bonus-round' : 'base',
    modeName: isBonusRound ? 'Bonus Round' : 'Base Game',
    spins: isBonusRound ? bonusSpins : baseSpins,
    rawSpins: baseSpins,
  };
}

function buildRicosRevengeHistoryConfig(rawMode, rawSpins) {
  const modeValue = Number(rawMode);
  const rawSpinCount = Number(rawSpins);
  const isTopDev = modeValue === 1;

  return {
    mode: isTopDev ? 'top-dev' : 'pump-n-dump',
    modeValue,
    modeName: isTopDev ? 'Top Dev' : 'Pump N Dump',
    spins: isTopDev ? 5 : rawSpinCount,
    rawSpins: rawSpinCount,
  };
}

function inferStatelessHistoryVariant(gameEntry, tx) {
  if (!gameEntry) {
    return null;
  }

  const inputData = getTransactionInputData(tx);
  if (!inputData) {
    return null;
  }

  let playCall;
  try {
    playCall = decodeFunctionData({
      abi: GAME_CONTRACT_ABI,
      data: inputData,
    });
  } catch {
    return null;
  }

  if (playCall.functionName !== 'play') {
    return null;
  }

  const encodedGameData = playCall.args?.[1];
  if (typeof encodedGameData !== 'string' || !encodedGameData.startsWith('0x')) {
    return null;
  }

  let config = null;

  try {
    switch (gameEntry.key) {
      case 'ape-strong': {
        const [range] = decodeAbiParameters(
          [
            { name: 'range', type: 'uint8' },
            { name: 'gameId', type: 'uint256' },
            { name: 'ref', type: 'address' },
            { name: 'userRandomWord', type: 'bytes32' },
          ],
          encodedGameData,
        );
        config = { range: Number(range) };
        break;
      }
      case 'baccarat': {
        const [, playerBankerBet, tieBet, isBanker] = decodeAbiParameters(
          [
            { name: 'gameId', type: 'uint256' },
            { name: 'playerBankerBet', type: 'uint256' },
            { name: 'tieBet', type: 'uint256' },
            { name: 'isBanker', type: 'bool' },
            { name: 'ref', type: 'address' },
            { name: 'userRandomWord', type: 'bytes32' },
          ],
          encodedGameData,
        );
        config = buildBaccaratConfig(playerBankerBet, tieBet, isBanker);
        break;
      }
      case 'roulette': {
        const [gameNumbers] = decodeAbiParameters(
          [
            { name: 'gameNumbers', type: 'uint8[]' },
            { name: 'amounts', type: 'uint256[]' },
            { name: 'gameId', type: 'uint256' },
            { name: 'ref', type: 'address' },
            { name: 'userRandomWord', type: 'bytes32' },
          ],
          encodedGameData,
        );
        const decodedNumbers = toNumericArray(gameNumbers);
        config = {
          bet: buildRouletteBetString(gameEntry, decodedNumbers),
          gameNumbers: decodedNumbers,
          numBets: decodedNumbers.length,
        };
        break;
      }
      case 'keno': {
        const [gameNumbers] = decodeAbiParameters(
          [
            { name: 'gameNumbers', type: 'uint8[]' },
            { name: 'gameId', type: 'uint256' },
            { name: 'ref', type: 'address' },
            { name: 'userRandomWord', type: 'bytes32' },
          ],
          encodedGameData,
        );
        const decodedNumbers = toNumericArray(gameNumbers);
        config = {
          picks: decodedNumbers.length,
          numbers: decodedNumbers,
        };
        break;
      }
      case 'speed-keno': {
        const [games, gameNumbers] = decodeAbiParameters(
          [
            { name: 'numGames', type: 'uint8' },
            { name: 'gameNumbers', type: 'uint8[]' },
            { name: 'gameId', type: 'uint256' },
            { name: 'ref', type: 'address' },
            { name: 'userRandomWord', type: 'bytes32' },
          ],
          encodedGameData,
        );
        const decodedNumbers = toNumericArray(gameNumbers);
        config = {
          split: Number(games),
          picks: decodedNumbers.length,
          numbers: decodedNumbers,
        };
        break;
      }
      case 'gimboz-smash': {
        const [numWinIntervals, winStarts, winEnds] = decodeAbiParameters(
          [
            { name: 'numWinIntervals', type: 'uint8' },
            { name: 'winStarts', type: 'uint8[2]' },
            { name: 'winEnds', type: 'uint8[2]' },
            { name: 'gameId', type: 'uint256' },
            { name: 'ref', type: 'address' },
            { name: 'userRandomWord', type: 'bytes32' },
          ],
          encodedGameData,
        );
        config = buildGimbozSmashConfigFromContractData(numWinIntervals, winStarts, winEnds);
        break;
      }
      case 'glyde-or-crash': {
        const [targetMultiplier] = decodeAbiParameters(
          [
            { name: 'targetMultiplier', type: 'uint256' },
            { name: 'gameId', type: 'uint256' },
            { name: 'ref', type: 'address' },
            { name: 'userRandomWord', type: 'bytes32' },
          ],
          encodedGameData,
        );
        config = buildGlydeOrCrashConfig(targetMultiplier, gameEntry);
        break;
      }
      case 'jungle-plinko':
      case 'cosmic-plinko': {
        const [mode, balls] = decodeAbiParameters(
          [
            { name: 'riskMode', type: 'uint8' },
            { name: 'numBalls', type: 'uint8' },
            { name: 'gameId', type: 'uint256' },
            { name: 'ref', type: 'address' },
            { name: 'userRandomWord', type: 'bytes32' },
          ],
          encodedGameData,
        );
        const numericMode = Number(mode);
        config = {
          mode: numericMode,
          modeName: getGameOptionLabel(gameEntry, 'mode', numericMode, `Mode ${numericMode}`),
          split: Number(balls),
        };
        break;
      }
      case 'blocks': {
        const [mode, runs] = decodeAbiParameters(
          [
            { name: 'riskMode', type: 'uint8' },
            { name: 'numRuns', type: 'uint8' },
            { name: 'gameId', type: 'uint256' },
            { name: 'ref', type: 'address' },
            { name: 'userRandomWord', type: 'bytes32' },
          ],
          encodedGameData,
        );
        const numericMode = Number(mode);
        config = {
          mode: numericMode,
          modeName: getGameOptionLabel(gameEntry, 'mode', numericMode, `Mode ${numericMode}`),
          survive: Number(runs),
        };
        break;
      }
      case 'dino-dough':
      case 'bubblegum-heist':
      case 'geez-diggerz':
      case 'sushi-showdown': {
        const [, spins] = decodeAbiParameters(
          [
            { name: 'gameId', type: 'uint256' },
            { name: 'numSpins', type: 'uint8' },
            { name: 'ref', type: 'address' },
            { name: 'userRandomWord', type: 'bytes32' },
          ],
          encodedGameData,
        );
        config = { split: Number(spins) };
        break;
      }
      case 'blizzard-blitz':
      case 'gimboz-galaxy': {
        const [spins, , , , mode] = decodeAbiParameters(
          [
            { name: 'numSpins', type: 'uint8' },
            { name: 'gameId', type: 'uint256' },
            { name: 'ref', type: 'address' },
            { name: 'userRandomWord', type: 'bytes32' },
            { name: 'mode', type: 'uint8' },
          ],
          encodedGameData,
        );
        config = buildCascadeSlotHistoryConfig(gameEntry.key, spins, mode);
        break;
      }
      case 'ricos-revenge': {
        const [mode, spins] = decodeAbiParameters(
          [
            { name: 'mode', type: 'uint8' },
            { name: 'numSpins', type: 'uint8' },
            { name: 'gameId', type: 'uint256' },
            { name: 'ref', type: 'address' },
            { name: 'userRandomWord', type: 'bytes32' },
          ],
          encodedGameData,
        );
        config = buildRicosRevengeHistoryConfig(mode, spins);
        break;
      }
      case 'cult-quest': {
        const [gems] = decodeAbiParameters(
          [
            { name: 'gems', type: 'uint8' },
            { name: 'gameId', type: 'uint256' },
            { name: 'ref', type: 'address' },
            { name: 'userRandomWord', type: 'bytes32' },
          ],
          encodedGameData,
        );
        config = {
          gems: Number(gems),
          grid: '5x5',
        };
        break;
      }
      case 'monkey-match': {
        const [mode] = decodeAbiParameters(
          [
            { name: 'gameMode', type: 'uint8' },
            { name: 'gameId', type: 'uint256' },
            { name: 'ref', type: 'address' },
            { name: 'userRandomWord', type: 'bytes32' },
          ],
          encodedGameData,
        );
        const numericMode = Number(mode);
        config = {
          mode: numericMode,
          modeName: getGameOptionLabel(gameEntry, 'mode', numericMode, `Mode ${numericMode}`),
        };
        break;
      }
      case 'bear-dice': {
        const [difficulty, rolls] = decodeAbiParameters(
          [
            { name: 'difficulty', type: 'uint8' },
            { name: 'numRuns', type: 'uint8' },
            { name: 'gameId', type: 'uint256' },
            { name: 'ref', type: 'address' },
            { name: 'userRandomWord', type: 'bytes32' },
          ],
          encodedGameData,
        );
        const numericDifficulty = Number(difficulty);
        config = {
          difficulty: numericDifficulty,
          difficultyName: getGameOptionLabel(gameEntry, 'difficulty', numericDifficulty, `Difficulty ${numericDifficulty}`),
          survive: Number(rolls),
        };
        break;
      }
      case 'primes': {
        const [difficulty, runs] = decodeAbiParameters(
          [
            { name: 'difficulty', type: 'uint8' },
            { name: 'numRuns', type: 'uint8' },
            { name: 'gameId', type: 'uint256' },
            { name: 'ref', type: 'address' },
            { name: 'userRandomWord', type: 'bytes32' },
          ],
          encodedGameData,
        );
        const numericDifficulty = Number(difficulty);
        config = {
          difficulty: numericDifficulty,
          difficultyName: getGameOptionLabel(gameEntry, 'difficulty', numericDifficulty, `Difficulty ${numericDifficulty}`),
          split: Number(runs),
        };
        break;
      }
      default:
        break;
    }
  } catch {
    return null;
  }

  if (!config) {
    return null;
  }

  const variant = resolveConfiguredGameVariant({
    game: gameEntry.key,
    config,
  });

  return {
    config,
    variant_key: variant.variantKey,
    variant_label: variant.variantLabel,
    rtp_game: variant.rtpGame,
    rtp_config: variant.rtpConfig,
  };
}

function resolveSupportedStatelessHistoryGame(game) {
  const normalizedGameKey = String(game?.game_key || '').trim().toLowerCase();
  const normalizedContract = String(game?.contract || '').trim().toLowerCase();
  const supportedGame = SUPPORTED_GAMES_BY_KEY.get(normalizedGameKey)
    || SUPPORTED_GAMES_BY_CONTRACT.get(normalizedContract)
    || null;

  return supportedGame?.type === 'stateful' ? null : supportedGame;
}

const CANONICAL_HISTORY_VARIANT_GAMES = new Set([
  'video-poker',
  'roulette',
  'jungle-plinko',
  'cosmic-plinko',
  'monkey-match',
  'gimboz-smash',
  'glyde-or-crash',
  'bear-dice',
  'blocks',
  'primes',
  'blizzard-blitz',
  'gimboz-galaxy',
  'ricos-revenge',
  'cult-quest',
]);

function resolveSavedHistoryCanonicalVariant(game, supportedGame = resolveSupportedStatelessHistoryGame(game)) {
  if (!supportedGame || !CANONICAL_HISTORY_VARIANT_GAMES.has(supportedGame.key)) {
    return null;
  }

  const effectiveConfig = (game?.rtp_config && typeof game.rtp_config === 'object') || (game?.config && typeof game.config === 'object')
    ? {
      ...(game?.config && typeof game.config === 'object' ? game.config : {}),
      ...(game?.rtp_config && typeof game.rtp_config === 'object' ? game.rtp_config : {}),
    }
    : (game?.rtp_config || game?.config || null);
  const resolvedVariant = resolveConfiguredGameVariant({
    game: game?.rtp_game || game?.game_key || supportedGame.key,
    config: effectiveConfig,
    variantKey: game?.variant_key || null,
    variantLabel: game?.variant_label || null,
  });

  if (!shouldUseResolvedCanonicalVariant(resolvedVariant)) {
    return null;
  }

  return {
    config: game?.config ?? null,
    variant_key: resolvedVariant.variantKey,
    variant_label: resolvedVariant.variantLabel,
    rtp_game: resolvedVariant.rtpGame,
    rtp_config: resolvedVariant.rtpConfig,
  };
}

function needsSavedHistoryVariantInference(game, supportedGame = resolveSupportedStatelessHistoryGame(game)) {
  if (!supportedGame) {
    return false;
  }

  const normalizedGameKey = String(game?.game_key || supportedGame.key || '').trim().toLowerCase();
  const normalizedVariantKey = String(game?.variant_key || '').trim().toLowerCase();

  if (!game?.variant_label
    || !game?.rtp_config
    || !normalizedVariantKey
    || normalizedVariantKey === normalizedGameKey) {
    return true;
  }

  return CANONICAL_HISTORY_VARIANT_GAMES.has(normalizedGameKey)
    && !resolveSavedHistoryCanonicalVariant(game, supportedGame);
}

function getSavedHistoryVariantTxHash(game) {
  const txHash = String(game?.play_tx || game?.tx || '').trim();
  return /^0x[a-fA-F0-9]{64}$/.test(txHash) ? txHash : null;
}

function getSavedHistoryRewardTxHash(game) {
  const txHash = String(game?.settlement_tx || game?.tx || game?.play_tx || '').trim();
  return /^0x[a-fA-F0-9]{64}$/.test(txHash) ? txHash : null;
}

function getSavedHistoryVariantGameInfoRequest(game, supportedGame) {
  if (!supportedGame) {
    return null;
  }

  const gameIdString = historyGameId(game).trim();
  if (!/^\d+$/.test(gameIdString)) {
    return null;
  }

  switch (supportedGame.key) {
    case 'ape-strong':
      return {
        address: APESTRONG_CONTRACT,
        abi: APESTRONG_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    case 'baccarat':
      return {
        address: BACCARAT_CONTRACT,
        abi: BACCARAT_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    case 'roulette':
      return {
        address: ROULETTE_CONTRACT,
        abi: ROULETTE_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    case 'keno':
      return {
        address: KENO_CONTRACT,
        abi: KENO_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    case 'gimboz-smash':
      return {
        address: GIMBOZ_SMASH_CONTRACT,
        abi: GIMBOZ_SMASH_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    case 'glyde-or-crash':
      return {
        address: GLYDE_OR_CRASH_CONTRACT,
        abi: GLYDE_OR_CRASH_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    case 'jungle-plinko':
      return {
        address: JUNGLE_PLINKO_CONTRACT,
        abi: PLINKO_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    case 'blocks':
      return {
        address: supportedGame.contract,
        abi: BLOCKS_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    case 'bear-dice':
      return {
        address: supportedGame.contract,
        abi: BEAR_DICE_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    case 'primes':
      return {
        address: supportedGame.contract,
        abi: PRIMES_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    case 'speed-keno':
      return {
        address: SPEED_KENO_CONTRACT,
        abi: SPEED_KENO_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    case 'cosmic-plinko':
      return {
        address: COSMIC_PLINKO_CONTRACT,
        abi: PLINKO_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    case 'dino-dough':
      return {
        address: DINO_DOUGH_CONTRACT,
        abi: SLOTS_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    case 'bubblegum-heist':
      return {
        address: BUBBLEGUM_HEIST_CONTRACT,
        abi: SLOTS_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    case 'geez-diggerz':
      return {
        address: GEEZ_DIGGERZ_CONTRACT,
        abi: SLOTS_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    case 'sushi-showdown':
      return {
        address: SUSHI_SHOWDOWN_CONTRACT,
        abi: SLOTS_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    case 'monkey-match':
      return {
        address: MONKEY_MATCH_CONTRACT,
        abi: MONKEY_MATCH_GAME_INFO_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(gameIdString)],
      };
    default:
      return null;
  }
}

function inferStatelessHistoryVariantFromGameInfo(gameEntry, rawGameInfo) {
  if (!gameEntry || !rawGameInfo) {
    return null;
  }

  let config = null;

  switch (gameEntry.key) {
    case 'ape-strong': {
      const range = Number(rawGameInfo.edgeFlipRange);
      if (!Number.isFinite(range)) {
        return null;
      }
      config = { range };
      break;
    }
    case 'baccarat': {
      const playerBankerBet = parseBigIntField(rawGameInfo.playerBankerBet);
      const tieBet = parseBigIntField(rawGameInfo.tieBet);
      config = buildBaccaratConfig(playerBankerBet, tieBet, Boolean(rawGameInfo.betOnBanker));
      break;
    }
    case 'roulette': {
      const gameNumbers = toNumericArray(rawGameInfo.gameNumbers);
      config = {
        bet: buildRouletteBetString(gameEntry, gameNumbers),
        gameNumbers,
        numBets: gameNumbers.length,
      };
      break;
    }
    case 'keno': {
      const numbers = toNumericArray(rawGameInfo.gameNumbers);
      config = {
        picks: numbers.length,
        numbers,
      };
      break;
    }
    case 'gimboz-smash': {
      config = buildGimbozSmashConfigFromContractData(
        rawGameInfo.numWinIntervals,
        rawGameInfo.winStarts,
        rawGameInfo.winEnds,
      );
      break;
    }
    case 'glyde-or-crash': {
      try {
        config = buildGlydeOrCrashConfig(rawGameInfo.targetMultiplier, gameEntry);
      } catch {
        return null;
      }
      break;
    }
    case 'jungle-plinko':
    case 'cosmic-plinko': {
      const mode = Number(rawGameInfo.gameMode);
      const balls = Number(rawGameInfo.numBalls);
      if (!Number.isFinite(mode) || !Number.isFinite(balls)) {
        return null;
      }
      config = {
        mode,
        modeName: getGameOptionLabel(gameEntry, 'mode', mode, `Mode ${mode}`),
        split: balls,
      };
      break;
    }
    case 'blocks': {
      const mode = Number(rawGameInfo.riskMode);
      const runs = Number(rawGameInfo.numRuns);
      if (!Number.isFinite(mode) || !Number.isFinite(runs)) {
        return null;
      }
      config = {
        mode,
        modeName: getGameOptionLabel(gameEntry, 'mode', mode, `Mode ${mode}`),
        survive: runs,
      };
      break;
    }
    case 'bear-dice': {
      const difficulty = Number(rawGameInfo.difficulty);
      const rolls = Number(rawGameInfo.numRuns);
      if (!Number.isFinite(difficulty) || !Number.isFinite(rolls)) {
        return null;
      }
      config = {
        difficulty,
        difficultyName: getGameOptionLabel(gameEntry, 'difficulty', difficulty, `Difficulty ${difficulty}`),
        survive: rolls,
      };
      break;
    }
    case 'primes': {
      const difficulty = Number(rawGameInfo.difficulty);
      const runs = Number(rawGameInfo.numRuns);
      if (!Number.isFinite(difficulty) || !Number.isFinite(runs)) {
        return null;
      }
      config = {
        difficulty,
        difficultyName: getGameOptionLabel(gameEntry, 'difficulty', difficulty, `Difficulty ${difficulty}`),
        split: runs,
      };
      break;
    }
    case 'speed-keno': {
      const games = Number(rawGameInfo.numGames);
      const numbers = toNumericArray(rawGameInfo.gameNumbers);
      if (!Number.isFinite(games)) {
        return null;
      }
      config = {
        split: games,
        picks: numbers.length,
        numbers,
      };
      break;
    }
    case 'dino-dough':
    case 'bubblegum-heist':
    case 'geez-diggerz':
    case 'sushi-showdown': {
      const spins = getSlotsSpinCountFromGameInfo(rawGameInfo);
      if (!Number.isFinite(spins) || spins <= 0) {
        return null;
      }
      config = { split: spins };
      break;
    }
    case 'monkey-match': {
      const mode = Number(rawGameInfo.gameMode);
      if (!Number.isFinite(mode)) {
        return null;
      }
      config = {
        mode,
        modeName: getGameOptionLabel(gameEntry, 'mode', mode, `Mode ${mode}`),
      };
      break;
    }
    default:
      return null;
  }

  const variant = resolveConfiguredGameVariant({
    game: gameEntry.key,
    config,
  });

  return {
    config,
    variant_key: variant.variantKey,
    variant_label: variant.variantLabel,
    rtp_game: variant.rtpGame,
    rtp_config: variant.rtpConfig,
  };
}

function shouldInferSavedHistoryVariant(game, supportedGame = resolveSupportedStatelessHistoryGame(game)) {
  return needsSavedHistoryVariantInference(game, supportedGame)
    && Boolean(getSavedHistoryVariantTxHash(game) || getSavedHistoryVariantGameInfoRequest(game, supportedGame));
}

function hasVariantMetadataChanged(game, inferredVariant) {
  return ['config', 'variant_key', 'variant_label', 'rtp_game', 'rtp_config']
    .some((field) => JSON.stringify(game?.[field] ?? null) !== JSON.stringify(inferredVariant?.[field] ?? null));
}

export function normalizeSavedHistoryGameVariants(savedGames = []) {
  if (!Array.isArray(savedGames) || savedGames.length === 0) {
    return {
      games: Array.isArray(savedGames) ? savedGames : [],
      changed: false,
      inferred: 0,
      failedLookups: 0,
      localInferred: 0,
      rpcAttempted: 0,
      rpcInferred: 0,
      rpcFailed: 0,
      pendingCandidates: 0,
    };
  }

  const games = savedGames.slice();
  let changed = false;
  let inferred = 0;

  for (const [index, game] of games.entries()) {
    const supportedGame = resolveSupportedStatelessHistoryGame(game);
    const canonicalVariant = resolveSavedHistoryCanonicalVariant(game, supportedGame);
    if (!canonicalVariant || !hasVariantMetadataChanged(game, canonicalVariant)) {
      continue;
    }

    games[index] = {
      ...game,
      ...canonicalVariant,
    };
    changed = true;
    inferred += 1;
  }

  const pendingCandidates = games.reduce((total, game) => {
    const supportedGame = resolveSupportedStatelessHistoryGame(game);
    return total + (shouldInferSavedHistoryVariant(game, supportedGame) ? 1 : 0);
  }, 0);

  return {
    games,
    changed,
    inferred,
    failedLookups: 0,
    localInferred: inferred,
    rpcAttempted: 0,
    rpcInferred: 0,
    rpcFailed: 0,
    pendingCandidates,
  };
}

function compareVariantEnrichmentPriority(left, right) {
  const leftAttempt = Date.parse(left.game?.variant_enrichment_on || '') || 0;
  const rightAttempt = Date.parse(right.game?.variant_enrichment_on || '') || 0;
  return leftAttempt - rightAttempt || left.index - right.index;
}

function normalizeRpcEnrichmentLimit(value) {
  if (value === Infinity) {
    return Infinity;
  }

  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new Error('maxRpcCandidates must be a non-negative safe integer or Infinity.');
  }
  return numeric;
}

export async function inferSavedHistoryGameVariants(
  publicClient,
  savedGames = [],
  {
    mode = HISTORY_ENRICHMENT_MODES.LOCAL,
    maxRpcCandidates = DEFAULT_HISTORY_RPC_ENRICHMENT_BACKLOG_LIMIT,
    syncTimestamp = new Date().toISOString(),
  } = {}
) {
  if (!Object.values(HISTORY_ENRICHMENT_MODES).includes(mode)) {
    throw new Error(`Unknown history enrichment mode: ${mode}`);
  }

  const local = normalizeSavedHistoryGameVariants(savedGames);
  if (mode === HISTORY_ENRICHMENT_MODES.LOCAL || local.pendingCandidates === 0) {
    return local;
  }

  if (!publicClient) {
    throw new Error('RPC history enrichment requires a public client.');
  }

  const games = local.games.slice();
  let changed = local.changed;
  let inferred = local.inferred;

  const allCandidates = games
    .map((game, index) => {
      const supportedGame = resolveSupportedStatelessHistoryGame(game);
      return {
        index,
        game,
        supportedGame,
        txHash: getSavedHistoryVariantTxHash(game),
        gameInfoRequest: getSavedHistoryVariantGameInfoRequest(game, supportedGame),
      };
    })
    .filter(({ game, supportedGame }) => shouldInferSavedHistoryVariant(game, supportedGame))
    .sort(compareVariantEnrichmentPriority);

  const rpcLimit = normalizeRpcEnrichmentLimit(maxRpcCandidates);
  const candidates = rpcLimit === Infinity
    ? allCandidates
    : allCandidates.slice(0, rpcLimit);

  if (candidates.length === 0) {
    return {
      games,
      changed,
      inferred,
      failedLookups: 0,
      localInferred: local.localInferred,
      rpcAttempted: 0,
      rpcInferred: 0,
      rpcFailed: 0,
      pendingCandidates: allCandidates.length,
    };
  }

  const txHashes = [...new Set(candidates
    .map(({ txHash }) => txHash?.toLowerCase() || null)
    .filter(Boolean))];
  const txByHash = new Map();
  let failedLookups = 0;
  const successfulCandidateIndexes = new Set();

  for (let index = 0; index < txHashes.length; index += DEFAULT_BATCH_SIZE) {
    const batch = txHashes.slice(index, index + DEFAULT_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(async (hash) => {
      const tx = await publicClient.getTransaction({ hash });
      return { hash, tx };
    }));

    for (const result of results) {
      if (result.status !== 'fulfilled') {
        failedLookups += 1;
        continue;
      }

      if (result.value.tx) {
        txByHash.set(result.value.hash, result.value.tx);
      } else {
        failedLookups += 1;
      }
    }
  }

  const gameInfoCandidates = [];

  for (const candidate of candidates) {
    const { index, game, supportedGame, txHash, gameInfoRequest } = candidate;
    const tx = txHash ? txByHash.get(txHash.toLowerCase()) : null;
    const inferredVariant = tx ? inferStatelessHistoryVariant(supportedGame, tx) : null;

    if (inferredVariant) {
      successfulCandidateIndexes.add(index);
      if (!hasVariantMetadataChanged(game, inferredVariant)) {
        continue;
      }

      games[index] = {
        ...game,
        ...inferredVariant,
      };
      changed = true;
      inferred += 1;
      continue;
    }

    if (gameInfoRequest) {
      gameInfoCandidates.push(candidate);
    }
  }

  const gameInfoResults = await runInBatches(gameInfoCandidates, DEFAULT_BATCH_SIZE, async (candidate) => {
    try {
      const rawGameInfo = await publicClient.readContract(candidate.gameInfoRequest);
      return { candidate, rawGameInfo, error: null };
    } catch (error) {
      return { candidate, rawGameInfo: null, error };
    }
  });

  for (const { candidate, rawGameInfo, error } of gameInfoResults) {
    if (error || !rawGameInfo) {
      failedLookups += 1;
      continue;
    }

    const inferredVariant = inferStatelessHistoryVariantFromGameInfo(candidate.supportedGame, rawGameInfo);
    if (!inferredVariant || !hasVariantMetadataChanged(candidate.game, inferredVariant)) {
      if (inferredVariant) {
        successfulCandidateIndexes.add(candidate.index);
      }
      continue;
    }

    successfulCandidateIndexes.add(candidate.index);
    games[candidate.index] = {
      ...candidate.game,
      ...inferredVariant,
    };
    changed = true;
    inferred += 1;
  }

  for (const candidate of candidates) {
    const game = games[candidate.index];
    if (successfulCandidateIndexes.has(candidate.index)) {
      if (game?.variant_enrichment_on || game?.variant_enrichment_msg) {
        const cleaned = { ...game };
        delete cleaned.variant_enrichment_on;
        delete cleaned.variant_enrichment_msg;
        games[candidate.index] = cleaned;
        changed = true;
      }
      continue;
    }

    games[candidate.index] = {
      ...game,
      variant_enrichment_on: syncTimestamp,
      variant_enrichment_msg: 'RPC metadata enrichment incomplete',
    };
    changed = true;
  }

  const pendingCandidates = games.reduce((total, game) => {
    const supportedGame = resolveSupportedStatelessHistoryGame(game);
    return total + (shouldInferSavedHistoryVariant(game, supportedGame) ? 1 : 0);
  }, 0);

  return {
    games,
    changed,
    inferred,
    failedLookups,
    localInferred: local.localInferred,
    rpcAttempted: candidates.length,
    rpcInferred: successfulCandidateIndexes.size,
    rpcFailed: candidates.length - successfulCandidateIndexes.size,
    pendingCandidates,
  };
}

function combineDiagnosticsMaps(...maps) {
  const combined = new Map();
  for (const map of maps) {
    if (!(map instanceof Map)) {
      continue;
    }
    for (const [key, value] of map.entries()) {
      combined.set(key, value);
    }
  }
  return combined;
}

function buildVideoPokerSyncedHistoryGame(existingGame, raw, syncTimestamp) {
  const wagerWei = parseBigIntField(raw.betAmount);
  const payoutWei = parseBigIntField(raw.totalPayout);
  const betAmountApe = Number.parseFloat(formatEther(wagerWei));
  const variant = resolveConfiguredGameVariant({
    game: 'video-poker',
    config: { betAmountApe },
  });

  return recomputeHistoryGameEconomics({
    ...existingGame,
    contract: VIDEO_POKER_CONTRACT,
    game: resolveGameDisplayName({
      gameKey: 'video-poker',
      contract: VIDEO_POKER_CONTRACT,
      fallbackName: 'Video Poker',
    }),
    game_key: 'video-poker',
    config: { betAmountApe },
    variant_key: variant.variantKey,
    variant_label: variant.variantLabel,
    rtp_game: variant.rtpGame,
    rtp_config: variant.rtpConfig,
    player: raw.player,
    timestamp: toMsTimestamp(raw.timestamp),
    chain_timestamp: Number(raw.timestamp),
    settled: true,
    wager_wei: wagerWei.toString(),
    payout_wei: payoutWei.toString(),
    contract_fee_wei: existingGame?.contract_fee_wei ?? '0',
    contract_fee_ape: existingGame?.contract_fee_ape ?? toApeString(0n),
    gas_fee_wei: existingGame?.gas_fee_wei ?? '0',
    gas_fee_ape: existingGame?.gas_fee_ape ?? toApeString(0n),
    gp_received_raw: existingGame?.gp_received_raw ?? '0',
    gp_received_display: existingGame?.gp_received_display ?? '0',
    wape_received_wei: existingGame?.wape_received_wei ?? '0',
    wape_received_ape: existingGame?.wape_received_ape ?? toApeString(0n),
    last_sync_on: syncTimestamp,
    last_sync_msg: OK_SYNC_MSG,
  });
}

function buildHiLoNebulaSyncedHistoryGame(existingGame, raw, syncTimestamp) {
  const wagerWei = parseBigIntField(raw.initialBetAmount);
  const payoutWei = parseBigIntField(raw.payout);

  return recomputeHistoryGameEconomics({
    ...existingGame,
    contract: HI_LO_NEBULA_CONTRACT,
    game: resolveGameDisplayName({
      gameKey: 'hi-lo-nebula',
      contract: HI_LO_NEBULA_CONTRACT,
      fallbackName: 'Hi-Lo Nebula',
    }),
    game_key: 'hi-lo-nebula',
    config: null,
    variant_key: 'hi-lo-nebula',
    variant_label: null,
    rtp_game: 'hi-lo-nebula',
    rtp_config: null,
    player: raw.user,
    timestamp: toMsTimestamp(raw.timestamp),
    chain_timestamp: Number(raw.timestamp),
    settled: Boolean(raw.hasEnded),
    wager_wei: wagerWei.toString(),
    payout_wei: payoutWei.toString(),
    contract_fee_wei: existingGame?.contract_fee_wei ?? '0',
    contract_fee_ape: existingGame?.contract_fee_ape ?? toApeString(0n),
    gas_fee_wei: existingGame?.gas_fee_wei ?? '0',
    gas_fee_ape: existingGame?.gas_fee_ape ?? toApeString(0n),
    gp_received_raw: existingGame?.gp_received_raw ?? '0',
    gp_received_display: existingGame?.gp_received_display ?? '0',
    wape_received_wei: existingGame?.wape_received_wei ?? '0',
    wape_received_ape: existingGame?.wape_received_ape ?? toApeString(0n),
    last_sync_on: syncTimestamp,
    last_sync_msg: OK_SYNC_MSG,
  });
}

function buildCashDashSyncedHistoryGame(existingGame, raw, syncTimestamp) {
  const wagerWei = parseBigIntField(raw.initialBetAmount);
  const payoutWei = parseBigIntField(raw.payout);

  return recomputeHistoryGameEconomics({
    ...existingGame,
    contract: CASH_DASH_CONTRACT,
    game: resolveGameDisplayName({
      gameKey: 'cash-dash',
      contract: CASH_DASH_CONTRACT,
      fallbackName: 'Cash Dash',
    }),
    game_key: 'cash-dash',
    config: null,
    variant_key: 'cash-dash',
    variant_label: null,
    rtp_game: 'cash-dash',
    rtp_config: null,
    player: raw.user,
    timestamp: toMsTimestamp(raw.timestamp),
    chain_timestamp: Number(raw.timestamp),
    settled: Boolean(raw.hasEnded),
    wager_wei: wagerWei.toString(),
    payout_wei: payoutWei.toString(),
    contract_fee_wei: existingGame?.contract_fee_wei ?? '0',
    contract_fee_ape: existingGame?.contract_fee_ape ?? toApeString(0n),
    gas_fee_wei: existingGame?.gas_fee_wei ?? '0',
    gas_fee_ape: existingGame?.gas_fee_ape ?? toApeString(0n),
    gp_received_raw: existingGame?.gp_received_raw ?? '0',
    gp_received_display: existingGame?.gp_received_display ?? '0',
    wape_received_wei: existingGame?.wape_received_wei ?? '0',
    wape_received_ape: existingGame?.wape_received_ape ?? toApeString(0n),
    last_sync_on: syncTimestamp,
    last_sync_msg: OK_SYNC_MSG,
  });
}

function buildBlackjackSyncedHistoryGame(existingGame, raw, syncTimestamp) {
  const mainBetApe = Number.parseFloat(formatEther(parseBigIntField(raw.initialBet)));
  const playerSideApe = Number.parseFloat(formatEther(parseBigIntField(raw.sideBets?.[0]?.bet)));
  const dealerSideApe = Number.parseFloat(formatEther(parseBigIntField(raw.sideBets?.[1]?.bet)));
  const variant = resolveConfiguredGameVariant({
    game: 'blackjack',
    config: {
      mainBetApe,
      playerSideApe,
      dealerSideApe,
    },
  });
  const wagerWei = parseBigIntField(raw.totalBet);
  const payoutWei = parseBigIntField(raw.totalPayout);

  return recomputeHistoryGameEconomics({
    ...existingGame,
    contract: BLACKJACK_CONTRACT,
    game: resolveGameDisplayName({
      gameKey: 'blackjack',
      contract: BLACKJACK_CONTRACT,
      fallbackName: 'Blackjack',
    }),
    game_key: 'blackjack',
    config: {
      mainBetApe,
      playerSideApe,
      dealerSideApe,
    },
    variant_key: variant.variantKey,
    variant_label: variant.variantLabel,
    rtp_game: variant.rtpGame,
    rtp_config: variant.rtpConfig,
    player: raw.user,
    timestamp: toMsTimestamp(raw.timestamp),
    chain_timestamp: Number(raw.timestamp),
    settled: true,
    wager_wei: wagerWei.toString(),
    payout_wei: payoutWei.toString(),
    contract_fee_wei: existingGame?.contract_fee_wei ?? '0',
    contract_fee_ape: existingGame?.contract_fee_ape ?? toApeString(0n),
    gas_fee_wei: existingGame?.gas_fee_wei ?? '0',
    gas_fee_ape: existingGame?.gas_fee_ape ?? toApeString(0n),
    gp_received_raw: existingGame?.gp_received_raw ?? '0',
    gp_received_display: existingGame?.gp_received_display ?? '0',
    wape_received_wei: existingGame?.wape_received_wei ?? '0',
    wape_received_ape: existingGame?.wape_received_ape ?? toApeString(0n),
    last_sync_on: syncTimestamp,
    last_sync_msg: OK_SYNC_MSG,
  });
}

async function readStatefulUsedGameIds(publicClient, contract) {
  let total;
  try {
    total = parseBigIntField(await publicClient.readContract({
      address: contract,
      abi: STATEFUL_HISTORY_DISCOVERY_ABI,
      functionName: 'numUsedGameIDs',
    }));
  } catch {
    return [];
  }

  if (total <= 0n) {
    return [];
  }

  const ids = [];
  const seen = new Set();

  for (let start = 0n; start < total; start += STATEFUL_DISCOVERY_PAGE_SIZE) {
    const endExclusive = start + STATEFUL_DISCOVERY_PAGE_SIZE > total
      ? total
      : start + STATEFUL_DISCOVERY_PAGE_SIZE;
    let page = null;

    try {
      page = await publicClient.readContract({
        address: contract,
        abi: STATEFUL_HISTORY_DISCOVERY_ABI,
        functionName: 'paginateUsedGameIDs',
        args: [start, endExclusive],
      });
    } catch {
      try {
        page = await publicClient.readContract({
          address: contract,
          abi: STATEFUL_HISTORY_DISCOVERY_ABI,
          functionName: 'paginateUsedGameIDs',
          args: [start, endExclusive - 1n],
        });
      } catch {
        page = null;
      }
    }

    if (!Array.isArray(page)) {
      continue;
    }

    for (const rawId of page) {
      const id = parseBigIntField(rawId);
      const key = id.toString();
      if (!seen.has(key)) {
        seen.add(key);
        ids.push(id);
      }
    }
  }

  return ids;
}

function buildDiscoveredStatefulHistoryGame(game, gameId, essentialInfo, syncTimestamp) {
  const timestamp = parseBigIntField(essentialInfo.timestamp);
  return recomputeHistoryGameEconomics({
    contract: game.contract,
    game_id: gameId.toString(),
    gameId: gameId.toString(),
    game: resolveGameDisplayName({
      gameKey: game.key,
      contract: game.contract,
      fallbackName: game.name,
    }),
    game_key: game.key,
    player: essentialInfo.player,
    timestamp: toMsTimestamp(timestamp),
    chain_timestamp: Number(timestamp),
    settled: Boolean(essentialInfo.hasEnded),
    wager_wei: parseBigIntField(essentialInfo.buyIn).toString(),
    payout_wei: parseBigIntField(essentialInfo.payout).toString(),
    contract_fee_wei: '0',
    gas_fee_wei: '0',
    gp_received_raw: '0',
    gp_received_display: '0',
    last_sync_on: syncTimestamp,
    last_sync_msg: OK_SYNC_MSG,
  });
}

async function discoverStatefulHistoryGamesForContract(publicClient, walletAddress, game, syncTimestamp) {
  const normalizedWallet = String(walletAddress || '').toLowerCase();
  const gameIds = await readStatefulUsedGameIds(publicClient, game.contract);
  if (gameIds.length === 0) {
    return [];
  }

  const discovered = [];
  for (let index = 0; index < gameIds.length; index += STATEFUL_DISCOVERY_INFO_BATCH_SIZE) {
    const batchIds = gameIds.slice(index, index + STATEFUL_DISCOVERY_INFO_BATCH_SIZE);
    let rawInfo;
    try {
      rawInfo = await publicClient.readContract({
        address: game.contract,
        abi: STATEFUL_HISTORY_DISCOVERY_ABI,
        functionName: 'getEssentialGameInfo',
        args: [batchIds],
      });
    } catch {
      continue;
    }

    const [players, buyIns, payouts, timestamps, hasEndeds] = Array.isArray(rawInfo)
      ? rawInfo
      : [];
    if (!Array.isArray(players)) {
      continue;
    }

    for (let infoIndex = 0; infoIndex < batchIds.length; infoIndex += 1) {
      if (String(players[infoIndex] || '').toLowerCase() !== normalizedWallet) {
        continue;
      }
      if (!hasEndeds?.[infoIndex]) {
        continue;
      }

      discovered.push(buildDiscoveredStatefulHistoryGame(game, batchIds[infoIndex], {
        player: players[infoIndex],
        buyIn: buyIns?.[infoIndex],
        payout: payouts?.[infoIndex],
        timestamp: timestamps?.[infoIndex],
        hasEnded: hasEndeds?.[infoIndex],
      }, syncTimestamp));
    }
  }

  return discovered;
}

export async function discoverStatefulHistoryGames(publicClient, walletAddress, syncTimestamp = new Date().toISOString()) {
  const normalizedWallet = String(walletAddress || '').toLowerCase();
  if (!normalizedWallet) {
    return [];
  }

  const discovered = [];
  for (const game of STATEFUL_HISTORY_DISCOVERY_GAMES) {
    discovered.push(...await discoverStatefulHistoryGamesForContract(
      publicClient,
      normalizedWallet,
      game,
      syncTimestamp
    ));
  }

  sortGamesNewestFirst(discovered);
  return discovered;
}

export async function syncSavedStatefulHistoryGames(
  publicClient,
  existingGames,
  walletAddress,
  syncTimestamp,
  {
    maxGames = Infinity,
    priorityGameKeys = [],
  } = {}
) {
  const normalizedWallet = String(walletAddress || '').toLowerCase();
  const priorityKeys = priorityGameKeys instanceof Set
    ? priorityGameKeys
    : new Set(priorityGameKeys);
  const statefulCandidates = (Array.isArray(existingGames) ? existingGames : []).filter((game) => {
    if (!isStatefulHistoryContract(game?.contract)) {
      return false;
    }

    const syncMessage = normalizeSyncMessage(game?.last_sync_msg);
    const hasCanonicalState = isEconomicallySyncedGame(game)
      && game?.settled !== false
      && syncMessage === OK_SYNC_MSG
      && Boolean(game?.variant_key);
    const needsReceiptRewards = String(game?.gp_source || '').toLowerCase() === 'local-estimate';
    return !hasCanonicalState || needsReceiptRewards;
  });

  statefulCandidates.sort((left, right) => {
    const leftPriority = priorityKeys.has(gameKey(left?.contract, historyGameId(left))) ? 0 : 1;
    const rightPriority = priorityKeys.has(gameKey(right?.contract, historyGameId(right))) ? 0 : 1;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    const leftAttempt = Date.parse(left?.last_sync_on || '') || 0;
    const rightAttempt = Date.parse(right?.last_sync_on || '') || 0;
    return leftAttempt - rightAttempt
      || Number(left?.timestamp || 0) - Number(right?.timestamp || 0);
  });

  const normalizedMaxGames = normalizeRpcEnrichmentLimit(maxGames);
  const statefulGames = normalizedMaxGames === Infinity
    ? statefulCandidates
    : statefulCandidates.slice(0, normalizedMaxGames);

  if (statefulGames.length === 0) {
    return {
      games: [],
      diagnosticsByGameKey: new Map(),
      attempted: 0,
      pending: statefulCandidates.length,
    };
  }

  const transactionMetadataByHash = await fetchTransactionMetadataByHashes(
    publicClient,
    statefulGames
      .map(getSavedHistoryRewardTxHash)
      .filter(Boolean)
  );

  const settledGames = [];
  const diagnosticsByGameKey = new Map();

  const results = await runInBatches(statefulGames, DEFAULT_BATCH_SIZE, async (game) => {
    const contract = String(game?.contract || '').toLowerCase();
    try {
      if (contract === VIDEO_POKER_CONTRACT.toLowerCase()) {
        const raw = await publicClient.readContract({
          address: VIDEO_POKER_CONTRACT,
          abi: VIDEO_POKER_ABI,
          functionName: 'getGameInfo',
          args: [BigInt(historyGameId(game))],
        });
        return { game, raw, kind: 'video-poker', error: null };
      }

      if (contract === HI_LO_NEBULA_CONTRACT.toLowerCase()) {
        const raw = await publicClient.readContract({
          address: HI_LO_NEBULA_CONTRACT,
          abi: HI_LO_NEBULA_ABI,
          functionName: 'getGameInfo',
          args: [BigInt(historyGameId(game))],
        });
        return { game, raw, kind: 'hi-lo-nebula', error: null };
      }

      if (contract === CASH_DASH_CONTRACT.toLowerCase()) {
        const raw = await publicClient.readContract({
          address: CASH_DASH_CONTRACT,
          abi: CASH_DASH_ABI,
          functionName: 'getGameInfo',
          args: [BigInt(historyGameId(game))],
        });
        return { game, raw, kind: 'cash-dash', error: null };
      }

      if (contract === BLACKJACK_CONTRACT.toLowerCase()) {
        const raw = await publicClient.readContract({
          address: BLACKJACK_CONTRACT,
          abi: BLACKJACK_ABI,
          functionName: 'getGameInfo',
          args: [BigInt(historyGameId(game))],
        });
        return { game, raw, kind: 'blackjack', error: null };
      }

      return { game, raw: null, kind: 'unsupported', error: null };
    } catch (error) {
      return { game, raw: null, kind: 'error', error };
    }
  });

  for (const result of results) {
    const key = gameKey(result.game?.contract, historyGameId(result.game));

    if (result.error) {
      const message = sanitizeError(result.error);
      diagnosticsByGameKey.set(key, {
        last_sync_on: syncTimestamp,
        last_sync_msg: message && message !== 'Unknown error'
          ? `${STATEFUL_FETCH_FAILED_SYNC_MSG}: ${message}`
          : STATEFUL_FETCH_FAILED_SYNC_MSG,
      });
      continue;
    }

    if (result.kind === 'video-poker') {
      if (String(result.raw?.player || '').toLowerCase() !== normalizedWallet) {
        diagnosticsByGameKey.set(key, {
          last_sync_on: syncTimestamp,
          last_sync_msg: STATEFUL_WRONG_OWNER_SYNC_MSG,
        });
        continue;
      }
      if (Number(result.raw?.gameState) !== VideoPokerGameState.HAND_COMPLETE) {
        diagnosticsByGameKey.set(key, {
          last_sync_on: syncTimestamp,
          last_sync_msg: STATEFUL_INCOMPLETE_SYNC_MSG,
        });
        continue;
      }
      settledGames.push(applyStatefulReceiptTransfers(
        buildVideoPokerSyncedHistoryGame(result.game, result.raw, syncTimestamp),
        result.game,
        transactionMetadataByHash,
        normalizedWallet
      ));
      continue;
    }

    if (result.kind === 'hi-lo-nebula') {
      if (String(result.raw?.user || '').toLowerCase() !== normalizedWallet) {
        diagnosticsByGameKey.set(key, {
          last_sync_on: syncTimestamp,
          last_sync_msg: STATEFUL_WRONG_OWNER_SYNC_MSG,
        });
        continue;
      }
      if (!result.raw?.hasEnded) {
        diagnosticsByGameKey.set(key, {
          last_sync_on: syncTimestamp,
          last_sync_msg: STATEFUL_INCOMPLETE_SYNC_MSG,
        });
        continue;
      }
      settledGames.push(applyStatefulReceiptTransfers(
        buildHiLoNebulaSyncedHistoryGame(result.game, result.raw, syncTimestamp),
        result.game,
        transactionMetadataByHash,
        normalizedWallet
      ));
      continue;
    }

    if (result.kind === 'cash-dash') {
      if (String(result.raw?.user || '').toLowerCase() !== normalizedWallet) {
        diagnosticsByGameKey.set(key, {
          last_sync_on: syncTimestamp,
          last_sync_msg: STATEFUL_WRONG_OWNER_SYNC_MSG,
        });
        continue;
      }
      if (!result.raw?.hasEnded) {
        diagnosticsByGameKey.set(key, {
          last_sync_on: syncTimestamp,
          last_sync_msg: STATEFUL_INCOMPLETE_SYNC_MSG,
        });
        continue;
      }
      settledGames.push(applyStatefulReceiptTransfers(
        buildCashDashSyncedHistoryGame(result.game, result.raw, syncTimestamp),
        result.game,
        transactionMetadataByHash,
        normalizedWallet
      ));
      continue;
    }

    if (result.kind === 'blackjack') {
      if (String(result.raw?.user || '').toLowerCase() !== normalizedWallet) {
        diagnosticsByGameKey.set(key, {
          last_sync_on: syncTimestamp,
          last_sync_msg: STATEFUL_WRONG_OWNER_SYNC_MSG,
        });
        continue;
      }
      if (Number(result.raw?.gameState) !== BlackjackGameState.HAND_COMPLETE) {
        diagnosticsByGameKey.set(key, {
          last_sync_on: syncTimestamp,
          last_sync_msg: STATEFUL_INCOMPLETE_SYNC_MSG,
        });
        continue;
      }
      settledGames.push(applyStatefulReceiptTransfers(
        buildBlackjackSyncedHistoryGame(result.game, result.raw, syncTimestamp),
        result.game,
        transactionMetadataByHash,
        normalizedWallet
      ));
    }
  }

  sortGamesNewestFirst(settledGames);
  return {
    games: settledGames,
    diagnosticsByGameKey,
    attempted: statefulGames.length,
    pending: Math.max(0, statefulCandidates.length - settledGames.length),
  };
}

export async function diagnoseUnsyncedSupportedGames(publicClient, existingGames, syncedGames, syncTimestamp) {
  const diagnostics = new Map();
  const syncedKeys = new Set((Array.isArray(syncedGames) ? syncedGames : []).map((game) => gameKey(game.contract, historyGameId(game))));
  const txHashesToCheck = new Map();

  for (const game of Array.isArray(existingGames) ? existingGames : []) {
    const key = gameKey(game?.contract, historyGameId(game));
    if (!key || syncedKeys.has(key) || isUnsupportedHistoryContract(game?.contract) || isEconomicallySyncedGame(game)) {
      continue;
    }

    const txHash = typeof game?.play_tx === 'string'
      ? game.play_tx.trim()
      : (typeof game?.tx === 'string' ? game.tx.trim() : '');
    if (!txHash) {
      diagnostics.set(key, {
        last_sync_on: syncTimestamp,
        last_sync_msg: MISSING_PLAY_TX_SYNC_MSG,
      });
      continue;
    }

    const normalizedTxHash = txHash.toLowerCase();
    if (!txHashesToCheck.has(normalizedTxHash)) {
      txHashesToCheck.set(normalizedTxHash, { hash: txHash, keys: [] });
    }
    txHashesToCheck.get(normalizedTxHash).keys.push(key);
  }

  const receiptChecks = await runInBatches([...txHashesToCheck.values()], DEFAULT_BATCH_SIZE, async ({ hash, keys }) => {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      return { keys, receipt, error: null };
    } catch (error) {
      return { keys, receipt: null, error };
    }
  });

  for (const result of receiptChecks) {
    let message = RECEIPT_LOOKUP_FAILED_SYNC_MSG;
    if (result.receipt?.status === 'reverted') {
      message = EXECUTION_REVERTED_SYNC_MSG;
    } else if (result.receipt?.status === 'success') {
      message = MISSING_SETTLEMENT_SYNC_MSG;
    } else if (result.error) {
      const sanitized = sanitizeError(result.error);
      if (sanitized && sanitized !== 'Unknown error') {
        message = `${RECEIPT_LOOKUP_FAILED_SYNC_MSG}: ${sanitized}`;
      }
    }

    for (const key of result.keys) {
      diagnostics.set(key, {
        last_sync_on: syncTimestamp,
        last_sync_msg: message,
      });
    }
  }

  return diagnostics;
}

async function runInBatches(items, batchSize, mapper) {
  const results = [];

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map(mapper));
    results.push(...batchResults);
  }

  return results;
}

function collectRpcErrorDetails(error, seen = new Set()) {
  if (!error || typeof error !== 'object' || seen.has(error)) {
    return [];
  }

  seen.add(error);
  const details = [
    error.name,
    error.shortMessage,
    error.message,
    error.status,
    error.code,
    ...(Array.isArray(error.metaMessages) ? error.metaMessages : []),
  ].filter((value) => value !== null && value !== undefined && String(value).trim());

  for (const field of ['cause', 'error', 'data']) {
    details.push(...collectRpcErrorDetails(error[field], seen));
  }
  return details;
}

function isSplittableLogRangeError(error) {
  const errorDetails = collectRpcErrorDetails(error).map((value) => String(value).toLowerCase());
  const details = errorDetails.join('\n');
  if (errorDetails.includes('413') || errorDetails.includes('-32005')) {
    return true;
  }
  return [
    'responsebodytoolargeerror',
    'response body exceeded the size limit',
    'limitexceededrpcerror',
    'query returned more than',
    'too many results',
    'block range is too wide',
    'block range limit',
    'exceeds max block range',
    'response size exceeded',
    'timeouterror',
    'request timeout',
    'request timed out',
    'headers timeout',
  ].some((needle) => details.includes(needle));
}

async function getHistoryLogs(publicClient, parameters) {
  if (typeof publicClient?.request !== 'function') {
    return publicClient.getLogs(parameters);
  }

  return getLogsAction({
    request(request, options = {}) {
      return publicClient.request(request, {
        ...options,
        retryCount: 0,
      });
    },
  }, parameters);
}

async function collectSettlementLogsForRange(publicClient, walletAddress, fromBlock, toBlock) {
  const endedLogs = [];
  const endedRangeLogs = await getHistoryLogs(publicClient, {
    address: HISTORY_EVENT_CONTRACTS,
    event: GAME_ENDED_EVENT,
    args: { user: walletAddress },
    fromBlock,
    toBlock,
  });

  endedLogs.push(...endedRangeLogs
    .filter((log) => !log.removed)
    .map((log) => ({
      ...log,
      kind: 'game-ended',
      chainTimestamp: typeof log.blockTimestamp === 'bigint'
        ? Number(log.blockTimestamp)
        : null,
    })));

  const fallbackLogs = [];
  const userTopic = toTopicAddress(walletAddress);
  const fallbackRangeLogs = await getHistoryLogs(publicClient, {
    address: USER_GAME_ID_LOG_FALLBACK_CONTRACTS,
    topics: [USER_GAME_ID_LOG_TOPIC0, userTopic],
    fromBlock,
    toBlock,
  });

  fallbackLogs.push(...fallbackRangeLogs
    .filter((log) => !log.removed)
    .map((log) => ({
      ...log,
      kind: 'fallback-game-id',
      args: {
        user: walletAddress,
        gameId: BigInt(log.data),
      },
    })));

  const hydratedFallbackLogs = await hydrateFallbackGameIdLogs(publicClient, fallbackLogs, walletAddress);
  const mergedLogs = mergeSettlementSources([...endedLogs, ...hydratedFallbackLogs]);
  sortSettlementRecordsNewestFirst(mergedLogs);
  return mergedLogs;
}

async function scanAdaptiveHistoryRange(
  publicClient,
  walletAddress,
  startBlock,
  endBlock,
  onRange,
  adaptiveState
) {
  const rangeSize = endBlock - startBlock + 1n;
  if (rangeSize > adaptiveState.maxRange) {
    let cursor = startBlock;
    while (cursor <= endBlock) {
      const learnedEndBlock = cursor + adaptiveState.maxRange - 1n > endBlock
        ? endBlock
        : cursor + adaptiveState.maxRange - 1n;
      await scanAdaptiveHistoryRange(
        publicClient,
        walletAddress,
        cursor,
        learnedEndBlock,
        onRange,
        adaptiveState
      );
      cursor = learnedEndBlock + 1n;
    }
    return;
  }

  try {
    const logs = await collectSettlementLogsForRange(
      publicClient,
      walletAddress,
      startBlock,
      endBlock
    );
    await onRange(logs, { startBlock, endBlock });
    return;
  } catch (error) {
    if (!isSplittableLogRangeError(error)) {
      throw error;
    }
    if (startBlock >= endBlock) {
      throw new Error(
        `RPC log request still failed for block ${startBlock.toString()} after adaptive splitting: ${sanitizeError(error)}`,
        { cause: error }
      );
    }
  }

  const midpoint = startBlock + ((endBlock - startBlock) / 2n);
  const nextMaxRange = midpoint - startBlock + 1n;
  adaptiveState.maxRange = nextMaxRange < adaptiveState.maxRange
    ? nextMaxRange
    : adaptiveState.maxRange;
  adaptiveState.splitCount += 1;
  await scanAdaptiveHistoryRange(
    publicClient,
    walletAddress,
    startBlock,
    midpoint,
    onRange,
    adaptiveState
  );
  await scanAdaptiveHistoryRange(
    publicClient,
    walletAddress,
    midpoint + 1n,
    endBlock,
    onRange,
    adaptiveState
  );
}

async function scanSettlementLogRanges(
  publicClient,
  walletAddress,
  fromBlock,
  toBlock,
  initialMaxRange,
  {
    onRange,
    onInitialRangeComplete = null,
  }
) {
  const adaptiveState = {
    maxRange: initialMaxRange,
    splitCount: 0,
  };

  for (const { startBlock, endBlock } of iterateHistoryBlockRanges(fromBlock, toBlock, initialMaxRange)) {
    await scanAdaptiveHistoryRange(
      publicClient,
      walletAddress,
      startBlock,
      endBlock,
      onRange,
      adaptiveState
    );
    if (typeof onInitialRangeComplete === 'function') {
      await onInitialRangeComplete({ startBlock, endBlock });
    }
  }

  return adaptiveState;
}

async function collectSettlementLogs(publicClient, walletAddress, fromBlock, toBlock, chunkSize) {
  const collectedLogs = [];
  await scanSettlementLogRanges(
    publicClient,
    walletAddress,
    fromBlock,
    toBlock,
    chunkSize,
    {
      onRange(logs) {
        collectedLogs.push(...logs);
      },
    }
  );

  const byGame = new Map();
  for (const log of collectedLogs) {
    const key = gameKey(log.address, log.args?.gameId ?? '');
    const existing = byGame.get(key);
    if (!existing) {
      byGame.set(key, { ...log, args: { ...log.args } });
      continue;
    }

    byGame.set(key, {
      ...existing,
      ...log,
      transactionHash: existing.transactionHash || log.transactionHash,
      settlementTxHash: existing.settlementTxHash || log.settlementTxHash,
      settlementBlockNumber: existing.settlementBlockNumber || log.settlementBlockNumber,
      settlementLogIndex: existing.settlementLogIndex ?? log.settlementLogIndex,
      settled: Boolean(existing.settled || log.settled),
      args: {
        ...existing.args,
        ...log.args,
      },
    });
  }

  const mergedLogs = [...byGame.values()];
  sortSettlementRecordsNewestFirst(mergedLogs);
  return mergedLogs;
}

async function hydrateFallbackGameIdLogs(publicClient, fallbackLogs, walletAddress) {
  if (!fallbackLogs.length) {
    return [];
  }

  const normalizedWallet = String(walletAddress || '').toLowerCase();

  const logsByContract = new Map();
  for (const log of fallbackLogs) {
    const contract = String(log.address || '').toLowerCase();
    if (!logsByContract.has(contract)) {
      logsByContract.set(contract, []);
    }
    logsByContract.get(contract).push(log);
  }

  const infoRequests = [];
  for (const [contract, logs] of logsByContract.entries()) {
    const uniqueGameIds = [...new Set(logs.map((log) => String(log.args?.gameId ?? '')))]
      .filter(Boolean)
      .map((value) => BigInt(value));

    for (let index = 0; index < uniqueGameIds.length; index += ESSENTIAL_GAME_INFO_BATCH_SIZE) {
      infoRequests.push({
        contract,
        gameIds: uniqueGameIds.slice(index, index + ESSENTIAL_GAME_INFO_BATCH_SIZE),
      });
    }
  }

  const infoResults = await runInBatches(infoRequests, DEFAULT_BATCH_SIZE, async ({ contract, gameIds }) => {
    try {
      const [players, buyIns, payouts, timestamps, hasEndeds] = await publicClient.readContract({
        address: contract,
        abi: GAME_CONTRACT_ABI,
        functionName: 'getEssentialGameInfo',
        args: [gameIds],
      });

      return gameIds.map((gameId, index) => ({
        contract,
        gameId: gameId.toString(),
        player: players[index],
        buyIn: buyIns[index],
        payout: payouts[index],
        timestamp: Number(timestamps[index]),
        settled: hasEndeds[index],
      }));
    } catch {
      return [];
    }
  });

  const infoByGameKey = new Map(infoResults
    .flat()
    .map((info) => [gameKey(info.contract, info.gameId), info]));
  const hydratedLogs = [];

  for (const [contract, logs] of logsByContract.entries()) {
    for (const log of logs) {
      const info = infoByGameKey.get(gameKey(contract, log.args?.gameId ?? ''));
      if (!info) {
        continue;
      }

      if (String(info.player || '').toLowerCase() !== normalizedWallet) {
        continue;
      }

      hydratedLogs.push({
        ...log,
        chainTimestamp: info.timestamp,
        settled: info.settled,
        args: {
          ...log.args,
          user: info.player || log.args?.user,
          buyIn: info.buyIn,
          payout: info.payout,
        },
      });
    }
  }

  return hydratedLogs;
}

function mergeSettlementSources(logs) {
  const merged = new Map();

  for (const log of logs) {
    // Some games emit a user-indexed play log and a separate settlement log.
    // Merge them by contract + gameId so the local record keeps the play tx
    // that paid fees/gas and the settlement tx that finalized payout.
    const key = gameKey(log.address, log.args?.gameId ?? '');
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        address: log.address,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        transactionHash: log.kind === 'fallback-game-id' ? log.transactionHash : null,
        settlementTxHash: log.kind === 'game-ended' ? log.transactionHash : null,
        settlementBlockNumber: log.kind === 'game-ended' ? log.blockNumber : null,
        settlementLogIndex: log.kind === 'game-ended' ? log.logIndex : null,
        kind: log.kind,
        chainTimestamp: log.chainTimestamp ?? null,
        settled: log.kind === 'game-ended' ? true : Boolean(log.settled),
        args: { ...log.args },
      });
      continue;
    }

    if (!existing.transactionHash && log.kind === 'fallback-game-id') {
      existing.transactionHash = log.transactionHash;
    }
    if (!existing.settlementTxHash && log.kind === 'game-ended') {
      existing.settlementTxHash = log.transactionHash;
      existing.settlementBlockNumber = log.blockNumber;
      existing.settlementLogIndex = log.logIndex;
    }

    if (log.kind === 'game-ended') {
      existing.blockNumber = log.blockNumber;
      existing.logIndex = log.logIndex;
      existing.settled = true;
    }

    if (log.chainTimestamp && !existing.chainTimestamp) {
      existing.chainTimestamp = log.chainTimestamp;
    }

    existing.args = {
      ...existing.args,
      ...log.args,
      buyIn: log.args?.buyIn ?? existing.args?.buyIn,
      payout: log.args?.payout ?? existing.args?.payout,
    };
  }

  return [...merged.values()].map((log) => ({
    ...log,
    transactionHash: log.transactionHash || log.settlementTxHash,
    blockNumber: log.blockNumber ?? log.settlementBlockNumber,
    logIndex: log.logIndex ?? log.settlementLogIndex,
  }));
}

async function fetchTransactionMetadataByHashes(publicClient, hashes = []) {
  const uniqueTransactionHashes = [...new Set(
    (Array.isArray(hashes) ? hashes : [])
      .filter(Boolean)
      .map((hash) => String(hash))
  )];

  const txResults = await runInBatches(uniqueTransactionHashes, DEFAULT_BATCH_SIZE, async (hash) => {
    try {
      const [tx, receipt] = await Promise.all([
        publicClient.getTransaction({ hash }),
        publicClient.getTransactionReceipt({ hash }),
      ]);

      return {
        hash,
        tx,
        receipt,
      };
    } catch {
      return {
        hash,
        tx: null,
        receipt: null,
      };
    }
  });

  return new Map(txResults.map((result) => [result.hash, result]));
}

async function fetchTransactionMetadata(publicClient, settlementLogs) {
  return fetchTransactionMetadataByHashes(
    publicClient,
    settlementLogs
      .map((log) => log.transactionHash)
      .filter(Boolean)
  );
}

async function fetchBlockTimestamps(publicClient, settlementLogs) {
  const uniqueBlockNumbers = [...new Set(
    settlementLogs
      .filter((log) => !log.chainTimestamp)
      .map((log) => log.blockNumber)
      .filter((blockNumber) => typeof blockNumber === 'bigint')
      .map((blockNumber) => blockNumber.toString())
  )].map((value) => BigInt(value));

  const blockResults = await runInBatches(uniqueBlockNumbers, DEFAULT_BATCH_SIZE, async (blockNumber) => {
    try {
      const block = await publicClient.getBlock({ blockNumber });
      return {
        blockNumber: blockNumber.toString(),
        timestamp: Number(block.timestamp),
      };
    } catch {
      return {
        blockNumber: blockNumber.toString(),
        timestamp: null,
      };
    }
  });

  return new Map(blockResults.map((result) => [result.blockNumber, result.timestamp]));
}

function decodeReceiptTokenTransfers(receipt, walletAddress) {
  const normalizedWallet = String(walletAddress || '').toLowerCase();
  let gpReceivedRaw = 0n;

  if (!receipt?.logs?.length) {
    return { gpReceivedRaw };
  }

  for (const log of receipt.logs) {
    const tokenAddress = String(log.address || '').toLowerCase();
    if (!GP_REWARD_TOKEN_CONTRACTS.some((contract) => tokenAddress === String(contract).toLowerCase())) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: ERC20_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName !== 'Transfer') {
        continue;
      }

      const to = String(decoded.args?.to || '').toLowerCase();
      if (to !== normalizedWallet) {
        continue;
      }

      const amount = BigInt(decoded.args?.value ?? 0n);
      gpReceivedRaw += amount;
    } catch {
      continue;
    }
  }

  return { gpReceivedRaw };
}

function applyStatefulReceiptTransfers(game, existingGame, transactionMetadataByHash, walletAddress) {
  const rewardTxHash = getSavedHistoryRewardTxHash(existingGame);
  if (!rewardTxHash || !(transactionMetadataByHash instanceof Map)) {
    return game;
  }

  const txMeta = transactionMetadataByHash.get(rewardTxHash);
  if (!txMeta?.receipt) {
    return game;
  }

  const { gpReceivedRaw } = decodeReceiptTokenTransfers(txMeta.receipt, walletAddress);
  const receiptHasRewards = gpReceivedRaw > 0n;
  const existingWasReceiptBacked = String(existingGame?.gp_source || '').toLowerCase() === 'receipt';

  if (!receiptHasRewards && !existingWasReceiptBacked) {
    return game;
  }

  return {
    ...game,
    play_tx: game?.play_tx ?? existingGame?.play_tx ?? existingGame?.tx ?? null,
    settlement_tx: rewardTxHash,
    transaction_from: txMeta.tx?.from ?? existingGame?.transaction_from ?? game?.transaction_from ?? null,
    gp_received_raw: gpReceivedRaw.toString(),
    gp_received_display: gpReceivedRaw.toString(),
    gp_source: 'receipt',
  };
}

function buildSettledGames(
  settlementLogs,
  transactionMetadata,
  blockTimestamps,
  walletAddress,
  syncTimestamp,
  onTransactionProcessed = null
) {
  const normalizedWallet = String(walletAddress).toLowerCase();
  const games = [];
  let missingTransactionMetadata = 0;
  const total = settlementLogs.length;

  for (const [index, log] of settlementLogs.entries()) {
    const contract = String(log.address || '').toLowerCase();
    const game = SUPPORTED_GAMES_BY_CONTRACT.get(contract);
    const txMeta = transactionMetadata.get(log.transactionHash) || { tx: null, receipt: null };
    const tx = txMeta.tx;
    const receipt = txMeta.receipt;
    const isWalletPayer = Boolean(tx?.from) && tx.from.toLowerCase() === normalizedWallet;
    const wagerWei = BigInt(log.args?.buyIn ?? 0n);
    const payoutWei = BigInt(log.args?.payout ?? 0n);
    const contractFeeWei = isWalletPayer && tx.value > wagerWei ? tx.value - wagerWei : 0n;
    const gasPriceWei = receipt?.effectiveGasPrice ?? tx?.gasPrice ?? 0n;
    const gasFeeWei = isWalletPayer && receipt ? receipt.gasUsed * gasPriceWei : 0n;
    const chainTimestamp = log.chainTimestamp ?? (log.blockNumber ? blockTimestamps.get(log.blockNumber.toString()) ?? null : null);
    const { gpReceivedRaw } = decodeReceiptTokenTransfers(receipt, walletAddress);
    const lastSyncMsg = tx && receipt ? OK_SYNC_MSG : 'partial: missing transaction metadata';
    const gameId = String(log.args?.gameId ?? '');
    const gameName = resolveGameDisplayName({
      gameKey: game?.key || null,
      contract: log.address,
      fallbackName: game?.name || resolveHistoryGameName(log.address),
    });
    const isSettled = log.settled !== false;

    if (!tx || !receipt) {
      missingTransactionMetadata += 1;
    }

    if (!isSettled) {
      const pendingGame = {
        contract: log.address,
        game: gameName,
        game_key: game?.key || 'unknown',
        game_url: game ? `https://www.ape.church/games/${game.slug}?id=${gameId}` : null,
        game_id: gameId,
        gameId,
        player: String(log.args?.user || walletAddress),
        transaction_from: tx?.from || null,
        play_tx: log.transactionHash,
        tx: log.transactionHash,
        settlement_tx: null,
        block_number: log.blockNumber?.toString() || null,
        chain_timestamp: chainTimestamp,
        timestamp: chainTimestamp ? toMsTimestamp(chainTimestamp) : Date.now(),
        settled: false,
        pending_wager_wei: wagerWei.toString(),
        pending_wager_ape: toApeString(wagerWei),
        contract_fee_wei: contractFeeWei.toString(),
        contract_fee_ape: toApeString(contractFeeWei),
        gas_fee_wei: gasFeeWei.toString(),
        gas_fee_ape: toApeString(gasFeeWei),
        gp_received_raw: gpReceivedRaw.toString(),
        gp_received_display: gpReceivedRaw.toString(),
        gp_source: 'receipt',
        last_sync_on: syncTimestamp,
        last_sync_msg: UNSETTLED_HISTORY_SYNC_MSG,
      };

      const inferredVariant = inferStatelessHistoryVariant(game, tx);
      if (inferredVariant) {
        Object.assign(pendingGame, inferredVariant);
      }

      games.push(pendingGame);
      continue;
    }

    const settledGame = {
      contract: log.address,
      game: gameName,
      game_key: game?.key || 'unknown',
      game_url: game ? `https://www.ape.church/games/${game.slug}?id=${gameId}` : null,
      game_id: gameId,
      gameId,
      player: String(log.args?.user || walletAddress),
      transaction_from: tx?.from || null,
      play_tx: log.transactionHash,
      tx: log.transactionHash,
      settlement_tx: log.settlementTxHash ?? log.transactionHash,
      block_number: log.blockNumber?.toString() || null,
      chain_timestamp: chainTimestamp,
      timestamp: chainTimestamp ? toMsTimestamp(chainTimestamp) : Date.now(),
      settled: true,
      won: payoutWei > wagerWei,
      push: payoutWei === wagerWei && payoutWei > 0n,
      wager_wei: wagerWei.toString(),
      wager_ape: toApeString(wagerWei),
      payout_wei: payoutWei.toString(),
      payout_ape: toApeString(payoutWei),
      contract_fee_wei: contractFeeWei.toString(),
      contract_fee_ape: toApeString(contractFeeWei),
      gas_fee_wei: gasFeeWei.toString(),
      gas_fee_ape: toApeString(gasFeeWei),
      gp_received_raw: gpReceivedRaw.toString(),
      gp_received_display: gpReceivedRaw.toString(),
      gp_source: 'receipt',
      wape_received_wei: wagerWei.toString(),
      wape_received_ape: toApeString(wagerWei),
      last_sync_on: syncTimestamp,
      last_sync_msg: lastSyncMsg,
    };

    const inferredVariant = inferStatelessHistoryVariant(game, tx);
    if (inferredVariant) {
      Object.assign(settledGame, inferredVariant);
    }

    games.push(settledGame);

    if (typeof onTransactionProcessed === 'function') {
      try {
        onTransactionProcessed({
          index: index + 1,
          total,
          txHash: settledGame.play_tx,
          settlementTxHash: settledGame.settlement_tx,
          game: settledGame.game,
          gameKey: settledGame.game_key,
          gameId: settledGame.game_id,
          blockNumber: settledGame.block_number,
          lastSyncMsg: settledGame.last_sync_msg,
        });
      } catch {
        // Progress output is best-effort and must not break downloads.
      }
    }
  }

  sortGamesNewestFirst(games);
  return { games, missingTransactionMetadata };
}

function hasDistinctPlayTx(game) {
  const playTx = String(game?.play_tx || game?.tx || '').toLowerCase();
  const settlementTx = String(game?.settlement_tx || '').toLowerCase();
  return Boolean(playTx && settlementTx && playTx !== settlementTx);
}

function getHistoryTxHash(value) {
  const txHash = String(value || '').trim();
  return /^0x[a-fA-F0-9]{64}$/.test(txHash) ? txHash : null;
}

function recomputeHistoryGameEconomics(game) {
  if (typeof game?.wager_wei !== 'string' || typeof game?.payout_wei !== 'string') {
    return game;
  }

  const wagerWei = parseBigIntField(game.wager_wei);
  const payoutWei = parseBigIntField(game.payout_wei);
  const contractFeeWei = parseBigIntField(game.contract_fee_wei);
  const gasFeeWei = parseBigIntField(game.gas_fee_wei);
  const grossResultWei = payoutWei - wagerWei;
  const netResultWei = grossResultWei - contractFeeWei - gasFeeWei;

  return {
    ...game,
    wager_ape: toApeString(wagerWei),
    payout_ape: toApeString(payoutWei),
    gross_result_wei: grossResultWei.toString(),
    gross_result_ape: toApeString(grossResultWei),
    net_result_wei: netResultWei.toString(),
    net_result_ape: toApeString(netResultWei),
    pnl_ape: toApeString(netResultWei),
    wape_received_wei: wagerWei.toString(),
    wape_received_ape: toApeString(wagerWei),
    won: payoutWei > wagerWei,
    push: payoutWei === wagerWei && payoutWei > 0n,
  };
}

function mergeHistoryGame(existingGame, syncedGame) {
  if (!existingGame) {
    return recomputeHistoryGameEconomics(syncedGame);
  }

  const existingHasPlayTx = hasDistinctPlayTx(existingGame);
  const syncedHasPlayTx = hasDistinctPlayTx(syncedGame);
  const existingPlayTx = getHistoryTxHash(existingGame?.play_tx || existingGame?.tx);
  const syncedPlayTx = getHistoryTxHash(syncedGame?.play_tx || syncedGame?.tx);
  const syncedSettlementTx = getHistoryTxHash(syncedGame?.settlement_tx);
  const existingIsPendingPlay = existingGame?.settled === false || (
    !isEconomicallySyncedGame(existingGame)
    && typeof existingGame?.pending_wager_wei === 'string'
  );
  const shouldCarryExistingPendingPlayTx = Boolean(
    existingIsPendingPlay
    && existingPlayTx
    && syncedSettlementTx
    && existingPlayTx.toLowerCase() !== syncedSettlementTx.toLowerCase()
    && (!syncedPlayTx || syncedPlayTx.toLowerCase() === syncedSettlementTx.toLowerCase())
  );
  const shouldCarryExistingPlayTx = Boolean(
    existingPlayTx
    && syncedSettlementTx
    && existingPlayTx.toLowerCase() !== syncedSettlementTx.toLowerCase()
    && (!syncedPlayTx || syncedPlayTx.toLowerCase() === syncedSettlementTx.toLowerCase())
  );
  const preferExistingPlayTx = (existingHasPlayTx && !syncedHasPlayTx) || shouldCarryExistingPlayTx;

  const merged = {
    ...existingGame,
    ...syncedGame,
    timestamp: syncedGame.timestamp || existingGame.timestamp || 0,
  };

  if (preferExistingPlayTx) {
    merged.play_tx = existingGame.play_tx ?? existingGame.tx ?? syncedGame.play_tx ?? syncedGame.tx ?? null;
    merged.settlement_tx = syncedGame.settlement_tx ?? existingGame.settlement_tx ?? null;
    merged.tx = merged.play_tx;
    merged.transaction_from = shouldCarryExistingPendingPlayTx
      ? existingGame.transaction_from ?? syncedGame.transaction_from ?? null
      : syncedGame.transaction_from ?? existingGame.transaction_from ?? null;
    merged.timestamp = syncedGame.timestamp || existingGame.timestamp || 0;
    if (shouldCarryExistingPendingPlayTx) {
      merged.contract_fee_wei = existingGame.contract_fee_wei ?? syncedGame.contract_fee_wei ?? '0';
      merged.contract_fee_ape = existingGame.contract_fee_ape ?? syncedGame.contract_fee_ape ?? toApeString(0n);
      merged.gas_fee_wei = existingGame.gas_fee_wei ?? syncedGame.gas_fee_wei ?? '0';
      merged.gas_fee_ape = existingGame.gas_fee_ape ?? syncedGame.gas_fee_ape ?? toApeString(0n);
      merged.gp_received_raw = existingGame.gp_received_raw ?? syncedGame.gp_received_raw ?? '0';
      merged.gp_received_display = existingGame.gp_received_display ?? syncedGame.gp_received_display ?? existingGame.gp_received_raw ?? syncedGame.gp_received_raw ?? '0';
      merged.gp_source = existingGame.gp_source ?? syncedGame.gp_source ?? null;
    } else {
      merged.contract_fee_wei = syncedGame.contract_fee_wei ?? existingGame.contract_fee_wei ?? '0';
      merged.contract_fee_ape = syncedGame.contract_fee_ape ?? existingGame.contract_fee_ape ?? toApeString(0n);
      merged.gas_fee_wei = syncedGame.gas_fee_wei ?? existingGame.gas_fee_wei ?? '0';
      merged.gas_fee_ape = syncedGame.gas_fee_ape ?? existingGame.gas_fee_ape ?? toApeString(0n);
      merged.gp_received_raw = syncedGame.gp_received_raw ?? existingGame.gp_received_raw ?? '0';
      merged.gp_received_display = syncedGame.gp_received_display ?? existingGame.gp_received_display ?? '0';
      merged.gp_source = syncedGame.gp_source ?? existingGame.gp_source ?? null;
    }
  }

  return recomputeHistoryGameEconomics(merged);
}

export function mergeDownloadedHistoryGames(existingGames, syncedGames, syncTimestamp, diagnosticsByGameKey = new Map()) {
  const mergedGames = new Map();

  for (const game of Array.isArray(existingGames) ? existingGames : []) {
    mergedGames.set(gameKey(game.contract, historyGameId(game)), { ...game });
  }

  for (const game of syncedGames) {
    const key = gameKey(game.contract, historyGameId(game));
    const existingGame = mergedGames.get(key);
    mergedGames.set(key, mergeHistoryGame(existingGame, game));
  }

  for (const [key, game] of mergedGames.entries()) {
    const diagnostics = diagnosticsByGameKey instanceof Map ? diagnosticsByGameKey.get(key) : null;
    if (diagnostics && !isEconomicallySyncedGame(game)) {
      mergedGames.set(key, {
        ...game,
        last_sync_on: diagnostics.last_sync_on ?? syncTimestamp,
        last_sync_msg: diagnostics.last_sync_msg ?? game.last_sync_msg ?? null,
      });
      continue;
    }

    if (isUnsupportedHistoryContract(game.contract) && !game.last_sync_on) {
      mergedGames.set(key, {
        ...game,
        last_sync_on: syncTimestamp,
        last_sync_msg: game.last_sync_msg || UNSUPPORTED_SYNC_MSG,
      });
    }
  }

  const output = [...mergedGames.values()];
  sortGamesNewestFirst(output);
  return output;
}

function readHistoryLastSyncedBlock(history) {
  try {
    return history?.last_synced_block ? BigInt(history.last_synced_block) : null;
  } catch {
    return null;
  }
}

export async function readCurrentHistoryBalances(publicClient, walletAddress) {
  const result = {
    current_gp_balance_raw: null,
    current_gp_balance_display: null,
    current_wape_balance_wei: null,
    current_wape_balance_ape: null,
  };

  const [gpBalanceResult, wapeBalanceResult] = await Promise.allSettled([
    publicClient.readContract({
      address: GP_TOKEN_CONTRACT,
      abi: GP_TOKEN_ABI,
      functionName: 'getCurrentEXP',
      args: [walletAddress],
    }),
    publicClient.readContract({
      address: WAPE_TOKEN_CONTRACT,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [walletAddress],
    }),
  ]);

  if (gpBalanceResult.status === 'fulfilled') {
    const gpBalance = gpBalanceResult.value;
    result.current_gp_balance_raw = gpBalance.toString();
    result.current_gp_balance_display = gpBalance.toString();
  }

  if (wapeBalanceResult.status === 'fulfilled') {
    const wapeBalance = wapeBalanceResult.value;
    result.current_wape_balance_wei = wapeBalance.toString();
    result.current_wape_balance_ape = toApeString(wapeBalance);
  }

  return result;
}

function normalizeGamesForStats(games) {
  return games.map((game) => ({
    wagerWei: parseBigIntField(game.wager_wei),
    payoutWei: parseBigIntField(game.payout_wei),
    contractFeeWei: parseBigIntField(game.contract_fee_wei),
    gasFeeWei: parseBigIntField(game.gas_fee_wei),
    gpReceivedRaw: parseBigIntField(game.gp_received_raw),
    wapeReceivedWei: parseBigIntField(game.wager_wei),
    won: Boolean(game.won),
    push: Boolean(game.push),
    maxHitX: toMultiplierNumber(parseBigIntField(game.payout_wei), parseBigIntField(game.wager_wei)),
  }));
}

function resolveHistoryStatsIdentity(game) {
  const effectiveConfig = (game?.rtp_config && typeof game.rtp_config === 'object') || (game?.config && typeof game.config === 'object')
    ? {
      ...(game?.config && typeof game.config === 'object' ? game.config : {}),
      ...(game?.rtp_config && typeof game.rtp_config === 'object' ? game.rtp_config : {}),
    }
    : (game?.rtp_config || game?.config || null);
  const displayGame = resolveGameDisplayName({
    gameKey: game?.game_key || null,
    contract: game?.contract || null,
    fallbackName: game?.game || resolveHistoryGameName(game?.contract),
  });
  const resolvedVariant = resolveConfiguredGameVariant({
    game: game?.rtp_game || game?.game_key || displayGame,
    config: effectiveConfig,
    variantKey: game?.variant_key || null,
    variantLabel: game?.variant_label || null,
  });
  const baseGameKey = String(game?.game_key || resolvedVariant.gameKey || displayGame || 'unknown').trim().toLowerCase();
  const useResolvedCanonicalVariant = shouldUseResolvedCanonicalVariant(resolvedVariant);
  const variantKey = String(
    (useResolvedCanonicalVariant ? resolvedVariant.variantKey : null)
    || game?.variant_key
    || resolvedVariant.variantKey
    || baseGameKey
  ).trim().toLowerCase();
  const variantLabel = (useResolvedCanonicalVariant ? resolvedVariant.variantLabel : null)
    || game?.variant_label
    || resolvedVariant.variantLabel
    || null;

  return {
    game: formatGameVariantName(displayGame, variantLabel),
    game_key: baseGameKey,
    variant_key: variantKey,
    variant_label: variantLabel,
    rtp_game: game?.rtp_game || resolvedVariant.rtpGame || baseGameKey,
    rtp_config: useResolvedCanonicalVariant
      ? resolvedVariant.rtpConfig
      : (game?.rtp_config || resolvedVariant.rtpConfig || effectiveConfig),
  };
}

function buildHistoryStatsSummary(
  normalizedGames,
  {
    wallet = null,
    totalSavedGames = normalizedGames.length,
    unsyncedGames = 0,
    currentBalances = {},
    lastSyncedBlock = null,
    lastDownloadOn = null,
    game = null,
    game_key: gameKey = null,
    variant_key: variantKey = null,
    variant_label: variantLabel = null,
    rtp_game: rtpGame = null,
    rtp_config: rtpConfig = null,
  } = {}
) {
  const syncedGameCount = normalizedGames.length;

  const totalWageredWei = sumBigInts(normalizedGames, 'wagerWei');
  const totalPayoutWei = sumBigInts(normalizedGames, 'payoutWei');
  const totalContractFeesWei = sumBigInts(normalizedGames, 'contractFeeWei');
  const totalGasPaidWei = sumBigInts(normalizedGames, 'gasFeeWei');
  const grossResultWei = totalPayoutWei - totalWageredWei;
  const netResultWei = grossResultWei - totalContractFeesWei - totalGasPaidWei;
  const wins = normalizedGames.filter((game) => game.won).length;
  const pushes = normalizedGames.filter((game) => game.push).length;
  const losses = syncedGameCount - wins - pushes;
  const totalGpReceivedRaw = sumBigInts(normalizedGames, 'gpReceivedRaw');
  const totalWapeReceivedWei = sumBigInts(normalizedGames, 'wapeReceivedWei');
  const averageGpPerApe = totalWageredWei > 0n
    ? toGpPerApeNumber(totalGpReceivedRaw, totalWageredWei)
    : null;
  const maxHitX = normalizedGames.reduce((best, game) => {
    if (!Number.isFinite(game.maxHitX)) {
      return best;
    }
    return best === null || game.maxHitX > best ? game.maxHitX : best;
  }, null);

  return {
    wallet,
    game,
    game_key: gameKey,
    variant_key: variantKey,
    variant_label: variantLabel,
    rtp_game: rtpGame,
    rtp_config: rtpConfig,
    total_saved_games: totalSavedGames,
    games: syncedGameCount,
    wins,
    pushes,
    losses,
    unsynced_games: unsyncedGames,
    total_wagered_wei: totalWageredWei.toString(),
    total_wagered_ape: toApeString(totalWageredWei),
    total_payout_wei: totalPayoutWei.toString(),
    total_payout_ape: toApeString(totalPayoutWei),
    contract_fees_paid_wei: totalContractFeesWei.toString(),
    contract_fees_paid_ape: toApeString(totalContractFeesWei),
    gas_paid_wei: totalGasPaidWei.toString(),
    gas_paid_ape: toApeString(totalGasPaidWei),
    gross_result_wei: grossResultWei.toString(),
    gross_result_ape: toApeString(grossResultWei),
    net_result_wei: netResultWei.toString(),
    net_result_ape: toApeString(netResultWei),
    win_loss_wei: grossResultWei.toString(),
    win_loss_ape: toApeString(grossResultWei),
    win_rate: syncedGameCount > 0 ? Number(((wins / syncedGameCount) * 100).toFixed(1)) : 0,
    rtp: totalWageredWei > 0n ? toPercentNumber(totalPayoutWei, totalWageredWei, 1) : null,
    max_hit_x: maxHitX,
    total_gp_received_raw: totalGpReceivedRaw.toString(),
    total_gp_received_display: totalGpReceivedRaw.toString(),
    average_gp_per_ape: averageGpPerApe,
    total_wape_received_wei: totalWapeReceivedWei.toString(),
    total_wape_received_ape: toApeString(totalWapeReceivedWei),
    current_gp_balance_raw: currentBalances.current_gp_balance_raw,
    current_gp_balance_display: currentBalances.current_gp_balance_display,
    current_wape_balance_wei: currentBalances.current_wape_balance_wei,
    current_wape_balance_ape: currentBalances.current_wape_balance_ape,
    last_synced_block: lastSyncedBlock,
    last_download_on: lastDownloadOn,
  };
}

export function summarizeHistoryGames(history, currentBalances = {}) {
  const allGames = Array.isArray(history?.games) ? history.games : [];
  const countableGames = allGames.filter(shouldCountHistoryGame);
  const syncedGames = countableGames.filter(isEconomicallySyncedGame);
  const totalGames = countableGames.length;
  const normalizedGames = normalizeGamesForStats(syncedGames);

  return buildHistoryStatsSummary(normalizedGames, {
    wallet: history?.wallet || null,
    totalSavedGames: totalGames,
    unsyncedGames: totalGames - syncedGames.length,
    currentBalances,
    lastSyncedBlock: history?.last_synced_block ?? null,
    lastDownloadOn: history?.last_download_on ?? null,
  });
}

export function summarizeHistoryGamesByGame(history) {
  const allGames = Array.isArray(history?.games) ? history.games : [];
  const groups = new Map();

  for (const game of allGames.filter(shouldCountHistoryGame)) {
    const identity = resolveHistoryStatsIdentity(game);
    const groupKey = identity.variant_key;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        ...identity,
        savedGames: [],
      });
    }
    groups.get(groupKey).savedGames.push(game);
  }

  return [...groups.values()]
    .map((group) => {
      const syncedGames = group.savedGames.filter(isEconomicallySyncedGame);
      return buildHistoryStatsSummary(normalizeGamesForStats(syncedGames), {
        wallet: history?.wallet || null,
        totalSavedGames: group.savedGames.length,
        unsyncedGames: group.savedGames.length - syncedGames.length,
        lastSyncedBlock: history?.last_synced_block ?? null,
        lastDownloadOn: history?.last_download_on ?? null,
        game: group.game,
        game_key: group.game_key,
        variant_key: group.variant_key,
        variant_label: group.variant_label,
        rtp_game: group.rtp_game,
        rtp_config: group.rtp_config,
      });
    })
    .sort((left, right) => {
      if (right.games !== left.games) {
        return right.games - left.games;
      }
      return String(left.game || '').localeCompare(String(right.game || ''));
    });
}

function syncProfileCurrentGpPerApe(walletAddress, games) {
  const observedGpPerApe = deriveCurrentGpPerApeFromHistoryGames(games);
  if (observedGpPerApe === null) {
    return null;
  }

  const profile = loadProfile(walletAddress);
  if (profile.currentGpPerApe !== observedGpPerApe) {
    saveProfile({
      ...profile,
      currentGpPerApe: observedGpPerApe,
    }, walletAddress);
  }

  return observedGpPerApe;
}

function* iterateHistoryBlockRanges(fromBlock, toBlock, chunkSize) {
  for (let startBlock = fromBlock; startBlock <= toBlock; startBlock += chunkSize) {
    const endBlock = startBlock + chunkSize - 1n > toBlock
      ? toBlock
      : startBlock + chunkSize - 1n;
    yield { startBlock, endBlock };
  }
}

function resolveNextHistoryLastSyncedBlock(previousLastSyncedBlock, syncedThroughBlock) {
  if (typeof syncedThroughBlock !== 'bigint') {
    return previousLastSyncedBlock;
  }

  if (previousLastSyncedBlock === null || syncedThroughBlock > previousLastSyncedBlock) {
    return syncedThroughBlock;
  }

  return previousLastSyncedBlock;
}

function buildDownloadedHistorySnapshot(history, normalizedWallet, lastSyncedBlock, syncTimestamp, games) {
  return {
    ...history,
    version: HISTORY_SCHEMA_VERSION,
    wallet: normalizedWallet,
    chain_id: apechain.id,
    last_synced_block: typeof lastSyncedBlock === 'bigint' ? lastSyncedBlock.toString() : null,
    last_download_on: syncTimestamp,
    games,
  };
}

function historyGamesFromGameKeySet(keys) {
  return [...keys].map((key) => {
    const [contract, ...gameIdParts] = String(key || '').split(':');
    const gameId = gameIdParts.join(':');
    return {
      contract,
      game_id: gameId,
      gameId,
    };
  }).filter((game) => game.contract && historyGameId(game));
}

export async function downloadWalletHistory(
  publicClient,
  walletAddress,
  {
    fromBlock,
    toBlock,
    chunkSize = DEFAULT_HISTORY_SYNC_CHUNK_SIZE,
    rebuild = false,
    onTransactionProcessed = null,
  } = {}
) {
  const normalizedWallet = String(walletAddress).toLowerCase();
  const history = loadHistory(normalizedWallet);
  const rebuildHistory = Boolean(rebuild && fromBlock === 0n);
  const previousLastSyncedBlock = rebuildHistory ? null : readHistoryLastSyncedBlock(history);
  const historyGames = Array.isArray(history.games) ? history.games : [];
  const baseHistoryGames = rebuildHistory
    ? historyGames.filter((game) => isStatefulHistoryContract(game?.contract))
    : historyGames;
  const latestBlock = toBlock ?? await publicClient.getBlockNumber();
  const effectiveFromBlock = fromBlock ?? (previousLastSyncedBlock !== null ? previousLastSyncedBlock + 1n : 0n);
  const syncTimestamp = new Date().toISOString();

  let workingGames = baseHistoryGames;
  const existingKeys = new Set((baseHistoryGames || []).map((game) => gameKey(game.contract, historyGameId(game))));
  const syncedGameKeys = new Set();
  const newUniqueGameKeys = new Set();
  const statefulLogSeedKeys = new Set();
  let downloadedGames = 0;
  let missingTransactionMetadata = 0;
  let adaptiveScan = {
    maxRange: chunkSize,
    splitCount: 0,
  };

  const trackSyncedGames = (games, { countStatefulDiscovery = false } = {}) => {
    for (const game of Array.isArray(games) ? games : []) {
      const gameId = historyGameId(game);
      if (!game?.contract || !gameId) {
        continue;
      }
      const key = gameKey(game.contract, gameId);
      syncedGameKeys.add(key);
      if (!existingKeys.has(key)) {
        newUniqueGameKeys.add(key);
      }
      if (countStatefulDiscovery && isStatefulHistoryContract(game?.contract)) {
        statefulLogSeedKeys.add(key);
      }
    }
  };

  const saveCheckpoint = (syncedThroughBlock) => {
    const nextSyncedBlock = resolveNextHistoryLastSyncedBlock(previousLastSyncedBlock, syncedThroughBlock);
    if (nextSyncedBlock === null) {
      return;
    }

    saveHistory(
      buildDownloadedHistorySnapshot(history, normalizedWallet, nextSyncedBlock, syncTimestamp, workingGames),
      normalizedWallet
    );
  };

  if (effectiveFromBlock <= latestBlock) {
    adaptiveScan = await scanSettlementLogRanges(
      publicClient,
      normalizedWallet,
      effectiveFromBlock,
      latestBlock,
      chunkSize,
      {
        async onRange(settlementLogs) {
          downloadedGames += settlementLogs.length;

          if (settlementLogs.length === 0) {
            return;
          }

          const [transactionMetadata, blockTimestamps] = await Promise.all([
            fetchTransactionMetadata(publicClient, settlementLogs),
            fetchBlockTimestamps(publicClient, settlementLogs),
          ]);
          const built = buildSettledGames(
            settlementLogs,
            transactionMetadata,
            blockTimestamps,
            normalizedWallet,
            syncTimestamp,
            onTransactionProcessed
          );
          missingTransactionMetadata += built.missingTransactionMetadata;
          trackSyncedGames(built.games, { countStatefulDiscovery: true });
          workingGames = mergeDownloadedHistoryGames(workingGames, built.games, syncTimestamp);
        },
        onInitialRangeComplete({ endBlock }) {
          saveCheckpoint(endBlock);
        },
      }
    );
  }

  const statefulSync = await syncSavedStatefulHistoryGames(
    publicClient,
    workingGames,
    normalizedWallet,
    syncTimestamp,
    {
      maxGames: DEFAULT_STATEFUL_HISTORY_REFRESH_LIMIT,
      priorityGameKeys: syncedGameKeys,
    }
  );
  trackSyncedGames(statefulSync.games);
  workingGames = mergeDownloadedHistoryGames(workingGames, statefulSync.games, syncTimestamp, statefulSync.diagnosticsByGameKey);
  const diagnosticsByGameKey = combineDiagnosticsMaps(
    await diagnoseUnsyncedSupportedGames(
      publicClient,
      workingGames,
      historyGamesFromGameKeySet(syncedGameKeys),
      syncTimestamp
    ),
    statefulSync.diagnosticsByGameKey
  );
  const mergedGames = mergeDownloadedHistoryGames(workingGames, [], syncTimestamp, diagnosticsByGameKey);
  const variantEnrichment = await inferSavedHistoryGameVariants(publicClient, mergedGames, {
    mode: HISTORY_ENRICHMENT_MODES.RPC_MISSING,
    maxRpcCandidates: DEFAULT_HISTORY_RPC_ENRICHMENT_BACKLOG_LIMIT,
    syncTimestamp,
  });
  const nextLastSyncedBlock = resolveNextHistoryLastSyncedBlock(previousLastSyncedBlock, latestBlock) ?? latestBlock;
  const nextHistory = buildDownloadedHistorySnapshot(
    history,
    normalizedWallet,
    nextLastSyncedBlock,
    syncTimestamp,
    variantEnrichment.games
  );

  saveHistory(nextHistory, normalizedWallet);
  const currentGpPerApe = syncProfileCurrentGpPerApe(normalizedWallet, nextHistory.games);

  const currentBalances = await readCurrentHistoryBalances(publicClient, normalizedWallet);
  const stats = summarizeHistoryGames(nextHistory, currentBalances);

  return {
    history: nextHistory,
    stats,
    sync: {
      wallet: normalizedWallet,
      file_path: getHistoryFilePath(normalizedWallet),
      from_block: effectiveFromBlock.toString(),
      to_block: latestBlock.toString(),
      latest_block: latestBlock.toString(),
      downloaded_games: downloadedGames,
      discovered_stateful_games: statefulLogSeedKeys.size,
      new_games: newUniqueGameKeys.size,
      saved_games: nextHistory.games.length,
      missing_transaction_metadata: missingTransactionMetadata,
      unsupported_saved_games: nextHistory.games.filter((game) => isUnsupportedHistoryContract(game.contract)).length,
      current_gp_per_ape: currentGpPerApe,
      initial_max_range: chunkSize.toString(),
      effective_max_range: adaptiveScan.maxRange.toString(),
      adaptive_range_splits: adaptiveScan.splitCount,
      metadata_enriched: variantEnrichment.rpcInferred,
      metadata_failed: variantEnrichment.rpcFailed,
      metadata_pending: variantEnrichment.pendingCandidates,
      stateful_refreshed: statefulSync.games.length,
      stateful_pending: statefulSync.pending,
    },
  };
}

export async function analyzeWalletHistory(
  publicClient,
  walletAddress,
  {
    fromBlock = 0n,
    toBlock,
    chunkSize = DEFAULT_HISTORY_SYNC_CHUNK_SIZE,
  } = {}
) {
  // Retained as an ephemeral analyzer for tests/internal callers.
  // User-facing flows should use wallet download + history instead.
  const latestBlock = toBlock ?? await publicClient.getBlockNumber();
  const settlementLogs = await collectSettlementLogs(
    publicClient,
    walletAddress,
    fromBlock,
    latestBlock,
    chunkSize
  );
  const [transactionMetadata, blockTimestamps, currentBalances] = await Promise.all([
    fetchTransactionMetadata(publicClient, settlementLogs),
    fetchBlockTimestamps(publicClient, settlementLogs),
    readCurrentHistoryBalances(publicClient, walletAddress),
  ]);
  const syncTimestamp = new Date().toISOString();
  const { games, missingTransactionMetadata } = buildSettledGames(
    settlementLogs,
    transactionMetadata,
    blockTimestamps,
    walletAddress,
    syncTimestamp
  );
  const ephemeralHistory = {
    version: HISTORY_SCHEMA_VERSION,
    wallet: String(walletAddress).toLowerCase(),
    chain_id: apechain.id,
    last_synced_block: latestBlock.toString(),
    last_download_on: syncTimestamp,
    games,
  };

  return {
    address: String(walletAddress).toLowerCase(),
    from_block: fromBlock.toString(),
    to_block: latestBlock.toString(),
    stats: summarizeHistoryGames(ephemeralHistory, currentBalances),
    missing_transaction_metadata: missingTransactionMetadata,
    recent_games: games.slice(0, 20),
  };
}

export async function readReportedTotalWagered(publicClient, walletAddress) {
  try {
    const reportedTotalWageredWei = await publicClient.readContract({
      address: USER_INFO_CONTRACT,
      abi: USER_INFO_ABI,
      functionName: 'getTotalWagered',
      args: [walletAddress],
    });

    return {
      reported_total_wagered_wei: reportedTotalWageredWei.toString(),
      reported_total_wagered_ape: toApeString(reportedTotalWageredWei),
    };
  } catch {
    return {
      reported_total_wagered_wei: null,
      reported_total_wagered_ape: null,
    };
  }
}
