import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { decodeAbiParameters, parseEther } from 'viem';
import { resolveGame } from '../../registry.js';
import { BLIZZARD_BLITZ_CONTRACT } from '../../lib/constants.js';
import { parseBlizzardBlitzSpins, readBlizzardBlitzReplay, validateBlizzardBlitzWager } from '../../lib/games/blizzard-blitz.js';
import { getSlotsTransactionCosts, playSlots, resolveSlotsConfig } from '../../lib/games/slots.js';
import { getConfiguredGameVrfFeeApe } from '../../lib/loop-estimate.js';
import { getGamePaytable, formatGamePaytable } from '../../lib/game-paytable.js';
import { getConfiguredGameExpectedRtpReference, resolveConfiguredGameVariant } from '../../lib/rtp.js';
import { inferSavedHistoryGameVariants } from '../../lib/wallet-analysis.js';

const gameEntry = resolveGame('blizzard-blitz');
const player = '0x1111111111111111111111111111111111111111';
const zero = '0x0000000000000000000000000000000000000000';
const entropy = `0x${'1'.repeat(64)}`;
const cli = new URL('../../bin/cli.js', import.meta.url).pathname;
const config = (opts, positionalConfig = {}) => resolveSlotsConfig({ opts, positionalConfig, gameEntry, preferGameDefault: true });

describe('Blizzard Blitz', () => {
  it('resolves aliases, defaults, counts and bonus purchases without truncation', () => {
    assert.equal(resolveGame('blizzard'), gameEntry);
    assert.equal(resolveGame('blizzardblitz'), gameEntry);
    assert.equal(gameEntry.contract, BLIZZARD_BLITZ_CONTRACT);
    assert.equal(gameEntry.abiVerified, false);
    assert.deepEqual(config({}), { split: 10, bonus: false });
    assert.deepEqual(config({ bonus: true }), { split: 1, bonus: true });
    assert.deepEqual(config({ split: '20' }), { split: 20, bonus: false });
    for (const bad of ['2junk', '1.1', '1e1', '', 0, 21]) {
      assert.throws(() => parseBlizzardBlitzSpins(bad), /integer between 1 and 20/);
      assert.throws(() => config({ split: bad }), /integer between 1 and 20/);
    }
    assert.throws(() => config({ split: 2 }, { spins: 3 }), /Conflicting/);
    for (const opts of [{ bonus: true, split: 1 }, { bonus: true, spin: 3 }]) {
      assert.throws(() => config(opts), /cannot be combined/);
    }
    assert.throws(() => config({ bonus: true }, { spins: 1 }), /cannot be combined/);
    assert.throws(() => validateBlizzardBlitzWager(parseEther('99.999999999999999999'), 1, true), /100 APE/);
    assert.throws(() => validateBlizzardBlitzWager(parseEther('4.999999999999999999'), 2), /2.5 APE per spin/);
  });

  it('encodes the trailing bonus bool and preserves each actual fee component', async () => {
    for (const bonus of [false, true]) {
      const split = bonus ? 1 : 20;
      const wager = parseEther(bonus ? '100' : '50');
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
      assert.equal(submitted.address, BLIZZARD_BLITZ_CONTRACT);
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
      assert.equal(table.component_paytable.symbols.length, 8);
      assert.deepEqual(table.component_paytable.symbols[1].multipliers, ['0.45', '1', '4']);
      assert.match(formatGamePaytable(table), /component multipliers/);
      assert.equal(getConfiguredGameExpectedRtpReference({ game: 'blizzard', config: { bonus } }), null);
    }
    assert.equal(resolveConfiguredGameVariant({ game: 'blizzard', config: { split: 20 } }).variantKey, 'blizzard-blitz:mode:base:spins:20');
    assert.equal(resolveConfiguredGameVariant({ game: 'blizzard', config: { split: 1, bonus: true } }).variantKey, 'blizzard-blitz:mode:bonus-round');
    const table = getGamePaytable(gameEntry, { amount: '23', spin: '4' });
    assert.equal(table.parameters.split, 5);
    assert.equal(table.parameters.amount, '20');
    assert.equal(table.parameters.unspent, '3');
  });

  it('reads exact contract offsets at one block without generating a replay outcome', async () => {
    const info = { numSpins: 1, isBonusBuy: false, hasRNGReturned: true, hasEnded: true,
      betAmount: parseEther('3'), totalPayout: 1234567890123456789n,
      reelIndexes: [2n, 3n, 4n, 5n, 6n], bonusReelIndexes: Array(25).fill(7n), bonusTriggerSpinIndexes: [0] };
    const client = { async getBlockNumber() { return 321n; }, async readContract(call) {
      assert.equal(call.blockNumber, 321n);
      assert.deepEqual(call.args, [42n]);
      return info;
    } };
    const replay = await readBlizzardBlitzReplay(client, { gameId: '42' });
    assert.equal(replay.total_payout_wei, '1234567890123456789');
    assert.deepEqual(replay.reel_indexes, ['2', '3', '4', '5', '6']);
    assert.equal(replay.bonus_reel_indexes.length, 25);
    info.bonusReelIndexes.pop();
    await assert.rejects(readBlizzardBlitzReplay(client, { gameId: 42n }), /offsets/);
    info.hasEnded = false;
    assert.equal((await readBlizzardBlitzReplay(client, { gameId: 42n })).has_ended, false);
  });

  it('recovers base and bonus history variants from the contract when calldata is missing', async () => {
    for (const isBonusBuy of [false, true]) {
      const result = await inferSavedHistoryGameVariants({
        async getTransaction() { throw Error('missing transaction'); },
        async readContract({ functionName }) {
          assert.equal(functionName, 'getGameInfo');
          return { numSpins: isBonusBuy ? 1 : 20, isBonusBuy };
        },
      }, [{ contract: BLIZZARD_BLITZ_CONTRACT, game_key: 'blizzard-blitz', gameId: '42' }], { mode: 'rpc-missing' });
      assert.equal(result.games[0].variant_key, isBonusBuy ? 'blizzard-blitz:mode:bonus-round' : 'blizzard-blitz:mode:base:spins:20');
    }
  });

  it('exposes valid base/bonus/exact-stake commands and comprehensive help', () => {
    for (const args of [
      ['blizzard', '25'], ['blizzardblitz', '50', '20'], ['blizzard', '100', '--bonus'],
      ['--game', 'blizzard', '--amount', '23', '--spin', '4'],
      ['blizzard', '100', '--bonus', '--loop', '--max-games', '2'],
    ]) {
      const out = execFileSync(process.execPath, [cli, 'play', ...args, '--validate-only', '--json'], { encoding: 'utf8' });
      assert.equal(JSON.parse(out).status, 'valid');
    }
    const help = execFileSync(process.execPath, [cli, 'game', 'blizzard'], { encoding: 'utf8' });
    for (const text of ['--bonus', '--spin', '--split', 'BNF', '100 APE', '1 <= split <= 20']) assert.ok(help.includes(text), text);
  });

  it('rejects invalid play/bet options before wallet access', () => {
    const bad = [
      ['play', 'blizzard', '25', '--split', '11'], ['play', 'blizzard', '25', '2junk'],
      ['play', 'blizzard', '50', '--split', '21'], ['play', 'blizzard', '100', '--bonus', '--split', '1'],
      ['play', 'blizzard', '100', '1', '--bonus'], ['play', 'blizzard', '100', '--bonus', '--spin', '4'],
      ['play', 'blizzard', '99.999999999999999999', '--bonus'],
      ['play', 'blizzard', '25', '2', '--split', '3'], ['play', '--auto', '--bonus'],
      ['play', 'blackjack', '100', '--bonus'], ['play', 'dojo', '100', '--bonus'],
      ['bet', '--game', 'blizzard', '--amount', '99', '--bonus'],
      ['bet', '--game', 'blizzard', '--amount', '25', '--split', '11'],
    ];
    for (const args of bad) {
      const result = spawnSync(process.execPath, [cli, ...args, ...(args[0] === 'play' ? ['--validate-only'] : []), '--json'], { encoding: 'utf8' });
      assert.notEqual(result.status, 0, args.join(' '));
      assert.doesNotMatch(result.stdout + result.stderr, /No wallet found|password/i);
    }
  });
});
