import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeAbiParameters, encodeAbiParameters, encodeFunctionData, parseEther } from 'viem';
import { resolveGame } from '../../registry.js';
import { GAME_CONTRACT_ABI, DOJO_DROP_CONTRACT } from '../../lib/constants.js';
import { getGamePaytable } from '../../lib/game-paytable.js';
import { getConfiguredGameExpectedRtpReference, resolveConfiguredGameVariant } from '../../lib/rtp.js';
import { inferSavedHistoryGameVariants } from '../../lib/wallet-analysis.js';
import { getSlotsTransactionCosts, playSlots, resolveSlotsConfig } from '../../lib/games/slots.js';
import { DOJO_DROP_ABI, parseDojoDropSpins, readDojoDropReplay } from '../../lib/games/dojo-drop.js';

const gameEntry = resolveGame('dojo-drop');
const player = '0x1111111111111111111111111111111111111111';
const zero = '0x0000000000000000000000000000000000000000';
const entropy = `0x${'1'.repeat(64)}`;

function fixture({ ended = true, mismatch = false } = {}) {
  const info = {
    player, betAmount: parseEther('10'), numSpins: 2, nextSpinIndex: ended ? 2 : 0,
    spinPayouts: [0n, 1234567890123456789n], bonusTriggerSpinIndexes: [1],
    clearedColumnMasks: [0, 3], capHitMask: 2,
    totalPayout: 1234567890123456789n, hasRNGReturned: ended, hasEnded: ended,
    timestamp: 1234567890n, rngResults: [1n, 2n],
  };
  const details = [0, 1].map(index => ({
    wallTiers: Array.from({ length: 30 }, (_, cell) => cell % 6),
    baseSymbols: Array(15).fill(255), bonusTriggered: index === 1,
    bonusSymbols: Array(60).fill(255), brokenAfterBase: 1,
    brokenAfterFreeSpin: [3, 7, 15, 63], clearedColumns: index ? 3 : 0,
    chestMultipliers: [2, 5, 3, 4, 2], totalXUncapped: 10000001n,
    totalX: 10000000n,
    spinPayout: info.spinPayouts[index] + (mismatch ? 1n : 0n),
  }));
  const config = [[1, 1, 2, 3, 4, 6], [0n, 0n, 2000n, 8000n, 20000n, 60000n],
    1600, 4900, [32, 17, 9, 4, 4, 4, 2], 6000, [40, 22, 10, 3, 0, 4, 1],
    [2, 3, 4, 5], [40, 30, 18, 12], 10000000n];
  const calls = [];
  return { info, details, calls, client: {
    async getBlockNumber() { return 123n; },
    async readContract(request) {
      calls.push(request);
      if (request.functionName === 'getGameInfo') return info;
      if (request.functionName === 'getGameConfig') return config;
      if (request.functionName === 'getSpinDetails') {
        assert.deepEqual(request.args, [42n, 0, 2], 'endSpinIndex is exclusive');
        return details;
      }
      throw Error('Unexpected read');
    },
  } };
}

describe('Dojo Drop integration', () => {
  it('uses aliases, split variants and an explicitly unverified probability model', () => {
    assert.equal(resolveGame('dojo'), gameEntry);
    assert.equal(resolveGame('dojodrop'), gameEntry);
    assert.equal(gameEntry.abiVerified, false);
    assert.equal(gameEntry.contract, DOJO_DROP_CONTRACT);
    assert.equal(resolveConfiguredGameVariant({ game: 'dojo-drop', config: { split: 2 } }).variantKey, 'dojo-drop:spins:2');
    assert.equal(getConfiguredGameExpectedRtpReference({ game: 'dojo-drop', config: { split: 2 } }), null);
    const table = getGamePaytable(gameEntry, { split: 2, amount: '5' });
    assert.equal(table.max_multiplier, '1000');
    assert.equal(table.payouts_enumerated, false);
    assert.match(table.enumeration_reason, /snapshot/);
    assert.throws(() => getGamePaytable(gameEntry, { split: 3, amount: '5' }), /at least 2.5/);
  });

  it('rejects fractional or malformed counts without truncation', () => {
    for (const value of [0, 16, '1.5', '2junk', '1e1', '', '-1', '9007199254740993']) {
      assert.throws(() => parseDojoDropSpins(value), /integer between 1 and 15/);
      assert.throws(() => resolveSlotsConfig({ opts: { split: value }, positionalConfig: {}, gameEntry }), /integer between/);
    }
    assert.equal(parseDojoDropSpins('15'), 15);
  });

  it('derives dynamic VRF gas and preserves executor costs separately', async () => {
    const calls = [];
    const costs = await getSlotsTransactionCosts({
      async readContract(call) {
        calls.push(call);
        return call.functionName === 'getVRFFee' ? 23n : 7n;
      },
    }, gameEntry, 2);
    assert.deepEqual(calls[0].args, [800000]);
    assert.deepEqual(costs, { vrf: 23n, executor: 14n, total: 37n });
  });

  it('encodes spins before gameId and adds fees to the wager unchanged', async () => {
    let submitted;
    await assert.rejects(playSlots({
      account: { address: player }, gameEntry, wager: parseEther('5'), split: 2,
      xGameId: '42', xRef: zero, xUserRandomWord: entropy, timeoutMs: 0,
      publicClient: {
        async readContract({ functionName, args }) {
          if (functionName === 'getVRFFee') { assert.deepEqual(args, [800000]); return 23n; }
          if (functionName === 'EXECUTOR_FEE') return 7n;
          throw Error('Unexpected read');
        },
        async estimateContractGas() { return 100000n; },
      },
      walletClient: { async writeContract(request) { submitted = request; throw Error('Synthetic transaction boundary'); } },
    }), /Synthetic transaction boundary/);
    assert.equal(submitted.value, parseEther('5') + 37n);
    const decoded = decodeAbiParameters(
      [{ type: 'uint8' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }], submitted.args[1],
    );
    assert.deepEqual(decoded, [2, 42n, zero, entropy]);
  });

  it('rejects insufficient stake and conflicting counts before any RPC', async () => {
    const publicClient = { async readContract() { throw Error('RPC must not be reached'); } };
    for (const config of [{ split: 2, wager: parseEther('4.999999999999999999') },
      { split: '2.1', wager: parseEther('10') }, { split: 2, spins: 3, wager: parseEther('10') }]) {
      await assert.rejects(playSlots({ account: { address: player }, gameEntry, publicClient,
        walletClient: {}, timeoutMs: 0, ...config }), /at least 2.5|integer between|Conflicting/);
    }
  });

  it('reads every spin at one block without losing token precision or bonus state', async () => {
    const { client, calls } = fixture();
    const replay = await readDojoDropReplay(client, { gameId: 42n });
    assert.equal(replay.total_payout_wei, '1234567890123456789');
    assert.deepEqual(replay.bonus_trigger_spin_indexes, [1]);
    assert.deepEqual(replay.spin_details[1].brokenAfterFreeSpin, [3, 7, 15, 63]);
    assert.deepEqual(replay.spin_details[1].chestMultipliers, [2, 5, 3, 4, 2]);
    assert.equal(replay.spin_details[1].totalX, '10000000');
    assert.equal(replay.cap_hit_mask, 2);
    assert.equal(replay.game_config.baseEmptyBp, 4900);
    assert.ok(calls.every(call => call.blockNumber === 123n));
    assert.doesNotThrow(() => JSON.stringify(replay));
  });

  it('avoids result replay while RNG or settlement is still pending', async () => {
    const { client, calls } = fixture({ ended: false });
    const replay = await readDojoDropReplay(client, { gameId: 42n, blockNumber: 100n });
    assert.equal(replay.has_ended, false);
    assert.deepEqual(replay.spin_details, []);
    assert.ok(!calls.some(call => call.functionName === 'getSpinDetails'));
    assert.ok(calls.every(call => call.blockNumber === 100n));
  });

  it('rejects replay data inconsistent with authoritative settlement', async () => {
    const { client } = fixture({ mismatch: true });
    await assert.rejects(readDojoDropReplay(client, { gameId: 42n }), /do not match/);
  });

  it('defines getter tuple components that ABI round-trip fixed arrays and large integers', () => {
    const { info, details } = fixture();
    for (const [name, value] of [['getGameInfo', info], ['getSpinDetails', details]]) {
      const outputs = DOJO_DROP_ABI.find(entry => entry.name === name).outputs;
      assert.deepEqual(decodeAbiParameters(outputs, encodeAbiParameters(outputs, [value]))[0], value);
    }
  });

  it('reconstructs split metadata from calldata or a getter without a play transaction', async () => {
    const gameData = encodeAbiParameters([{ type: 'uint8' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }],
      [2, 42n, zero, entropy]);
    const input = encodeFunctionData({ abi: GAME_CONTRACT_ABI, functionName: 'play', args: [player, gameData] });
    for (const includeTx of [false, true]) {
      const result = await inferSavedHistoryGameVariants({
        async getTransaction() { return { input }; },
        async readContract(request) { assert.equal(request.functionName, 'getGameInfo'); return { numSpins: 2 }; },
      }, [{ contract: DOJO_DROP_CONTRACT, game_key: 'dojo-drop', gameId: '42',
        ...(includeTx ? { tx: `0x${'2'.repeat(64)}` } : {}) }], { mode: 'rpc-missing' });
      assert.deepEqual(result.games[0].config, { split: 2 });
      assert.equal(result.games[0].variant_key, 'dojo-drop:spins:2');
    }
  });
});
