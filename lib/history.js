/**
 * @fileoverview History helpers for recent-game rendering.
 *
 * Handles contract-specific history lookups so the CLI can enrich locally
 * saved game ids with wager, payout, and settlement data.
 */
import { formatEther } from 'viem';
import { GAME_CONTRACT_ABI } from './constants.js';
import { GAME_REGISTRY } from '../registry.js';
import { BLACKJACK_CONTRACT } from './stateful/blackjack/constants.js';
import {
  VIDEO_POKER_CONTRACT,
  VIDEO_POKER_ABI,
  GameState as VideoPokerGameState,
} from './stateful/video-poker/constants.js';

const STATEFUL_HISTORY_GAMES = new Map([
  [BLACKJACK_CONTRACT.toLowerCase(), 'Blackjack'],
  [VIDEO_POKER_CONTRACT.toLowerCase(), 'Video Poker'],
]);

export function selectHistoryGames(games, { limit = 10, all = false } = {}) {
  if (all) {
    return games;
  }

  return games.slice(0, limit);
}

export function resolveHistoryGameName(contract) {
  const normalized = String(contract || '').toLowerCase();
  const gameEntry = GAME_REGISTRY.find((game) => game.contract.toLowerCase() === normalized);
  if (gameEntry) {
    return gameEntry.name;
  }

  return STATEFUL_HISTORY_GAMES.get(normalized) || 'Unknown';
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
    game: resolveHistoryGameName(contract),
    gameId: historyGame.gameId,
    contract,
    player,
    wager_ape: formatEther(wagerWei),
    payout_ape: formatEther(payoutWei),
    pnl_ape: formatEther(payoutWei - wagerWei),
    won: payoutWei > wagerWei,
    push: payoutWei === wagerWei && payoutWei > 0n,
    settled,
    chain_timestamp: Number(chainTimestamp),
  };
}

async function fetchEssentialHistoryEntries(publicClient, contract, games) {
  const gameIds = games.map((game) => BigInt(game.gameId));

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
        args: [BigInt(historyGame.gameId)],
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

export async function fetchHistoryEntriesForContract(publicClient, contract, games) {
  const normalized = String(contract || '').toLowerCase();

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
