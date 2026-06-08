/**
 * @fileoverview History helpers for recent-game rendering.
 *
 * Handles contract-specific on-chain lookups for minimal local history entries.
 * These helpers are still used by status-style summaries; the dedicated
 * `history` command now reads downloaded per-wallet cache files directly.
 */
import { formatEther } from 'viem';
import {
  BLACKJACK_CONTRACT,
  CASH_DASH_CONTRACT,
  GAME_CONTRACT_ABI,
  HI_LO_NEBULA_CONTRACT,
  VIDEO_POKER_CONTRACT,
} from './constants.js';
import { resolveGameDisplayName } from '../registry.js';
import { HI_LO_NEBULA_ABI } from './stateful/hi-lo-nebula/constants.js';
import {
  VIDEO_POKER_ABI,
  GameState as VideoPokerGameState,
} from './stateful/video-poker/constants.js';

const STATEFUL_HISTORY_GAMES = new Map([
  [BLACKJACK_CONTRACT.toLowerCase(), resolveGameDisplayName({ gameKey: 'blackjack', contract: BLACKJACK_CONTRACT, fallbackName: 'Blackjack' })],
  [CASH_DASH_CONTRACT.toLowerCase(), resolveGameDisplayName({ gameKey: 'cash-dash', contract: CASH_DASH_CONTRACT, fallbackName: 'Cash Dash' })],
  [HI_LO_NEBULA_CONTRACT.toLowerCase(), resolveGameDisplayName({ gameKey: 'hi-lo-nebula', contract: HI_LO_NEBULA_CONTRACT, fallbackName: 'Hi-Lo Nebula' })],
  [VIDEO_POKER_CONTRACT.toLowerCase(), resolveGameDisplayName({ gameKey: 'video-poker', contract: VIDEO_POKER_CONTRACT, fallbackName: 'Video Poker' })],
]);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function selectHistoryGames(games, { limit = 10, all = false } = {}) {
  if (all) {
    return games;
  }

  return games.slice(0, limit);
}

function parseBigIntField(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.trim()) {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }

  return 0n;
}

function normalizeSyncMessage(message) {
  return String(message || '').trim().toLowerCase();
}

function historyGameId(game) {
  return String(game?.game_id ?? game?.gameId ?? '');
}

function isLeaderboardEligibleGame(game) {
  return normalizeSyncMessage(game?.last_sync_msg) !== 'execution reverted'
    && game
    && game.last_sync_on
    && typeof game.wager_wei === 'string'
    && typeof game.payout_wei === 'string';
}

function toHistoryTimestampMs(game) {
  const chainTimestamp = Number(game?.tx_chain_timestamp ?? game?.chain_timestamp ?? 0);
  if (Number.isFinite(chainTimestamp) && chainTimestamp > 0) {
    return chainTimestamp < 1e12 ? chainTimestamp * 1000 : chainTimestamp;
  }

  const timestamp = Number(game?.timestamp || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 0;
  }

  return timestamp < 1e12 ? timestamp * 1000 : timestamp;
}

function getSundayStartUtcWeekParts(timestampMs) {
  const date = new Date(timestampMs);
  const utcMidnight = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
  const day = utcMidnight.getUTCDay();
  const weekStartMs = utcMidnight.getTime() - (day * MS_PER_DAY);

  const monday = new Date(weekStartMs + MS_PER_DAY);
  const thursday = new Date(monday.getTime() + (3 * MS_PER_DAY));
  const year = thursday.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.ceil((((thursday.getTime() - yearStart) / MS_PER_DAY) + 1) / 7);

  return { year, week, weekStartMs };
}

function slugifyLeaderboardGameLabel(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/\s*✔︎\s*$/u, '');

  if (!normalized) {
    return 'unknown';
  }

  return normalized
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'unknown';
}

function resolveLeaderboardGameLabel(game) {
  const candidates = [
    game?.game_key,
    game?.rtp_game,
    game?.base_game_key,
    game?.game,
    resolveHistoryGameName(game?.contract),
  ];

  for (const candidate of candidates) {
    const label = slugifyLeaderboardGameLabel(candidate);
    if (label !== 'unknown') {
      return label;
    }
  }

  return 'unknown';
}

export function buildHistoryWapeLeaderboard(history) {
  const games = Array.isArray(history?.games) ? history.games : [];
  const weeksByKey = new Map();
  let totalWageredWei = 0n;
  let totalGames = 0;

  for (const game of games) {
    if (!isLeaderboardEligibleGame(game)) {
      continue;
    }

    const timestampMs = toHistoryTimestampMs(game);
    if (!timestampMs) {
      continue;
    }

    const wageredWei = parseBigIntField(game.wager_wei);
    const { year, week, weekStartMs } = getSundayStartUtcWeekParts(timestampMs);
    const key = `${year}-W${String(week).padStart(2, '0')}`;
    const existing = weeksByKey.get(key) || {
      year,
      week,
      week_label: `${year} W${String(week).padStart(2, '0')}`,
      week_start_utc: new Date(weekStartMs).toISOString(),
      weekStartMs,
      wageredWei: 0n,
      games: 0,
      playsByGame: new Map(),
    };

    const gameLabel = resolveLeaderboardGameLabel(game);
    const playBucket = existing.playsByGame.get(gameLabel) || {
      game: gameLabel,
      plays: 0,
      wageredWei: 0n,
    };

    playBucket.plays += 1;
    playBucket.wageredWei += wageredWei;
    existing.wageredWei += wageredWei;
    existing.games += 1;
    existing.playsByGame.set(gameLabel, playBucket);
    weeksByKey.set(key, existing);
    totalWageredWei += wageredWei;
    totalGames += 1;
  }

  const weeks = [...weeksByKey.values()]
    .sort((left, right) => right.weekStartMs - left.weekStartMs)
    .map((week) => ({
      year: week.year,
      week: week.week,
      week_label: week.week_label,
      week_start_utc: week.week_start_utc,
      wagered_wei: week.wageredWei.toString(),
      wagered_ape: formatEther(week.wageredWei),
      games: week.games,
      plays: [...week.playsByGame.values()]
        .sort((left, right) => {
          if (right.plays !== left.plays) {
            return right.plays - left.plays;
          }

          if (right.wageredWei !== left.wageredWei) {
            return right.wageredWei > left.wageredWei ? 1 : -1;
          }

          return left.game.localeCompare(right.game);
        })
        .map((play) => ({
          game: play.game,
          plays: play.plays,
          wagered_wei: play.wageredWei.toString(),
          wagered_ape: formatEther(play.wageredWei),
        })),
    }));

  return {
    total_wagered_wei: totalWageredWei.toString(),
    total_wagered_ape: formatEther(totalWageredWei),
    total_games: totalGames,
    weeks,
  };
}

export function resolveHistoryGameName(contract) {
  const normalized = String(contract || '').toLowerCase();
  return resolveGameDisplayName({
    contract: normalized,
    fallbackName: STATEFUL_HISTORY_GAMES.get(normalized) || 'Unknown',
  });
}

function buildHistoryEntry({
  historyGame,
  contract,
  player,
  wagerWei,
  payoutWei,
  settled,
  chainTimestamp,
}) {
  return {
    timestamp: historyGame.timestamp,
    game: resolveGameDisplayName({
      gameKey: historyGame.game_key || null,
      contract,
      fallbackName: historyGame.game || resolveHistoryGameName(contract),
    }),
    game_key: historyGame.game_key || null,
    config: historyGame.config || null,
    variant_key: historyGame.variant_key || null,
    variant_label: historyGame.variant_label || null,
    rtp_game: historyGame.rtp_game || historyGame.game_key || null,
    rtp_config: historyGame.rtp_config || historyGame.config || null,
    game_id: historyGameId(historyGame),
    gameId: historyGameId(historyGame),
    contract,
    player,
    wager_ape: formatEther(wagerWei),
    payout_ape: formatEther(payoutWei),
    pnl_ape: formatEther(payoutWei - wagerWei),
    won: payoutWei > wagerWei,
    push: payoutWei === wagerWei && payoutWei > 0n,
    gp_received_raw: historyGame.gp_received_raw ?? null,
    gp_received_display: historyGame.gp_received_display ?? historyGame.gp_received_raw ?? null,
    settled,
    chain_timestamp: Number(chainTimestamp),
    last_sync_on: historyGame.last_sync_on ?? null,
    last_sync_msg: historyGame.last_sync_msg ?? null,
  };
}

async function fetchEssentialHistoryEntries(publicClient, contract, games) {
  const gameIds = games.map((game) => BigInt(historyGameId(game)));

  try {
    const [players, buyIns, payouts, timestamps, hasEndeds] = await publicClient.readContract({
      address: contract,
      abi: GAME_CONTRACT_ABI,
      functionName: 'getEssentialGameInfo',
      args: [gameIds],
    });

    return {
      entries: games.map((historyGame, index) =>
        buildHistoryEntry({
          historyGame,
          contract,
          player: players[index],
          wagerWei: buyIns[index],
          payoutWei: payouts[index],
          settled: hasEndeds[index],
          chainTimestamp: timestamps[index],
        })
      ),
      failedFetches: 0,
    };
  } catch {
    return {
      entries: [],
      failedFetches: games.length,
    };
  }
}

async function fetchVideoPokerHistoryEntries(publicClient, contract, games) {
  const settledResults = await Promise.allSettled(
    games.map(async (historyGame) => {
      const raw = await publicClient.readContract({
        address: contract,
        abi: VIDEO_POKER_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(historyGameId(historyGame))],
      });

      return buildHistoryEntry({
        historyGame,
        contract,
        player: raw.player,
        wagerWei: raw.betAmount,
        payoutWei: raw.totalPayout,
        settled: Number(raw.gameState) === VideoPokerGameState.HAND_COMPLETE,
        chainTimestamp: raw.timestamp,
      });
    })
  );

  const entries = [];
  let failedFetches = 0;

  for (const result of settledResults) {
    if (result.status === 'fulfilled') {
      entries.push(result.value);
    } else {
      failedFetches += 1;
    }
  }

  return { entries, failedFetches };
}

async function fetchHiLoNebulaHistoryEntries(publicClient, contract, games) {
  const settledResults = await Promise.allSettled(
    games.map(async (historyGame) => {
      const raw = await publicClient.readContract({
        address: contract,
        abi: HI_LO_NEBULA_ABI,
        functionName: 'getGameInfo',
        args: [BigInt(historyGameId(historyGame))],
      });

      return buildHistoryEntry({
        historyGame,
        contract,
        player: raw.user,
        wagerWei: raw.initialBetAmount,
        payoutWei: raw.payout,
        settled: raw.hasEnded,
        chainTimestamp: raw.timestamp,
      });
    })
  );

  const entries = [];
  let failedFetches = 0;

  for (const result of settledResults) {
    if (result.status === 'fulfilled') {
      entries.push(result.value);
    } else {
      failedFetches += 1;
    }
  }

  return { entries, failedFetches };
}

export async function fetchHistoryEntriesForContract(publicClient, contract, games) {
  const normalized = String(contract || '').toLowerCase();

  if (normalized === HI_LO_NEBULA_CONTRACT.toLowerCase()) {
    return fetchHiLoNebulaHistoryEntries(publicClient, contract, games);
  }

  if (normalized === VIDEO_POKER_CONTRACT.toLowerCase()) {
    return fetchVideoPokerHistoryEntries(publicClient, contract, games);
  }

  return fetchEssentialHistoryEntries(publicClient, contract, games);
}

export async function fetchSavedHistoryEntries(publicClient, savedGames = []) {
  if (!Array.isArray(savedGames) || savedGames.length === 0) {
    return { entries: [], failedFetches: 0 };
  }

  const gamesByContract = {};
  for (const game of savedGames) {
    if (!gamesByContract[game.contract]) gamesByContract[game.contract] = [];
    gamesByContract[game.contract].push(game);
  }

  const entries = [];
  let failedFetches = 0;

  for (const [contract, games] of Object.entries(gamesByContract)) {
    const result = await fetchHistoryEntriesForContract(publicClient, contract, games);
    entries.push(...result.entries);
    failedFetches += result.failedFetches;
  }

  entries.sort((a, b) => b.timestamp - a.timestamp);
  return { entries, failedFetches };
}
