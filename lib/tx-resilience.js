/**
 * Transaction retry helpers for broadcast, contract, RNG, gas, network, and
 * RPC-node resilience.
 */
import { sanitizeError } from './utils.js';
import { formatTerminalTimestamp } from './terminal-time.js';
import { theme } from './theme.js';

/**
 * Generic transient broadcast errors and reverted receipts: 8h08m30s total.
 */
export const RESILIENT_GENERIC_RETRY_DELAYS_MS = Object.freeze([
  30_000,
  60_000,
  120_000,
  300_000,
  ...Array(6).fill(600_000),
  ...Array(7).fill(3_600_000),
]);

/**
 * Network/DNS outages, retryable contract/RNG guards, out-of-gas failures,
 * and RPC node errors: exactly 24 hours total.
 */
export const RESILIENT_INFRASTRUCTURE_RETRY_DELAYS_MS = Object.freeze([
  180_000,
  420_000,
  ...Array(5).fill(600_000),
  ...Array(10).fill(1_800_000),
  ...Array(18).fill(3_600_000),
]);

// Backward-compatible exported names for callers that imported the original
// resilient queues directly.
export const RESILIENT_LONG_RETRY_DELAYS_MS = RESILIENT_GENERIC_RETRY_DELAYS_MS;
export const RESILIENT_NETWORK_RETRY_DELAYS_MS = RESILIENT_INFRASTRUCTURE_RETRY_DELAYS_MS;
export const RESILIENT_CONTRACT_RETRY_DELAYS_MS = RESILIENT_INFRASTRUCTURE_RETRY_DELAYS_MS;

export const RETRYABLE_CONTRACT_GUARD_MESSAGES = Object.freeze([
  'PRICE TOO LOW, PvH GAMES PAUSED',
  'All Games Paused',
  'Paused',
]);

export const TRANSACTION_RETRY_REASON = Object.freeze({
  GENERIC: 'generic_transient',
  NETWORK_OUTAGE: 'network_outage',
  CONTRACT_GUARD: 'contract_guard',
  RNG: 'rng',
  OUT_OF_GAS: 'out_of_gas',
  RPC_NODE: 'rpc_node',
  REVERTED: 'reverted',
});

function createAbortError() {
  const error = new Error('Transaction retry aborted.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError();
}

function sleep(ms, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function collectErrorText(error, seen = new Set()) {
  if (!error || seen.has(error)) return '';
  if (typeof error === 'string') return error;
  seen.add(error);

  const parts = [];
  for (const field of ['shortMessage', 'details', 'message', 'reason', 'errorName', 'name', 'code']) {
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getRetryableContractGuardMessage(error) {
  const text = collectErrorText(error);

  for (const message of RETRYABLE_CONTRACT_GUARD_MESSAGES) {
    const pattern = new RegExp(
      `(?:^|\\n|(?:execution|transaction) reverted(?::|\\s)|reason:)\\s*["']?${escapeRegExp(message)}["'.]?(?:$|\\n)`,
      'i',
    );
    if (pattern.test(text)) return message;
  }
  return null;
}

export function isRetryableContractGuardError(error) {
  return getRetryableContractGuardMessage(error) !== null;
}

export function isRngTransactionError(error) {
  const text = collectErrorText(error).toLowerCase();
  return [
    /\brng(?:\b|[_a-z0-9])/,
    /\bvrf(?:\b|[_a-z0-9])/,
    /\brandomness(?:\b|[_a-z0-9])/,
    /\brandomizer(?:\b|[_a-z0-9])/,
    /\brandom number(?:\b|[_a-z0-9])/,
    /\bpyth\b.*\b(?:rng|random)/,
    /\boracle\b.*\b(?:rng|random)/,
  ].some((pattern) => pattern.test(text));
}

export function isOutOfGasTransactionError(error) {
  const text = collectErrorText(error).toLowerCase();
  return [
    'out of gas',
    'out-of-gas',
    'ran out of gas',
    'intrinsic gas too low',
    'gas required exceeds allowance',
    'exceeds block gas limit',
    'gas limit exceeded',
    'transaction would exceed gas limits',
  ].some((needle) => text.includes(needle));
}

export function isRpcNodeTransactionError(error) {
  const text = collectErrorText(error).toLowerCase();
  if (text.includes('execution reverted')) return false;
  const hasNodeMessage = [
    'rpcrequesterror',
    'rpc request failed',
    'rpc error',
    'json-rpc error',
    'internal json-rpc error',
    'internal error',
    'node error',
    'node is syncing',
    'node unavailable',
    'service unavailable',
    'bad gateway',
    'gateway timeout',
    'rate limit',
    'too many requests',
  ].some((needle) => text.includes(needle));
  const hasRetryableHttpStatus = /\b(?:http(?: status)?|status(?: code)?|response)\s*[:=]?\s*(?:429|50[0-4]|52[0-4])\b/i.test(text);
  return hasNodeMessage || hasRetryableHttpStatus;
}

export function isNetworkOutageTransactionError(error) {
  const text = collectErrorText(error).toLowerCase();
  return [
    'failed to fetch',
    'fetch failed',
    'network error',
    'network request failed',
    'econnreset',
    'econnrefused',
    'econnaborted',
    'etimedout',
    'epipe',
    'enotfound',
    'eai_again',
    'enetunreach',
    'ehostunreach',
    'socket hang up',
    'connection reset',
    'connection refused',
    'connection aborted',
    'connection closed',
    'connection terminated',
    'headers timeout',
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
  reason = TRANSACTION_RETRY_REASON.GENERIC,
} = {}) {
  if (!resilient) return [legacyDelayMs];
  return reason === TRANSACTION_RETRY_REASON.GENERIC
    ? RESILIENT_GENERIC_RETRY_DELAYS_MS
    : RESILIENT_INFRASTRUCTURE_RETRY_DELAYS_MS;
}

function getRevertedRetryDelays({ resilient = false, legacyDelayMs = 3_000 } = {}) {
  return resilient ? RESILIENT_GENERIC_RETRY_DELAYS_MS : [legacyDelayMs];
}

export function classifyTransactionRetry(error) {
  if (isNonRetryableTransactionError(error)) {
    return { retryable: false, reason: null, contractMessage: null };
  }

  const contractMessage = getRetryableContractGuardMessage(error);
  if (contractMessage) {
    return {
      retryable: true,
      reason: TRANSACTION_RETRY_REASON.CONTRACT_GUARD,
      contractMessage,
    };
  }
  if (isOutOfGasTransactionError(error)) {
    return { retryable: true, reason: TRANSACTION_RETRY_REASON.OUT_OF_GAS, contractMessage: null };
  }
  if (isRngTransactionError(error)) {
    return { retryable: true, reason: TRANSACTION_RETRY_REASON.RNG, contractMessage: null };
  }
  if (isNetworkOutageTransactionError(error)) {
    return { retryable: true, reason: TRANSACTION_RETRY_REASON.NETWORK_OUTAGE, contractMessage: null };
  }
  if (isRpcNodeTransactionError(error)) {
    return { retryable: true, reason: TRANSACTION_RETRY_REASON.RPC_NODE, contractMessage: null };
  }
  if (isTransientTransactionError(error)) {
    return { retryable: true, reason: TRANSACTION_RETRY_REASON.GENERIC, contractMessage: null };
  }
  return { retryable: false, reason: null, contractMessage: null };
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
  signal = null,
}) {
  let lastError = null;

  for (let attempt = 0; ; attempt += 1) {
    throwIfAborted(signal);
    try {
      return await send();
    } catch (error) {
      lastError = error;
      const classification = classifyTransactionRetry(error);
      const retryDelays = getBroadcastRetryDelays({
        resilient,
        legacyDelayMs,
        reason: classification.reason,
      });
      const shouldRetry = resilient
        ? classification.retryable
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
          reason: classification.reason || TRANSACTION_RETRY_REASON.GENERIC,
          contractMessage: classification.contractMessage,
          retryAt: new Date(Date.now() + delayMs),
        });
      }
      await sleepFn(delayMs, { signal });
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
  signal = null,
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
      signal,
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
        reason: TRANSACTION_RETRY_REASON.REVERTED,
        contractMessage: null,
        retryAt: new Date(Date.now() + delayMs),
      });
    }
    await sleepFn(delayMs, { signal });
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

function stripTransactionRevertPrefix(message) {
  return String(message || '')
    .replace(/^Transaction reverted:\s*/i, '')
    .replace(/^Transaction reverted by contract\.?$/i, 'Transaction reverted on-chain')
    .trim();
}

export function formatRetryLogLine(retry, { colorTimestamp = true } = {}) {
  const retryAt = retry?.retryAt instanceof Date
    ? retry.retryAt
    : new Date(Date.now() + Number(retry?.delayMs || 0));
  const rawTimestamp = formatTerminalTimestamp(retryAt) || 'unknown timestamp';
  const timestamp = colorTimestamp ? theme.cyan(rawTimestamp) : rawTimestamp;
  const delay = formatRetryDelay(Number(retry?.delayMs || 0));
  const sanitized = stripTransactionRevertPrefix(formatRetryReason(retry?.error));

  let message;
  if (retry?.reason === TRANSACTION_RETRY_REASON.CONTRACT_GUARD) {
    message = retry.contractMessage || sanitized;
    return `⚠️ Contract returns error message "${message}", Rechecking in ${delay} (at ${timestamp}).`;
  }
  if (retry?.reason === TRANSACTION_RETRY_REASON.RNG) {
    return `⚠️ Contract/RNG returns error message "${sanitized}", Rechecking in ${delay} (at ${timestamp}).`;
  }
  if (retry?.reason === TRANSACTION_RETRY_REASON.REVERTED) {
    return `⚠️ Transaction reverted on-chain, Rechecking in ${delay} (at ${timestamp}).`;
  }
  if (retry?.reason === TRANSACTION_RETRY_REASON.NETWORK_OUTAGE) {
    return `⚠️ Network/DNS error "${sanitized}", Rechecking in ${delay} (at ${timestamp}).`;
  }
  if (retry?.reason === TRANSACTION_RETRY_REASON.RPC_NODE) {
    return `⚠️ RPC node error "${sanitized}", Rechecking in ${delay} (at ${timestamp}).`;
  }
  if (retry?.reason === TRANSACTION_RETRY_REASON.OUT_OF_GAS) {
    return `⚠️ Out-of-gas error "${sanitized}", Rechecking in ${delay} (at ${timestamp}).`;
  }
  return `⚠️ Transaction error "${sanitized}", Rechecking in ${delay} (at ${timestamp}).`;
}

export function logTransactionRetry(retry, { stream = process.stderr } = {}) {
  stream.write(`${formatRetryLogLine(retry)}\n`);
}
