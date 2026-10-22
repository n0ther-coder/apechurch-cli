import { formatEther, parseEther } from 'viem';

export const ACCOUNTING_VERSION = 2;
export const COST_COMPONENTS = Object.freeze(['vrf', 'protocol', 'executor', 'gas', 'other']);
export const ECONOMICS_FIELDS = Object.freeze([
  'accounting_version', 'wager_wei', 'wager_ape', 'payout_wei', 'payout_ape',
  'multiplier', 'multiplier_display', 'gross_profit_wei', 'gross_profit_ape',
  'cost_wei', 'cost_ape', 'pnl_wei', 'pnl_ape', 'pnl_basis', 'pnl_profit_percent', 'costs',
]);

export function pickEconomicsFields(value) {
  return Object.fromEntries(ECONOMICS_FIELDS.filter((key) => value?.[key] !== undefined)
    .map((key) => [key, value[key]]));
}

export function multiplierText(payoutWei, wagerWei, digits = 2) {
  if (BigInt(wagerWei) <= 0n) return null;
  const scale = 10n ** BigInt(digits);
  const rounded = (BigInt(payoutWei) * scale * 2n + BigInt(wagerWei)) / (BigInt(wagerWei) * 2n);
  return `${rounded / scale}.${String(rounded % scale).padStart(digits, '0')}`;
}

export function createEconomics({ wagerWei, payoutWei, costsWei = null }) {
  const wager = BigInt(wagerWei);
  const payout = BigInt(payoutWei);
  if (wager < 0n || payout < 0n) throw new Error('Gross wager and payout cannot be negative.');
  const cost = costsWei === null ? null : BigInt(costsWei);
  if (cost !== null && cost < 0n) throw new Error('Additional costs cannot be negative.');
  return {
    wagerWei: wager,
    payoutWei: payout,
    grossProfitWei: payout - wager,
    costsWei: cost,
    pnlWei: cost === null ? null : payout - wager - cost,
  };
}

export function formatPnlProfitPercent(pnlWei, wagerWei) {
  if (pnlWei === null || BigInt(wagerWei) <= 0n) return null;
  const pnl = BigInt(pnlWei), wager = BigInt(wagerWei);
  const rounded = ((pnl < 0n ? -pnl : pnl) * 200n + wager) / (wager * 2n);
  return `${pnl < 0n && rounded > 0n ? '-' : ''}${rounded}%`;
}

export function serializeEconomics(economics, costs = null) {
  const { wagerWei, payoutWei, costsWei, pnlWei } = economics;
  const multiplier = multiplierText(payoutWei, wagerWei);
  return {
    accounting_version: ACCOUNTING_VERSION,
    wager_wei: wagerWei.toString(),
    wager_ape: formatEther(wagerWei),
    payout_wei: payoutWei.toString(),
    payout_ape: formatEther(payoutWei),
    multiplier,
    multiplier_display: multiplier === null ? null : `${multiplier}×`,
    gross_profit_wei: (payoutWei - wagerWei).toString(),
    gross_profit_ape: formatEther(payoutWei - wagerWei),
    cost_wei: costsWei?.toString() ?? null,
    cost_ape: costsWei === null ? null : formatEther(costsWei),
    pnl_wei: pnlWei?.toString() ?? null,
    pnl_ape: pnlWei === null ? null : formatEther(pnlWei),
    pnl_basis: 'net',
    pnl_profit_percent: formatPnlProfitPercent(pnlWei, wagerWei),
    costs,
  };
}

export function sumTransactionCosts(transactions = []) {
  const totals = Object.fromEntries(COST_COMPONENTS.map((name) => [name, 0n]));
  const ledger = new Map();
  for (const tx of transactions) {
    const key = String(tx.hash || '').toLowerCase();
    if (!key) continue;
    const previous = ledger.get(key);
    if (!previous || (!previous.confirmed && tx.confirmed) || (previous.gas_wei == null && tx.gas_wei != null)) ledger.set(key, tx);
  }
  const seen = new Set();
  let complete = true;
  for (const tx of ledger.values()) {
    const hash = String(tx.hash || '').toLowerCase();
    if (!hash || seen.has(hash)) continue;
    seen.add(hash);
    if (!tx.confirmed || tx.gas_wei === null || tx.gas_wei === undefined) complete = false;
    for (const component of COST_COMPONENTS) {
      const amount = tx[`${component}_wei`];
      if (amount !== null && amount !== undefined) totals[component] += BigInt(amount);
    }
  }
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0n);
  return {
    ...Object.fromEntries(COST_COMPONENTS.flatMap((name) => [
      [`${name}_wei`, totals[name].toString()], [`${name}_ape`, formatEther(totals[name])],
    ])),
    total_wei: complete ? total.toString() : null,
    total_ape: complete ? formatEther(total) : null,
    confirmed_total_wei: total.toString(),
    confirmed_total_ape: formatEther(total),
    complete,
    transactions: [...ledger.values()],
  };
}

export function readAdditionalCostsWei(payload) {
  const candidates = [payload?.costs?.total_wei, payload?.cost_wei, payload?.total_cost_wei];
  for (const value of candidates) if (value !== null && value !== undefined) return BigInt(value);
  const ape = payload?.costs?.total_ape ?? payload?.cost_ape ?? payload?.total_cost_ape
    ?? payload?.total_fee_ape ?? payload?.fee_ape;
  return ape === null || ape === undefined ? null : parseEther(String(ape));
}

export function aggregateEconomicsPayloads(payloads = []) {
  let wagerWei = 0n;
  let payoutWei = 0n;
  let costsKnown = true;
  const transactions = [];
  for (const [index, payload] of payloads.entries()) {
    const wager = payload.wager_wei ?? payload.result?.wager_wei;
    const payout = payload.payout_wei ?? payload.result?.payout_wei;
    wagerWei += wager === undefined ? parseEther(String(payload.wager_ape ?? payload.result?.wager_ape)) : BigInt(wager);
    payoutWei += payout === undefined ? parseEther(String(payload.payout_ape ?? payload.result?.payout_ape)) : BigInt(payout);
    if (payload.costs?.transactions?.length) {
      // Legacy cost-only placeholders are local to the aggregate that created
      // them. They are not transaction identities and must not collide with
      // another child's placeholders when aggregates are nested or resumed.
      transactions.push(...payload.costs.transactions.map((tx) =>
        String(tx.hash).startsWith('aggregate:')
          ? { ...tx, hash: `aggregate:${index}:${tx.hash}` } : tx));
    }
    else {
      const cost = readAdditionalCostsWei(payload);
      if (cost === null) costsKnown = false;
      else transactions.push({ hash: `aggregate:${index}`, confirmed: true, gas_wei: '0', other_wei: cost.toString() });
    }
  }
  const costs = sumTransactionCosts(transactions);
  if (!costsKnown) { costs.complete = false; costs.total_wei = null; costs.total_ape = null; }
  const economics = createEconomics({ wagerWei, payoutWei, costsWei: costs.total_wei });
  const fields = serializeEconomics(economics, costs);
  return {
    ...fields,
    total_wager_ape: fields.wager_ape,
    total_payout_ape: fields.payout_ape,
    total_cost_ape: fields.cost_ape,
    total_pnl_ape: fields.pnl_ape,
  };
}
