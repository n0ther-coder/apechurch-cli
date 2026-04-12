function parseNumberOption(rawValue, optionName, {
  allowZero = false,
  integer = false,
  example = null,
} = {}) {
  if (rawValue === undefined) {
    return null;
  }

  const parsedValue = integer ? parseInt(rawValue, 10) : parseFloat(rawValue);
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

function formatMultiplier(value) {
  return `${(Number(value) || 0).toFixed(4).replace(/\.?0+$/, '')}x`;
}

function appendGamesPlayed(lines, gamesPlayed) {
  if (Number.isFinite(gamesPlayed) && gamesPlayed >= 0) {
    lines.push(`   Games played: ${gamesPlayed}`);
  }
  return lines.join('\n');
}

export function parseLoopTerminalOptions(opts = {}) {
  const targetBalance = parseNumberOption(opts.target, '--target', {
    example: '--target 200',
  });
  const stopLoss = parseNumberOption(opts.stopLoss, '--stop-loss', {
    allowZero: true,
    example: '--stop-loss 50',
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
  const recoverLoss = parseNumberOption(opts.recoverLoss, '--recover-loss', {
    example: '--recover-loss 25',
  });
  const givebackProfit = parseNumberOption(opts.givebackProfit, '--giveback-profit', {
    example: '--giveback-profit 40',
  });

  if (targetBalance !== null && stopLoss !== null && stopLoss >= targetBalance) {
    throw new Error(`Invalid range: --stop-loss (${stopLoss}) must be less than --target (${targetBalance})`);
  }

  return {
    targetBalance,
    stopLoss,
    maxGames,
    targetX,
    targetProfit,
    recoverLoss,
    givebackProfit,
  };
}

export function createLoopTerminalState() {
  return {
    recoverLossArmed: false,
    givebackProfitArmed: false,
  };
}

export function getBalanceLoopTerminalCondition({
  currentBalanceApe = null,
  startingBalanceApe = null,
  targetBalance = null,
  stopLoss = null,
  maxGames = null,
  minBalanceFloor = null,
  recoverLoss = null,
  givebackProfit = null,
  gamesPlayed = null,
  state = null,
} = {}) {
  const balanceApe = Number(currentBalanceApe);
  const startingBalance = Number(startingBalanceApe);
  if (!Number.isFinite(balanceApe) || !Number.isFinite(startingBalance)) {
    return null;
  }

  const sessionPnlApe = balanceApe - startingBalance;
  const terminalState = state || createLoopTerminalState();

  if (recoverLoss !== null && sessionPnlApe <= -recoverLoss) {
    terminalState.recoverLossArmed = true;
  }
  if (givebackProfit !== null && sessionPnlApe >= givebackProfit) {
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

  if (stopLoss !== null && balanceApe <= stopLoss) {
    return {
      kind: 'stop_loss',
      threshold: stopLoss,
      sessionPnlApe,
    };
  }

  if (recoverLoss !== null && terminalState.recoverLossArmed && sessionPnlApe >= 0) {
    return {
      kind: 'recover_loss',
      threshold: recoverLoss,
      sessionPnlApe,
    };
  }

  if (givebackProfit !== null && terminalState.givebackProfitArmed && sessionPnlApe <= 0) {
    return {
      kind: 'giveback_profit',
      threshold: givebackProfit,
      sessionPnlApe,
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

  if (targetX !== null && multiplier >= targetX) {
    return {
      kind: 'target_x',
      threshold: targetX,
      wagerApe,
      payoutApe,
      multiplier,
    };
  }

  if (targetProfit !== null && payoutApe >= targetProfit) {
    return {
      kind: 'target_profit',
      threshold: targetProfit,
      wagerApe,
      payoutApe,
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
        `💰 Target payout hit! ${formatApe(condition.payoutApe)} >= ${formatApe(condition.threshold)}`,
        `   Multiplier: ${formatMultiplier(condition.multiplier)} on ${formatApe(condition.wagerApe)} wager`,
      ], gamesPlayed);
    case 'target_balance': {
      return appendGamesPlayed([
        `🎯 Target reached! Balance: ${formatApe(balanceApe)} (target: ${formatApe(condition.threshold)})`,
        `   Profit: ${formatSignedApe(sessionPnlApe)}`,
      ], gamesPlayed);
    }
    case 'stop_loss':
      return appendGamesPlayed([
        `🛑 Stop-loss hit! Balance: ${formatApe(balanceApe)} (limit: ${formatApe(condition.threshold)})`,
        `   Loss: ${formatSignedApe(sessionPnlApe)}`,
      ], gamesPlayed);
    case 'recover_loss':
      return appendGamesPlayed([
        `🛟 Loss recovered! Session P&L: ${formatSignedApe(sessionPnlApe)}`,
        `   Triggered after reaching ${formatSignedApe(-Math.abs(condition.threshold))} or worse`,
      ], gamesPlayed);
    case 'giveback_profit':
      return appendGamesPlayed([
        `📉 Profit given back! Session P&L: ${formatSignedApe(sessionPnlApe)}`,
        `   Triggered after reaching ${formatSignedApe(Math.abs(condition.threshold))} or better`,
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
