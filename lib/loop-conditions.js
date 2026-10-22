import { normalizePnlThreshold, pnlThresholdApe } from './result-thresholds.js';
function parseNumberOption(rawValue, optionName, {
  allowZero = false,
  integer = false,
  example = null,
} = {}) {
  if (rawValue === undefined) {
    return null;
  }

  if (/(?:profit|loss|retrace)/.test(optionName) && String(rawValue).endsWith('%')) {
    return normalizePnlThreshold(rawValue, optionName, { allowZero });
  }
  const parsedValue = Number(rawValue);
  const invalidNumber = integer
    ? !Number.isInteger(parsedValue)
    : !Number.isFinite(parsedValue);
  const invalidRange = allowZero ? parsedValue < 0 : parsedValue <= 0;

  if (invalidNumber || invalidRange) {
    const expectedValue = integer
      ? 'a positive integer'
      : allowZero
        ? 'a non-negative number'
        : 'a positive number';
    const exampleText = example ? ` (e.g., ${example})` : '';
    throw new Error(`Invalid ${optionName} value: "${rawValue}". Must be ${expectedValue}${exampleText}`);
  }

  return parsedValue;
}

function formatApe(value) {
  return `${(Number(value) || 0).toFixed(2)} APE`;
}

function formatSignedApe(value) {
  const amount = Number(value) || 0;
  const sign = amount >= 0 ? '+' : '';
  return `${sign}${amount.toFixed(2)} APE`;
}

function resolveMaxLossOption(opts) {
  const hasMaxLoss = opts.maxLoss !== undefined || opts.stopLoss !== undefined;
  const hasBankroll = opts.bankroll !== undefined;

  if (hasMaxLoss && hasBankroll && String(opts.maxLoss ?? opts.stopLoss) !== String(opts.bankroll)) {
    throw new Error('Conflicting --max-loss and --bankroll values; use only one session loss cap.');
  }

  if (hasBankroll && !hasMaxLoss) {
    return { value: opts.bankroll, optionName: '--bankroll' };
  }

  return { value: opts.maxLoss ?? opts.stopLoss, optionName: '--max-loss' };
}

function formatMultiplier(value) {
  return `${(Number(value) || 0).toFixed(2)}×`;
}

function appendGamesPlayed(lines, gamesPlayed) {
  if (Number.isFinite(gamesPlayed) && gamesPlayed >= 0) {
    lines.push(`   Games played: ${gamesPlayed}`);
  }
  return lines.join('\n');
}

export function parseLoopTerminalOptions(opts = {}) {
  const targetBalance = parseNumberOption(opts.maxBalance, '--max-balance', {
    example: '--max-balance 200',
  });
  const minProfit = parseNumberOption(opts.minProfit ?? opts.takeProfit, '--min-profit', {
    example: '--min-profit 25',
  });
  const minBalance = parseNumberOption(opts.minBalance, '--min-balance', {
    allowZero: true,
    example: '--min-balance 50',
  });
  const maxLossOption = resolveMaxLossOption(opts);
  const maxLoss = parseNumberOption(maxLossOption.value, maxLossOption.optionName, {
    example: `${maxLossOption.optionName} 25`,
  });
  const maxGames = parseNumberOption(opts.maxGames, '--max-games', {
    integer: true,
    example: '--max-games 20',
  });
  const targetX = parseNumberOption(opts.targetX, '--target-x', {
    example: '--target-x 10',
  });
  const targetProfit = parseNumberOption(opts.targetProfit, '--target-profit', {
    example: '--target-profit 250',
  });
  const retrace = parseNumberOption(opts.retrace, '--retrace', {
    example: '--retrace 25',
  });
  const recoverLoss = parseNumberOption(opts.recoverLoss, '--recover-loss', {
    example: '--recover-loss 25',
  });
  const givebackProfit = parseNumberOption(opts.givebackProfit, '--giveback-profit', {
    example: '--giveback-profit 40',
  });

  if (targetBalance !== null && minBalance !== null && minBalance >= targetBalance) {
    throw new Error(`Invalid range: --min-balance (${minBalance}) must be less than --max-balance (${targetBalance})`);
  }

  return {
    targetBalance,
    minProfit,
    minBalance,
    maxLoss,
    maxGames,
    targetX,
    targetProfit,
    retrace,
    recoverLoss,
    givebackProfit,
  };
}

export function deriveLoopLossControls({
  minBalance = null,
  maxLoss = null,
  startingBalanceApe = null,
} = {}) {
  // Wallet limits and result PnL limits are independent domains.
  return { minBalance, maxLoss, derivedMinBalance: false, derivedMaxLoss: false };
}

export function getRemainingBankrollApe({
  currentBalanceApe = null,
  startingBalanceApe = null,
  maxLoss = null,
  sessionPnlApe = null,
  totalWagerApe = 0,
  minBalance = null,
} = {}) {
  const balanceApe = Number(currentBalanceApe);
  const startingBalance = Number(startingBalanceApe);
  const explicitBankroll = maxLoss !== null && !String(maxLoss).endsWith('%') ? Number(maxLoss) : null;
  const bankroll = explicitBankroll ?? (minBalance === null ? null : startingBalance - Number(minBalance));
  if (bankroll === null || !Number.isFinite(balanceApe) || !Number.isFinite(startingBalance) || !Number.isFinite(bankroll)) {
    return null;
  }

  return Math.max(bankroll + (sessionPnlApe ?? (balanceApe - startingBalance)), 0);
}

export function createLoopTerminalState() {
  return {
    recoverLossArmed: false,
    givebackProfitArmed: false,
    minSessionPnlApe: null,
    maxSessionPnlApe: null,
  };
}

function updateLoopPnlExtrema(state, sessionPnlApe) {
  if (state.minSessionPnlApe === null || state.minSessionPnlApe === undefined) {
    state.minSessionPnlApe = sessionPnlApe;
  } else {
    state.minSessionPnlApe = Math.min(state.minSessionPnlApe, sessionPnlApe);
  }

  if (state.maxSessionPnlApe === null || state.maxSessionPnlApe === undefined) {
    state.maxSessionPnlApe = sessionPnlApe;
  } else {
    state.maxSessionPnlApe = Math.max(state.maxSessionPnlApe, sessionPnlApe);
  }
}

export function getBalanceLoopTerminalCondition({
  currentBalanceApe = null,
  startingBalanceApe = null,
  targetBalance = null,
  minProfit = null,
  minBalance = null,
  maxLoss = null,
  maxGames = null,
  minBalanceFloor = null,
  recoverLoss = null,
  givebackProfit = null,
  gamesPlayed = null,
  state = null,
  sessionPnlApe: suppliedPnlApe = 0,
  totalWagerApe = 0,
} = {}) {
  const balanceApe = Number(currentBalanceApe);
  const startingBalance = Number(startingBalanceApe);
  if (!Number.isFinite(balanceApe) || !Number.isFinite(startingBalance)) {
    return null;
  }

  const sessionPnlApe = Number(suppliedPnlApe ?? 0);
  minProfit = pnlThresholdApe(minProfit, totalWagerApe);
  maxLoss = pnlThresholdApe(maxLoss, totalWagerApe);
  recoverLoss = pnlThresholdApe(recoverLoss, totalWagerApe);
  givebackProfit = pnlThresholdApe(givebackProfit, totalWagerApe);
  const terminalState = state || createLoopTerminalState();
  updateLoopPnlExtrema(terminalState, sessionPnlApe);

  if (recoverLoss !== null && terminalState.minSessionPnlApe <= -recoverLoss) {
    terminalState.recoverLossArmed = true;
  }
  if (givebackProfit !== null && terminalState.maxSessionPnlApe >= givebackProfit) {
    terminalState.givebackProfitArmed = true;
  }

  if (minBalanceFloor !== null && balanceApe <= minBalanceFloor) {
    return {
      kind: 'min_balance_floor',
      threshold: minBalanceFloor,
      sessionPnlApe,
    };
  }

  if (targetBalance !== null && balanceApe >= targetBalance) {
    return {
      kind: 'target_balance',
      threshold: targetBalance,
      sessionPnlApe,
    };
  }

  if (minProfit !== null && sessionPnlApe >= minProfit) {
    return {
      kind: 'min_profit',
      threshold: minProfit,
      sessionPnlApe,
    };
  }

  if (minBalance !== null && balanceApe <= minBalance) {
    return {
      kind: 'min_balance',
      threshold: minBalance,
      sessionPnlApe,
    };
  }

  if (maxLoss !== null && sessionPnlApe <= -maxLoss) {
    return {
      kind: 'max_loss',
      threshold: maxLoss,
      sessionPnlApe,
    };
  }

  if (recoverLoss !== null && terminalState.recoverLossArmed && sessionPnlApe >= 0) {
    const recoveredApe = sessionPnlApe - terminalState.minSessionPnlApe;
    return {
      kind: 'recover_loss',
      threshold: recoverLoss,
      sessionPnlApe,
      minSessionPnlApe: terminalState.minSessionPnlApe,
      recoveredApe,
    };
  }

  if (givebackProfit !== null && terminalState.givebackProfitArmed && sessionPnlApe <= 0) {
    const givebackApe = terminalState.maxSessionPnlApe - sessionPnlApe;
    return {
      kind: 'giveback_profit',
      threshold: givebackProfit,
      sessionPnlApe,
      maxSessionPnlApe: terminalState.maxSessionPnlApe,
      givebackApe,
    };
  }

  if (maxGames !== null && Number.isFinite(gamesPlayed) && gamesPlayed >= maxGames) {
    return {
      kind: 'max_games',
      threshold: maxGames,
      sessionPnlApe,
    };
  }

  return null;
}

export function getSingleGameLoopTerminalCondition({
  gameResult,
  targetX = null,
  targetProfit = null,
  retrace = null,
} = {}) {
  if (!gameResult || gameResult.exactPayout === false) {
    return null;
  }

  const wagerApe = Number(gameResult.bet);
  const payoutApe = Number(gameResult.payout);
  if (!Number.isFinite(wagerApe) || wagerApe <= 0 || !Number.isFinite(payoutApe)) {
    return null;
  }

  const multiplier = payoutApe / wagerApe;
  const netPnl = gameResult.pnl_ape !== undefined && gameResult.pnl_ape !== null
    ? Number(gameResult.pnl_ape)
    : payoutApe - wagerApe - (Number(gameResult.feesPaidApe) || 0);
  const lossApe = Math.max(-netPnl, 0);
  const targetProfitAmount = pnlThresholdApe(targetProfit, wagerApe);
  const retraceAmount = pnlThresholdApe(retrace, wagerApe);

  if (targetX !== null && multiplier >= targetX) {
    return {
      kind: 'target_x',
      threshold: targetX,
      wagerApe,
      payoutApe,
      multiplier,
    };
  }

  if (targetProfitAmount !== null && netPnl >= targetProfitAmount) {
    return {
      kind: 'target_profit',
      threshold: targetProfitAmount,
      pnlApe: netPnl,
      wagerApe,
      payoutApe,
      multiplier,
    };
  }

  if (retraceAmount !== null && lossApe >= retraceAmount) {
    return {
      kind: 'retrace',
      threshold: retraceAmount,
      wagerApe,
      payoutApe,
      lossApe,
      multiplier,
    };
  }

  return null;
}

export function formatLoopTerminalConditionMessage(condition, {
  currentBalanceApe = null,
  startingBalanceApe = null,
  gamesPlayed = null,
} = {}) {
  if (!condition) {
    return '';
  }

  const balanceApe = Number(currentBalanceApe) || 0;
  const startingBalance = Number(startingBalanceApe) || 0;
  const sessionPnlApe = Number.isFinite(condition.sessionPnlApe)
    ? Number(condition.sessionPnlApe)
    : balanceApe - startingBalance;

  switch (condition.kind) {
    case 'target_x':
      return appendGamesPlayed([
        `🎯 Target multiplier hit! ${formatMultiplier(condition.multiplier)} >= ${formatMultiplier(condition.threshold)}`,
        `   Payout: ${formatApe(condition.payoutApe)} on ${formatApe(condition.wagerApe)} wager`,
      ], gamesPlayed);
    case 'target_profit':
      return appendGamesPlayed([
        `💰 Target PnL Profit hit! ${formatApe(condition.pnlApe)} >= ${formatApe(condition.threshold)}`,
        `   Multiplier: ${formatMultiplier(condition.multiplier)} on ${formatApe(condition.wagerApe)} wager`,
      ], gamesPlayed);
    case 'retrace':
      return appendGamesPlayed([
        `📉 Retrace hit! Loss: ${formatApe(condition.lossApe)} >= ${formatApe(condition.threshold)}`,
        `   Payout: ${formatApe(condition.payoutApe)} on ${formatApe(condition.wagerApe)} wager`,
      ], gamesPlayed);
    case 'target_balance': {
      return appendGamesPlayed([
        `🎯 Maximum balance reached! Balance: ${formatApe(balanceApe)} (target: ${formatApe(condition.threshold)})`,
        `   Profit: ${formatSignedApe(sessionPnlApe)}`,
      ], gamesPlayed);
    }
    case 'min_profit':
      return appendGamesPlayed([
        `💰 Min-profit reached! PnL Profit: ${formatSignedApe(sessionPnlApe)} (target: ${formatSignedApe(Math.abs(condition.threshold))})`,
      ], gamesPlayed);
    case 'min_balance':
      return appendGamesPlayed([
        `🛑 Minimum balance hit! Balance: ${formatApe(balanceApe)} (limit: ${formatApe(condition.threshold)})`,
        `   Loss: ${formatSignedApe(sessionPnlApe)}`,
      ], gamesPlayed);
    case 'max_loss':
      return appendGamesPlayed([
        `🛑 Max-loss hit! PnL Profit: ${formatSignedApe(sessionPnlApe)} (limit: ${formatSignedApe(-Math.abs(condition.threshold))})`,
      ], gamesPlayed);
    case 'recover_loss':
      return appendGamesPlayed([
        `🛟 Loss recovered! PnL Profit: ${formatSignedApe(sessionPnlApe)}`,
        `   Armed at min P&L ${formatSignedApe(condition.minSessionPnlApe ?? sessionPnlApe)}; closed after returning to break-even/profit (recovered ${formatApe(condition.recoveredApe ?? condition.threshold)})`,
      ], gamesPlayed);
    case 'giveback_profit':
      return appendGamesPlayed([
        `📉 Profit given back! PnL Profit: ${formatSignedApe(sessionPnlApe)}`,
        `   Armed at max P&L ${formatSignedApe(condition.maxSessionPnlApe ?? sessionPnlApe)}; closed after returning to break-even/loss (gave back ${formatApe(condition.givebackApe ?? condition.threshold)})`,
      ], gamesPlayed);
    case 'max_games':
      return appendGamesPlayed([
        `🏁 Max games reached! (${condition.threshold})`,
      ], gamesPlayed);
    case 'min_balance_floor':
      return appendGamesPlayed([
        `🛑 Stopping: Balance (${formatApe(balanceApe)}) at or below minimum floor (${formatApe(condition.threshold)})`,
      ], gamesPlayed);
    default:
      return '';
  }
}
