import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareStrategyAmounts as compare, strategyShortfall,
  extractStrategyPrecisionArgs, inheritStrategyPrecisionArgs,
  resolveStrategyPrecisionResume,
} from '../../lib/bots/strategy-precision.js';
import { parseApeToWei as wei, getStandardBotLoopCondition } from '../../lib/bots/session.js';

describe('Strategy comparison precision', () => {
  it('validates precision and preserves explicit values over inheritance', () => {
    for (const precision of ['0', '2', '18', 'none']) {
      assert.equal(extractStrategyPrecisionArgs([`--strategy-precision=${precision}`], '7').precision, precision);
      assert.deepEqual(inheritStrategyPrecisionArgs(['--strategy-precision', precision], '3'), ['--strategy-precision', precision]);
    }
    assert.equal(extractStrategyPrecisionArgs([], '4').precision, '4');
    assert.equal(extractStrategyPrecisionArgs([]).precision, 'none');
    for (const value of ['-1', '19', '1.5', 'NaN', '', undefined]) {
      assert.throws(() => extractStrategyPrecisionArgs(['--strategy-precision', value]), /requires/);
    }
    assert.throws(() => extractStrategyPrecisionArgs(['--strategy-precision=2', '--strategy-precision=none']), /once/);
  });

  it('truncates signed differences, not operands, across decimal boundaries', () => {
    for (const base of ['0', '10', '-10', '1000000000000000000000']) {
      const target = wei(base);
      for (const [delta, result] of [['-0.01', -1], ['-0.009999', 0], ['0', 0], ['0.009999', 0], ['0.01', 1]]) {
        assert.equal(compare(target + wei(delta), target, '2'), result);
      }
    }
    assert.equal(compare(wei('9.9999'), wei('10'), '2'), 0);
    assert.equal(compare(-1n, 0n), -1);
    assert.equal(compare(-1n, 0n, 'none'), -1);
    assert.equal(compare(0n, 1n, '18'), -1);
  });

  it('converts ratios to currency without scaling tolerance with the wager', () => {
    for (const wager of [wei('1'), wei('1000')]) {
      const required = wager * 101n;
      assert.equal(compare(required / 100n - wei('0.009'), required, '2', 100n), 0);
      assert.equal(compare(required / 100n - wei('0.01'), required, '2', 100n), -1);
    }
    assert.equal(compare(3n, 36n, '18', 10n), 0);
    assert.equal(compare(3n, 36n, 'none', 10n), 0);
    assert.deepEqual(strategyShortfall(3n, 36n, 10n), {});
    assert.deepEqual(strategyShortfall(wei('4'), wei('3')), {});
    assert.deepEqual(strategyShortfall(wei('-0.004'), 0n), { shortfall_ape: '0.004' });
  });

  it('restores saved precision, preserves legacy exact mode, and rejects changes', () => {
    const saved = { resume_state: { loop_controls: { strategyPrecision: '4' } } };
    assert.equal(resolveStrategyPrecisionResume([], saved), '4');
    assert.equal(resolveStrategyPrecisionResume(['--strategy-precision=4'], saved), '4');
    assert.throws(() => resolveStrategyPrecisionResume(['--strategy-precision=2'], saved), /Cannot change/);
    assert.equal(resolveStrategyPrecisionResume([], { args: [] }), 'none');
    assert.throws(() => resolveStrategyPrecisionResume([], { args: ['--strategy-precision=4'],
      resume_state: { strategy_precision: '2' } }), /Inconsistent saved/);
    assert.throws(() => resolveStrategyPrecisionResume([], {
      resume_state: { strategy_precision: '2', loop_controls: { strategyPrecision: 'none' } },
    }), /Inconsistent saved/);
  });

  it('keeps wallet and loss protections exact while tolerating strategic profit targets', () => {
    assert.equal(getStandardBotLoopCondition({ loopControls: { minProfit: '10', strategyPrecision: '2' }, totalPnlWei: wei('9.995') }).kind, 'min_profit');
    assert.equal(getStandardBotLoopCondition({ loopControls: { minProfit: '10', strategyPrecision: 'none' }, totalPnlWei: wei('9.995') }), null);
    assert.equal(getStandardBotLoopCondition({ loopControls: { minBalance: '10', strategyPrecision: '0' }, currentBalanceApe: '9.999' }).kind, 'min_balance');
    assert.equal(getStandardBotLoopCondition({ loopControls: { maxLoss: '10', strategyPrecision: '0' }, totalPnlWei: wei('-10.001') }).kind, 'max_loss');
  });
});

for (const precision of ['none', '18', '2']) {
  it(`discards fractional wei before the signed difference (${precision})`, () => {
    assert.equal(compare(3n, 39n, precision, 10n), 0);
    assert.equal(compare(-3n, -39n, precision, 10n), 0);
    const required = wei('10') * 100n + 99n;
    assert.equal(compare(wei('9.99'), required, '2', 100n), -1);
    assert.equal(compare(wei('9.99') + 1n, required, '2', 100n), 0);
    assert.deepEqual(strategyShortfall(2n, 39n, 10n), { shortfall_ape: '0.000000000000000001' });
    assert.deepEqual(strategyShortfall(0n, 1n, 3n), {});
    assert.deepEqual(strategyShortfall(-4n, -39n, 10n), { shortfall_ape: '0.000000000000000001' });
  });
}
