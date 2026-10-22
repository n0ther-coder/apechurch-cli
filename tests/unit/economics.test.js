import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseEther } from 'viem';
import { aggregateEconomicsPayloads, createEconomics, multiplierText, serializeEconomics, sumTransactionCosts } from '../../lib/economics.js';
import { submitAndConfirmWithRetry } from '../../lib/tx-resilience.js';

describe('gross returns and net result accounting', () => {
  it('allows a positive payout multiplier and a negative net result', () => {
    const result = serializeEconomics(createEconomics({
      wagerWei: parseEther('10'), payoutWei: parseEther('10.1'), costsWei: parseEther('0.2'),
    }));
    assert.equal(result.multiplier_display, '1.01×');
    assert.equal(result.pnl_ape, '-0.1');
    assert.equal(result.gross_profit_ape, '0.1');
  });

  it('uses matching cumulative wager and payout rather than the opening stake', () => {
    assert.equal(multiplierText(parseEther('20.2'), parseEther('20')), '1.01');
    assert.equal(multiplierText(parseEther('10'), parseEther('20')), '0.50');
  });

  it('keeps an unknown result unknown and leaves a zero-wager multiplier undefined', () => {
    assert.equal(createEconomics({ wagerWei: 10n, payoutWei: 20n }).pnlWei, null);
    const result = serializeEconomics(createEconomics({ wagerWei: 0n, payoutWei: 0n, costsWei: 5n }));
    assert.equal(result.multiplier, null);
    assert.equal(result.pnl_wei, '-5');
  });

  it('includes exhausted retry costs without adding a game wager or payout', () => {
    const settled = serializeEconomics(createEconomics({ wagerWei: parseEther('10'),
      payoutWei: parseEther('20'), costsWei: parseEther('0.2') }));
    const failed = serializeEconomics(createEconomics({ wagerWei: 0n, payoutWei: 0n,
      costsWei: parseEther('0.3') }));
    const total = aggregateEconomicsPayloads([settled, failed]);
    assert.equal(total.wager_ape, '10');
    assert.equal(total.payout_ape, '20');
    assert.equal(total.cost_ape, '0.5');
    assert.equal(total.pnl_ape, '9.5');
    assert.equal(total.multiplier_display, '2.00×');
  });

  it('deduplicates transactions and exports each additional cost component', () => {
    const tx = { hash: '0xaaa', confirmed: true, gas_wei: '7', vrf_wei: '3', executor_wei: '2' };
    const result = sumTransactionCosts([tx, tx]);
    assert.equal(result.total_wei, '12');
    assert.equal(result.gas_wei, '7');
    assert.equal(result.vrf_wei, '3');
    assert.equal(result.executor_wei, '2');
    assert.equal(sumTransactionCosts([{ hash: '0xbbb', confirmed: false, gas_wei: null }]).total_wei, null);
  });

  it('preserves separate cost-only placeholders across nested aggregates', () => {
    const settled = { wager_ape: '10', payout_ape: '20', cost_ape: '0.1' };
    const failed = aggregateEconomicsPayloads([{ wager_ape: '0', payout_ape: '0', cost_ape: '0.5' }]);
    const resumed = aggregateEconomicsPayloads([settled, failed]);
    assert.equal(resumed.cost_ape, '0.6');
    assert.equal(resumed.pnl_ape, '9.4');
    const another = aggregateEconomicsPayloads([{ wager_ape: '1', payout_ape: '2', cost_ape: '0.2' }]);
    const outer = aggregateEconomicsPayloads([resumed, another]);
    assert.equal(outer.cost_ape, '0.8');
    assert.equal(outer.pnl_ape, '10.2');
    assert.equal(new Set(outer.costs.transactions.map((tx) => tx.hash)).size, 3);
  });

  it('still deduplicates a real receipt shared by nested aggregates', () => {
    const tx = { hash: '0xaaa', confirmed: true, gas_wei: parseEther('0.1').toString() };
    const child = { wager_ape: '10', payout_ape: '20', costs: sumTransactionCosts([tx]) };
    const total = aggregateEconomicsPayloads([aggregateEconomicsPayloads([child]), child]);
    assert.equal(total.wager_ape, '20');
    assert.equal(total.payout_ape, '40');
    assert.equal(total.cost_ape, '0.1');
    assert.equal(total.costs.transactions.length, 1);
  });

  it('observes failed receipts and then continues with the successful retry', async () => {
    const seen = [];
    let sends = 0;
    const result = await submitAndConfirmWithRetry({
      send: async () => `0x${++sends}`,
      wait: async () => ({ status: sends === 1 ? 'reverted' : 'success', gasUsed: 3n, effectiveGasPrice: 2n }),
      retryReverted: true,
      sleepFn: async () => {},
      onTransaction: (tx) => seen.push(tx),
    });
    assert.equal(result.hash, '0x2');
    assert.equal(result.pending, false);
    assert.deepEqual(seen.map((tx) => [tx.hash, tx.receipt?.status ?? 'pending']), [
      ['0x1', 'pending'], ['0x1', 'reverted'], ['0x2', 'pending'], ['0x2', 'success'],
    ]);
  });
});
