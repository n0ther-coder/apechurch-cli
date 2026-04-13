/**
 * @fileoverview Status summary helpers.
 *
 * Aggregates local history and unfinished stateful games into the compact
 * status views used by the CLI.
 */
import { resolveHistoryGameName } from './history.js';
import { formatGameVariantName, listGameStatusCatalogEntries, resolveConfiguredGameVariant } from './rtp.js';
import { BINARY_NAME } from './constants.js';
import { resolveGameDisplayName } from '../registry.js';

const ACTIVE_GAME_NAME_OVERRIDES = new Map([
  ['blackjack', resolveGameDisplayName({ gameKey: 'blackjack', fallbackName: 'Blackjack' })],
  ['hi-lo-nebula', resolveGameDisplayName({ gameKey: 'hi-lo-nebula', fallbackName: 'Hi-Lo Nebula' })],
  ['video-poker', resolveGameDisplayName({ gameKey: 'video-poker', fallbackName: 'Video Poker' })],
]);

const ACTIVE_GAME_RESUME_COMMANDS = new Map([
  ['blackjack', `${BINARY_NAME} blackjack resume [--game <id>][--auto [best]]`],
  ['hi-lo-nebula', `${BINARY_NAME} hi-lo-nebula resume [--game <id>][--auto [best] | --solver]`],
  ['video-poker', `${BINARY_NAME} video-poker resume [--game <id>][--auto [best] | --solver]`],
]);
const EXECUTION_REVERTED_SYNC_MSG = 'execution reverted';

function titleCase(segment) {
  if (!segment) return '';
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function parseApeAmount(value) {
  const parsed = Number.parseFloat(value || '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function shouldCountHistoryGame(game) {
  return String(game?.last_sync_msg || '').trim().toLowerCase() !== EXECUTION_REVERTED_SYNC_MSG;
}

function computeHitMultiplier(payoutApe, wagerApe) {
  const payout = parseApeAmount(payoutApe);
  const wager = parseApeAmount(wagerApe);
  if (!(wager > 0)) {
    return null;
  }

  return Number((payout / wager).toFixed(3));
}

function createGameStatusAccumulator({
  gameName,
  groupKey,
  baseGameKey = null,
  variantLabel = null,
  rtpGame = null,
  rtpConfig = null,
}) {
  return {
    game: String(gameName || 'Unknown'),
    group_key: String(groupKey || gameName || 'unknown').toLowerCase(),
    base_game_key: String(baseGameKey || groupKey || gameName || 'unknown').toLowerCase(),
    variant_label: variantLabel || null,
    rtp_game: rtpGame || null,
    rtp_config: rtpConfig || null,
    games_played: 0,
    unfinished_games: 0,
    unfinished_game_ids: [],
    net_profit_total_ape: 0,
    total_wagered_ape: 0,
    total_payout_ape: 0,
    max_hit_x: null,
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
    group_key: summary.group_key,
    base_game_key: summary.base_game_key,
    variant_label: summary.variant_label,
    rtp_game: summary.rtp_game,
    rtp_config: summary.rtp_config,
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
    max_hit_x: netProfitComplete ? summary.max_hit_x : null,
    unfinished_games: summary.unfinished_games,
    unfinished_game_ids: summary.unfinished_game_ids,
  };
}

function getSortableGameName(summary) {
  const gameName = String(summary?.game || '').trim();
  const variantLabel = String(summary?.variant_label || '').trim();
  if (!gameName || !variantLabel) {
    return gameName;
  }

  const suffix = ` (${variantLabel})`;
  return gameName.endsWith(suffix)
    ? gameName.slice(0, -suffix.length).trim()
    : gameName;
}

function sortGameStatusSummaries(left, right) {
  return getSortableGameName(left).localeCompare(getSortableGameName(right), undefined, { numeric: true })
    || String(left.variant_label || '').localeCompare(String(right.variant_label || ''), undefined, { numeric: true })
    || left.game.localeCompare(right.game, undefined, { numeric: true });
}

function resolveStatusSummaryIdentity({
  gameName = null,
  gameKey = null,
  variantKey = null,
  variantLabel = null,
  rtpGame = null,
  rtpConfig = null,
  contract = null,
  config = null,
} = {}) {
  const displayGame = resolveGameDisplayName({
    gameKey,
    contract,
    fallbackName: gameName || resolveHistoryGameName(contract),
  });
  const resolvedVariant = resolveConfiguredGameVariant({
    game: rtpGame || gameKey || displayGame,
    config: rtpConfig || config || null,
    variantKey,
    variantLabel,
  });
  const baseGameKey = String(gameKey || resolvedVariant.gameKey || displayGame || 'unknown').trim().toLowerCase();
  const useResolvedVideoPokerVariant = resolvedVariant.gameKey === 'video-poker'
    && Boolean(resolvedVariant.variantKey)
    && Boolean(rtpConfig || config);
  const useResolvedPlinkoVariant = (
    resolvedVariant.gameKey === 'jungle-plinko'
    || resolvedVariant.gameKey === 'cosmic-plinko'
  ) && Boolean(resolvedVariant.variantKey);
  const useResolvedCanonicalVariant = useResolvedVideoPokerVariant || useResolvedPlinkoVariant;
  const finalVariantKey = String(
    (useResolvedCanonicalVariant ? resolvedVariant.variantKey : null)
    || variantKey
    || resolvedVariant.variantKey
    || baseGameKey
  ).trim().toLowerCase();
  const finalVariantLabel = (useResolvedCanonicalVariant ? resolvedVariant.variantLabel : null)
    || variantLabel
    || resolvedVariant.variantLabel
    || null;

  return {
    game: formatGameVariantName(displayGame, finalVariantLabel),
    groupKey: finalVariantKey,
    baseGameKey,
    variantLabel: finalVariantLabel,
    rtpGame: rtpGame || resolvedVariant.rtpGame || baseGameKey,
    rtpConfig: useResolvedCanonicalVariant
      ? resolvedVariant.rtpConfig
      : (rtpConfig || resolvedVariant.rtpConfig || config || null),
  };
}

export function resolveActiveGameName(gameType) {
  const normalized = String(gameType || '').trim().toLowerCase();
  if (!normalized) return 'Unknown';
  if (ACTIVE_GAME_NAME_OVERRIDES.has(normalized)) {
    return ACTIVE_GAME_NAME_OVERRIDES.get(normalized);
  }

  return resolveGameDisplayName({
    gameKey: normalized,
    fallbackName: normalized
      .split('-')
      .filter(Boolean)
      .map(titleCase)
      .join(' '),
  });
}

export function resolveActiveGameResumeCommand(gameType) {
  const normalized = String(gameType || '').trim().toLowerCase();
  if (!normalized) {
    return `${BINARY_NAME} resume [--game <id>]`;
  }

  return ACTIVE_GAME_RESUME_COMMANDS.get(normalized)
    || `${BINARY_NAME} ${normalized} resume [--game <id>]`;
}

export function resolveActiveGameClearCommand(gameType) {
  const normalized = String(gameType || '').trim().toLowerCase();
  if (!normalized) {
    return `${BINARY_NAME} clear`;
  }

  return `${BINARY_NAME} ${normalized} clear`;
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
      resume_command: resolveActiveGameResumeCommand(gameType),
      clear_command: resolveActiveGameClearCommand(gameType),
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

  function ensureSummary(identity) {
    const groupKey = String(identity?.groupKey || identity?.game || 'unknown').toLowerCase();
    if (!summaryByGame.has(groupKey)) {
      summaryByGame.set(groupKey, createGameStatusAccumulator({
        gameName: identity?.game,
        groupKey,
        baseGameKey: identity?.baseGameKey || groupKey,
        variantLabel: identity?.variantLabel || null,
        rtpGame: identity?.rtpGame || null,
        rtpConfig: identity?.rtpConfig || null,
      }));
    }
    return summaryByGame.get(groupKey);
  }

  for (const game of historyGames) {
    if (!shouldCountHistoryGame(game)) {
      continue;
    }

    const summary = ensureSummary(resolveStatusSummaryIdentity({
      gameName: game.game || null,
      gameKey: game.game_key || null,
      variantKey: game.variant_key || null,
      variantLabel: game.variant_label || null,
      rtpGame: game.rtp_game || null,
      rtpConfig: game.rtp_config || null,
      contract: game.contract,
      config: game.config || null,
    }));
    summary.games_played += 1;
  }

  for (const entry of historyEntries) {
    if (entry.settled === false) {
      continue;
    }
    if (!shouldCountHistoryGame(entry)) {
      continue;
    }

    const summary = ensureSummary(resolveStatusSummaryIdentity({
      gameName: entry.game || null,
      gameKey: entry.game_key || null,
      variantKey: entry.variant_key || null,
      variantLabel: entry.variant_label || null,
      rtpGame: entry.rtp_game || null,
      rtpConfig: entry.rtp_config || null,
      contract: entry.contract,
      config: entry.config || null,
    }));
    summary.net_profit_total_ape += parseApeAmount(entry.pnl_ape);
    summary.total_wagered_ape += parseApeAmount(entry.wager_ape);
    summary.total_payout_ape += parseApeAmount(entry.payout_ape);
    const hitMultiplier = computeHitMultiplier(entry.payout_ape, entry.wager_ape);
    if (Number.isFinite(hitMultiplier)) {
      summary.max_hit_x = summary.max_hit_x === null
        ? hitMultiplier
        : Math.max(summary.max_hit_x, hitMultiplier);
    }
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
    const identity = resolveStatusSummaryIdentity({
      gameName: unfinished.game,
      gameKey: unfinished.key,
      rtpGame: unfinished.key,
    });
    const matchingVariants = [...summaryByGame.values()]
      .filter((summary) => summary.base_game_key === identity.baseGameKey);
    const summary = matchingVariants.length === 1
      ? matchingVariants[0]
      : ensureSummary(identity);
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
  includeCatalog = false,
} = {}) {
  const summaryByGame = new Map();

  function ensureSummary(identity) {
    const groupKey = String(identity?.groupKey || identity?.game || 'unknown').toLowerCase();
    if (!summaryByGame.has(groupKey)) {
      summaryByGame.set(groupKey, createGameStatusAccumulator({
        gameName: identity?.game,
        groupKey,
        baseGameKey: identity?.baseGameKey || groupKey,
        variantLabel: identity?.variantLabel || null,
        rtpGame: identity?.rtpGame || null,
        rtpConfig: identity?.rtpConfig || null,
      }));
    }
    return summaryByGame.get(groupKey);
  }

  for (const gameStats of historyBreakdown) {
    const summary = ensureSummary(resolveStatusSummaryIdentity({
      gameName: gameStats.game || null,
      gameKey: gameStats.game_key || null,
      variantKey: gameStats.variant_key || null,
      variantLabel: gameStats.variant_label || null,
      rtpGame: gameStats.rtp_game || null,
      rtpConfig: gameStats.rtp_config || null,
    }));
    summary.games_played = Number(gameStats.total_saved_games || 0);
    summary.net_profit_total_ape = parseApeAmount(gameStats.net_result_ape);
    summary.total_wagered_ape = parseApeAmount(gameStats.total_wagered_ape);
    summary.total_payout_ape = parseApeAmount(gameStats.total_payout_ape);
    summary.max_hit_x = Number.isFinite(Number(gameStats.max_hit_x)) ? Number(gameStats.max_hit_x) : null;
    summary.wins = Number(gameStats.wins || 0);
    summary.pushes = Number(gameStats.pushes || 0);
    summary.losses = Number(gameStats.losses || 0);
    summary.known_history_games = Number(gameStats.games || 0);
  }

  for (const unfinished of summarizeUnfinishedGames(activeGames)) {
    const identity = resolveStatusSummaryIdentity({
      gameName: unfinished.game,
      gameKey: unfinished.key,
      rtpGame: unfinished.key,
    });
    const matchingVariants = [...summaryByGame.values()]
      .filter((summary) => summary.base_game_key === identity.baseGameKey);
    const summary = matchingVariants.length === 1
      ? matchingVariants[0]
      : ensureSummary(identity);
    summary.unfinished_games = unfinished.unfinished_games;
    summary.unfinished_game_ids = unfinished.game_ids;
  }

  if (includeCatalog) {
    for (const entry of listGameStatusCatalogEntries()) {
      ensureSummary(resolveStatusSummaryIdentity({
        gameName: entry.gameName,
        gameKey: entry.gameKey,
        variantKey: entry.variantKey,
        variantLabel: entry.variantLabel,
        rtpGame: entry.rtpGame,
        rtpConfig: entry.rtpConfig,
      }));
    }
  }

  return Array.from(summaryByGame.values())
    .map(finalizeGameStatusSummary)
    .sort(sortGameStatusSummaries);
}
