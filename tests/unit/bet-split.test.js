import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseEther } from 'viem';
import { resolveGame } from '../../registry.js';
import { resolveLoopBetSplit, validateSpinUsage } from '../../lib/split-spin.js';
import { getGamePaytable } from '../../lib/game-paytable.js';

describe('Finite exact-stake single-game loops', () => {
  it('divides the wager budget in wei without spending its remainder', () => {
    const options = { loop: true, betSplit: '0.1' };
    const plan = resolveLoopBetSplit(resolveGame('roulette'), '0.299999999999999999', options);
    assert.equal(plan.count, 2n);
    assert.equal(plan.wagerWei, parseEther('0.1'));
    assert.equal(plan.unspent, '0.099999999999999999');
    assert.equal(resolveLoopBetSplit(resolveGame('keno'), '9007199254740993', { loop: true, betSplit: '1' }).count, 9007199254740993n);
    assert.throws(() => resolveLoopBetSplit(resolveGame('keno'), undefined, options), /explicit total wager budget/);
    assert.throws(() => resolveLoopBetSplit(resolveGame('keno'), '0.09', options), /0 games/);
  });

  it('preserves survival steps and rejects incompatible exact-stake options', () => {
    assert.doesNotThrow(() => validateSpinUsage(resolveGame('bear-dice'), { loop: true, betSplit: '4', survive: 3 }));
    for (const key of ['primes', 'speed-keno']) {
      assert.throws(() => validateSpinUsage(resolveGame(key), { spin: '4' }), /Use --bet-split/);
    }
    for (const options of [{ betSplit: '4' }, { loop: true, betSplit: '0' },
      { loop: true, betSplit: '4', betStrategy: 'martingale' },
      { loop: true, betSplit: '4', minBet: '5' }, { loop: true, betSplit: '4', maxBet: '3' }]) {
      assert.throws(() => validateSpinUsage(resolveGame('roulette'), options), /--bet-split/);
    }
    assert.throws(() => validateSpinUsage(resolveGame('dino-dough'), { spin: '4', betSplit: '4' }), /only one/);
    assert.throws(() => getGamePaytable(resolveGame('primes'), { amount: '23', spin: '4' }), /Use --bet-split/);
    assert.equal(getGamePaytable(resolveGame('primes'), { amount: '23', betSplit: '4' }).parameters.amount, '20');
  });

  it('runs complete games through the real router and handlers, respecting budgets and safety controls', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bet-split-loops-'));
    const loader = path.join(directory, 'loader.mjs');
    const cli = fileURLToPath(new URL('../../bin/cli.js', import.meta.url));
    // Wallet, RPC, and settlement are replaced; parsers, loop controls, routing,
    // wager allocation and game encoders run normally. No signing is possible.
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
          'export function createClients(account) { return { publicClient: { async getBalance() { return BigInt(process.env.BET_SPLIT_BALANCE) + (globalThis.betSplitBalanceDelta ?? 0n); }, async readContract({functionName}) { return functionName === "MAX_GUESSES" ? 50n : 1n; } }, walletClient: { async writeContract() { throw new Error("Unexpected transaction submission"); } } };'
        );
        if (url.endsWith('/lib/games/base.js')) {
          source = 'import { createEconomics, serializeEconomics } from "../economics.js";\\n' + source;
          source = source.replace('// Total transaction value = bet amount + VRF fee', \`
            const call = globalThis.betSplitCallCount = (globalThis.betSplitCallCount ?? 0) + 1;
            if (call === Number(process.env.BET_SPLIT_FAIL_AT)) throw new Error('Simulated game failure');
            const sequence = process.env.BET_SPLIT_PAYOUTS.split(',');
            const multiplier = BigInt(sequence[Math.min(call - 1, sequence.length - 1)]);
            const payout = wager * multiplier;
            const fee = 10000000000000000n;
            globalThis.betSplitBalanceDelta = (globalThis.betSplitBalanceDelta ?? 0n) + payout - wager - fee;
            const economics = serializeEconomics(createEconomics({ wagerWei: wager, payoutWei: payout, costsWei: fee }));
            const pending = process.env.BET_SPLIT_PENDING === '1';
            return { status: pending ? 'pending' : 'complete', game: gameEntry.key, gameId: String(call), tx: '0x' + String(call).padStart(64, '0'),
              config: { ...config, strictPreflight }, ...economics,
              result: pending ? null : { ...economics, buy_in_wei: wager.toString() } };
          \`);
        }
        return { ...result, source };
      }
    `);
    let runNumber = 0;
    const run = (game, extra = [], settings = {}) => {
      const child = spawnSync(process.execPath, ['--loader', loader, cli,
        'play', game, settings.budget ?? '23', settings.flag ?? '--bet-split', settings.stake ?? '4', '--loop', ...(settings.human ? [] : ['--json']), '--delay', '0', ...extra], {
        encoding: 'utf8', timeout: 10000, input: settings.human ? 'y\n' : undefined,
        env: { ...process.env, APECHURCH_CLI_CONFIG_DIR: path.join(directory, String(++runNumber)),
          APECHURCH_CLI_SUPPRESS_VERSION_BANNER: '1', NODE_NO_WARNINGS: '1',
          BET_SPLIT_BALANCE: parseEther(settings.balance ?? '100').toString(),
          BET_SPLIT_PAYOUTS: settings.payouts ?? '0', BET_SPLIT_FAIL_AT: String(settings.failAt ?? 0),
          BET_SPLIT_PENDING: settings.pending ? '1' : '0' },
      });
      assert.equal(child.status, settings.failAt ? 1 : 0, child.stdout + child.stderr);
      if (settings.human) return child.stdout;
      const lines = child.stdout.trim().split('\n').map(line => JSON.parse(line));
      return lines.at(-1);
    };
    try {
      for (const [game, extra] of [['roulette', ['--bet', 'RED=3,BLACK=1']], ['baccarat', ['--bet', '3.8 BANKER 0.2 TIE']],
        ['ape-strong', []], ['keno', []], ['monkey-match', []], ['gimboz-smash', []], ['glyde-or-crash', ['--multiplier', '2x']],
        ['bear-dice', ['--survive', '3']]]) {
        const result = run(game, extra);
        assert.equal(result.completed_games, 5, JSON.stringify(result));
        assert.equal(result.wager_wei, parseEther('20').toString(), game);
        assert.equal(result.cost_wei, parseEther('0.05').toString(), game);
        assert.deepEqual(result.bet_split, { budget_ape: '23', per_game_ape: '4', wagered_ape: '20', remaining_ape: '3', exhausted: true });
        assert.ok(result.games_detail.every(detail => detail.wager_wei === parseEther('4').toString() && detail.config.strictPreflight));
        if (game === 'bear-dice') assert.ok(result.games_detail.every(detail => detail.config.survive === 3));
        if (game === 'roulette') assert.ok(result.games_detail.every(detail => detail.config.chipValue === '1'));
      }
      // Winning does not refill a wager-volume budget.
      assert.equal(run('ape-strong', [], { payouts: '2' }).completed_games, 5);
      for (const flag of ['--bet-split', '--spin']) {
        const blocks = run('blocks', ['--survive', '3'], { flag });
        assert.equal(blocks.completed_games, 5);
        assert.equal(blocks.bet_split.wagered_ape, '20');
        assert.ok(blocks.games_detail.every(detail => detail.config.survive === 3 && detail.config.compounding === true && detail.config.split === undefined));
      }
      for (const [controls, payouts, count] of [
        [['--max-games', '2'], '0', 2], [['--max-loss', '6'], '0', 2],
        [['--stop-loss', '6'], '0', 2], [['--min-balance', '95'], '0', 2],
        [['--min-profit', '3'], '2', 1], [['--take-profit', '3'], '2', 1],
        [['--max-balance', '103'], '2', 1], [['--target-x', '2'], '2', 1],
        [['--target-profit', '3'], '2', 1], [['--retrace', '4'], '0', 1],
        [['--recover-loss', '4'], '0,3', 2], [['--giveback-profit', '3'], '2,0', 2],
      ]) {
        const result = run('ape-strong', controls, { payouts });
        assert.equal(result.completed_games, count, JSON.stringify({ controls, result }));
        assert.equal(result.bet_split.exhausted, false);
      }
      const shortBalance = run('ape-strong', [], { balance: '6' });
      assert.equal(shortBalance.completed_games, 1);
      assert.equal(shortBalance.bet_split.wagered_ape, '4');
      assert.equal(shortBalance.bet_split.remaining_ape, '19');
      const smallStake = run('ape-strong', [], { balance: '1.5', budget: '0.3', stake: '0.1' });
      assert.equal(smallStake.completed_games, 3);
      assert.equal(smallStake.bet_split.wagered_ape, '0.3');
      const partial = run('ape-strong', [], { failAt: 2 });
      assert.equal(partial.status, 'error');
      assert.equal(partial.completed_games, 1);
      const pending = run('ape-strong', [], { pending: true });
      assert.equal(pending.status, 'pending');
      assert.equal(pending.completed_games, 0);
      assert.equal(pending.bet_split.wagered_ape, '4');
      assert.equal(pending.bet_split.remaining_ape, '19');
      // Values passed to the transaction retain all 18 decimal places.
      const exact = run('ape-strong', ['--max-games', '1'], { budget: '0.3', stake: '0.100000000000000001' });
      assert.equal(exact.games_detail[0].wager_wei, '100000000000000001');
      const human = run('ape-strong', ['--max-bet', '4'], { human: true });
      assert.match(human, /Wager budget: 23 APE; at most 5 games/);
      assert.match(human, /At most 5 games × 4 APE/);
      assert.match(human, /--bet-split wager budget completed/);
      assert.equal((human.match(/LOST/g) ?? []).length, 5);
      assert.ok(!human.includes('Bets will be capped'));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
