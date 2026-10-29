import { observeGasReceipt } from './gas-estimates.js';
import { loadHistory, saveGameToHistory } from './profile.js';
import { COST_COMPONENTS, createEconomics, serializeEconomics, sumTransactionCosts } from './economics.js';

function historyGame(contract, gameId, walletAddress) {
  return loadHistory(walletAddress).games.find((game) =>
    String(game.contract).toLowerCase() === String(contract).toLowerCase()
    && String(game.game_id ?? game.gameId) === String(gameId));
}

// Observe each submitted hash and each mined receipt, including reverted retries.
// Only successful receipts spend protocol/executor/VRF value; every mined receipt
// spends gas. A pending hash remains pending and must never be re-submitted here.
export function createGameCostObserver({ contract, gameId, walletAddress, componentsWei = {}, chainId, config = null }) {
  const observer = ({ hash, receipt = null }) => {
    const previous = historyGame(contract, gameId, walletAddress);
    const transactions = [...(previous?.cost_transactions ?? [])];
    const key = String(hash).toLowerCase();
    const index = transactions.findIndex((tx) => String(tx.hash).toLowerCase() === key);
    const existing = index >= 0 ? transactions[index] : {};
    const confirmed = Boolean(receipt);
    const reverted = receipt?.status === 'reverted' || receipt?.status === 0;
    const gasKnown = confirmed && receipt.gasUsed != null && receipt.effectiveGasPrice != null;
    const entry = {
      ...existing,
      hash,
      additional_components_wei: Object.fromEntries(Object.entries(componentsWei).map(([name, value]) => [name, String(value)])),
      confirmed: confirmed || Boolean(existing.confirmed),
      status: confirmed ? (reverted ? 'reverted' : 'success') : existing.status ?? 'pending',
      gas_wei: gasKnown
        ? (BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice)).toString()
        : existing.gas_wei ?? null,
      ...Object.fromEntries(COST_COMPONENTS.filter((name) => name !== 'gas').map((name) => [
        `${name}_wei`, confirmed ? (reverted ? '0' : String(componentsWei[name] ?? 0n)) : existing[`${name}_wei`] ?? '0',
      ])),
    };
    if (index >= 0) transactions[index] = entry;
    else transactions.push(entry);
    saveGameToHistory({ contract, gameId, tx: confirmed && !reverted ? hash : undefined,
      walletAddress, cost_transactions: transactions });
    const effectiveConfig = config ?? previous?.config;
    if (effectiveConfig) observeGasReceipt({ chainId, contract, config: effectiveConfig, hash, receipt });
  };
  observer.getFailureAccounting = () => getGameFailureAccounting({ contract, gameId, walletAddress });
  return observer;
}

export function getGameEconomicsFields({ contract, gameId, walletAddress, wagerWei, payoutWei }) {
  const game = historyGame(contract, gameId, walletAddress);
  const transactions = game?.cost_transactions ?? [];
  const costs = sumTransactionCosts(transactions);
  if (!transactions.length) {
    costs.complete = false;
    costs.total_wei = null;
    costs.total_ape = null;
  }
  const economics = createEconomics({
    wagerWei, payoutWei,
    costsWei: costs.total_wei,
  });
  return serializeEconomics(economics, costs);
}

export function withGameEconomics(state, { contract, wagerWei, payoutWei }) {
  if (!state) return state;
  if (!state.isComplete) {
    const game = historyGame(contract, state.gameId, state.user ?? state.player);
    if (!game?.cost_transactions) return state;
    const costs = sumTransactionCosts(game.cost_transactions);
    return { ...state, costs, cost_wei: costs.total_wei, cost_ape: costs.total_ape };
  }
  return {
    ...state,
    ...getGameEconomicsFields({ contract, gameId: state.gameId,
      walletAddress: state.user ?? state.player, wagerWei, payoutWei }),
  };
}

export async function reconcileGameCosts({ publicClient, contract, gameId, walletAddress }) {
  const game = historyGame(contract, gameId, walletAddress);
  for (const tx of game?.cost_transactions ?? []) {
    if (tx.confirmed && tx.gas_wei != null) continue;
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: tx.hash });
      createGameCostObserver({ contract, gameId, walletAddress,
        componentsWei: tx.additional_components_wei ?? {}, chainId: publicClient.chain?.id,
        config: game?.config })({ hash: tx.hash, receipt });
    } catch {
      // A missing receipt means unknown costs, never zero costs or a new bet.
    }
  }
}

export function assertCompleteResultCosts(state) {
  if (state?.accounting_version >= 2 && state.pnl_wei === null) {
    const error = new Error('Settled game costs are incomplete; reconcile its transaction receipts before continuing.');
    error.code = 'ACCOUNTING_INCOMPLETE';
    throw error;
  }
}

export function getGameFailureAccounting({ contract, gameId, walletAddress }) {
  const game = historyGame(contract, gameId, walletAddress);
  const transactions = game?.cost_transactions ?? [];
  if (!transactions.length) return null;
  const costs = sumTransactionCosts(transactions);
  const failedOnly = transactions.every((tx) => tx.confirmed && tx.status === 'reverted')
    && (!game?.wager_wei || BigInt(game.wager_wei) === 0n);
  return {
    ...(failedOnly ? serializeEconomics(createEconomics({ wagerWei: 0n, payoutWei: 0n, costsWei: costs.total_wei }), costs)
      : { accounting_version: 2, costs, cost_wei: costs.total_wei, cost_ape: costs.total_ape, pnl_wei: null, pnl_ape: null }),
    contract, gameId: String(gameId), failed_transaction_only: failedOnly,
    counts_as_game: false,
  };
}
