import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseEther } from 'viem';
import { getBankrollCapCondition, normalizeBankrollCap, resolveBankrollCap } from '../../lib/bankroll-cap.js';
import { createLoopTerminalState, deriveLoopLossControls, getBalanceLoopTerminalCondition,
  getRemainingBankrollApe, parseLoopTerminalOptions } from '../../lib/loop-conditions.js';
import { createStandardBotLoopState, getStandardBotCliForwardTokens, getStandardBotLoopCondition,
  getStandardBotNestedBotForwardTokens, parseStandardBotArgs, prepareStandardBotLoopRuntime,
  validateStandardBotBankrollCapResume } from '../../lib/bots/session.js';
import { buildScriptPayloadFromArgs, normalizeScriptCommand } from '../../lib/scripts.js';

const wei = parseEther;
const cli = fileURLToPath(new URL('../../bin/cli.js', import.meta.url));

describe('Shared bankroll cap', () => {
  it('validates positive exact APE inputs and rejects ratios and excessive precision', () => {
    assert.equal(normalizeBankrollCap('240.00'), '240');
    assert.equal(normalizeBankrollCap('0.000000000000000001'), '0.000000000000000001');
    for (const value of ['0', '-1', '20%', '2x', '', '1.0000000000000000001', 'Infinity']) {
      assert.throws(() => normalizeBankrollCap(value), /bankroll-cap/);
    }
    assert.equal(parseLoopTerminalOptions({ bankrollCap: '240' }).bankrollCap, '240');
    assert.equal(parseStandardBotArgs(['--bankroll-cap=240']).loopControls.bankrollCap, '240');
    assert.throws(() => parseStandardBotArgs(['--bankroll-cap', '2', '--bankroll-cap', '3']), /only once/);
  });

  it('allocates from wallet, floor, optional absolute budget and cap independently', () => {
    for (const [balance, floor, budget, initial, effectiveFloor] of [
      ['400', '90', null, '240', '160'],
      ['250', '90', null, '160', '90'],
      ['400', null, null, '240', '160'],
      ['400', '90', '120', '120', '280'],
      ['400', '90', '50%', '240', '160'],
      ['80', '90', null, '0', '90'],
    ]) {
      const state = resolveBankrollCap({ cap: '240', startingBalanceWei: wei(balance),
        minBalance: floor, bankroll: budget });
      assert.equal(state.initial_bankroll_ape, initial);
      assert.equal(state.min_balance_ape, effectiveFloor);
    }
  });

  it('compares exact net capital strictly, including one-wei boundaries and negative PnL', () => {
    const capState = resolveBankrollCap({ cap: '240', startingBalanceWei: wei('250'), minBalance: '90' });
    assert.equal(getBankrollCapCondition({ capState, totalPnlWei: wei('80') }), null);
    assert.equal(getBankrollCapCondition({ capState, totalPnlWei: wei('-10') }), null);
    const stop = getBankrollCapCondition({ capState, totalPnlWei: wei('80') + 1n, executions: 2 });
    assert.equal(stop.kind, 'bankroll_cap');
    assert.equal(stop.excess_ape, '0.000000000000000001');
  });

  it('resolves loop sizing and a profit exit with no max-loss or min-profit', () => {
    const controls = deriveLoopLossControls({ bankrollCap: '240', startingBalanceApe: 400, minBalance: 90 });
    assert.equal(controls.minBalance, 160);
    assert.equal(controls.maxLoss, null);
    assert.equal(getRemainingBankrollApe({ bankrollCap: '240', startingBalanceApe: 400,
      currentBalanceApe: 450, sessionPnlApe: 50, minBalance: 160 }), 240);
    assert.equal(getRemainingBankrollApe({ bankrollCap: '240', startingBalanceApe: 400,
      currentBalanceApe: 350, sessionPnlApe: -50 }), 190);
    const state = createLoopTerminalState();
    state.bankrollCap = controls.bankrollCapState;
    const common = { currentBalanceApe: 401, startingBalanceApe: 400, minBalance: 160,
      bankrollCap: '240', state, gamesPlayed: 1 };
    assert.equal(getBalanceLoopTerminalCondition({ ...common, sessionPnlApe: 0 }), null);
    assert.equal(getBalanceLoopTerminalCondition({ ...common, sessionPnlApe: 1 }).kind, 'bankroll_cap');
    assert.equal(getBalanceLoopTerminalCondition({ ...common, currentBalanceApe: 160,
      sessionPnlApe: -240 }).kind, 'min_balance');
  });

  it('uses receipt net PnL rather than rounded or gross loop profit', () => {
    const condition = getBalanceLoopTerminalCondition({ currentBalanceApe: 401,
      startingBalanceApe: 400, minBalance: 90, bankrollCap: '240', sessionPnlApe: 1,
      economics: [{ accounting_version: 2, wager_wei: wei('10').toString(),
        payout_wei: wei('11').toString(), cost_wei: wei('2').toString() }] });
    assert.equal(condition, null);
    const exact = getBalanceLoopTerminalCondition({ currentBalanceApe: 400,
      startingBalanceApe: 400, minBalance: 90, bankrollCap: '240', sessionPnlApe: 0,
      economics: [{ accounting_version: 2, wager_wei: wei('10').toString(),
        payout_wei: (wei('10') + 1n).toString(), cost_wei: '0' }] });
    assert.equal(exact.excess_ape, '0.000000000000000001');
  });

  it('initializes standard bot controls and forwards only the effective wallet floor', async () => {
    const controls = parseStandardBotArgs(['--bankroll-cap', '240', '--min-balance', '90']).loopControls;
    const runtime = await prepareStandardBotLoopRuntime({ loopControls: controls,
      getBalanceApe: async () => '400.000000000000000001', json: true });
    const forwarded = getStandardBotCliForwardTokens(controls, runtime);
    assert.deepEqual(forwarded, ['--min-balance', '160.000000000000000001']);
    assert.ok(!getStandardBotNestedBotForwardTokens(controls, { runtime }).includes('--bankroll-cap'));
    const common = { loopControls: controls, state: runtime.state, executions: 1,
      currentBalanceApe: '401', totalPnlWei: wei('1') };
    assert.equal(getStandardBotLoopCondition({ ...common, includeBankrollCap: false }), null);
    assert.equal(getStandardBotLoopCondition(common).kind, 'bankroll_cap');
    assert.equal(getStandardBotLoopCondition({ ...common, loopControls: { ...controls, minProfit: '1' } }).kind, 'min_profit');
    const saved = JSON.parse(JSON.stringify(runtime, (_, value) => typeof value === 'bigint' ? value.toString() : value));
    assert.doesNotThrow(() => validateStandardBotBankrollCapResume(controls, controls, saved));
    assert.throws(() => validateStandardBotBankrollCapResume({ ...controls, bankrollCap: '241' }, controls, saved), /resume/);
  });

  it('does not invent a wallet balance from an opening wager in simulations', () => {
    assert.throws(() => getStandardBotLoopCondition({ loopControls: { bankrollCap: '240' },
      state: createStandardBotLoopState() }), /known starting wallet balance/);
  });

  it('preserves the option through script serialization', () => {
    const command = ['play', 'roulette', '10', '--bet', 'RED', '--bankroll-cap', '240', '--min-balance', '90', '--loop'];
    assert.deepEqual(normalizeScriptCommand(buildScriptPayloadFromArgs(command)), command);
  });

  for (const game of ['roulette', 'blackjack', 'cash-dash', 'hi-lo-nebula', 'video-poker']) {
    it(`accepts the shared cap in ${game} validation and help without wallet access`, () => {
      const output = execFileSync(process.execPath, [cli, 'play', game, '10', '--loop',
        '--bankroll-cap', '240', '--min-balance', '90', '--validate-only', '--json'], { encoding: 'utf8' });
      assert.equal(JSON.parse(output).status, 'valid');
      const help = execFileSync(process.execPath, [cli, game === 'roulette' ? 'play' : game, '--help'], { encoding: 'utf8' });
      assert.match(help, /--bankroll-cap/);
      const fractional = execFileSync(process.execPath, [cli, 'play', game, '--loop',
        '--bankroll-cap', '240', '--bet-strategy', 'bankroll-fraction=0.1',
        '--validate-only', '--json'], { encoding: 'utf8' });
      assert.equal(JSON.parse(fractional).status, 'valid');
    });
  }
});
