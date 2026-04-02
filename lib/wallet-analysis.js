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
 * - Blackjack and Video Poker cannot be generically enumerated from raw RPC
 *   with the local ABIs, but locally-known saved game IDs can still be
 *   rehydrated via `getGameInfo` during refresh/download.
 */
import { decodeEventLog, formatEther } from 'viem';
import {
  apechain,
  BEAR_DICE_CONTRACT,
  BLACKJACK_CONTRACT,
  ERC20_ABI,
  GAME_CONTRACT_ABI,
  GP_TOKEN_ABI,
  GP_TOKEN_CONTRACT,
  HISTORY_SCHEMA_VERSION,
  USER_INFO_ABI,
  USER_INFO_CONTRACT,
  VIDEO_POKER_CONTRACT,
  WAPE_TOKEN_CONTRACT,
} from './constants.js';
import { loadHistory, saveHistory, getHistoryFilePath } from './profile.js';
import { resolveHistoryGameName } from './history.js';
import { GAME_REGISTRY, resolveGameDisplayName } from '../registry.js';
import { formatGameVariantName, resolveConfiguredGameVariant } from './rtp.js';
import { sanitizeError } from './utils.js';
import {
  BLACKJACK_ABI,
  GameState as BlackjackGameState,
} from './stateful/blackjack/constants.js';
import {
  VIDEO_POKER_ABI,
  GameState as VideoPokerGameState,
} from './stateful/video-poker/constants.js';

const GAME_ENDED_EVENT = GAME_CONTRACT_ABI.find((item) => item.type === 'event' && item.name === 'GameEnded');

export const DEFAULT_ANALYSIS_CHUNK_SIZE = 50_000n;
export const DEFAULT_HISTORY_SYNC_CHUNK_SIZE = DEFAULT_ANALYSIS_CHUNK_SIZE;

const DEFAULT_BATCH_SIZE = 10;
const OK_SYNC_MSG = 'ok';
const UNSUPPORTED_SYNC_MSG = 'unsupported game fetch';
const EXECUTION_REVERTED_SYNC_MSG = 'execution reverted';
const MISSING_SETTLEMENT_SYNC_MSG = 'no settlement event found';
const MISSING_PLAY_TX_SYNC_MSG = 'missing play transaction hash';
const RECEIPT_LOOKUP_FAILED_SYNC_MSG = 'transaction receipt unavailable';
const STATEFUL_FETCH_FAILED_SYNC_MSG = 'stateful game fetch failed';
const STATEFUL_WRONG_OWNER_SYNC_MSG = 'stateful game belongs to a different wallet';
const STATEFUL_INCOMPLETE_SYNC_MSG = 'stateful game not settled';

const SUPPORTED_GAMES = GAME_REGISTRY.map(({ key, name, slug, contract }) => ({
  key,
  name,
  slug,
  contract,
}));

const SUPPORTED_CONTRACTS = SUPPORTED_GAMES.map((game) => game.contract);
const SUPPORTED_GAMES_BY_CONTRACT = new Map(
  SUPPORTED_GAMES.map((game) => [String(game.contract).toLowerCase(), game])
);

export const UNSUPPORTED_HISTORY_GAMES = [
  {
    key: 'blackjack',
    name: resolveGameDisplayName({ gameKey: 'blackjack', contract: BLACKJACK_CONTRACT, fallbackName: 'Blackjack' }),
    contract: BLACKJACK_CONTRACT,
    reason: 'No indexed per-user settlement event is available in the local contract ABI; saved local game IDs can still be refreshed via getGameInfo.',
  },
  {
    key: 'video-poker',
    name: resolveGameDisplayName({ gameKey: 'video-poker', contract: VIDEO_POKER_CONTRACT, fallbackName: 'Video Poker' }),
    contract: VIDEO_POKER_CONTRACT,
    reason: 'No indexed per-user settlement event is available in the local contract ABI; saved local game IDs can still be refreshed via getGameInfo.',
  },
];

const USER_GAME_ID_LOG_FALLBACKS = [
  {
    contract: BEAR_DICE_CONTRACT,
    topic0: '0xea32a03505fd9f04d664676d72295a86c5fb0465e69654751907ca305bc1d1c7',
  },
];

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

function toTopicAddress(address) {
  return `0x000000000000000000000000${String(address || '').toLowerCase().replace(/^0x/, '')}`;
}

function isUnsupportedHistoryContract(contract) {
  const normalized = String(contract || '').toLowerCase();
  return normalized === BLACKJACK_CONTRACT.toLowerCase()
    || normalized === VIDEO_POKER_CONTRACT.toLowerCase();
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
  return game && game.last_sync_on && typeof game.wager_wei === 'string' && typeof game.payout_wei === 'string';
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

export async function syncSavedStatefulHistoryGames(publicClient, existingGames, walletAddress, syncTimestamp) {
  const normalizedWallet = String(walletAddress || '').toLowerCase();
  const statefulGames = (Array.isArray(existingGames) ? existingGames : []).filter((game) => {
    const contract = String(game?.contract || '').toLowerCase();
    return contract === VIDEO_POKER_CONTRACT.toLowerCase()
      || contract === BLACKJACK_CONTRACT.toLowerCase();
  });

  if (statefulGames.length === 0) {
    return { games: [], diagnosticsByGameKey: new Map() };
  }

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
          args: [BigInt(game.gameId)],
        });
        return { game, raw, kind: 'video-poker', error: null };
      }

      if (contract === BLACKJACK_CONTRACT.toLowerCase()) {
        const raw = await publicClient.readContract({
          address: BLACKJACK_CONTRACT,
          abi: BLACKJACK_ABI,
          functionName: 'getGameInfo',
          args: [BigInt(game.gameId)],
        });
        return { game, raw, kind: 'blackjack', error: null };
      }

      return { game, raw: null, kind: 'unsupported', error: null };
    } catch (error) {
      return { game, raw: null, kind: 'error', error };
    }
  });

  for (const result of results) {
    const key = gameKey(result.game?.contract, result.game?.gameId);

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
      settledGames.push(buildVideoPokerSyncedHistoryGame(result.game, result.raw, syncTimestamp));
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
      settledGames.push(buildBlackjackSyncedHistoryGame(result.game, result.raw, syncTimestamp));
    }
  }

  sortGamesNewestFirst(settledGames);
  return { games: settledGames, diagnosticsByGameKey };
}

export async function diagnoseUnsyncedSupportedGames(publicClient, existingGames, syncedGames, syncTimestamp) {
  const diagnostics = new Map();
  const syncedKeys = new Set((Array.isArray(syncedGames) ? syncedGames : []).map((game) => gameKey(game.contract, game.gameId)));
  const txHashesToCheck = new Map();

  for (const game of Array.isArray(existingGames) ? existingGames : []) {
    const key = gameKey(game?.contract, game?.gameId);
    if (!key || syncedKeys.has(key) || isUnsupportedHistoryContract(game?.contract) || isEconomicallySyncedGame(game)) {
      continue;
    }

    const txHash = typeof game?.tx === 'string' ? game.tx.trim() : '';
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

async function collectSettlementLogs(publicClient, walletAddress, fromBlock, toBlock, chunkSize) {
  const endedLogs = [];

  for (let startBlock = fromBlock; startBlock <= toBlock; startBlock += chunkSize) {
    const endBlock = startBlock + chunkSize - 1n > toBlock
      ? toBlock
      : startBlock + chunkSize - 1n;

    const chunkLogs = await publicClient.getLogs({
      address: SUPPORTED_CONTRACTS,
      event: GAME_ENDED_EVENT,
      args: { user: walletAddress },
      fromBlock: startBlock,
      toBlock: endBlock,
    });

    endedLogs.push(...chunkLogs
      .filter((log) => !log.removed)
      .map((log) => ({ ...log, kind: 'game-ended' })));
  }

  const fallbackLogs = [];
  const userTopic = toTopicAddress(walletAddress);

  for (const fallback of USER_GAME_ID_LOG_FALLBACKS) {
    for (let startBlock = fromBlock; startBlock <= toBlock; startBlock += chunkSize) {
      const endBlock = startBlock + chunkSize - 1n > toBlock
        ? toBlock
        : startBlock + chunkSize - 1n;

      const chunkLogs = await publicClient.getLogs({
        address: fallback.contract,
        topics: [fallback.topic0, userTopic],
        fromBlock: startBlock,
        toBlock: endBlock,
      });

      fallbackLogs.push(...chunkLogs
        .filter((log) => !log.removed)
        .map((log) => ({
          ...log,
          kind: 'fallback-game-id',
          args: {
            user: walletAddress,
            gameId: BigInt(log.data),
          },
        })));
    }
  }

  const hydratedFallbackLogs = await hydrateFallbackGameIdLogs(publicClient, fallbackLogs, walletAddress);
  const mergedLogs = mergeSettlementSources([...endedLogs, ...hydratedFallbackLogs]);
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

  const hydratedLogs = [];

  for (const [contract, logs] of logsByContract.entries()) {
    const uniqueGameIds = [...new Set(logs.map((log) => String(log.args?.gameId ?? '')))]
      .filter(Boolean)
      .map((value) => BigInt(value));

    const results = await Promise.allSettled(uniqueGameIds.map(async (gameId) => {
      const [players, buyIns, payouts, timestamps, hasEndeds] = await publicClient.readContract({
        address: contract,
        abi: GAME_CONTRACT_ABI,
        functionName: 'getEssentialGameInfo',
        args: [[gameId]],
      });

      return {
        gameId: gameId.toString(),
        player: players[0],
        buyIn: buyIns[0],
        payout: payouts[0],
        timestamp: Number(timestamps[0]),
        settled: hasEndeds[0],
      };
    }));

    const infoByGameId = new Map();
    for (const result of results) {
      if (result.status === 'fulfilled') {
        infoByGameId.set(result.value.gameId, result.value);
      }
    }

    for (const log of logs) {
      const info = infoByGameId.get(String(log.args?.gameId ?? ''));
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

async function fetchTransactionMetadata(publicClient, settlementLogs) {
  const uniqueTransactionHashes = [...new Set(
    settlementLogs
      .map((log) => log.transactionHash)
      .filter(Boolean)
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

async function fetchBlockTimestamps(publicClient, settlementLogs) {
  const uniqueBlockNumbers = [...new Set(
    settlementLogs
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
  let wapeReceivedWei = 0n;

  if (!receipt?.logs?.length) {
    return { gpReceivedRaw, wapeReceivedWei };
  }

  for (const log of receipt.logs) {
    const tokenAddress = String(log.address || '').toLowerCase();
    if (tokenAddress !== GP_TOKEN_CONTRACT.toLowerCase() && tokenAddress !== WAPE_TOKEN_CONTRACT.toLowerCase()) {
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
      if (tokenAddress === GP_TOKEN_CONTRACT.toLowerCase()) {
        gpReceivedRaw += amount;
      } else if (tokenAddress === WAPE_TOKEN_CONTRACT.toLowerCase()) {
        wapeReceivedWei += amount;
      }
    } catch {
      continue;
    }
  }

  return { gpReceivedRaw, wapeReceivedWei };
}

function buildSettledGames(settlementLogs, transactionMetadata, blockTimestamps, walletAddress, syncTimestamp) {
  const normalizedWallet = String(walletAddress).toLowerCase();
  const games = [];
  let missingTransactionMetadata = 0;

  for (const log of settlementLogs) {
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
    const grossResultWei = payoutWei - wagerWei;
    const netResultWei = payoutWei - wagerWei - contractFeeWei - gasFeeWei;
    const chainTimestamp = log.chainTimestamp ?? (log.blockNumber ? blockTimestamps.get(log.blockNumber.toString()) ?? null : null);
    const { gpReceivedRaw, wapeReceivedWei } = decodeReceiptTokenTransfers(receipt, walletAddress);
    const lastSyncMsg = tx && receipt ? OK_SYNC_MSG : 'partial: missing transaction metadata';

    if (!tx || !receipt) {
      missingTransactionMetadata += 1;
    }

    games.push({
      contract: log.address,
      game: resolveGameDisplayName({
        gameKey: game?.key || null,
        contract: log.address,
        fallbackName: game?.name || resolveHistoryGameName(log.address),
      }),
      game_key: game?.key || 'unknown',
      game_url: game ? `https://www.ape.church/games/${game.slug}?id=${String(log.args?.gameId ?? '')}` : null,
      gameId: String(log.args?.gameId ?? ''),
      player: String(log.args?.user || walletAddress),
      transaction_from: tx?.from || null,
      sponsored_transaction: Boolean(tx?.from) && tx.from.toLowerCase() !== normalizedWallet,
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
      gross_result_wei: grossResultWei.toString(),
      gross_result_ape: toApeString(grossResultWei),
      pnl_ape: toApeString(netResultWei),
      contract_fee_wei: contractFeeWei.toString(),
      contract_fee_ape: toApeString(contractFeeWei),
      gas_fee_wei: gasFeeWei.toString(),
      gas_fee_ape: toApeString(gasFeeWei),
      net_result_wei: netResultWei.toString(),
      net_result_ape: toApeString(netResultWei),
      gp_received_raw: gpReceivedRaw.toString(),
      gp_received_display: gpReceivedRaw.toString(),
      wape_received_wei: wapeReceivedWei.toString(),
      wape_received_ape: toApeString(wapeReceivedWei),
      last_sync_on: syncTimestamp,
      last_sync_msg: lastSyncMsg,
    });
  }

  sortGamesNewestFirst(games);
  return { games, missingTransactionMetadata };
}

function hasDistinctPlayTx(game) {
  const tx = String(game?.tx || '').toLowerCase();
  const settlementTx = String(game?.settlement_tx || game?.tx || '').toLowerCase();
  return Boolean(tx && settlementTx && tx !== settlementTx);
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
  const preferExistingPlayTx = existingHasPlayTx && !syncedHasPlayTx;

  const merged = {
    ...existingGame,
    ...syncedGame,
    timestamp: syncedGame.timestamp || existingGame.timestamp || 0,
  };

  if (preferExistingPlayTx) {
    merged.tx = existingGame.tx;
    merged.transaction_from = existingGame.transaction_from ?? syncedGame.transaction_from ?? null;
    merged.sponsored_transaction = existingGame.sponsored_transaction ?? syncedGame.sponsored_transaction ?? false;
    merged.chain_timestamp = existingGame.chain_timestamp ?? syncedGame.chain_timestamp ?? null;
    merged.timestamp = existingGame.timestamp || syncedGame.timestamp || 0;
    merged.contract_fee_wei = existingGame.contract_fee_wei ?? syncedGame.contract_fee_wei ?? '0';
    merged.contract_fee_ape = existingGame.contract_fee_ape ?? syncedGame.contract_fee_ape ?? toApeString(0n);
    merged.gas_fee_wei = existingGame.gas_fee_wei ?? syncedGame.gas_fee_wei ?? '0';
    merged.gas_fee_ape = existingGame.gas_fee_ape ?? syncedGame.gas_fee_ape ?? toApeString(0n);
    merged.gp_received_raw = existingGame.gp_received_raw ?? syncedGame.gp_received_raw ?? '0';
    merged.gp_received_display = existingGame.gp_received_display ?? syncedGame.gp_received_display ?? '0';
    merged.wape_received_wei = existingGame.wape_received_wei ?? syncedGame.wape_received_wei ?? '0';
    merged.wape_received_ape = existingGame.wape_received_ape ?? syncedGame.wape_received_ape ?? toApeString(0n);
  }

  return recomputeHistoryGameEconomics(merged);
}

export function mergeDownloadedHistoryGames(existingGames, syncedGames, syncTimestamp, diagnosticsByGameKey = new Map()) {
  const mergedGames = new Map();

  for (const game of Array.isArray(existingGames) ? existingGames : []) {
    mergedGames.set(gameKey(game.contract, game.gameId), { ...game });
  }

  for (const game of syncedGames) {
    const key = gameKey(game.contract, game.gameId);
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

  try {
    const gpBalance = await publicClient.readContract({
      address: GP_TOKEN_CONTRACT,
      abi: GP_TOKEN_ABI,
      functionName: 'getCurrentEXP',
      args: [walletAddress],
    });
    result.current_gp_balance_raw = gpBalance.toString();
    result.current_gp_balance_display = gpBalance.toString();
  } catch {
    // Best effort: leave as n.a.
  }

  try {
    const wapeBalance = await publicClient.readContract({
      address: WAPE_TOKEN_CONTRACT,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [walletAddress],
    });
    result.current_wape_balance_wei = wapeBalance.toString();
    result.current_wape_balance_ape = toApeString(wapeBalance);
  } catch {
    // Best effort: leave as n.a.
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
    wapeReceivedWei: parseBigIntField(game.wape_received_wei),
    won: Boolean(game.won),
    push: Boolean(game.push),
    maxHitX: toMultiplierNumber(parseBigIntField(game.payout_wei), parseBigIntField(game.wager_wei)),
  }));
}

function resolveHistoryStatsIdentity(game) {
  const displayGame = resolveGameDisplayName({
    gameKey: game?.game_key || null,
    contract: game?.contract || null,
    fallbackName: game?.game || resolveHistoryGameName(game?.contract),
  });
  const resolvedVariant = resolveConfiguredGameVariant({
    game: game?.rtp_game || game?.game_key || displayGame,
    config: game?.rtp_config || game?.config || null,
    variantKey: game?.variant_key || null,
    variantLabel: game?.variant_label || null,
  });
  const baseGameKey = String(game?.game_key || resolvedVariant.gameKey || displayGame || 'unknown').trim().toLowerCase();
  const useResolvedVideoPokerVariant = resolvedVariant.gameKey === 'video-poker'
    && Boolean(resolvedVariant.variantKey)
    && Boolean(game?.rtp_config || game?.config);
  const useResolvedPlinkoVariant = (
    resolvedVariant.gameKey === 'jungle-plinko'
    || resolvedVariant.gameKey === 'cosmic-plinko'
  ) && Boolean(resolvedVariant.variantKey);
  const useResolvedCanonicalVariant = useResolvedVideoPokerVariant || useResolvedPlinkoVariant;
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
      : (game?.rtp_config || resolvedVariant.rtpConfig || game?.config || null),
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
  const syncedGames = allGames.filter(isEconomicallySyncedGame);
  const totalGames = allGames.length;
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

  for (const game of allGames) {
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

export async function downloadWalletHistory(
  publicClient,
  walletAddress,
  {
    fromBlock,
    toBlock,
    chunkSize = DEFAULT_HISTORY_SYNC_CHUNK_SIZE,
  } = {}
) {
  const normalizedWallet = String(walletAddress).toLowerCase();
  const history = loadHistory(normalizedWallet);
  const previousLastSyncedBlock = readHistoryLastSyncedBlock(history);
  const latestBlock = toBlock ?? await publicClient.getBlockNumber();
  const effectiveFromBlock = fromBlock ?? (previousLastSyncedBlock !== null ? previousLastSyncedBlock + 1n : 0n);
  const syncTimestamp = new Date().toISOString();

  let settlementLogs = [];
  let syncedGames = [];
  let missingTransactionMetadata = 0;

  if (effectiveFromBlock <= latestBlock) {
    settlementLogs = await collectSettlementLogs(
      publicClient,
      normalizedWallet,
      effectiveFromBlock,
      latestBlock,
      chunkSize
    );

    const [transactionMetadata, blockTimestamps] = await Promise.all([
      fetchTransactionMetadata(publicClient, settlementLogs),
      fetchBlockTimestamps(publicClient, settlementLogs),
    ]);
    const built = buildSettledGames(
      settlementLogs,
      transactionMetadata,
      blockTimestamps,
      normalizedWallet,
      syncTimestamp
    );
    syncedGames = built.games;
    missingTransactionMetadata = built.missingTransactionMetadata;
  }

  const statefulSync = await syncSavedStatefulHistoryGames(publicClient, history.games, normalizedWallet, syncTimestamp);
  const allSyncedGames = [...syncedGames, ...statefulSync.games];
  const diagnosticsByGameKey = combineDiagnosticsMaps(
    await diagnoseUnsyncedSupportedGames(publicClient, history.games, allSyncedGames, syncTimestamp),
    statefulSync.diagnosticsByGameKey
  );
  const mergedGames = mergeDownloadedHistoryGames(history.games, allSyncedGames, syncTimestamp, diagnosticsByGameKey);
  const nextLastSyncedBlock = previousLastSyncedBlock === null || latestBlock > previousLastSyncedBlock
    ? latestBlock
    : previousLastSyncedBlock;
  const nextHistory = {
    ...history,
    version: HISTORY_SCHEMA_VERSION,
    wallet: normalizedWallet,
    chain_id: apechain.id,
    last_synced_block: nextLastSyncedBlock.toString(),
    last_download_on: syncTimestamp,
    games: mergedGames,
    coverage: {
      supported_games: SUPPORTED_GAMES,
      unsupported_games: UNSUPPORTED_HISTORY_GAMES,
    },
  };

  saveHistory(nextHistory, normalizedWallet);

  const currentBalances = await readCurrentHistoryBalances(publicClient, normalizedWallet);
  const stats = summarizeHistoryGames(nextHistory, currentBalances);
  const existingKeys = new Set((history.games || []).map((game) => gameKey(game.contract, game.gameId)));
  const newUniqueGames = allSyncedGames.filter((game) => !existingKeys.has(gameKey(game.contract, game.gameId))).length;

  return {
    history: nextHistory,
    stats,
    sync: {
      wallet: normalizedWallet,
      file_path: getHistoryFilePath(normalizedWallet),
      from_block: effectiveFromBlock.toString(),
      to_block: latestBlock.toString(),
      latest_block: latestBlock.toString(),
      downloaded_games: settlementLogs.length,
      new_games: newUniqueGames,
      saved_games: nextHistory.games.length,
      missing_transaction_metadata: missingTransactionMetadata,
      unsupported_saved_games: nextHistory.games.filter((game) => isUnsupportedHistoryContract(game.contract)).length,
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
