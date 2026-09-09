import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseEther } from 'viem';

import {
  getPendingPlayReference,
  reconcilePendingPlay,
} from '../../lib/games/pending.js';

const CONTRACT = '0x1111111111111111111111111111111111111111';

function pendingPayload(overrides = {}) {
  return {
    status: 'pending',
    game: 'speed-keno',
    contract: CONTRACT,
    tx: `0x${'2'.repeat(64)}`,
    gameId: '42',
    config: { picks: 5, split: 1 },
    wager_wei: parseEther('1').toString(),
    vrf_fee_wei: parseEther('0.01').toString(),
    result: null,
    ...overrides,
  };
}

describe('Pending play reconciliation', () => {
  it('extracts the immutable reference for a known pending play', () => {
    assert.deepStrictEqual(getPendingPlayReference(pendingPayload()), {
      contract: CONTRACT,
      gameId: 42n,
      gameIdText: '42',
    });
  });

  it('settles an existing game without submitting another transaction', async () => {
    const reads = [];
    const historyWrites = [];
    const publicClient = {
      async readContract(request) {
        reads.push(request);
        return [
          ['0x2222222222222222222222222222222222222222'],
          [parseEther('1')],
          [parseEther('1.5')],
          [1n],
          [true],
        ];
      },
    };

    const result = await reconcilePendingPlay(pendingPayload(), {
      publicClient,
      walletAddress: '0x2222222222222222222222222222222222222222',
      nowFn: () => 1_000,
      saveHistoryFn: (entry) => historyWrites.push(entry),
    });

    assert.strictEqual(reads.length, 1);
    assert.strictEqual(reads[0].functionName, 'getEssentialGameInfo');
    assert.deepStrictEqual(reads[0].args, [[42n]]);
    assert.strictEqual(result.status, 'complete');
    assert.strictEqual(result.tx, pendingPayload().tx);
    assert.strictEqual(result.result.buy_in_ape, '1');
    assert.strictEqual(result.result.payout_ape, '1.5');
    assert.deepStrictEqual(result.reconciliation, {
      status: 'complete',
      attempts: 1,
      read_errors: 0,
      last_checked_at_utc: new Date(1_000).toISOString(),
      last_success_at_utc: new Date(1_000).toISOString(),
      last_error: null,
      last_error_at_utc: null,
      history_error: null,
    });
    assert.strictEqual(historyWrites.length, 1);
    assert.strictEqual(historyWrites[0].gameId, '42');
    assert.strictEqual(historyWrites[0].settled, true);
    assert.strictEqual(historyWrites[0].payout_wei, parseEther('1.5').toString());
  });

  it('keeps a known play pending across read failures and accumulates attempts', async () => {
    let now = 5_000;
    let reads = 0;
    const result = await reconcilePendingPlay(pendingPayload({
      reconciliation: { attempts: 4 },
    }), {
      publicClient: {
        async readContract() {
          reads += 1;
          throw new Error('RPC temporarily unavailable');
        },
      },
      timeoutMs: 2_000,
      pollIntervalMs: 1_000,
      nowFn: () => now,
      sleepFn: async (ms) => {
        now += ms;
      },
      saveHistoryFn: () => assert.fail('pending reads must not update settlement history'),
    });

    assert.strictEqual(reads, 3);
    assert.strictEqual(result.status, 'pending');
    assert.strictEqual(result.tx, pendingPayload().tx);
    assert.strictEqual(result.gameId, '42');
    assert.deepStrictEqual(result.reconciliation, {
      status: 'read_error',
      attempts: 7,
      read_errors: 3,
      last_checked_at_utc: new Date(7_000).toISOString(),
      last_success_at_utc: null,
      last_error: 'RPC temporarily unavailable',
      last_error_at_utc: new Date(7_000).toISOString(),
      history_error: null,
    });
  });

  it('fails closed for a game owned by another wallet', async () => {
    await assert.rejects(
      reconcilePendingPlay(pendingPayload(), {
        publicClient: {
          async readContract() {
            return [
              ['0x3333333333333333333333333333333333333333'],
              [parseEther('1')],
              [parseEther('2')],
              [1n],
              [true],
            ];
          },
        },
        walletAddress: '0x2222222222222222222222222222222222222222',
        nowFn: () => 1_000,
        saveHistoryFn: () => assert.fail('foreign games must not update settlement history'),
      }),
      /another wallet/,
    );
  });

  it('returns an already complete payload unchanged', async () => {
    const payload = { status: 'complete', result: { payout_wei: '1' } };
    assert.strictEqual(await reconcilePendingPlay(payload), payload);
  });

  it('rejects pending payloads without a safe reconciliation key', () => {
    assert.throws(
      () => getPendingPlayReference(pendingPayload({ contract: null })),
      /valid contract address/,
    );
    assert.throws(
      () => getPendingPlayReference(pendingPayload({ gameId: 'nope' })),
      /valid gameId/,
    );
    assert.throws(
      () => getPendingPlayReference({ status: 'error' }),
      /expected "pending"/,
    );
  });
});
