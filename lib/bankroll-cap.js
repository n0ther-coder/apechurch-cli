import { formatUnits, parseUnits } from 'viem';

export function normalizeBankrollCap(value, label = '--bankroll-cap') {
  const input = String(value ?? '').trim();
  if (!/^(?:\d+(?:\.\d{1,18})?|\.\d{1,18})$/.test(input)
    || parseUnits(input, 18) <= 0n || !Number.isFinite(Number(input))) {
    throw new Error(`Invalid ${label}: expected a positive APE amount with at most 18 decimals.`);
  }
  return formatUnits(parseUnits(input, 18), 18).replace(/\.0$/, '');
}

export function normalizeBankrollStop(value) {
  const input = String(value ?? '').trim();
  if (!/^(?:\d+(?:\.\d{1,18})?|\.\d{1,18})$/.test(input)
    || !Number.isFinite(Number(input))) {
    throw new Error('Invalid --bankroll-stop: expected a nonnegative APE amount with at most 18 decimals.');
  }
  return formatUnits(parseUnits(input, 18), 18).replace(/\.0$/, '');
}

export function validateBankrollStop({ stop = null, cap = null, bankroll = null } = {}) {
  if (stop == null) return;
  const stopWei = bankrollApeToWei(normalizeBankrollStop(stop));
  for (const [label, amount] of [['--bankroll-cap', cap], ['initial bankroll', bankroll]]) {
    if (amount == null || String(amount).endsWith('%')) continue;
    if (stopWei >= bankrollApeToWei(amount)) {
      throw new Error(`--bankroll-stop must be less than ${label}.`);
    }
  }
}

export function bankrollApeToWei(value) {
  return parseUnits(typeof value === 'number' ? value.toFixed(18) : String(value), 18);
}

export function resolveBankrollCap({
  cap = null, stop = null, startingBalanceWei, minBalance = null, bankroll = null,
}) {
  const capApe = cap == null ? null : normalizeBankrollCap(cap);
  const capWei = capApe == null ? null : bankrollApeToWei(capApe);
  const stopApe = stop == null ? null : normalizeBankrollStop(stop);
  validateBankrollStop({ stop: stopApe, cap: capApe, bankroll });
  const configuredFloorWei = minBalance == null ? 0n : bankrollApeToWei(minBalance);
  const availableWei = BigInt(startingBalanceWei) - configuredFloorWei;
  let initialWei = availableWei < 0n ? 0n : availableWei;
  if (capWei !== null && initialWei > capWei) initialWei = capWei;
  if (bankroll != null && !String(bankroll).endsWith('%')) {
    const budgetWei = bankrollApeToWei(bankroll);
    if (initialWei > budgetWei) initialWei = budgetWei;
  }
  const allocatedFloorWei = BigInt(startingBalanceWei) - initialWei;
  if (stopApe !== null && initialWei <= bankrollApeToWei(stopApe)) {
    throw new Error('--bankroll-stop must be less than the actual initial bankroll available above the wallet floor.');
  }
  const stopFloorWei = allocatedFloorWei + (stopApe === null ? 0n : bankrollApeToWei(stopApe));
  const floorWei = stopFloorWei > configuredFloorWei ? stopFloorWei : configuredFloorWei;
  return {
    cap_ape: capApe,
    ...(stopApe === null ? {} : { stop_ape: stopApe }),
    initial_bankroll_ape: formatUnits(initialWei, 18),
    allocation_min_balance_ape: formatUnits(allocatedFloorWei > configuredFloorWei ? allocatedFloorWei : configuredFloorWei, 18),
    min_balance_ape: formatUnits(floorWei, 18),
    configured_min_balance_ape: minBalance == null ? null : String(minBalance),
  };
}

export function getBankrollCapCondition({ capState, totalPnlWei = 0n, executions = 0 }) {
  if (!capState || capState.cap_ape == null) return null;
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

export function getBankrollStopCondition({ capState, totalPnlWei = 0n, executions = 0 }) {
  if (capState?.stop_ape == null) return null;
  const remainingWei = bankrollApeToWei(capState.initial_bankroll_ape) + BigInt(totalPnlWei);
  if (remainingWei > bankrollApeToWei(capState.stop_ape)) return null;
  return { kind: 'bankroll_stop', threshold_ape: capState.stop_ape,
    bankroll_ape: formatUnits(remainingWei, 18), pnl_ape: formatUnits(BigInt(totalPnlWei), 18), executions };
}
