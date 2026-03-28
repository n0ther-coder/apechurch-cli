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
      summaryByGame.set(key, {
        game: normalizedName,
        games_played: 0,
        unfinished_games: 0,
        unfinished_game_ids: [],
        net_profit_total_ape: 0,
        known_history_games: 0,
      });
    }
    return summaryByGame.get(key);
  }

  for (const game of historyGames) {
    const summary = ensureSummary(resolveHistoryGameName(game.contract));
    summary.games_played += 1;
  }

  for (const entry of historyEntries) {
    const summary = ensureSummary(entry.game || resolveHistoryGameName(entry.contract));
    summary.net_profit_total_ape += parseFloat(entry.pnl_ape || '0');
    summary.known_history_games += 1;
  }

  for (const unfinished of summarizeUnfinishedGames(activeGames)) {
    const summary = ensureSummary(unfinished.game);
    summary.unfinished_games = unfinished.unfinished_games;
    summary.unfinished_game_ids = unfinished.game_ids;
  }

  return Array.from(summaryByGame.values())
    .map((summary) => {
      const netProfitComplete = (
        summary.games_played === 0 ||
        summary.known_history_games === summary.games_played
      );

      return {
        game: summary.game,
        games_played: summary.games_played,
        net_profit_ape: netProfitComplete ? summary.net_profit_total_ape.toFixed(4) : null,
        net_profit_complete: netProfitComplete,
        unfinished_games: summary.unfinished_games,
        unfinished_game_ids: summary.unfinished_game_ids,
      };
    })
    .sort((a, b) =>
      b.unfinished_games - a.unfinished_games ||
      b.games_played - a.games_played ||
      a.game.localeCompare(b.game)
    );
}
