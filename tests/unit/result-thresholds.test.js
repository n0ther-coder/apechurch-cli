import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseEther } from 'viem';
import { normalizePnlThreshold, pnlThresholdWei } from '../../lib/result-thresholds.js';
import { getStandardBotLoopCondition, getSettledPlayEconomics, createStandardBotLoopState } from '../../lib/bots/session.js';
import { getSingleGameLoopTerminalCondition } from '../../lib/loop-conditions.js';

describe('net result thresholds', () => {
  it('resolves whole percentages over the controlled wager and waits for a nonzero wager', () => {
    assert.equal(pnlThresholdWei('25%', parseEther('20')), parseEther('5'));
    assert.equal(pnlThresholdWei('25%', 0n), null);
    assert.throws(() => normalizePnlThreshold('1x'), /whole percentage/);
    assert.throws(() => normalizePnlThreshold('2.5%'), /whole percentage/);
  });
  it('permits a positive payout multiplier together with a net loss', () => {
    const economics = getSettledPlayEconomics({ status: 'complete', accounting_version: 2,
      wager_ape: '10', payout_ape: '10.1', cost_wei: parseEther('0.2').toString() }, 1);
    assert.equal(economics.pnlWei, parseEther('-0.1'));
    assert.equal(getSingleGameLoopTerminalCondition({ gameResult: {
      bet: 10, payout: 10.1, pnl_ape: '-0.1', exactPayout: true }, targetProfit: '1%' }), null);
  });
  it('uses recorded net PnL even when a wallet deposit crosses a profit threshold', () => {
    assert.equal(getStandardBotLoopCondition({ loopControls: { minProfit: '10%' },
      totalWagerWei: parseEther('100'), totalPnlWei: parseEther('-1'),
      currentBalanceApe: '5000', startingBalanceApe: '100' }), null);
  });
  it('uses actual cumulative wager for a percentage session limit', () => {
    const condition = getStandardBotLoopCondition({ loopControls: { maxLoss: '20%' },
      totalWagerWei: parseEther('50'), totalPnlWei: parseEther('-10'), executions: 2 });
    assert.equal(condition.kind, 'max_loss');
  });
  it('rejects a settled version-2 result with unknown costs before another decision', () => {
    assert.throws(() => getSettledPlayEconomics({ status: 'complete', accounting_version: 2,
      wager_ape: '10', payout_ape: '11', cost_wei: null }, 1), /costs are incomplete/);
  });
  it('arms a trailing guard from net results, independently of wallet transfers', () => {
    const state = createStandardBotLoopState();
    getStandardBotLoopCondition({ loopControls: { recoverLoss: '5' },
      totalPnlWei: parseEther('-6'), currentBalanceApe: '5000', state });
    assert.equal(state.recoverLossArmed, true);
    const condition = getStandardBotLoopCondition({ loopControls: { recoverLoss: '5' },
      totalPnlWei: 0n, currentBalanceApe: '1', state });
    assert.equal(condition.kind, 'recover_loss');
  });
});
