/**
 * @fileoverview Status summary helpers.
 *
 * Aggregates local history and unfinished stateful games into the compact
 * status views used by the CLI.
 */
import { resolveHistoryGameName } from './history.js';

const ACTIVE_GAME_NAME_OVERRIDES = new Map([
  ['blackjack', 'Blackjack'],
  ['video-poker', 'Video Poker'],
]);

function titleCase(segment) {
  if (!segment) return '';
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function parseApeAmount(value) {
  const parsed = Number.parseFloat(value || '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function createGameStatusAccumulator(gameName) {
  return {
    game: String(gameName || 'Unknown'),
    games_played: 0,
    unfinished_games: 0,
    unfinished_game_ids: [],
    net_profit_total_ape: 0,
    total_wagered_ape: 0,
    total_payout_ape: 0,
    wins: 0,
    pushes: 0,
    losses: 0,
    known_history_games: 0,
  };
}

function finalizeGameStatusSummary(summary) {
  const netProfitComplete = (
    summary.games_played === 0 ||
    summary.known_history_games === summary.games_played
  );
  const hasCompletedGames = summary.games_played > 0;
  const hasWagered = summary.total_wagered_ape > 0;

  return {
    game: summary.game,
    games_played: summary.games_played,
    net_profit_ape: netProfitComplete ? summary.net_profit_total_ape.toFixed(4) : null,
    net_profit_complete: netProfitComplete,
    wins: netProfitComplete ? summary.wins : null,
    pushes: netProfitComplete ? summary.pushes : null,
    losses: netProfitComplete ? summary.losses : null,
    win_rate: netProfitComplete && hasCompletedGames
      ? Number(((summary.wins / summary.games_played) * 100).toFixed(2))
      : null,
    rtp: netProfitComplete && hasWagered
      ? Number(((summary.total_payout_ape / summary.total_wagered_ape) * 100).toFixed(2))
      : null,
    unfinished_games: summary.unfinished_games,
    unfinished_game_ids: summary.unfinished_game_ids,
  };
}

function sortGameStatusSummaries(left, right) {
  return right.unfinished_games - left.unfinished_games
    || right.games_played - left.games_played
    || left.game.localeCompare(right.game);
}

export function resolveActiveGameName(gameType) {
  const normalized = String(gameType || '').trim().toLowerCase();
  if (!normalized) return 'Unknown';
  if (ACTIVE_GAME_NAME_OVERRIDES.has(normalized)) {
    return ACTIVE_GAME_NAME_OVERRIDES.get(normalized);
  }

  return normalized
    .split('-')
    .filter(Boolean)
    .map(titleCase)
    .join(' ');
}

export function summarizeUnfinishedGames(activeGames = {}) {
  const summaries = [];

  for (const [gameType, ids] of Object.entries(activeGames || {})) {
    const gameIds = Array.isArray(ids) ? ids.map((id) => String(id)) : [];
    if (gameIds.length === 0) continue;

    summaries.push({
      key: gameType,
      game: resolveActiveGameName(gameType),
      unfinished_games: gameIds.length,
      game_ids: gameIds,
    });
  }

  return summaries.sort((a, b) =>
    b.unfinished_games - a.unfinished_games || a.game.localeCompare(b.game)
  );
}

export function buildGameStatusSummary({
  historyGames = [],
  historyEntries = [],
  activeGames = {},
} = {}) {
  const summaryByGame = new Map();

  function ensureSummary(gameName) {
    const normalizedName = String(gameName || 'Unknown');
    const key = normalizedName.toLowerCase();
    if (!summaryByGame.has(key)) {
      summaryByGame.set(key, createGameStatusAccumulator(normalizedName));
    }
    return summaryByGame.get(key);
  }

  for (const game of historyGames) {
    const summary = ensureSummary(resolveHistoryGameName(game.contract));
    summary.games_played += 1;
  }

  for (const entry of historyEntries) {
    if (entry.settled === false) {
      continue;
    }

    const summary = ensureSummary(entry.game || resolveHistoryGameName(entry.contract));
    summary.net_profit_total_ape += parseApeAmount(entry.pnl_ape);
    summary.total_wagered_ape += parseApeAmount(entry.wager_ape);
    summary.total_payout_ape += parseApeAmount(entry.payout_ape);
    summary.known_history_games += 1;
    if (entry.won) {
      summary.wins += 1;
    } else if (entry.push) {
      summary.pushes += 1;
    } else {
      summary.losses += 1;
    }
  }

  for (const unfinished of summarizeUnfinishedGames(activeGames)) {
    const summary = ensureSummary(unfinished.game);
    summary.unfinished_games = unfinished.unfinished_games;
    summary.unfinished_game_ids = unfinished.game_ids;
  }

  return Array.from(summaryByGame.values())
    .map(finalizeGameStatusSummary)
    .sort(sortGameStatusSummaries);
}

export function buildHistoryGameStatusSummary({
  historyBreakdown = [],
  activeGames = {},
} = {}) {
  const summaryByGame = new Map();

  function ensureSummary(gameName) {
    const normalizedName = String(gameName || 'Unknown');
    const key = normalizedName.toLowerCase();
    if (!summaryByGame.has(key)) {
      summaryByGame.set(key, createGameStatusAccumulator(normalizedName));
    }
    return summaryByGame.get(key);
  }

  for (const gameStats of historyBreakdown) {
    const summary = ensureSummary(gameStats.game);
    summary.games_played = Number(gameStats.total_saved_games || 0);
    summary.net_profit_total_ape = parseApeAmount(gameStats.net_result_ape);
    summary.total_wagered_ape = parseApeAmount(gameStats.total_wagered_ape);
    summary.total_payout_ape = parseApeAmount(gameStats.total_payout_ape);
    summary.wins = Number(gameStats.wins || 0);
    summary.pushes = Number(gameStats.pushes || 0);
    summary.losses = Number(gameStats.losses || 0);
    summary.known_history_games = Number(gameStats.games || 0);
  }

  for (const unfinished of summarizeUnfinishedGames(activeGames)) {
    const summary = ensureSummary(unfinished.game);
    summary.unfinished_games = unfinished.unfinished_games;
    summary.unfinished_game_ids = unfinished.game_ids;
  }

  return Array.from(summaryByGame.values())
    .map(finalizeGameStatusSummary)
    .sort(sortGameStatusSummaries);
}
