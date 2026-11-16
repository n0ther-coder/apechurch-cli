import { describe, it } from 'node:test';
import assert from 'node:assert';

import { getBalanceWithRetry, withRetainedBalanceCheck } from '../../lib/wallet.js';

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
