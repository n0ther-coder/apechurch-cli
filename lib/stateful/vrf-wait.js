/**
 * Shared recovery loop for stateful games waiting on an existing VRF request.
 *
 * A VRF timeout is not a failed wager: the transaction may already be
 * confirmed and must never be replaced just because the callback is late.
 */
import { BINARY_NAME } from '../constants.js';
import { loadHistory } from '../profile.js';
import { formatTerminalTimestamp } from '../terminal-time.js';
import {
  classifyTransactionRetry,
  formatRetryDelay,
  RESILIENT_INFRASTRUCTURE_RETRY_DELAYS_MS,
} from '../tx-resilience.js';
import { sanitizeError } from '../utils.js';

export const VRF_REQUESTED_TOPIC = '0xa84a2cb53f607d38de59c343ca8d84bef59bb205b6a50aaf84658c78975742ac';

const DEFAULT_EXPLORER_URL = 'https://apescan.io';
const DEFAULT_RESILIENT_INTERVAL_MS = 3_600_000;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAddress(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^0x[a-fA-F0-9]{40}$/.test(text) ? text : null;
}

function normalizeTransactionHash(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^0x[a-fA-F0-9]{64}$/.test(text) ? text : null;
}

function topicToAddress(topic) {
  const text = typeof topic === 'string' ? topic.trim() : '';
  if (!/^0x[a-fA-F0-9]{64}$/.test(text)) return null;
  return normalizeAddress(`0x${text.slice(-40)}`);
}

function normalizeTimestampMs(value) {
  if (typeof value === 'bigint') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric * 1000 : null;
  }
  if (typeof value === 'string' && /^0x[a-fA-F0-9]+$/.test(value)) {
    const numeric = Number.parseInt(value, 16);
    return Number.isFinite(numeric) ? numeric * 1000 : null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
}

function findHistoryEntry({ walletAddress, gameContract, gameId }) {
  if (!walletAddress || !gameContract || gameId === null || gameId === undefined) return null;
  const contract = String(gameContract).toLowerCase();
  const id = String(gameId);
  return loadHistory(walletAddress).games.find((entry) => (
    String(entry?.contract || '').toLowerCase() === contract
    && String(entry?.game_id ?? entry?.gameId ?? '') === id
  )) || null;
}

function getExplorerUrl(publicClient) {
  return String(publicClient?.chain?.blockExplorers?.default?.url || DEFAULT_EXPLORER_URL).replace(/\/$/, '');
}

function formatDuration(durationMs) {
  let seconds = Math.max(0, Math.floor(Number(durationMs || 0) / 1000));
  const days = Math.floor(seconds / 86_400);
  seconds %= 86_400;
  const hours = Math.floor(seconds / 3_600);
  seconds %= 3_600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.slice(0, 3).join(' ');
}

function formatLinkedValue(label, value, url) {
  if (!value) return null;
  return `${label}: ${value}${url ? ` (${url})` : ''}`;
}

function getReceiptStatus(receipt) {
  if (receipt?.status === 'success' || receipt?.status === 1 || receipt?.status === '0x1') return 'success';
  if (receipt?.status === 'reverted' || receipt?.status === 0 || receipt?.status === '0x0') return 'reverted';
  return null;
}

async function readReceiptContext(publicClient, transactionHash) {
  if (!transactionHash || typeof publicClient?.getTransactionReceipt !== 'function') return {};
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: transactionHash });
    const logs = Array.isArray(receipt?.logs) ? receipt.logs : [];
    const requestLog = logs.find((log) => String(log?.topics?.[0] || '').toLowerCase() === VRF_REQUESTED_TOPIC);
    let confirmedAtMs = normalizeTimestampMs(receipt?.blockTimestamp);
    if (!confirmedAtMs && receipt?.blockNumber !== undefined && typeof publicClient?.getBlock === 'function') {
      try {
        const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
        confirmedAtMs = normalizeTimestampMs(block?.timestamp);
      } catch {
        // The transaction and contract links are still useful without a block timestamp.
      }
    }
    const requestIdHex = requestLog?.topics?.[1] || null;
    let requestId = null;
    try {
      requestId = requestIdHex ? BigInt(requestIdHex).toString() : null;
    } catch {
      requestId = null;
    }
    return {
      receiptStatus: getReceiptStatus(receipt),
      confirmedAtMs,
      vrfCoordinator: normalizeAddress(requestLog?.address),
      vrfConsumer: topicToAddress(requestLog?.topics?.[2]),
      requestId,
      requestIdHex,
    };
  } catch {
    return {};
  }
}

async function resolveWaitContext({
  publicClient,
  gameId,
  gameContract,
  walletAddress,
  transactionHash,
  fallbackStartedAtMs,
}) {
  const historyEntry = findHistoryEntry({ walletAddress, gameContract, gameId });
  const resolvedTransactionHash = normalizeTransactionHash(transactionHash)
    || normalizeTransactionHash(historyEntry?.settlement_tx)
    || normalizeTransactionHash(historyEntry?.play_tx)
    || normalizeTransactionHash(historyEntry?.tx);
  const receiptContext = await readReceiptContext(publicClient, resolvedTransactionHash);
  return {
    ...receiptContext,
    transactionHash: resolvedTransactionHash,
    waitingSinceMs: receiptContext.confirmedAtMs
      || normalizeTimestampMs(historyEntry?.timestamp)
      || fallbackStartedAtMs,
    explorerUrl: getExplorerUrl(publicClient),
  };
}

function buildManualChecks(context, gameContract) {
  const explorer = context.explorerUrl;
  const checks = [
    formatLinkedValue(
      'transaction',
      context.transactionHash,
      context.transactionHash ? `${explorer}/tx/${context.transactionHash}` : null,
    ),
    formatLinkedValue(
      'game contract',
      gameContract,
      gameContract ? `${explorer}/address/${gameContract}` : null,
    ),
    formatLinkedValue(
      'VRF coordinator',
      context.vrfCoordinator,
      context.vrfCoordinator ? `${explorer}/address/${context.vrfCoordinator}` : null,
    ),
    formatLinkedValue(
      'VRF consumer',
      context.vrfConsumer,
      context.vrfConsumer ? `${explorer}/address/${context.vrfConsumer}` : null,
    ),
    context.requestId
      ? `VRF request ID: ${context.requestId}${context.requestIdHex ? ` (${context.requestIdHex})` : ''}`
      : null,
  ].filter(Boolean);
  return checks.length > 0 ? `Manual checks — ${checks.join('; ')}` : null;
}

function buildTimeoutMessage({
  gameName,
  gameKey,
  gameId,
  gameContract,
  context,
  nowMs,
  lastReadError,
}) {
  const waited = formatDuration(nowMs - context.waitingSinceMs);
  const readStatus = lastReadError
    ? ` The latest state read failed with "${sanitizeError(lastReadError)}".`
    : context.receiptStatus === 'success'
      ? ' The confirmed transaction has not advanced the on-chain game state yet.'
      : context.transactionHash
        ? ' The submitted transaction is not confirmed yet, or its VRF callback has not advanced the on-chain game state.'
        : ' The on-chain game state is still waiting for its VRF callback.';
  const manualChecks = buildManualChecks(context, gameContract);
  const resume = gameKey
    ? ` Resume with "${BINARY_NAME} ${gameKey} resume --resilient"; the existing game will be checked before any new wager.`
    : '';
  return [
    `Timeout waiting for VRF: ${gameName} game ${gameId} has been waiting ${waited}.`,
    `${readStatus} No replacement wager or action will be submitted.${resume}`,
    manualChecks,
  ].filter(Boolean).join(' ');
}

function buildStateReadMessage({ gameName, gameId, gameContract, context, error }) {
  const manualChecks = buildManualChecks(context, gameContract);
  return [
    `Unable to read ${gameName} game ${gameId}: ${sanitizeError(error)}.`,
    'This error is not classified as recoverable, so the command is stopping without submitting a replacement transaction.',
    manualChecks,
  ].filter(Boolean).join(' ');
}

export class StatefulVrfTimeoutError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'StatefulVrfTimeoutError';
    this.code = 'STATEFUL_VRF_TIMEOUT';
    this.retryable = true;
    this.details = details;
  }
}

export class StatefulStateReadError extends Error {
  constructor(message, details = {}, cause = null) {
    super(message, cause ? { cause } : undefined);
    this.name = 'StatefulStateReadError';
    this.code = 'STATEFUL_STATE_READ_FAILED';
    this.retryable = false;
    this.details = details;
  }
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error('VRF wait aborted.');
  error.name = 'AbortError';
  throw error;
}

/**
 * Poll an already-submitted stateful game until its VRF-dependent state advances.
 * In resilient mode the last infrastructure interval repeats indefinitely; an
 * outstanding wager is exposure to reconcile, not a transaction to resubmit.
 */
export async function waitForVrfState({
  publicClient,
  gameId,
  gameName,
  gameKey,
  gameContract,
  walletAddress = null,
  transactionHash = null,
  readState,
  isAwaiting,
  resilient = false,
  pollIntervalMs = 2_000,
  timeoutMs = 120_000,
  retryDelaysMs = RESILIENT_INFRASTRUCTURE_RETRY_DELAYS_MS,
  onPoll = null,
  onRetry = null,
  sleepFn = defaultSleep,
  nowFn = Date.now,
  stream = process.stderr,
  signal = null,
}) {
  if (typeof readState !== 'function' || typeof isAwaiting !== 'function') {
    throw new TypeError('waitForVrfState requires readState and isAwaiting functions.');
  }

  const startedAtMs = nowFn();
  const normalizedTimeoutMs = Math.max(0, Number(timeoutMs) || 0);
  const normalizedPollIntervalMs = Math.max(1, Number(pollIntervalMs) || 2_000);
  let lastState = null;
  let lastReadError = null;
  let observedState = false;
  let pollAttempt = 0;

  while (true) {
    throwIfAborted(signal);
    try {
      lastState = await readState();
      lastReadError = null;
      observedState = true;
      if (!isAwaiting(lastState)) return lastState;
    } catch (error) {
      lastReadError = error;
      const retryable = classifyTransactionRetry(error).retryable;
      if (!retryable && !observedState) {
        const context = await resolveWaitContext({
          publicClient,
          gameId,
          gameContract,
          walletAddress,
          transactionHash,
          fallbackStartedAtMs: startedAtMs,
        });
        if (!context.transactionHash || context.receiptStatus === 'reverted') {
          const stateError = context.receiptStatus === 'reverted'
            ? new Error('The tracked transaction reverted on-chain.')
            : error;
          throw new StatefulStateReadError(
            buildStateReadMessage({ gameName, gameId, gameContract, context, error: stateError }),
            { gameId: String(gameId), gameContract, ...context },
            stateError,
          );
        }
      }
    }

    if (typeof onPoll === 'function') onPoll(lastState, pollAttempt);
    pollAttempt += 1;
    const elapsedMs = nowFn() - startedAtMs;
    if (elapsedMs >= normalizedTimeoutMs) break;
    await sleepFn(Math.min(normalizedPollIntervalMs, normalizedTimeoutMs - elapsedMs), { signal });
  }

  let context = await resolveWaitContext({
    publicClient,
    gameId,
    gameContract,
    walletAddress,
    transactionHash,
    fallbackStartedAtMs: startedAtMs,
  });
  if (context.receiptStatus === 'reverted') {
    const receiptError = new Error('The tracked transaction reverted on-chain.');
    throw new StatefulStateReadError(
      buildStateReadMessage({ gameName, gameId, gameContract, context, error: receiptError }),
      { gameId: String(gameId), gameContract, ...context },
      receiptError,
    );
  }

  const initialMessage = buildTimeoutMessage({
    gameName,
    gameKey,
    gameId,
    gameContract,
    context,
    nowMs: nowFn(),
    lastReadError,
  });
  if (!resilient) {
    throw new StatefulVrfTimeoutError(initialMessage, {
      gameId: String(gameId),
      gameContract,
      waitedMs: Math.max(0, nowFn() - context.waitingSinceMs),
      ...context,
    });
  }

  const delays = Array.isArray(retryDelaysMs) && retryDelaysMs.length > 0
    ? retryDelaysMs.map((delay) => Math.max(1, Number(delay) || 1))
    : [DEFAULT_RESILIENT_INTERVAL_MS];

  for (let retryIndex = 0; ; retryIndex += 1) {
    throwIfAborted(signal);
    const delayMs = delays[Math.min(retryIndex, delays.length - 1)];
    const retryAt = new Date(nowFn() + delayMs);
    const message = buildTimeoutMessage({
      gameName,
      gameKey,
      gameId,
      gameContract,
      context,
      nowMs: nowFn(),
      lastReadError,
    });
    const line = `⚠️ ${message}, Rechecking in ${formatRetryDelay(delayMs)} (at ${formatTerminalTimestamp(retryAt)}).`;
    if (typeof onRetry === 'function') {
      onRetry({ retryIndex, delayMs, retryAt, message, line, context });
    }
    stream.write(`${line}\n`);
    await sleepFn(delayMs, { signal });

    try {
      lastState = await readState();
      lastReadError = null;
      observedState = true;
      if (!isAwaiting(lastState)) {
        const waited = formatDuration(nowFn() - context.waitingSinceMs);
        stream.write(`✅ VRF resolved for ${gameName} game ${gameId} after ${waited}. Resuming from the existing on-chain state.\n`);
        return lastState;
      }
    } catch (error) {
      lastReadError = error;
      if (!classifyTransactionRetry(error).retryable && !observedState && !context.transactionHash) {
        throw new StatefulStateReadError(
          buildStateReadMessage({ gameName, gameId, gameContract, context, error }),
          { gameId: String(gameId), gameContract, ...context },
          error,
        );
      }
    }

    if (typeof onPoll === 'function') onPoll(lastState, pollAttempt);
    pollAttempt += 1;

    // Refresh receipt-derived diagnostics in case the first lookup raced the transaction.
    if (!context.confirmedAtMs || !context.vrfCoordinator) {
      context = await resolveWaitContext({
        publicClient,
        gameId,
        gameContract,
        walletAddress,
        transactionHash: context.transactionHash || transactionHash,
        fallbackStartedAtMs: context.waitingSinceMs,
      });
      if (context.receiptStatus === 'reverted') {
        const receiptError = new Error('The tracked transaction reverted on-chain.');
        throw new StatefulStateReadError(
          buildStateReadMessage({ gameName, gameId, gameContract, context, error: receiptError }),
          { gameId: String(gameId), gameContract, ...context },
          receiptError,
        );
      }
    }
  }
}

export const vrfWaitInternals = Object.freeze({
  buildManualChecks,
  buildTimeoutMessage,
  formatDuration,
  normalizeTimestampMs,
  resolveWaitContext,
});
