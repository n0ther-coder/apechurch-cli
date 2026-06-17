/**
 * Transaction retry helpers for network/RPC resilience.
 */
import { sanitizeError } from './utils.js';

export const RESILIENT_LONG_RETRY_DELAYS_MS = Object.freeze([
  30_000,
  60_000,
  120_000,
  300_000,
  600_000,
]);

export const RESILIENT_NETWORK_RETRY_DELAYS_MS = Object.freeze([
  ...RESILIENT_LONG_RETRY_DELAYS_MS,
  900_000,
  1_800_000,
  3_600_000,
  3_600_000,
  3_600_000,
  3_600_000,
  3_600_000,
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectErrorText(error, seen = new Set()) {
  if (!error || seen.has(error)) return '';
  if (typeof error === 'string') return error;
  seen.add(error);

  const parts = [];
  for (const field of ['shortMessage', 'details', 'message', 'name', 'code']) {
    const value = error[field];
    if (typeof value === 'string' && value.trim()) parts.push(value.trim());
    else if (typeof value === 'number') parts.push(String(value));
  }
  if (Array.isArray(error.metaMessages)) {
    parts.push(...error.metaMessages.filter((value) => typeof value === 'string' && value.trim()));
  }
  for (const field of ['cause', 'error', 'data']) {
    if (error[field] && typeof error[field] === 'object') {
      const nested = collectErrorText(error[field], seen);
      if (nested) parts.push(nested);
    }
  }
  return parts.join('\n');
}

export function isTransientTransactionError(error) {
  const text = collectErrorText(error).toLowerCase();
  return [
    'timeout',
    'timed out',
    'failed to fetch',
    'could not coalesce',
    'network',
    'econnreset',
    'econnrefused',
    'enotfound',
    'socket hang up',
    'headers timeout',
    'rate limit',
    'too many requests',
    '429',
    '502',
    '503',
    '504',
  ].some((needle) => text.includes(needle));
}

export function isNetworkOutageTransactionError(error) {
  const text = collectErrorText(error).toLowerCase();
  return [
    'failed to fetch',
    'fetch failed',
    'network error',
    'network request failed',
    'econnrefused',
    'enotfound',
    'eai_again',
    'enetunreach',
    'ehostunreach',
    'host down',
    'host unreachable',
    'no route to host',
    'getaddrinfo',
    'could not resolve',
    'name resolution',
  ].some((needle) => text.includes(needle));
}

export function isNonRetryableTransactionError(error) {
  const text = collectErrorText(error).toLowerCase();
  return [
    'insufficient funds',
    'user rejected',
    'user denied',
    'transaction was rejected',
    'wrong password',
    'corrupted wallet',
    'invalid amount',
    'invalid bet',
    'invalid option',
  ].some((needle) => text.includes(needle));
}

export function isRevertedReceipt(receipt) {
  return receipt?.status === 'reverted' || receipt?.status === 0;
}

function getBroadcastRetryDelays({
  resilient = false,
  legacyDelayMs = 2_000,
  networkOutage = false,
} = {}) {
  if (!resilient) return [legacyDelayMs];
  return [
    legacyDelayMs,
    ...(networkOutage ? RESILIENT_NETWORK_RETRY_DELAYS_MS : RESILIENT_LONG_RETRY_DELAYS_MS),
  ];
}

function getRevertedRetryDelays({ resilient = false, legacyDelayMs = 3_000 } = {}) {
  return resilient ? [...RESILIENT_LONG_RETRY_DELAYS_MS] : [legacyDelayMs];
}

function buildPendingConfirmationResult(hash, error) {
  return {
    hash,
    receipt: null,
    pending: true,
    confirmationError: error,
  };
}

export async function retryBroadcast({
  send,
  resilient = false,
  legacyDelayMs = 2_000,
  onRetry = null,
  sleepFn = sleep,
}) {
  let lastError = null;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await send();
    } catch (error) {
      lastError = error;
      const networkOutage = isNetworkOutageTransactionError(error);
      const retryDelays = getBroadcastRetryDelays({
        resilient,
        legacyDelayMs,
        networkOutage,
      });
      const shouldRetry = resilient
        ? (networkOutage || isTransientTransactionError(error)) && !isNonRetryableTransactionError(error)
        : true;
      if (!shouldRetry || attempt >= retryDelays.length) {
        throw lastError;
      }
      const delayMs = retryDelays[attempt];
      if (typeof onRetry === 'function') {
        onRetry({
          attempt: attempt + 2,
          delayMs,
          error,
          reason: networkOutage ? 'network_outage' : 'broadcast_error',
        });
      }
      await sleepFn(delayMs);
    }
  }
}

export async function submitAndConfirmWithRetry({
  send,
  wait,
  resilient = false,
  retryReverted = false,
  legacyDelayMs = 3_000,
  onSubmitted = null,
  onReverted = null,
  onRetry = null,
  sleepFn = sleep,
}) {
  const revertedRetryDelays = getRevertedRetryDelays({ resilient, legacyDelayMs });
  let revertedAttempts = 0;

  while (true) {
    const hash = await retryBroadcast({
      send,
      resilient,
      legacyDelayMs,
      onRetry,
      sleepFn,
    });

    if (typeof onSubmitted === 'function') {
      onSubmitted(hash);
    }

    let receipt;
    try {
      receipt = await wait(hash);
    } catch (error) {
      return buildPendingConfirmationResult(hash, error);
    }

    if (!isRevertedReceipt(receipt)) {
      return { hash, receipt, pending: false };
    }

    const error = new Error('Transaction reverted on-chain');
    error.receipt = receipt;
    error.txHash = hash;

    if (
      !retryReverted
      || revertedAttempts >= revertedRetryDelays.length
    ) {
      throw error;
    }

    if (typeof onReverted === 'function') {
      onReverted({ hash, receipt });
    }

    const delayMs = revertedRetryDelays[revertedAttempts];
    revertedAttempts += 1;
    if (typeof onRetry === 'function') {
      onRetry({
        attempt: revertedAttempts + 1,
        delayMs,
        error,
        reason: 'reverted',
      });
    }
    await sleepFn(delayMs);
  }
}

export function formatRetryDelay(delayMs) {
  if (delayMs >= 3_600_000) {
    const hours = delayMs / 3_600_000;
    return Number.isInteger(hours) ? `${hours}h` : `${Math.round(delayMs / 60_000)}m`;
  }
  if (delayMs >= 60_000) {
    const minutes = delayMs / 60_000;
    return Number.isInteger(minutes) ? `${minutes}m` : `${Math.round(delayMs / 1000)}s`;
  }
  return `${Math.round(delayMs / 1000)}s`;
}

export function formatRetryReason(error) {
  return sanitizeError(error);
}
