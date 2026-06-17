import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  RESILIENT_LONG_RETRY_DELAYS_MS,
  RESILIENT_NETWORK_RETRY_DELAYS_MS,
  retryBroadcast,
  submitAndConfirmWithRetry,
} from '../../lib/tx-resilience.js';

describe('Transaction resilience helpers', () => {
  it('retries transient broadcast errors before succeeding', async () => {
    let calls = 0;

    const hash = await retryBroadcast({
      resilient: true,
      legacyDelayMs: 0,
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

  it('uses the short resilient queue for generic transient broadcast errors', async () => {
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

    assert.deepStrictEqual(delays, [0, ...RESILIENT_LONG_RETRY_DELAYS_MS]);
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

    assert.deepStrictEqual(delays, [0, ...RESILIENT_NETWORK_RETRY_DELAYS_MS]);
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

    assert.deepStrictEqual(delays, [0, ...RESILIENT_NETWORK_RETRY_DELAYS_MS]);
    assert.strictEqual(calls, delays.length + 1);
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
});
