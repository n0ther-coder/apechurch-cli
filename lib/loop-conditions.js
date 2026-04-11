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

  if (targetBalance !== null && stopLoss !== null && stopLoss >= targetBalance) {
    throw new Error(`Invalid range: --stop-loss (${stopLoss}) must be less than --target (${targetBalance})`);
  }

  return {
    targetBalance,
    stopLoss,
    maxGames,
    targetX,
    targetProfit,
  };
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
      const balanceApe = Number(currentBalanceApe) || 0;
      const startingBalance = Number(startingBalanceApe) || 0;
      return appendGamesPlayed([
        `🎯 Target reached! Balance: ${formatApe(balanceApe)} (target: ${formatApe(condition.threshold)})`,
        `   Profit: ${formatSignedApe(balanceApe - startingBalance)}`,
      ], gamesPlayed);
    }
    case 'stop_loss': {
      const balanceApe = Number(currentBalanceApe) || 0;
      const startingBalance = Number(startingBalanceApe) || 0;
      return appendGamesPlayed([
        `🛑 Stop-loss hit! Balance: ${formatApe(balanceApe)} (limit: ${formatApe(condition.threshold)})`,
        `   Loss: ${formatSignedApe(balanceApe - startingBalance)}`,
      ], gamesPlayed);
    }
    case 'max_games':
      return appendGamesPlayed([
        `🏁 Max games reached!`,
      ], gamesPlayed);
    case 'min_balance_floor':
      return appendGamesPlayed([
        `🛑 Stopping: Balance (${formatApe(currentBalanceApe)}) at or below minimum floor (${formatApe(condition.threshold)})`,
      ], gamesPlayed);
    default:
      return '';
  }
}
