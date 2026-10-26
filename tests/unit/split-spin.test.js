import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseEther } from 'viem';
import { resolveGame } from '../../registry.js';
import { resolveSpinWager, resolveLiveSpinWager, validateSpinUsage } from '../../lib/split-spin.js';
import { executeGame } from '../../lib/games/base.js';
import { playGame } from '../../lib/games/index.js';

describe('Exact wager per split attempt', () => {
  it('leaves the remainder unspent and caps at each supported count', () => {
    const expected = { blocks: 5, 'jungle-plinko': 100, 'cosmic-plinko': 30,
      primes: 20, 'speed-keno': 20, 'dino-dough': 15, 'bubblegum-heist': 15,
      'geez-diggerz': 15, 'sushi-showdown': 15, 'dojo-drop': 15, 'reel-pirates': 15, 'blizzard-blitz': 20 };
    for (const [key, maximum] of Object.entries(expected)) {
      assert.deepEqual(resolveSpinWager(resolveGame(key), '23', '4'), {
        split: 5, spin: '4', amount: '20', unspent: '3',
      });
      const plan = resolveSpinWager(resolveGame(key), '1000', '4');
      assert.equal(plan.split, maximum, key);
      assert.equal(plan.amount, String(maximum * 4), key);
      assert.equal(plan.unspent, String(1000 - maximum * 4), key);
    }
  });

  it('preserves wei precision at division and large-budget boundaries', () => {
    const game = resolveGame('dino-dough');
    assert.equal(resolveSpinWager(game, '0.3', '0.1').split, 3);
    assert.equal(resolveSpinWager(game, '0.299999999999999999', '0.1').split, 2);
    assert.deepEqual(resolveSpinWager(game, '0.000000000000000023', '0.000000000000000004'), {
      split: 5, spin: '0.000000000000000004', amount: '0.00000000000000002', unspent: '0.000000000000000003',
    });
    assert.equal(resolveSpinWager(game, '9007199254740993', '1').split, 15);
    assert.equal(resolveSpinWager(game, '4', '4').split, 1);
  });

  it('rejects zero counts, invalid decimals, and the per-spin slot floor', () => {
    const game = resolveGame('dino-dough');
    for (const spin of ['0', '-1', 'NaN', 'Infinity', '1e0', '1junk', '0.0000000000000000001']) {
      assert.throws(() => resolveSpinWager(game, '23', spin), /--spin/);
    }
    assert.throws(() => resolveSpinWager(game, '3', '4'), /0 attempts/);
    assert.throws(() => resolveSpinWager(resolveGame('dojo-drop'), '23', '2.499999999999999999'), /minimum 2.5/);
    assert.equal(resolveSpinWager(resolveGame('reel-pirates'), '5', '2.5').amount, '5');
  });

  it('rejects explicit count conflicts while permitting risk and number selections', () => {
    const game = resolveGame('dino-dough');
    for (const key of ['split', 'survive', 'games']) {
      assert.throws(() => validateSpinUsage(game, { spin: '4', [key]: 1 }), /cannot be combined/);
    }
    for (const key of ['balls', 'games', 'spins', 'runs', 'rolls']) {
      assert.throws(() => validateSpinUsage(game, { spin: '4' }, { [key]: 1 }), /explicit attempt count/);
    }
    assert.doesNotThrow(() => validateSpinUsage(game, { spin: '4' }, { risk: 0, numbers: '1,2,3' }));
  });

  it('uses lower live limits and fails closed on unavailable or zero limits', async () => {
    const calls = [];
    const client = { async readContract(call) { calls.push(call); return 3n; } };
    assert.deepEqual(await resolveLiveSpinWager(client, resolveGame('dino-dough'), '23', '4'), {
      split: 3, spin: '4', amount: '12', unspent: '11',
    });
    assert.equal(calls[0].functionName, 'MAX_SPINS');
    for (const [key, getter] of [['blocks', 'MAX_RUNS'], ['primes', 'MAX_RUNS'],
      ['jungle-plinko', 'maxBalls'], ['speed-keno', 'MAX_GAMES']]) {
      await resolveLiveSpinWager(client, resolveGame(key), '23', '4');
      assert.equal(calls.at(-1).functionName, getter);
    }
    const failed = { async readContract() { throw new Error('offline'); } };
    await assert.rejects(resolveLiveSpinWager(failed, resolveGame('dino-dough'), '23', '4'), /Cannot verify/);
    await assert.rejects(resolveLiveSpinWager({ async readContract() { return 0n; } }, resolveGame('blocks'), '23', '4'), /0 attempts/);
    await assert.rejects(resolveLiveSpinWager(failed, resolveGame('blocks'), '3', '4'), /0 attempts/);
  });

  it('rejects invalid router requests without constructing clients', async () => {
    await assert.rejects(playGame({ game: 'dino-dough', amountApe: '3', spin: '4' }), /0 attempts/);
    await assert.rejects(playGame({ game: 'blocks', amountApe: '23', spin: '4', survive: 2 }), /requires --loop/);
  });

  it('does not submit after a failed exact-spin preflight', async () => {
    let sends = 0;
    await assert.rejects(executeGame({
      account: { address: '0x1111111111111111111111111111111111111111' },
      publicClient: { async estimateContractGas() { throw new Error('invalid bet size'); } },
      walletClient: { async writeContract() { sends++; } },
      contractAddress: resolveGame('dino-dough').contract,
      encodedData: '0x', wager: parseEther('20'), vrfFee: 1n, strictPreflight: true,
    }), /Exact wager .* failed contract preflight/);
    assert.equal(sends, 0);
  });

  it('routes every split game to the exact transaction wager with live caps', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'split-spin-routing-'));
    const loader = path.join(directory, 'loader.mjs');
    const cli = fileURLToPath(new URL('../../bin/cli.js', import.meta.url));
    fs.writeFileSync(loader, `
      export async function load(url, context, nextLoad) {
        const result = await nextLoad(url, context);
        if (result.format !== 'module' || result.source === undefined) return result;
        let source = result.source.toString();
        if (url.endsWith('/bin/cli.js')) source = source.replace(
          'async function getWalletWithPrompt(opts = {}) {',
          'async function getWalletWithPrompt(opts = {}) { return { address: "0x1111111111111111111111111111111111111111" };'
        );
        if (url.endsWith('/lib/wallet.js')) source = source.replace(
          'export function createClients(account) {',
          'export function createClients(account) { return { publicClient: { async getBalance() { return BigInt(process.env.SPIN_TEST_BALANCE); }, async readContract({functionName}) { return ["MAX_SPINS", "MAX_GAMES", "MAX_RUNS", "maxBalls"].includes(functionName) ? BigInt(process.env.SPIN_TEST_LIMIT) : 3n; } }, walletClient: { async writeContract() { throw new Error("Unexpected transaction submission"); } } };'
        );
        if (url.endsWith('/lib/games/base.js')) source = source.replace(
          '// Total transaction value = bet amount + VRF fee',
          'process.stdout.write(JSON.stringify({ wager, config, strictPreflight }, (_, value) => typeof value === "bigint" ? value.toString() : value)); process.exit(0);'
        );
        return { ...result, source };
      }
    `);
    const run = (args, { limit = '3', balance = '100' } = {}) => {
      const child = spawnSync(process.execPath, ['--loader', loader, cli, ...args], {
        encoding: 'utf8', timeout: 10000,
        env: { ...process.env, APECHURCH_CLI_CONFIG_DIR: directory,
          APECHURCH_CLI_SUPPRESS_VERSION_BANNER: '1', NODE_NO_WARNINGS: '1',
          SPIN_TEST_LIMIT: limit, SPIN_TEST_BALANCE: parseEther(balance).toString() },
      });
      assert.equal(child.status, 0, child.stdout + child.stderr);
      return JSON.parse(child.stdout);
    };
    try {
      for (const key of ['blocks', 'jungle-plinko', 'cosmic-plinko', 'primes', 'speed-keno',
        'dino-dough', 'bubblegum-heist', 'geez-diggerz', 'sushi-showdown', 'dojo-drop', 'reel-pirates', 'blizzard-blitz']) {
        for (const flag of (['primes', 'speed-keno'].includes(key) ? ['--bet-split'] : ['--spin', '--bet-split'])) {
          for (const args of [['play', key, '23', flag, '4', '--json'],
            ['bet', '--game', key, '--amount', '23', flag, '4']]) {
            const result = run(args);
            assert.equal(result.wager, parseEther('12').toString(), key);
            assert.equal(result.config.split, 3, key);
            assert.equal(result.strictPreflight, true, key);
            if (key === 'blocks') assert.equal(result.config.compounding, false);
          }
        }
      }
      // A loop budget capped to the available balance must be used for sizing.
      const loop = run(['play', 'dino-dough', '23', '--spin', '4', '--loop', '--max-games', '1', '--json'],
        { limit: '15', balance: '19' });
      assert.equal(loop.wager, parseEther('16').toString());
      assert.equal(loop.config.split, 4);
      // The budget may exceed the balance when the actual rounded wager fits.
      const oneShot = run(['play', 'dino-dough', '23', '--spin', '4', '--json'],
        { limit: '15', balance: '21' });
      assert.equal(oneShot.wager, parseEther('20').toString());
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
