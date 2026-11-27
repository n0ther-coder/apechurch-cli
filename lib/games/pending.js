/**
 * @fileoverview Safe reconciliation for already-submitted stateless plays.
 *
 * A pending play has a known contract and game ID. Reconciliation only reads
 * that existing game; it never submits or retries a wager transaction.
 *
 * @module lib/games/pending
 */
import { formatEther } from 'viem';

import { SCRAP_FORGE_CONTRACT } from '../constants.js';
import { readStatelessSettlement } from './base.js';
import { saveGameToHistory } from '../profile.js';
import { sanitizeError } from '../utils.js';
import { getGameEconomicsFields, reconcileGameCosts } from '../game-costs.js';
import { aggregateEconomicsPayloads } from '../economics.js';

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const CONTRACT_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNonNegativeInteger(value, fallback, label) {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return resolved;
}

function parsePositiveInteger(value, fallback, label) {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return resolved;
}

function parsePriorAttempts(payload) {
  const attempts = Number(payload?.reconciliation?.attempts);
  return Number.isInteger(attempts) && attempts >= 0 ? attempts : 0;
}

function parsePriorReadErrors(payload) {
  const errors = Number(payload?.reconciliation?.read_errors);
  return Number.isInteger(errors) && errors >= 0 ? errors : 0;
}

export function getPendingPlayReference(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Pending play payload must be an object.');
  }

  const status = String(payload.status || '').trim().toLowerCase();
  if (status === 'complete') {
    return null;
  }
  if (status !== 'pending') {
    throw new Error(`Cannot reconcile play status "${status || 'unknown'}"; expected "pending".`);
  }

  const contract = String(payload.contract || '').trim();
  if (!CONTRACT_ADDRESS_RE.test(contract)) {
    throw new Error('Pending play payload is missing a valid contract address.');
  }

  const rawGameId = payload.gameId ?? payload.game_id;
  let gameId;
  try {
    gameId = BigInt(rawGameId);
  } catch {
    throw new Error('Pending play payload is missing a valid gameId.');
  }
  if (gameId < 0n) {
    throw new Error('Pending play gameId must be non-negative.');
  }

  return {
    contract,
    gameId,
    gameIdText: gameId.toString(),
  };
}

function buildReconciliation(payload, {
  attempts,
  readErrors,
  checkedAt,
  lastSuccessAt = null,
  lastError = null,
  lastErrorAt = null,
  historyError = null,
  status = payload.status,
}) {
  return {
    status,
    attempts: parsePriorAttempts(payload) + attempts,
    read_errors: parsePriorReadErrors(payload) + readErrors,
    last_checked_at_utc: checkedAt,
    last_success_at_utc: lastSuccessAt,
    last_error: lastError,
    last_error_at_utc: lastErrorAt,
    history_error: historyError,
  };
}

/**
 * Poll an existing stateless game until it settles or the supplied timeout
 * expires. This function is deliberately read-only with respect to the chain.
 */
export async function reconcilePendingPlay(payload, {
  publicClient,
  walletAddress = null,
  timeoutMs = 0,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  sleepFn = wait,
  nowFn = () => Date.now(),
  saveHistoryFn = saveGameToHistory,
} = {}) {
  if (payload?.loop && payload?.pending_play) {
    const settled = await reconcilePendingPlay(payload.pending_play, { publicClient,
      walletAddress, timeoutMs, pollIntervalMs, sleepFn, nowFn, saveHistoryFn });
    if (settled.status !== 'complete') return { ...payload, pending_play: settled };
    const games = [...(payload.games_detail ?? []).filter((game) => game.result), settled];
    const economics = aggregateEconomicsPayloads(games);
    return { ...payload, ...economics, status: 'complete', pending_play: null,
      pending_exposure_ape: '0', games_played: games.length, completed_games: games.length,
      games_detail: games, result: { ...economics,
        won: economics.pnl_wei === null ? null : BigInt(economics.pnl_wei) > 0n } };
  }
  if (String(payload?.status || '').trim().toLowerCase() === 'complete') {
    return payload;
  }
  if (!publicClient || typeof publicClient.readContract !== 'function') {
    throw new Error('Pending play reconciliation requires a public client.');
  }

  const reference = getPendingPlayReference(payload);
  const isForge = reference.contract.toLowerCase() === SCRAP_FORGE_CONTRACT.toLowerCase();
  const resolvedTimeoutMs = parseNonNegativeInteger(timeoutMs, 0, 'timeoutMs');
  const resolvedPollIntervalMs = parsePositiveInteger(
    pollIntervalMs,
    DEFAULT_POLL_INTERVAL_MS,
    'pollIntervalMs',
  );
  const startedAt = nowFn();
  const deadline = startedAt + resolvedTimeoutMs;
  let attempts = 0;
  let readErrors = 0;
  let lastError = null;
  let lastErrorAt = null;
  let lastSuccessAt = null;
  let lastAttemptStatus = 'pending';
  let checkedAt = new Date(startedAt).toISOString();
  let latestDetails;

  for (;;) {
    attempts += 1;
    checkedAt = new Date(nowFn()).toISOString();

    try {
      const { player, buyInWei, payoutWei, hasEnded, details } = await readStatelessSettlement(
        publicClient, reference.contract, reference.gameId,
      );

      if (
        player === undefined || hasEnded === undefined
        || ((!isForge || hasEnded) && (buyInWei === undefined || payoutWei === undefined))
      ) {
        throw new Error('Settlement lookup returned incomplete game information.');
      }
      if (
        walletAddress
        && player !== null
        && String(player).toLowerCase() !== String(walletAddress).toLowerCase()
      ) {
        const ownershipError = new Error(
          'Settlement lookup returned a game owned by another wallet.',
        );
        ownershipError.code = 'PENDING_PLAY_OWNER_MISMATCH';
        throw ownershipError;
      }
      if (isForge && buyInWei !== undefined && payload.wager_wei != null && buyInWei !== BigInt(payload.wager_wei)) {
        throw new Error('Scrap Forge settlement does not match the submitted wager.');
      }

      latestDetails = details;
      lastSuccessAt = checkedAt;
      lastAttemptStatus = 'pending';
      if (hasEnded) {
        const result = {
          ...(payload.result && typeof payload.result === 'object' ? payload.result : {}),
          buy_in_wei: buyInWei.toString(),
          buy_in_ape: formatEther(buyInWei),
          payout_wei: payoutWei.toString(),
          payout_ape: formatEther(payoutWei),
          ...(details ? { details } : {}),
        };
        let historyError = null;

        try {
          saveHistoryFn({
            contract: reference.contract,
            gameId: reference.gameIdText,
            timestamp: nowFn(),
            tx: payload.tx,
            game_key: payload.game || payload.game_key || null,
            config: payload.config || null,
            details,
            settled: true,
            wager_wei: buyInWei.toString(),
            payout_wei: payoutWei.toString(),
            contract_fee_wei: payload.contract_fee_wei ?? payload.vrf_fee_wei,
            last_sync_on: checkedAt,
            last_sync_msg: 'ok',
            walletAddress,
          });
        } catch (error) {
          historyError = sanitizeError(error);
        }

        const complete = {
          ...payload,
          status: 'complete',
          ...(details ? { details } : {}),
          result,
        };
        if (payload.accounting_version === 2 || Array.isArray(payload.costs?.transactions)) {
          await reconcileGameCosts({ publicClient, contract: reference.contract,
            gameId: reference.gameIdText, walletAddress });
          const economics = getGameEconomicsFields({ contract: reference.contract,
            gameId: reference.gameIdText, walletAddress, wagerWei: buyInWei, payoutWei });
          Object.assign(complete, economics);
          Object.assign(complete.result, economics);
        }
        complete.reconciliation = buildReconciliation(complete, {
          attempts,
          readErrors,
          checkedAt,
          lastSuccessAt,
          lastError,
          lastErrorAt,
          historyError,
          status: 'complete',
        });
        return complete;
      }
    } catch (error) {
      if (error?.code === 'PENDING_PLAY_OWNER_MISMATCH') {
        throw error;
      }
      readErrors += 1;
      lastError = sanitizeError(error);
      lastErrorAt = checkedAt;
      lastAttemptStatus = 'read_error';
    }

    const remainingMs = deadline - nowFn();
    if (remainingMs <= 0) break;
    await sleepFn(Math.min(resolvedPollIntervalMs, remainingMs));
  }

  return {
    ...payload,
    status: 'pending',
    ...(latestDetails ? { details: latestDetails } : {}),
    reconciliation: buildReconciliation(payload, {
      attempts,
      readErrors,
      checkedAt,
      lastSuccessAt,
      lastError,
      lastErrorAt,
      status: lastAttemptStatus,
    }),
  };
}
