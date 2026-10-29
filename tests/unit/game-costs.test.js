import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEther } from 'viem';

const originalConfig = process.env.APECHURCH_CLI_CONFIG_DIR;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'game-cost-ledger-'));
process.env.APECHURCH_CLI_CONFIG_DIR = directory;
const { createGameCostObserver, getGameEconomicsFields, reconcileGameCosts } = await import('../../lib/game-costs.js');
const { saveGameToHistory, loadHistory } = await import('../../lib/profile.js');
const { GAS_CACHE_FILE, gasModeKey } = await import('../../lib/gas-estimates.js');
const walletAddress = `0x${'1'.repeat(40)}`;
const contract = `0x${'2'.repeat(40)}`;
after(() => {
  if (originalConfig === undefined) delete process.env.APECHURCH_CLI_CONFIG_DIR;
  else process.env.APECHURCH_CLI_CONFIG_DIR = originalConfig;
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('persistent per-game transaction costs', () => {
  it('classifies legacy recorded costs as net results without a new receipt ledger', () => {
    saveGameToHistory({ contract, gameId: 'legacy-fees', walletAddress,
      wager_wei: parseEther('10').toString(), payout_wei: parseEther('10.1').toString(),
      contract_fee_wei: parseEther('0.2').toString(), gas_fee_wei: '0' });
    const game = loadHistory(walletAddress).games.find((game) => game.game_id === 'legacy-fees');
    assert.equal(game.pnl_ape, '-0.1');
    assert.equal(game.won, false);
    assert.equal(game.push, false);
  });
  it('adds gas from a reverted attempt and charges VRF only for the successful attempt', () => {
    const observe = createGameCostObserver({ contract, gameId: '1', walletAddress, componentsWei: { vrf: 10n } });
    observe({ hash: '0xaaa' });
    observe({ hash: '0xaaa', receipt: { status: 'reverted', gasUsed: 3n, effectiveGasPrice: 2n } });
    observe({ hash: '0xbbb', receipt: { status: 'success', gasUsed: 4n, effectiveGasPrice: 2n } });
    observe({ hash: '0xbbb', receipt: { status: 'success', gasUsed: 4n, effectiveGasPrice: 2n } });
    const result = getGameEconomicsFields({ contract, gameId: '1', walletAddress, wagerWei: 100n, payoutWei: 125n });
    assert.equal(result.costs.gas_wei, '14');
    assert.equal(result.costs.vrf_wei, '10');
    assert.equal(result.costs.transactions.length, 2);
    assert.equal(result.pnl_wei, '1');
  });

  it('reconciles the existing pending hash without submitting another transaction', async () => {
    const observe = createGameCostObserver({ contract, gameId: '2', walletAddress, componentsWei: { vrf: 5n, executor: 2n } });
    observe({ hash: '0xccc' });
    assert.equal(getGameEconomicsFields({ contract, gameId: '2', walletAddress, wagerWei: 10n, payoutWei: 20n }).pnl_wei, null);
    await reconcileGameCosts({ contract, gameId: '2', walletAddress, publicClient: {
      getTransactionReceipt: async ({ hash }) => {
        assert.equal(hash, '0xccc');
        return { status: 'success', gasUsed: 2n, effectiveGasPrice: 1n };
      },
    } });
    const result = getGameEconomicsFields({ contract, gameId: '2', walletAddress, wagerWei: 10n, payoutWei: 20n });
    assert.equal(result.cost_wei, '9');
    assert.equal(result.pnl_wei, '1');
  });

  it('keeps receipt-derived history costs when completion supplies legacy zero gas', () => {
    const observe = createGameCostObserver({ contract, gameId: '3', walletAddress, componentsWei: { vrf: parseEther('0.1') } });
    observe({ hash: '0xddd', receipt: { status: 'success', gasUsed: 1n, effectiveGasPrice: parseEther('0.05') } });
    saveGameToHistory({ contract, gameId: '3', walletAddress,
      wager_wei: parseEther('10').toString(), payout_wei: parseEther('10.1').toString(), gas_fee_wei: '0' });
    const entry = loadHistory(walletAddress).games.find((game) => game.game_id === '3');
    assert.equal(entry.gas_fee_ape, '0.05');
    assert.equal(entry.pnl_ape, '-0.05');
    assert.equal(entry.multiplier_display, '1.01×');
  });

  it('exports failed-only gas with zero wager without inventing a game outcome', () => {
    const observe = createGameCostObserver({ contract, gameId: 'failed-only', walletAddress, componentsWei: { vrf: 100n } });
    observe({ hash: '0xfail', receipt: { status: 'reverted', gasUsed: 3n, effectiveGasPrice: 2n } });
    const accounting = observe.getFailureAccounting();
    assert.equal(accounting.wager_wei, '0');
    assert.equal(accounting.payout_wei, '0');
    assert.equal(accounting.cost_wei, '6');
    assert.equal(accounting.pnl_wei, '-6');
    assert.equal(accounting.multiplier, null);
    assert.equal(accounting.counts_as_game, false);
    assert.equal(accounting.costs.vrf_wei, '0');
    const entry = loadHistory(walletAddress).games.find((game) => game.game_id === 'failed-only');
    assert.equal(entry.cost_wei, '6');
    assert.equal(entry.wager_wei, undefined);
  });

  it('feeds successful receipt gas into planning without adding fields to the accounting ledger', () => {
    const config = { range: 72 };
    const hash = `0x${'7'.repeat(64)}`;
    const observe = createGameCostObserver({ contract, gameId: 'calibration', walletAddress, config });
    observe({ hash, receipt: { status: 'success', gasUsed: 250001n, effectiveGasPrice: 3n } });
    const data = JSON.parse(fs.readFileSync(GAS_CACHE_FILE, 'utf8'));
    assert.equal(data.modes[gasModeKey({ contract, config })][0].gas, '250001');
    const game = loadHistory(walletAddress).games.find(game => game.game_id === 'calibration');
    assert.equal(game.cost_transactions[0].gas_wei, '750003');
    assert.equal(game.cost_transactions[0].gas_units, undefined);
  });

  it('does not invent zero fees for a game with no receipts', () => {
    const result = getGameEconomicsFields({ contract, gameId: 'missing', walletAddress, wagerWei: 10n, payoutWei: 20n });
    assert.equal(result.costs.complete, false);
    assert.equal(result.cost_wei, null);
    assert.equal(result.pnl_wei, null);
  });
});
