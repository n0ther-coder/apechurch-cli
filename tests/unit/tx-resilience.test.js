import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  RESILIENT_GENERIC_RETRY_DELAYS_MS,
  RESILIENT_INFRASTRUCTURE_RETRY_DELAYS_MS,
  RESILIENT_LONG_RETRY_DELAYS_MS,
  RESILIENT_NETWORK_RETRY_DELAYS_MS,
  TRANSACTION_RETRY_REASON,
  classifyTransactionRetry,
  formatRetryLogLine,
  retryBroadcast,
  submitAndConfirmWithRetry,
} from '../../lib/tx-resilience.js';

describe('Transaction resilience helpers', () => {
  it('retries transient broadcast errors before succeeding', async () => {
    let calls = 0;

    const hash = await retryBroadcast({
      resilient: true,
      legacyDelayMs: 0,
      sleepFn: async () => {},
      async send() {
        calls += 1;
        if (calls === 1) {
          const error = new Error('The request timed out.');
          error.shortMessage = 'Request timeout';
          throw error;
        }
        return '0xabc';
      },
    });

    assert.strictEqual(hash, '0xabc');
    assert.strictEqual(calls, 2);
  });

  it('does not retry non-retryable broadcast errors in resilient mode', async () => {
    let calls = 0;

    await assert.rejects(
      retryBroadcast({
        resilient: true,
        legacyDelayMs: 0,
        async send() {
          calls += 1;
          throw new Error('User rejected the request.');
        },
      }),
      /User rejected/
    );

    assert.strictEqual(calls, 1);
  });

  it('uses the generic resilient queue for generic transient broadcast errors', async () => {
    let calls = 0;
    const delays = [];

    await assert.rejects(
      retryBroadcast({
        resilient: true,
        legacyDelayMs: 0,
        sleepFn: async (delayMs) => delays.push(delayMs),
        async send() {
          calls += 1;
          throw new Error('The request timed out.');
        },
      }),
      /timed out/
    );

    assert.deepStrictEqual(delays, RESILIENT_GENERIC_RETRY_DELAYS_MS);
    assert.strictEqual(RESILIENT_LONG_RETRY_DELAYS_MS, RESILIENT_GENERIC_RETRY_DELAYS_MS);
    assert.strictEqual(calls, delays.length + 1);
  });

  it('uses the extended resilient queue when the RPC host is unreachable', async () => {
    let calls = 0;
    const delays = [];

    await assert.rejects(
      retryBroadcast({
        resilient: true,
        legacyDelayMs: 0,
        sleepFn: async (delayMs) => delays.push(delayMs),
        async send() {
          calls += 1;
          const error = new Error('getaddrinfo ENOTFOUND rpc.example');
          error.code = 'ENOTFOUND';
          throw error;
        },
      }),
      /ENOTFOUND/
    );

    assert.deepStrictEqual(delays, RESILIENT_INFRASTRUCTURE_RETRY_DELAYS_MS);
    assert.strictEqual(RESILIENT_NETWORK_RETRY_DELAYS_MS, RESILIENT_INFRASTRUCTURE_RETRY_DELAYS_MS);
    assert.strictEqual(calls, delays.length + 1);
  });

  it('treats temporary DNS failures as extended network outages', async () => {
    let calls = 0;
    const delays = [];

    await assert.rejects(
      retryBroadcast({
        resilient: true,
        legacyDelayMs: 0,
        sleepFn: async (delayMs) => delays.push(delayMs),
        async send() {
          calls += 1;
          const error = new Error('getaddrinfo EAI_AGAIN rpc.example');
          error.code = 'EAI_AGAIN';
          throw error;
        },
      }),
      /EAI_AGAIN/
    );

    assert.deepStrictEqual(delays, RESILIENT_INFRASTRUCTURE_RETRY_DELAYS_MS);
    assert.strictEqual(calls, delays.length + 1);
  });

  it('treats reset and timed-out connections as extended network outages', () => {
    for (const error of [
      Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
      Object.assign(new Error('connect ETIMEDOUT rpc.example'), { code: 'ETIMEDOUT' }),
    ]) {
      assert.deepStrictEqual(classifyTransactionRetry(error), {
        retryable: true,
        reason: TRANSACTION_RETRY_REASON.NETWORK_OUTAGE,
        contractMessage: null,
      });
    }
  });

  it('keeps the hard-coded resilient queues at the documented lengths and totals', () => {
    assert.strictEqual(RESILIENT_GENERIC_RETRY_DELAYS_MS.length, 17);
    assert.strictEqual(
      RESILIENT_GENERIC_RETRY_DELAYS_MS.reduce((sum, delay) => sum + delay, 0),
      29_310_000,
    );
    assert.strictEqual(RESILIENT_INFRASTRUCTURE_RETRY_DELAYS_MS.length, 35);
    assert.strictEqual(
      RESILIENT_INFRASTRUCTURE_RETRY_DELAYS_MS.reduce((sum, delay) => sum + delay, 0),
      86_400_000,
    );
  });

  it('classifies only the allowlisted pause guards as retryable contract conditions', () => {
    for (const message of [
      'execution reverted: PRICE TOO LOW, PvH GAMES PAUSED',
      'The contract function reverted with the following reason:\nAll Games Paused',
      'execution reverted: Paused',
    ]) {
      assert.deepStrictEqual(
        classifyTransactionRetry(new Error(message)),
        {
          retryable: true,
          reason: TRANSACTION_RETRY_REASON.CONTRACT_GUARD,
          contractMessage: message.includes('PRICE TOO LOW')
            ? 'PRICE TOO LOW, PvH GAMES PAUSED'
            : (message.includes('All Games') ? 'All Games Paused' : 'Paused'),
        },
      );
    }

    assert.deepStrictEqual(
      classifyTransactionRetry(new Error('execution reverted: RequestId In Use')),
      { retryable: false, reason: null, contractMessage: null },
    );
    assert.deepStrictEqual(
      classifyTransactionRetry(new Error('execution reverted: Not Paused')),
      { retryable: false, reason: null, contractMessage: null },
    );
  });

  it('uses the 24-hour queue for contract guards and resumes when the guard clears', async () => {
    let calls = 0;
    const retries = [];

    const hash = await retryBroadcast({
      resilient: true,
      sleepFn: async () => {},
      onRetry: (retry) => retries.push(retry),
      async send() {
        calls += 1;
        if (calls === 1) {
          throw new Error('execution reverted: PRICE TOO LOW, PvH GAMES PAUSED');
        }
        return '0xresolved';
      },
    });

    assert.strictEqual(hash, '0xresolved');
    assert.strictEqual(calls, 2);
    assert.strictEqual(retries.length, 1);
    assert.strictEqual(retries[0].delayMs, 180_000);
    assert.strictEqual(retries[0].reason, TRANSACTION_RETRY_REASON.CONTRACT_GUARD);
    assert.strictEqual(retries[0].contractMessage, 'PRICE TOO LOW, PvH GAMES PAUSED');
  });

  it('uses the 24-hour queue for RNG, out-of-gas, and RPC node failures', async () => {
    const cases = [
      ['execution reverted: VRF request temporarily unavailable', TRANSACTION_RETRY_REASON.RNG],
      ['execution reverted: out of gas', TRANSACTION_RETRY_REASON.OUT_OF_GAS],
      ['HTTP response status: 503 Service Unavailable', TRANSACTION_RETRY_REASON.RPC_NODE],
    ];

    for (const [message, expectedReason] of cases) {
      let calls = 0;
      const delays = [];
      const reasons = [];

      await assert.rejects(
        retryBroadcast({
          resilient: true,
          sleepFn: async (delayMs) => delays.push(delayMs),
          onRetry: (retry) => reasons.push(retry.reason),
          async send() {
            calls += 1;
            throw new Error(message);
          },
        }),
        new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      );

      assert.deepStrictEqual(delays, RESILIENT_INFRASTRUCTURE_RETRY_DELAYS_MS);
      assert.ok(reasons.every((reason) => reason === expectedReason));
      assert.strictEqual(calls, delays.length + 1);
    }
  });

  it('recognizes decoded RNG custom error names nested in provider data', () => {
    const error = new Error('Contract function failed');
    error.data = { errorName: 'RNGRequestTemporarilyUnavailable' };

    assert.deepStrictEqual(classifyTransactionRetry(error), {
      retryable: true,
      reason: TRANSACTION_RETRY_REASON.RNG,
      contractMessage: null,
    });
  });

  it('formats retry logs with the contract message and standardized timestamp', () => {
    const line = formatRetryLogLine({
      delayMs: 180_000,
      error: new Error('execution reverted: PRICE TOO LOW, PvH GAMES PAUSED'),
      reason: TRANSACTION_RETRY_REASON.CONTRACT_GUARD,
      contractMessage: 'PRICE TOO LOW, PvH GAMES PAUSED',
      retryAt: new Date(2026, 6, 18, 18, 36, 15),
    }, { colorTimestamp: false });

    assert.match(
      line,
      /^⚠️ Contract returns error message "PRICE TOO LOW, PvH GAMES PAUSED", Rechecking in 3m \(at 2026-JUL-18 18:36:15[+-]\d{4}\)\.$/,
    );
  });

  it('stops before broadcasting when a resilient retry signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;

    await assert.rejects(
      retryBroadcast({
        resilient: true,
        signal: controller.signal,
        async send() {
          calls += 1;
          return '0xnever';
        },
      }),
      (error) => error?.name === 'AbortError',
    );
    assert.strictEqual(calls, 0);
  });

  it('does not resend when confirmation fails after a transaction hash exists', async () => {
    let sends = 0;
    let waits = 0;

    const result = await submitAndConfirmWithRetry({
      resilient: true,
      legacyDelayMs: 0,
      async send() {
        sends += 1;
        return '0xsubmitted';
      },
      async wait() {
        waits += 1;
        throw new Error('Timed out while waiting for transaction receipt.');
      },
    });

    assert.strictEqual(result.hash, '0xsubmitted');
    assert.strictEqual(result.pending, true);
    assert.strictEqual(sends, 1);
    assert.strictEqual(waits, 1);
  });

  it('keeps the legacy single retry for reverted receipts', async () => {
    let sends = 0;

    const result = await submitAndConfirmWithRetry({
      resilient: false,
      retryReverted: true,
      legacyDelayMs: 0,
      async send() {
        sends += 1;
        return `0x${sends}`;
      },
      async wait() {
        return sends === 1
          ? { status: 'reverted' }
          : { status: 'success' };
      },
    });

    assert.strictEqual(result.hash, '0x2');
    assert.strictEqual(result.pending, false);
    assert.strictEqual(sends, 2);
  });

  it('treats numeric reverted receipts as reverted', async () => {
    let sends = 0;

    const result = await submitAndConfirmWithRetry({
      resilient: false,
      retryReverted: true,
      legacyDelayMs: 0,
      async send() {
        sends += 1;
        return `0x${sends}`;
      },
      async wait() {
        return sends === 1
          ? { status: 0 }
          : { status: 1 };
      },
    });

    assert.strictEqual(result.hash, '0x2');
    assert.strictEqual(result.pending, false);
    assert.strictEqual(sends, 2);
  });

  it('uses the generic resilient queue for repeatedly reverted receipts', async () => {
    let sends = 0;
    const delays = [];

    await assert.rejects(
      submitAndConfirmWithRetry({
        resilient: true,
        retryReverted: true,
        sleepFn: async (delayMs) => delays.push(delayMs),
        async send() {
          sends += 1;
          return `0x${sends}`;
        },
        async wait() {
          return { status: 'reverted' };
        },
      }),
      /reverted on-chain/,
    );

    assert.deepStrictEqual(delays, RESILIENT_GENERIC_RETRY_DELAYS_MS);
    assert.strictEqual(sends, RESILIENT_GENERIC_RETRY_DELAYS_MS.length + 1);
  });
});
