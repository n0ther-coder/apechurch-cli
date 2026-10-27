import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEther as wei } from 'viem';
import { resolveBankrollCap, normalizeBankrollStop, getBankrollStopCondition } from '../../lib/bankroll-cap.js';
import { parseLoopTerminalOptions, deriveLoopLossControls, getRemainingBankrollApe,
  getBalanceLoopTerminalCondition, createLoopTerminalState, formatLoopTerminalConditionMessage } from '../../lib/loop-conditions.js';
import { parseStandardBotArgs, prepareStandardBotLoopRuntime, getStandardBotLoopCondition,
  getStandardBotCliForwardTokens, getStandardBotNestedBotForwardTokens,
  validateStandardBotBankrollCapResume } from '../../lib/bots/session.js';
import { buildScriptPayloadFromArgs, normalizeScriptCommand, getBalanceConditionResult,
  parseWatchOptions } from '../../lib/scripts.js';

const cli = fileURLToPath(new URL('../../bin/cli.js', import.meta.url));
const allocation = extra => resolveBankrollCap({ cap: '240', stop: '30',
  startingBalanceWei: wei('400'), bankroll: '120', ...extra });
const controls = () => parseStandardBotArgs(['--bankroll', '120', '--bankroll-stop', '30', '--bankroll-cap', '240']).loopControls;

describe('Shared residual bankroll stop', () => {
  it('validates exact amounts, zero, duplicate flags and incompatible bounds before wallet access', () => {
    assert.equal(normalizeBankrollStop('0'), '0');
    assert.equal(normalizeBankrollStop('.000000000000000001'), '0.000000000000000001');
    for (const stop of ['-1', '2x', '10%', '', 'Infinity', '1e2', '0.0000000000000000001']) {
      assert.throws(() => parseLoopTerminalOptions({ bankrollStop: stop }), /bankroll-stop/);
    }
    assert.throws(() => parseStandardBotArgs(['--bankroll-stop', '2', '--bankroll-stop=3']), /only once/);
    for (const opts of [{ bankrollStop: '240', bankrollCap: '240' },
      { bankrollStop: '120', bankroll: '120' }, { bankrollStop: '121', bankroll: '120' }]) {
      assert.throws(() => parseLoopTerminalOptions(opts), /bankroll-stop/);
    }
    assert.throws(() => allocation({ startingBalanceWei: wei('20') }), /actual initial bankroll/);
  });

  it('keeps initial allocation independent from the stop and computes a relative wallet floor', () => {
    for (const balance of ['400', '650']) {
      const state = allocation({ startingBalanceWei: wei(balance) });
      assert.equal(state.initial_bankroll_ape, '120');
      assert.equal(state.min_balance_ape, String(Number(balance) - 90));
      assert.equal(state.stop_ape, '30');
      assert.equal(state.allocation_min_balance_ape, String(Number(balance) - 120));
    }
    const state = allocation({ cap: null });
    assert.equal(state.cap_ape, null);
    assert.equal(state.initial_bankroll_ape, '120');
    assert.equal(state.min_balance_ape, '310');
    assert.equal(allocation({ minBalance: '300' }).initial_bankroll_ape, '100');
    assert.equal(allocation({ minBalance: '300' }).min_balance_ape, '330');
  });

  it('preserves fractional sizing from the saved allocation after raising the wallet floor', () => {
    const d = deriveLoopLossControls({ bankrollStop: '30', bankrollCap: '240', maxLoss: 120,
      startingBalanceApe: 400 });
    assert.equal(d.minBalance, 310);
    const common = { bankrollStop: '30', bankrollCap: '240', bankrollCapState: d.bankrollCapState,
      startingBalanceApe: 400, minBalance: d.minBalance, maxLoss: 120 };
    assert.equal(getRemainingBankrollApe({ ...common, currentBalanceApe: 400, sessionPnlApe: 0 }), 120);
    assert.equal(getRemainingBankrollApe({ ...common, currentBalanceApe: 380, sessionPnlApe: -20 }), 100);
    assert.equal(getRemainingBankrollApe({ ...common, currentBalanceApe: 600, sessionPnlApe: 200 }), 240);
    const onlyStop = deriveLoopLossControls({ bankrollStop: '30', startingBalanceApe: 400 });
    assert.equal(getRemainingBankrollApe({ bankrollStop: '30', bankrollCapState: onlyStop.bankrollCapState,
      startingBalanceApe: 400, currentBalanceApe: 400, minBalance: onlyStop.minBalance }), 400);
  });

  it('stops at equality on exact net PnL, independently from rounded wallet values', () => {
    const state = allocation();
    assert.equal(getBankrollStopCondition({ capState: state, totalPnlWei: wei('-90') + 1n }), null);
    const condition = getBankrollStopCondition({ capState: state, totalPnlWei: wei('-90') });
    assert.equal(condition.kind, 'bankroll_stop');
    assert.equal(condition.bankroll_ape, '30');
    const runtime = { ...createLoopTerminalState(), bankrollCap: state };
    const result = getBalanceLoopTerminalCondition({ bankrollStop: '30', bankrollCap: '240',
      state: runtime, currentBalanceApe: 400, startingBalanceApe: 400, sessionPnlApe: 0,
      economics: [
        { accounting_version: 2, wager_wei: '0', payout_wei: '0', cost_wei: wei('5').toString() },
        { accounting_version: 2, wager_wei: wei('80').toString(), payout_wei: '0', cost_wei: wei('5').toString() },
      ] });
    assert.equal(result.kind, 'bankroll_stop');
    assert.match(formatLoopTerminalConditionMessage(result), /Bankroll stop reached/);
  });

  it('forwards the fixed effective floor without rebasing the child budget or thresholds', async () => {
    const c = controls();
    const runtime = await prepareStandardBotLoopRuntime({ loopControls: c, getBalanceApe: async () => '400', json: true });
    for (const tokens of [getStandardBotCliForwardTokens(c, runtime), getStandardBotNestedBotForwardTokens(c, { runtime })]) {
      assert.ok(tokens.includes('--min-balance'));
      assert.equal(tokens[tokens.indexOf('--min-balance') + 1], '310');
      assert.ok(!tokens.includes('--bankroll-stop'));
      assert.ok(!tokens.includes('--bankroll-cap'));
    }
    const common = { loopControls: c, state: runtime.state, currentBalanceApe: '310', totalPnlWei: wei('-90') };
    assert.equal(getStandardBotLoopCondition({ ...common, includeBankrollCap: false }).kind, 'bankroll_stop');
    assert.equal(getStandardBotLoopCondition({ ...common, currentBalanceApe: '520', totalPnlWei: wei('120') }), null);
    const saved = JSON.parse(JSON.stringify(runtime, (_, v) => typeof v === 'bigint' ? String(v) : v));
    assert.doesNotThrow(() => validateStandardBotBankrollCapResume(c, c, saved));
    const altered = structuredClone(saved);
    altered.state.bankrollCap.stop_ape = '0';
    assert.throws(() => validateStandardBotBankrollCapResume(c, c, altered), /resume/);
    assert.throws(() => validateStandardBotBankrollCapResume({ ...c, bankrollStop: '31' }, c, saved), /resume/);
    const standalone = parseStandardBotArgs(['--bankroll', '120', '--bankroll-stop=30']).loopControls;
    const r = await prepareStandardBotLoopRuntime({ loopControls: standalone, getBalanceApe: async () => '400', json: true, confirmWarnings: false });
    assert.equal(r.state.bankrollCap.min_balance_ape, '310');
    assert.throws(() => validateStandardBotBankrollCapResume({ ...standalone, bankrollStop: '31' }, standalone, r), /resume/);
  });

  it('round-trips script commands without changing watcher balance semantics', () => {
    const argv = ['play', 'roulette', '--bet', 'RED', '--bankroll', '120', '--bankroll-stop', '30', '--bankroll-cap', '240', '--loop'];
    assert.deepEqual(normalizeScriptCommand(buildScriptPayloadFromArgs(argv)), argv);
    const opts = parseWatchOptions({ every: '300', ifBalanceOver: '400' });
    assert.equal(getBalanceConditionResult(wei('400'), opts).ok, false);
  });

  for (const game of ['roulette', 'blackjack', 'cash-dash', 'hi-lo-nebula', 'video-poker']) {
    it(`rejects both undashed controls in ${game} before validation or game dispatch`, t => {
      const config = mkdtempSync(join(tmpdir(), 'bankroll-prefix-'));
      t.after(() => rmSync(config, { recursive: true, force: true }));
      const env = { PATH: process.env.PATH, APECHURCH_CLI_CONFIG_DIR: config,
        NO_UPDATE_NOTIFIER: '1', APECHAIN_RPC_URL: 'http://127.0.0.1:1' };
      const paths = game === 'roulette' ? [['play', game, '10']] : [['play', game, '10'], [game, '10']];
      for (const prefix of paths) {
        for (const flag of ['bankroll-cap', 'bankroll-stop']) {
          for (const tokens of [[flag, '30'], [flag + '=30']]) {
            let error;
            try {
              execFileSync(process.execPath, [cli, ...prefix, ...tokens,
                ...(prefix[0] === 'play' ? ['--validate-only'] : []), '--json'],
                { encoding: 'utf8', stdio: 'pipe', env, timeout: 5000 });
            } catch (caught) { error = caught; }
            assert.ok(error, 'bare optional controls must not be silently ignored');
            assert.match(String(error.stderr), /optional control.*required -- prefix|too many arguments/);
          }
        }
      }
    });

    it(`supports stop with or without cap in ${game}, including offline validation and help`, () => {
      for (const extra of [[], ['--bankroll-cap', '240']]) {
        const output = execFileSync(process.execPath, [cli, 'play', game, '--loop', '--bankroll', '120',
          '--bankroll-stop', '30', ...extra, '--bet-strategy', 'bankroll-fraction=0.1', '--validate-only', '--json'], { encoding: 'utf8' });
        assert.equal(JSON.parse(output).status, 'valid');
      }
      const help = execFileSync(process.execPath, [cli, game === 'roulette' ? 'play' : game, '--help'], { encoding: 'utf8' });
      assert.match(help, /--bankroll-stop/);
      assert.throws(() => execFileSync(process.execPath, [cli, 'play', game, '10', '--bankroll', '120',
        '--bankroll-stop', '120', '--validate-only', '--json'], { encoding: 'utf8', stdio: 'pipe' }));
    });
  }
});
