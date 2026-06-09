/**
 * Unit Tests: lib/fee-analysis.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseEther } from 'viem';
import { resolveGame } from '../../registry.js';
import {
  addCoveredRange,
  applyFeeRecord,
  buildFeeRecordFromLog,
  createEmptyFeeSnapshot,
  discoverContractDeploymentBlock,
  planFeeScanRanges,
  planTargetOnlyScanRanges,
  subtractCoveredRanges,
} from '../../lib/fee-analysis.js';

const WALLET_A = '0x1111111111111111111111111111111111111111';
const WALLET_B = '0x2222222222222222222222222222222222222222';

function feeRecord({
  wallet = WALLET_A,
  wager = '10',
  payout = '0',
  fee = '0.1',
  gas = '0.01',
  tx = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  block = '100',
  gameId = '1',
} = {}) {
  return {
    wallet,
    payer: wallet,
    sponsored: false,
    gameId,
    blockNumber: block,
    txHash: tx,
    wagerWei: parseEther(wager),
    payoutWei: parseEther(payout),
    feeWei: parseEther(fee),
    gasWei: parseEther(gas),
    configKey: 'all',
  };
}

describe('Fee Analysis', () => {
  it('aggregates global stats and only the selected target wallet without raw events', () => {
    const snapshot = createEmptyFeeSnapshot(resolveGame('primes'));

    applyFeeRecord(snapshot, feeRecord({
      wager: '10',
      payout: '20',
      fee: '0.1',
      gas: '0.01',
      gameId: '1',
    }), { targetWallet: WALLET_A });
    applyFeeRecord(snapshot, feeRecord({
      wallet: WALLET_B,
      wager: '5',
      payout: '0',
      fee: '0.2',
      gas: '0.02',
      tx: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      block: '101',
      gameId: '2',
    }), { targetWallet: WALLET_A });

    assert.strictEqual(snapshot.g.n, 2);
    assert.strictEqual(snapshot.g.w, 1);
    assert.strictEqual(snapshot.g.l, 1);
    assert.strictEqual(snapshot.g.bw, parseEther('15').toString());
    assert.strictEqual(snapshot.g.fw, parseEther('0.3').toString());
    assert.strictEqual(snapshot.g.minf, parseEther('0.1').toString());
    assert.strictEqual(snapshot.g.maxf, parseEther('0.2').toString());
    assert.strictEqual(snapshot.g.minfb, '100');
    assert.strictEqual(snapshot.g.maxfb, '400');
    assert.strictEqual(snapshot.t[WALLET_A].a.n, 1);
    assert.strictEqual(snapshot.t[WALLET_A].a.fw, parseEther('0.1').toString());
    assert.strictEqual(snapshot.t[WALLET_B], undefined);
    assert.strictEqual(snapshot.w, undefined);
    assert.strictEqual(snapshot.c, undefined);
    assert.ok(!Array.isArray(snapshot.events), 'Snapshot should not keep raw events');
    assert.strictEqual(snapshot.x.minf.id, '1');
    assert.strictEqual(snapshot.x.maxfb.id, '2');
  });

  it('subtracts already covered ranges before planning scans', () => {
    const uncovered = subtractCoveredRanges(1n, 100n, [
      ['1', '20'],
      ['40', '60'],
      ['90', '100'],
    ]);

    assert.deepStrictEqual(
      uncovered.map(([from, to]) => [from.toString(), to.toString()]),
      [['21', '39'], ['61', '89']]
    );
  });

  it('plans delta chunks before older backfill chunks', () => {
    const snapshot = createEmptyFeeSnapshot(resolveGame('blocks'));
    addCoveredRange(snapshot, 101n, 200n);

    const chunks = planFeeScanRanges(snapshot, {
      latestBlock: 260n,
      floorBlock: 0n,
      chunkSize: 50n,
      maxChunks: 3,
    });

    assert.deepStrictEqual(
      chunks.map((chunk) => [chunk.fromBlock.toString(), chunk.toBlock.toString()]),
      [['201', '250'], ['251', '260'], ['51', '100']]
    );
  });

  it('treats toBlock-only scans as the latest boundary for backward planning', () => {
    const snapshot = createEmptyFeeSnapshot(resolveGame('speed-keno'));

    const chunks = planFeeScanRanges(snapshot, {
      latestBlock: 200n,
      floorBlock: 0n,
      toBlock: 200n,
      chunkSize: 50n,
      maxChunks: 2,
    });

    assert.deepStrictEqual(
      chunks.map((chunk) => [chunk.fromBlock.toString(), chunk.toBlock.toString()]),
      [['151', '200'], ['101', '150']]
    );
  });

  it('plans target-only backfill from already covered global ranges', () => {
    const snapshot = createEmptyFeeSnapshot(resolveGame('primes'));
    addCoveredRange(snapshot, 1n, 100n);
    snapshot.t[WALLET_A] = {
      a: snapshot.t[WALLET_A]?.a,
      r: [['51', '100']],
    };

    const chunks = planTargetOnlyScanRanges(snapshot, WALLET_A, {
      chunkSize: 25n,
      maxChunks: 2,
    });

    assert.deepStrictEqual(
      chunks.map((chunk) => [chunk.fromBlock.toString(), chunk.toBlock.toString()]),
      [['26', '50'], ['1', '25']]
    );
  });

  it('uses observed wager overrides when event buyIn includes the fee', () => {
    const txHash = '0x' + 'c'.repeat(64);
    const log = {
      args: {
        user: WALLET_A,
        gameId: 42n,
        buyIn: parseEther('1.01'),
        payout: 0n,
      },
      blockNumber: 123n,
      transactionHash: txHash,
      logIndex: 0,
    };
    const txMeta = {
      tx: {
        from: WALLET_A,
        value: parseEther('1.01'),
        gasPrice: 1n,
      },
      receipt: {
        gasUsed: 21_000n,
        effectiveGasPrice: 2n,
      },
    };

    const record = buildFeeRecordFromLog(log, txMeta, {
      observedWagerWei: parseEther('1'),
    });

    assert.strictEqual(record.wagerWei, parseEther('1'));
    assert.strictEqual(record.feeWei, parseEther('0.01'));
    assert.strictEqual(record.gasWei, 42_000n);
  });

  it('uses the play transaction metadata when settlement is emitted by a callback transaction', () => {
    const playTxHash = '0x' + 'd'.repeat(64);
    const settlementTxHash = '0x' + 'e'.repeat(64);
    const log = {
      args: {
        user: WALLET_A,
        gameId: 99n,
        buyIn: parseEther('3.056392'),
        payout: parseEther('1.528196'),
      },
      blockNumber: 200n,
      transactionHash: settlementTxHash,
      logIndex: 0,
    };
    const paymentLog = {
      args: {
        user: WALLET_A,
        gameId: 99n,
      },
      blockNumber: 100n,
      transactionHash: playTxHash,
      logIndex: 4,
    };
    const txMeta = {
      tx: {
        from: WALLET_A,
        value: 3190980669650400000n,
        gasPrice: 1n,
      },
      receipt: {
        gasUsed: 867_117n,
        effectiveGasPrice: 101_682_760_000n,
      },
    };

    const record = buildFeeRecordFromLog(log, txMeta, { paymentLog });

    assert.strictEqual(record.txHash, playTxHash);
    assert.strictEqual(record.blockNumber, '100');
    assert.strictEqual(record.wagerWei, parseEther('3.056392'));
    assert.strictEqual(record.feeWei, 134588669650400000n);
    assert.strictEqual(record.gasWei, 88170849802920000n);
  });

  it('discovers the first block where a contract has bytecode', async () => {
    const client = {
      async getCode({ blockNumber }) {
        return BigInt(blockNumber) >= 42n ? '0x1234' : '0x';
      },
    };

    const block = await discoverContractDeploymentBlock(client, '0x3333333333333333333333333333333333333333', 100n);

    assert.strictEqual(block, 42n);
  });
});
