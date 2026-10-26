import { formatUnits, parseUnits } from 'viem';

export function normalizeBankrollCap(value, label = '--bankroll-cap') {
  const input = String(value ?? '').trim();
  if (!/^(?:\d+(?:\.\d{1,18})?|\.\d{1,18})$/.test(input)
    || parseUnits(input, 18) <= 0n || !Number.isFinite(Number(input))) {
    throw new Error(`Invalid ${label}: expected a positive APE amount with at most 18 decimals.`);
  }
  return formatUnits(parseUnits(input, 18), 18).replace(/\.0$/, '');
}

export function bankrollApeToWei(value) {
  return parseUnits(typeof value === 'number' ? value.toFixed(18) : String(value), 18);
}

export function resolveBankrollCap({
  cap, startingBalanceWei, minBalance = null, bankroll = null,
}) {
  const capApe = normalizeBankrollCap(cap);
  const capWei = bankrollApeToWei(capApe);
  const configuredFloorWei = minBalance == null ? 0n : bankrollApeToWei(minBalance);
  const availableWei = BigInt(startingBalanceWei) - configuredFloorWei;
  let initialWei = availableWei < 0n ? 0n : availableWei;
  if (initialWei > capWei) initialWei = capWei;
  if (bankroll != null && !String(bankroll).endsWith('%')) {
    const budgetWei = bankrollApeToWei(bankroll);
    if (initialWei > budgetWei) initialWei = budgetWei;
  }
  const allocatedFloorWei = BigInt(startingBalanceWei) - initialWei;
  const floorWei = allocatedFloorWei > configuredFloorWei ? allocatedFloorWei : configuredFloorWei;
  return {
    cap_ape: capApe,
    initial_bankroll_ape: formatUnits(initialWei, 18),
    min_balance_ape: formatUnits(floorWei, 18),
    configured_min_balance_ape: minBalance == null ? null : String(minBalance),
  };
}

export function getBankrollCapCondition({ capState, totalPnlWei = 0n, executions = 0 }) {
  if (!capState) return null;
  const capWei = bankrollApeToWei(capState.cap_ape);
  const remainingWei = bankrollApeToWei(capState.initial_bankroll_ape) + BigInt(totalPnlWei);
  if (remainingWei <= capWei) return null;
  return {
    kind: 'bankroll_cap',
    threshold_ape: capState.cap_ape,
    bankroll_ape: formatUnits(remainingWei, 18),
    excess_ape: formatUnits(remainingWei - capWei, 18),
    pnl_ape: formatUnits(BigInt(totalPnlWei), 18),
    executions,
  };
}
