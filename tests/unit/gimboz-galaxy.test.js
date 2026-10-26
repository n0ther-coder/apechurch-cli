import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { decodeAbiParameters, encodeAbiParameters, encodeFunctionData, parseEther } from 'viem';
import { resolveGame } from '../../registry.js';
import { GAME_CONTRACT_ABI, GIMBOZ_GALAXY_CONTRACT } from '../../lib/constants.js';
import { GIMBOZ_GALAXY_ABI, parseGimbozGalaxySpins, readGimbozGalaxyReplay, validateGimbozGalaxyWager } from '../../lib/games/gimboz-galaxy.js';
import { getSlotsTransactionCosts, playSlots, resolveSlotsConfig } from '../../lib/games/slots.js';
import { getConfiguredGameVrfFeeApe } from '../../lib/loop-estimate.js';
import { getGamePaytable, formatGamePaytable } from '../../lib/game-paytable.js';
import { getConfiguredGameExpectedRtpReference, resolveConfiguredGameVariant } from '../../lib/rtp.js';
import { inferSavedHistoryGameVariants } from '../../lib/wallet-analysis.js';

const gameEntry = resolveGame('gimboz-galaxy');
const player = '0x1111111111111111111111111111111111111111';
const zero = '0x0000000000000000000000000000000000000000';
const entropy = `0x${'1'.repeat(64)}`;
const cli = new URL('../../bin/cli.js', import.meta.url).pathname;
const config = (opts, positionalConfig = {}) => resolveSlotsConfig({ opts, positionalConfig, gameEntry, preferGameDefault: true });

describe('Gimboz of the Galaxy', () => {
  it('resolves aliases, defaults, counts and bonus purchases without truncation', () => {
    assert.equal(resolveGame('galaxy'), gameEntry);
    assert.equal(resolveGame('gimbozgalaxy'), gameEntry);
    assert.equal(gameEntry.contract, GIMBOZ_GALAXY_CONTRACT);
    assert.equal(gameEntry.abiVerified, false);
    assert.deepEqual(config({}), { split: 10, bonus: false });
    assert.deepEqual(config({ bonus: true }), { split: 1, bonus: true });
    assert.deepEqual(config({ split: '10' }), { split: 10, bonus: false });
    for (const bad of ['2junk', '1.1', '1e1', '', 0, 11]) {
      assert.throws(() => parseGimbozGalaxySpins(bad), /integer between 1 and 10/);
      assert.throws(() => config({ split: bad }), /integer between 1 and 10/);
    }
    assert.throws(() => config({ split: 2 }, { spins: 3 }), /Conflicting/);
    for (const opts of [{ bonus: true, split: 1 }, { bonus: true, spin: 3 }]) {
      assert.throws(() => config(opts), /cannot be combined/);
    }
    assert.throws(() => config({ bonus: true }, { spins: 1 }), /cannot be combined/);
    assert.throws(() => validateGimbozGalaxyWager(parseEther('99.999999999999999999'), 1, true), /100 APE/);
    assert.throws(() => validateGimbozGalaxyWager(parseEther('5.999999999999999999'), 2), /3 APE per spin/);
  });

  it('encodes the trailing bonus bool and preserves each actual fee component', async () => {
    for (const bonus of [false, true]) {
      const split = bonus ? 1 : 10;
      const wager = parseEther(bonus ? '100' : '30');
      let submitted;
      const publicClient = {
        async readContract({ functionName, args }) {
          if (functionName === 'getVRFFee') {
            assert.deepEqual(args, [550000 + 200000 * split]);
            return 23n;
          }
          if (functionName === 'EXECUTOR_FEE') return 7n;
          throw Error('Unexpected read');
        },
        async estimateContractGas() { return 100000n; },
      };
      assert.deepEqual(await getSlotsTransactionCosts(publicClient, gameEntry, split),
        { vrf: 23n, executor: 7n * BigInt(split), total: 23n + 7n * BigInt(split) });
      await assert.rejects(playSlots({ account: { address: player }, publicClient, gameEntry,
        walletClient: { async writeContract(request) { submitted = request; throw Error('Synthetic transaction boundary'); } },
        wager, split, bonus, xGameId: '42', xRef: zero, xUserRandomWord: entropy, timeoutMs: 0,
      }), /Synthetic transaction boundary/);
      assert.equal(submitted.address, GIMBOZ_GALAXY_CONTRACT);
      assert.equal(submitted.functionName, 'play');
      assert.equal(submitted.value, wager + 23n + 7n * BigInt(split));
      assert.deepEqual(decodeAbiParameters(
        [{ type: 'uint8' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }, { type: 'bool' }],
        submitted.args[1],
      ), [split, 42n, zero, entropy, bonus]);
    }
  });

  it('rejects bad wagers before RPC and quotes one bonus purchase in loop estimates', async () => {
    const publicClient = { async readContract() { throw Error('RPC must not be reached'); } };
    await assert.rejects(playSlots({ gameEntry, publicClient, wager: parseEther('99'), bonus: true }), /100 APE/);
    await assert.rejects(playSlots({ gameEntry, publicClient, wager: parseEther('100'), bonus: true, split: 2 }), /exactly one/);
    const fee = await getConfiguredGameVrfFeeApe({ gameEntry, config: { bonus: true }, publicClient: {
      async readContract({ functionName, args }) {
        if (functionName === 'getVRFFee') { assert.deepEqual(args, [750000]); return parseEther('0.1'); }
        return parseEther('0.04');
      },
    } });
    assert.equal(fee, 0.14);
  });

  it('separates component awards from unverified full outcomes and RTP', () => {
    for (const bonus of [false, true]) {
      const table = getGamePaytable(gameEntry, { bonus });
      assert.equal(table.payouts_enumerated, false);
      assert.equal(table.max_multiplier, null);
      assert.equal(table.component_paytable.symbols.length, 10);
      assert.deepEqual(table.component_paytable.symbols[1].multipliers, ['0.25', '0.5', '1.25']);
      assert.match(formatGamePaytable(table), /component multipliers/);
      assert.equal(getConfiguredGameExpectedRtpReference({ game: 'galaxy', config: { bonus } }), null);
    }
    assert.equal(resolveConfiguredGameVariant({ game: 'galaxy', config: { split: 10 } }).variantKey, 'gimboz-galaxy:mode:base:spins:10');
    assert.equal(resolveConfiguredGameVariant({ game: 'galaxy', config: { split: 1, bonus: true } }).variantKey, 'gimboz-galaxy:mode:bonus-round');
    const table = getGamePaytable(gameEntry, { amount: '23', spin: '4' });
    assert.equal(table.parameters.split, 5);
    assert.equal(table.parameters.amount, '20');
    assert.equal(table.parameters.unspent, '3');
  });

  it('reads exact contract offsets at one block without generating a replay outcome', async () => {
    const info = { numSpins: 1, isBonusBuy: false, hasRNGReturned: true, hasEnded: true,
      betAmount: parseEther('3'), totalPayout: 1234567890123456789n,
      reelIndexes: [2n, 3n, 4n, 5n, 6n, 7n], bonusReelIndexes: Array(48).fill(7n), bonusTriggerSpinIndexes: [0], bonusSpinCounts: [6] };
    const client = { async getBlockNumber() { return 321n; }, async readContract(call) {
      assert.equal(call.blockNumber, 321n);
      assert.deepEqual(call.args, [42n]);
      return info;
    } };
    const replay = await readGimbozGalaxyReplay(client, { gameId: '42' });
    assert.equal(replay.total_payout_wei, '1234567890123456789');
    assert.deepEqual(replay.reel_indexes, ['2', '3', '4', '5', '6', '7']);
    assert.equal(replay.bonus_reel_indexes.length, 48);
    info.bonusReelIndexes.pop();
    await assert.rejects(readGimbozGalaxyReplay(client, { gameId: 42n }), /offsets/);
    info.hasEnded = false;
    assert.equal((await readGimbozGalaxyReplay(client, { gameId: 42n })).has_ended, false);
  });

  it('round-trips the variable bonus-count tuple without shifting payout or flags', async () => {
    const info = { player, betAmount: parseEther('100'), numSpins: 1,
      reelIndexes: Array(6).fill(12345678901234567890n),
      bonusReelIndexes: Array(48).fill(4999n), bonusTriggerSpinIndexes: [0],
      bonusSpinCounts: [6], totalPayout: 123456789012345678901n,
      hasRNGReturned: true, hasEnded: true, timestamp: 1793000000n, isBonusBuy: true };
    const outputs = GIMBOZ_GALAXY_ABI.find(entry => entry.name === 'getGameInfo').outputs;
    const decoded = decodeAbiParameters(outputs, encodeAbiParameters(outputs, [info]))[0];
    assert.deepEqual(decoded, info);
    const client = { async readContract({ blockNumber }) { assert.equal(blockNumber, 123n); return decoded; } };
    const read = () => readGimbozGalaxyReplay(client, { gameId: 42n, blockNumber: 123n });
    const replay = await read();
    assert.equal(replay.total_payout_wei, info.totalPayout.toString());
    assert.deepEqual(replay.bonus_spin_counts, [6]);
    for (const bad of [[], [4], [3, 3]]) {
      decoded.bonusSpinCounts = bad;
      await assert.rejects(read(), /offsets/);
    }
    decoded.bonusSpinCounts = [6];
    decoded.bonusTriggerSpinIndexes = [1];
    await assert.rejects(read(), /offsets/);
    decoded.bonusTriggerSpinIndexes = [0];
    decoded.bonusReelIndexes.pop();
    await assert.rejects(read(), /offsets/);
    decoded.hasEnded = false;
    assert.equal((await read()).has_ended, false);
  });

  it('caps strategy counts to the supported game range', () => {
    const resolved = resolveSlotsConfig({ opts: {}, positionalConfig: {}, gameEntry,
      strategyConfig: { slots: { spins: [12, 15] } },
      randomIntInclusive(min, max) { assert.equal(min, 10); assert.equal(max, 10); return min; } });
    assert.deepEqual(resolved, { split: 10, bonus: false });
  });

  it('retains legacy history variant keys when decoding the bonus bool from calldata', async () => {
    for (const bonus of [false, true]) {
      const data = encodeAbiParameters(
        [{ type: 'uint8' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }, { type: 'bool' }],
        [bonus ? 1 : 2, 42n, zero, entropy, bonus],
      );
      const input = encodeFunctionData({ abi: GAME_CONTRACT_ABI, functionName: 'play', args: [player, data] });
      const result = await inferSavedHistoryGameVariants({
        async getTransaction() { return { input }; },
        async readContract() { throw Error('Calldata must suffice'); },
      }, [{ contract: GIMBOZ_GALAXY_CONTRACT, game_key: 'gimboz-galaxy', gameId: '42', tx: `0x${'2'.repeat(64)}` }], { mode: 'rpc-missing' });
      assert.equal(result.games[0].variant_key, bonus ? 'gimboz-galaxy:mode:bonus-round' : 'gimboz-galaxy:mode:base:spins:2');
    }
  });

  it('recovers base and bonus history variants from the contract when calldata is missing', async () => {
    for (const isBonusBuy of [false, true]) {
      const result = await inferSavedHistoryGameVariants({
        async getTransaction() { throw Error('missing transaction'); },
        async readContract({ functionName }) {
          assert.equal(functionName, 'getGameInfo');
          return { numSpins: isBonusBuy ? 1 : 10, isBonusBuy };
        },
      }, [{ contract: GIMBOZ_GALAXY_CONTRACT, game_key: 'gimboz-galaxy', gameId: '42' }], { mode: 'rpc-missing' });
      assert.equal(result.games[0].variant_key, isBonusBuy ? 'gimboz-galaxy:mode:bonus-round' : 'gimboz-galaxy:mode:base:spins:10');
    }
  });

  it('exposes valid base/bonus/exact-stake commands and comprehensive help', () => {
    for (const args of [
      ['galaxy', '30'], ['gimbozgalaxy', '30', '10'], ['galaxy', '100', '--bonus'],
      ['--game', 'galaxy', '--amount', '23', '--spin', '4'],
      ['galaxy', '100', '--bonus', '--loop', '--max-games', '2'],
    ]) {
      const out = execFileSync(process.execPath, [cli, 'play', ...args, '--validate-only', '--json'], { encoding: 'utf8' });
      assert.equal(JSON.parse(out).status, 'valid');
    }
    const help = execFileSync(process.execPath, [cli, 'game', 'galaxy'], { encoding: 'utf8' });
    for (const text of ['--bonus', '--spin', '--split', 'BNF', '100 APE', '1 <= split <= 10']) assert.ok(help.includes(text), text);
  });

  it('rejects invalid play/bet options before wallet access', () => {
    const bad = [
      ['play', 'galaxy', '25', '--split', '11'], ['play', 'galaxy', '25', '2junk'],
      ['play', 'galaxy', '50', '--split', '21'], ['play', 'galaxy', '100', '--bonus', '--split', '1'],
      ['play', 'galaxy', '100', '1', '--bonus'], ['play', 'galaxy', '100', '--bonus', '--spin', '4'],
      ['play', 'galaxy', '99.999999999999999999', '--bonus'],
      ['play', 'galaxy', '25', '2', '--split', '3'], ['play', '--auto', '--bonus'],
      ['play', 'blackjack', '100', '--bonus'], ['play', 'dojo', '100', '--bonus'],
      ['bet', '--game', 'galaxy', '--amount', '99', '--bonus'],
      ['bet', '--game', 'galaxy', '--amount', '25', '--split', '11'],
    ];
    for (const args of bad) {
      const result = spawnSync(process.execPath, [cli, ...args, ...(args[0] === 'play' ? ['--validate-only'] : []), '--json'], { encoding: 'utf8' });
      assert.notEqual(result.status, 0, args.join(' '));
      assert.doesNotMatch(result.stdout + result.stderr, /No wallet found|password/i);
    }
  });
});
