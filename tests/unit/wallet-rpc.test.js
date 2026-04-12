import { describe, it } from 'node:test';
import assert from 'node:assert';

import { getBalanceWithRetry } from '../../lib/wallet.js';

describe('Wallet RPC helpers', () => {
  it('retries transient balance errors before succeeding', async () => {
    let calls = 0;
    const publicClient = {
      async getBalance() {
        calls++;
        if (calls < 3) {
          const error = new Error('The request timed out.');
          error.shortMessage = 'The request took too long to respond.';
          throw error;
        }
        return 123n;
      },
    };

    const balance = await getBalanceWithRetry(publicClient, '0x123', {
      attempts: 3,
      delayMs: 0,
    });

    assert.strictEqual(balance, 123n);
    assert.strictEqual(calls, 3);
  });

  it('does not retry non-transient balance errors', async () => {
    let calls = 0;
    const publicClient = {
      async getBalance() {
        calls++;
        throw new Error('execution reverted: nope');
      },
    };

    await assert.rejects(
      getBalanceWithRetry(publicClient, '0x123', {
        attempts: 3,
        delayMs: 0,
      }),
      /execution reverted: nope/
    );

    assert.strictEqual(calls, 1);
  });
});
