/**
 * @fileoverview Safe reconciliation for already-submitted stateless plays.
 *
 * A pending play has a known contract and game ID. Reconciliation only reads
 * that existing game; it never submits or retries a wager transaction.
 *
 * @module lib/games/pending
 */
import { formatEther } from 'viem';

import { GAME_CONTRACT_ABI } from '../constants.js';
import { saveGameToHistory } from '../profile.js';
import { sanitizeError } from '../utils.js';

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
  if (String(payload?.status || '').trim().toLowerCase() === 'complete') {
    return payload;
  }
  if (!publicClient || typeof publicClient.readContract !== 'function') {
    throw new Error('Pending play reconciliation requires a public client.');
  }

  const reference = getPendingPlayReference(payload);
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

  for (;;) {
    attempts += 1;
    checkedAt = new Date(nowFn()).toISOString();

    try {
      const [players, buyIns, payouts, , hasEndeds] = await publicClient.readContract({
        address: reference.contract,
        abi: GAME_CONTRACT_ABI,
        functionName: 'getEssentialGameInfo',
        args: [[reference.gameId]],
      });
      const player = players?.[0];
      const buyInWei = buyIns?.[0];
      const payoutWei = payouts?.[0];
      const hasEnded = hasEndeds?.[0];

      if (
        player === undefined
        || buyInWei === undefined
        || payoutWei === undefined
        || hasEnded === undefined
      ) {
        throw new Error('Settlement lookup returned incomplete game information.');
      }
      if (
        walletAddress
        && String(player).toLowerCase() !== String(walletAddress).toLowerCase()
      ) {
        const ownershipError = new Error(
          'Settlement lookup returned a game owned by another wallet.',
        );
        ownershipError.code = 'PENDING_PLAY_OWNER_MISMATCH';
        throw ownershipError;
      }

      lastSuccessAt = checkedAt;
      lastAttemptStatus = 'pending';
      if (hasEnded) {
        const result = {
          ...(payload.result && typeof payload.result === 'object' ? payload.result : {}),
          buy_in_wei: buyInWei.toString(),
          buy_in_ape: formatEther(buyInWei),
          payout_wei: payoutWei.toString(),
          payout_ape: formatEther(payoutWei),
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
            settled: true,
            wager_wei: buyInWei.toString(),
            payout_wei: payoutWei.toString(),
            contract_fee_wei: payload.vrf_fee_wei,
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
          result,
        };
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
