import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  StatefulStateReadError,
  StatefulVrfTimeoutError,
  VRF_REQUESTED_TOPIC,
  waitForVrfState,
} from '../../lib/stateful/vrf-wait.js';

const GAME_CONTRACT = `0x${'33'.repeat(20)}`;
const VRF_COORDINATOR = `0x${'44'.repeat(20)}`;
const VRF_CONSUMER = `0x${'55'.repeat(20)}`;
const TX_HASH = `0x${'12'.repeat(32)}`;
const REQUEST_ID_HEX = `0x${'2a'.padStart(64, '0')}`;

function makePublicClient({ confirmedAtMs, receiptStatus = 'success' } = {}) {
  return {
    chain: {
      blockExplorers: {
        default: { url: 'https://apescan.io/' },
      },
    },
    async getTransactionReceipt({ hash }) {
      assert.strictEqual(hash, TX_HASH);
      return {
        status: receiptStatus,
        blockTimestamp: BigInt(Math.floor(confirmedAtMs / 1000)),
        logs: [{
          address: VRF_COORDINATOR,
          topics: [
            VRF_REQUESTED_TOPIC,
            REQUEST_ID_HEX,
            `0x${VRF_CONSUMER.slice(2).padStart(64, '0')}`,
          ],
        }],
      };
    },
  };
}

function makeStream() {
  let output = '';
  return {
    write(chunk) {
      output += String(chunk);
    },
    get output() {
      return output;
    },
  };
}

describe('stateful VRF wait recovery', () => {
  it('throws an actionable timeout with elapsed time and every manual-check identifier', async () => {
    const nowMs = 1_800_000_125_000;
    const publicClient = makePublicClient({ confirmedAtMs: nowMs - 125_000 });

    await assert.rejects(
      waitForVrfState({
        publicClient,
        gameId: '42',
        gameName: 'Blackjack',
        gameKey: 'blackjack',
        gameContract: GAME_CONTRACT,
        transactionHash: TX_HASH,
        readState: async () => ({ awaitingRandomNumber: true }),
        isAwaiting: (state) => state.awaitingRandomNumber,
        timeoutMs: 0,
        nowFn: () => nowMs,
      }),
      (error) => {
        assert.ok(error instanceof StatefulVrfTimeoutError);
        assert.strictEqual(error.code, 'STATEFUL_VRF_TIMEOUT');
        assert.strictEqual(error.retryable, true);
        assert.match(error.message, /Timeout waiting for VRF: Blackjack game 42 has been waiting 2m 5s\./);
        assert.match(error.message, /No replacement wager or action will be submitted\./);
        assert.match(error.message, new RegExp(TX_HASH));
        assert.match(error.message, new RegExp(GAME_CONTRACT, 'i'));
        assert.match(error.message, new RegExp(VRF_COORDINATOR, 'i'));
        assert.match(error.message, new RegExp(VRF_CONSUMER, 'i'));
        assert.match(error.message, /VRF request ID: 42/);
        assert.match(error.message, /blackjack resume --resilient/);
        return true;
      },
    );
  });

  it('keeps checking the same game under --resilient and resumes when it becomes actionable', async () => {
    let nowMs = 1_800_000_000_000;
    let reads = 0;
    const sleeps = [];
    const stream = makeStream();
    const publicClient = makePublicClient({ confirmedAtMs: nowMs - 120_000 });

    const state = await waitForVrfState({
      publicClient,
      gameId: '42',
      gameName: 'Blackjack',
      gameKey: 'blackjack',
      gameContract: GAME_CONTRACT,
      transactionHash: TX_HASH,
      resilient: true,
      readState: async () => {
        reads += 1;
        return reads === 1
          ? { awaitingRandomNumber: true }
          : { awaitingRandomNumber: false, gameState: 'PLAYER_ACTION' };
      },
      isAwaiting: (current) => current.awaitingRandomNumber,
      timeoutMs: 0,
      retryDelaysMs: [180_000],
      sleepFn: async (delayMs) => {
        sleeps.push(delayMs);
        nowMs += delayMs;
      },
      nowFn: () => nowMs,
      stream,
    });

    assert.strictEqual(state.gameState, 'PLAYER_ACTION');
    assert.strictEqual(reads, 2);
    assert.deepStrictEqual(sleeps, [180_000]);
    assert.match(stream.output, /^⚠️ Timeout waiting for VRF:.+, Rechecking in 3m \(at .+\)\./m);
    assert.match(stream.output, /No replacement wager or action will be submitted\./);
    assert.match(stream.output, /✅ VRF resolved for Blackjack game 42 after 5m\./);
  });

  it('exits on an unclassified state-read failure when there is no submitted transaction to reconcile', async () => {
    await assert.rejects(
      waitForVrfState({
        publicClient: {},
        gameId: 'missing',
        gameName: 'Blackjack',
        gameKey: 'blackjack',
        gameContract: GAME_CONTRACT,
        resilient: true,
        readState: async () => {
          throw new Error('execution reverted: game does not exist');
        },
        isAwaiting: () => true,
        timeoutMs: 0,
      }),
      (error) => {
        assert.ok(error instanceof StatefulStateReadError);
        assert.strictEqual(error.code, 'STATEFUL_STATE_READ_FAILED');
        assert.strictEqual(error.retryable, false);
        assert.match(error.message, /not classified as recoverable/);
        return true;
      },
    );
  });

  it('stops immediately when the tracked transaction is known to have reverted', async () => {
    const nowMs = 1_800_000_000_000;
    const publicClient = makePublicClient({ confirmedAtMs: nowMs - 120_000, receiptStatus: 'reverted' });

    await assert.rejects(
      waitForVrfState({
        publicClient,
        gameId: '42',
        gameName: 'Blackjack',
        gameKey: 'blackjack',
        gameContract: GAME_CONTRACT,
        transactionHash: TX_HASH,
        resilient: true,
        readState: async () => ({ awaitingRandomNumber: true }),
        isAwaiting: (state) => state.awaitingRandomNumber,
        timeoutMs: 0,
        nowFn: () => nowMs,
      }),
      (error) => {
        assert.ok(error instanceof StatefulStateReadError);
        assert.match(error.message, /tracked transaction reverted on-chain/);
        return true;
      },
    );
  });
});
