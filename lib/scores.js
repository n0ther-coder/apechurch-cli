/**
 * Wallet-scoped scoreboards derived from saved history.
 *
 * Produces two Top 20 rankings for the selected wallet:
 * - Highest Multipliers
 * - Biggest Payouts
 */
import fs from 'fs';
import path from 'path';
import { formatEther } from 'viem';
import { apechain, SCORES_DIR } from './constants.js';
import { resolveConfiguredGameVariant } from './rtp.js';
import { ensureDir } from './utils.js';
import { getWalletAddress } from './wallet.js';
import {
  resolveGame,
  resolveGameByContract,
  resolveGameDisplayName,
  stripAbiVerifiedSymbol,
} from '../registry.js';

const SCORE_SCHEMA_VERSION = 1;
const SCORE_FILE_SUFFIX = '_score.json';
const TOP_SCORE_LIMIT = 20;
const MULTIPLIER_SCALE = 1_000_000n;
const SCORE_TITLE_COLLATOR = new Intl.Collator('en', {
  sensitivity: 'base',
  numeric: true,
});

function normalizeWalletScopedAddress(walletAddress) {
  if (walletAddress) {
    return String(walletAddress).trim().toLowerCase();
  }

  const localWalletAddress = getWalletAddress();
  return localWalletAddress ? localWalletAddress.toLowerCase() : null;
}

function parseBigIntField(value) {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }

  return 0n;
}

function formatMultiplierValue(payoutWei, wagerWei) {
  if (wagerWei <= 0n) {
    return null;
  }

  const rounded = ((payoutWei * MULTIPLIER_SCALE) + (wagerWei / 2n)) / wagerWei;
  return Number(rounded) / Number(MULTIPLIER_SCALE);
}

function formatScoreDecimal(value, decimals = 2) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric.toFixed(decimals);
}

function createEmptyScores(walletAddress = null, { updatedOn = null, historyLastDownloadOn = null } = {}) {
  return {
    version: SCORE_SCHEMA_VERSION,
    wallet: walletAddress,
    chain_id: apechain.id,
    updated_on: updatedOn,
    history_last_download_on: historyLastDownloadOn,
    highest_multipliers: [],
    biggest_payouts: [],
  };
}

function compareRowsByTimestampDesc(left, right) {
  const leftTimestamp = Number(left?.timestampMs || 0);
  const rightTimestamp = Number(right?.timestampMs || 0);
  if (rightTimestamp !== leftTimestamp) {
    return rightTimestamp - leftTimestamp;
  }

  return SCORE_TITLE_COLLATOR.compare(
    String(left?.gameTitle || ''),
    String(right?.gameTitle || ''),
  );
}

function compareRowsByMultiplierDesc(left, right) {
  const crossLeft = left.payoutWei * right.wagerWei;
  const crossRight = right.payoutWei * left.wagerWei;
  if (crossLeft !== crossRight) {
    return crossLeft > crossRight ? -1 : 1;
  }

  if (left.payoutWei !== right.payoutWei) {
    return left.payoutWei > right.payoutWei ? -1 : 1;
  }

  return compareRowsByTimestampDesc(left, right);
}

function compareRowsByPayoutDesc(left, right) {
  if (left.payoutWei !== right.payoutWei) {
    return left.payoutWei > right.payoutWei ? -1 : 1;
  }

  const crossLeft = left.payoutWei * right.wagerWei;
  const crossRight = right.payoutWei * left.wagerWei;
  if (crossLeft !== crossRight) {
    return crossLeft > crossRight ? -1 : 1;
  }

  return compareRowsByTimestampDesc(left, right);
}

function resolveScoreGameTitle(game) {
  return stripAbiVerifiedSymbol(resolveGameDisplayName({
    gameKey: game?.game_key || null,
    contract: game?.contract || null,
    fallbackName: game?.game || 'Unknown',
  }));
}

function resolveScoreGameMode(game) {
  const variant = resolveConfiguredGameVariant({
    game: game?.rtp_game || game?.game_key || game?.game || null,
    config: game?.rtp_config || game?.config || null,
    variantKey: game?.variant_key || null,
    variantLabel: game?.variant_label || null,
  });
  const variantLabel = String(variant.variantLabel || '').trim();
  if (!variantLabel) {
    return null;
  }

  if (String(game?.game_key || variant.gameKey || '').trim().toLowerCase() === 'roulette') {
    const singleBetLabel = variantLabel.match(/^1\s+([^,]+)$/);
    if (singleBetLabel) {
      return singleBetLabel[1].trim();
    }
  }

  return variantLabel;
}

function resolveScoreGameUrl(game) {
  const existingUrl = String(game?.game_url || '').trim();
  if (existingUrl) {
    return existingUrl;
  }

  const gameId = String(game?.gameId || '').trim();
  if (!gameId) {
    return null;
  }

  const gameEntry = resolveGame(game?.game_key) || resolveGameByContract(game?.contract);
  if (!gameEntry?.slug) {
    return null;
  }

  return `https://www.ape.church/games/${gameEntry.slug}?id=${gameId}`;
}

function resolveScoreGameId(game) {
  const existingGameId = String(game?.gameId || game?.game_id || '').trim();
  if (existingGameId) {
    return existingGameId;
  }

  const existingUrl = String(game?.game_url || '').trim();
  if (!existingUrl) {
    return null;
  }

  try {
    const gameUrl = new URL(existingUrl);
    const gameId = String(gameUrl.searchParams.get('id') || '').trim();
    return gameId || null;
  } catch {
    const match = existingUrl.match(/[?&]id=([^&#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }
}

function toScoreTimestamp(game) {
  const rawTimestamp = Number(game?.timestamp || 0);
  if (Number.isFinite(rawTimestamp) && rawTimestamp > 0) {
    return rawTimestamp;
  }

  const chainTimestamp = Number(game?.chain_timestamp || 0);
  return Number.isFinite(chainTimestamp) && chainTimestamp > 0
    ? chainTimestamp * 1000
    : 0;
}

function isScoreEligibleGame(game) {
  return parseBigIntField(game?.wager_wei) > 0n && parseBigIntField(game?.payout_wei) >= 0n;
}

function formatApeAmount(value, fallbackWei) {
  const normalized = String(value || '').trim();
  if (normalized) {
    return normalized;
  }

  return formatEther(fallbackWei);
}

function toScoreRow(game) {
  const wagerWei = parseBigIntField(game?.wager_wei);
  const payoutWei = parseBigIntField(game?.payout_wei);
  const timestampMs = toScoreTimestamp(game);

  return {
    wagerWei,
    payoutWei,
    timestampMs,
    gameId: resolveScoreGameId(game),
    gameTitle: resolveScoreGameTitle(game),
    gameMode: resolveScoreGameMode(game),
    bet: formatApeAmount(game?.wager_ape, wagerWei),
    payout: formatApeAmount(game?.payout_ape, payoutWei),
    multiplier: formatMultiplierValue(payoutWei, wagerWei),
    datetimeUtc: timestampMs > 0 ? new Date(timestampMs).toISOString() : null,
    gameUrl: resolveScoreGameUrl(game),
  };
}

function toHighestMultiplierEntry(row) {
  return {
    multiplier: formatScoreDecimal(row.multiplier),
    game_title: row.gameTitle,
    game_mode: row.gameMode,
    bet: row.bet,
    payout: formatScoreDecimal(row.payout),
    game_id: row.gameId,
    datetime_utc: row.datetimeUtc,
    game_url: row.gameUrl,
  };
}

function toBiggestPayoutEntry(row) {
  return {
    payout: formatScoreDecimal(row.payout),
    game_title: row.gameTitle,
    game_mode: row.gameMode,
    bet: row.bet,
    multiplier: formatScoreDecimal(row.multiplier),
    game_id: row.gameId,
    datetime_utc: row.datetimeUtc,
    game_url: row.gameUrl,
  };
}

function buildScoreRows(games = []) {
  return (Array.isArray(games) ? games : [])
    .filter(isScoreEligibleGame)
    .map(toScoreRow)
    .filter((row) => Number.isFinite(row.multiplier));
}

export function getScoreFilePath(walletAddress) {
  const normalizedWallet = normalizeWalletScopedAddress(walletAddress);
  if (!normalizedWallet) {
    return null;
  }

  ensureDir(SCORES_DIR);
  return path.join(SCORES_DIR, `${normalizedWallet}${SCORE_FILE_SUFFIX}`);
}

export function listScoreWalletAddresses() {
  if (!fs.existsSync(SCORES_DIR)) {
    return [];
  }

  return fs.readdirSync(SCORES_DIR)
    .filter((fileName) => fileName.endsWith(SCORE_FILE_SUFFIX))
    .map((fileName) => fileName.slice(0, -SCORE_FILE_SUFFIX.length))
    .filter((address) => /^0x[a-f0-9]{40}$/i.test(address))
    .sort((left, right) => left.localeCompare(right));
}

export function buildWalletScores(history, { limit = TOP_SCORE_LIMIT, updatedOn = new Date().toISOString() } = {}) {
  const normalizedWallet = normalizeWalletScopedAddress(history?.wallet);
  const rows = buildScoreRows(history?.games);

  return {
    ...createEmptyScores(normalizedWallet, {
      updatedOn,
      historyLastDownloadOn: history?.last_download_on ?? null,
    }),
    highest_multipliers: rows
      .slice()
      .sort(compareRowsByMultiplierDesc)
      .slice(0, limit)
      .map(toHighestMultiplierEntry),
    biggest_payouts: rows
      .slice()
      .sort(compareRowsByPayoutDesc)
      .slice(0, limit)
      .map(toBiggestPayoutEntry),
  };
}

export function saveScoresFromHistory(history, walletAddress = null, options = {}) {
  const normalizedWallet = normalizeWalletScopedAddress(walletAddress || history?.wallet);
  if (!normalizedWallet) {
    return createEmptyScores(null, {
      updatedOn: options.updatedOn ?? new Date().toISOString(),
      historyLastDownloadOn: history?.last_download_on ?? null,
    });
  }

  const scores = buildWalletScores({
    ...(history || {}),
    wallet: normalizedWallet,
  }, options);
  const scoreFilePath = getScoreFilePath(normalizedWallet);

  fs.writeFileSync(scoreFilePath, JSON.stringify(scores, null, 2));
  return scores;
}
