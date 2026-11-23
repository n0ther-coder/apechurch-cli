import { describe, it } from 'node:test';
import assert from 'node:assert';

import { getBalanceWithRetry, withRetainedBalanceCheck } from '../../lib/wallet.js';
import { RESILIENT_INFRASTRUCTURE_RETRY_DELAYS_MS, retryInfrastructureRead } from '../../lib/tx-resilience.js';

describe('Wallet RPC helpers', () => {
  it('retries temporary HTTP server errors and rejects permanent responses', async () => {
    for (const [status, retryable] of [
      [401, false], [429, true], [500, true], [501, false], [502, true],
      [503, true], [504, true], [505, false], [508, false], [511, false], [524, true], [529, true],
    ]) {
      const error = Object.assign(new Error('HTTP request failed.'), { status });
      let calls = 0;
      const read = getBalanceWithRetry({
        async getBalance() {
          if (++calls === 1) throw error;
          return 123n;
        },
      }, '0x123', { attempts: 2, delayMs: 0 });

      if (retryable) assert.equal(await read, 123n, `HTTP ${status}`);
      else await assert.rejects(read, actual => actual === error, `HTTP ${status}`);
      assert.equal(calls, retryable ? 2 : 1, `HTTP ${status}`);
    }
  });

  it('uses the entire infrastructure schedule and surfaces the last read error', async () => {
    const error = new Error('HTTP response status: 529');
    const delays = [];
    let calls = 0;
    await assert.rejects(retryInfrastructureRead(async () => {
      calls += 1;
      throw error;
    }, { sleepFn: async delay => delays.push(delay) }), actual => actual === error);
    assert.deepEqual(delays, RESILIENT_INFRASTRUCTURE_RETRY_DELAYS_MS);
    assert.equal(calls, delays.length + 1);
  });

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


describe('retained balance checks before signing', () => {
  function setup(balance = 1000n) {
    const signed = [];
    const rpc = { getBalance: async () => balance, getGasPrice: async () => 2n,
      estimateContractGas: async () => 10n, estimateGas: async () => 10n };
    const wallet = { writeContract: async request => { signed.push(request); return 'hash'; },
      sendTransaction: async request => { signed.push(request); return 'hash'; } };
    return { signed, rpc, guarded: withRetainedBalanceCheck(wallet, rpc, { address: '0x123' }, 900n) };
  }
  it('does not call the signer when value fits but gas does not', async () => {
    const h = setup();
    await assert.rejects(h.guarded.writeContract({ value: 80n }), /INSUFFICIENT_CAPITAL/);
    assert.equal(h.signed.length, 0);
  });
  it('pins the checked gas and fee on the signed transaction at exact equality', async () => {
    const h = setup();
    await h.guarded.writeContract({ value: 76n });
    assert.equal(h.signed[0].gas, 12n);
    assert.equal(h.signed[0].gasPrice, 2n);
  });
  it('rechecks balance before another signature after fees were spent', async () => {
    const h = setup();
    await h.guarded.writeContract({ value: 76n });
    h.rpc.getBalance = async () => 999n;
    await assert.rejects(h.guarded.writeContract({ value: 76n }), /INSUFFICIENT_CAPITAL/);
    assert.equal(h.signed.length, 1);
  });
  it('uses the EIP-1559 maximum fee and also guards transfers', async () => {
    const h = setup();
    await assert.rejects(h.guarded.sendTransaction({ value: 81n, gas: 10n, maxFeePerGas: 2n }), /INSUFFICIENT_CAPITAL/);
    await h.guarded.sendTransaction({ value: 80n, gas: 10n, maxFeePerGas: 2n });
    assert.equal(h.signed[0].maxFeePerGas, 2n);
  });
});
