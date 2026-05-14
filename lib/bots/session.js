import chalk from 'chalk';

const APE_SCALE = 10n ** 18n;

export function parseApeToWei(value, label = 'APE amount') {
  const input = String(value ?? '').trim();
  const match = input.match(/^(-?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/);
  if (!match) {
    throw new Error(`Invalid ${label}: "${input}".`);
  }

  const [, sign, wholePart = '0', rawFraction = '', leadingDecimalFraction = ''] = match;
  const fractionPart = leadingDecimalFraction || rawFraction;
  if (fractionPart.length > 18) {
    throw new Error(`Invalid ${label}: too many decimal places.`);
  }

  const wholeWei = BigInt(wholePart) * APE_SCALE;
  const fractionalWei = BigInt(fractionPart.padEnd(18, '0'));
  const wei = wholeWei + fractionalWei;
  return sign === '-' ? -wei : wei;
}

export function formatWeiAsApe(wei) {
  if (wei === 0n) return '0';

  const sign = wei < 0n ? '-' : '';
  const absWei = wei < 0n ? -wei : wei;
  const whole = absWei / APE_SCALE;
  const fraction = absWei % APE_SCALE;

  if (fraction === 0n) {
    return `${sign}${whole.toString()}`;
  }

  const fractionText = fraction.toString().padStart(18, '0').replace(/0+$/, '');
  return `${sign}${whole.toString()}.${fractionText}`;
}

export function formatWeiRatio(numeratorWei, denominatorWei) {
  if (denominatorWei === 0n) return '0';

  const scaled = (numeratorWei * 1_000_000n) / denominatorWei;
  const whole = scaled / 1_000_000n;
  const fraction = scaled % 1_000_000n;

  if (fraction === 0n) {
    return whole.toString();
  }

  return `${whole.toString()}.${fraction.toString().padStart(6, '0').replace(/0+$/, '')}`;
}

export function parsePositiveApeAmount(value) {
  const input = String(value || '').trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(input)) {
    return null;
  }

  const amount = Number(input);
  return Number.isFinite(amount) && amount > 0 ? input : null;
}

function readOptionValue(tokens, index, name) {
  const token = tokens[index];
  const prefix = `${name}=`;
  if (token.startsWith(prefix)) {
    return { value: token.slice(prefix.length), consumed: 1 };
  }

  const value = tokens[index + 1];
  if (value === undefined || String(value).startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return { value, consumed: 2 };
}

export function parseStandardBotArgs(args = []) {
  const tokens = args.map((arg) => String(arg));
  const remainingArgs = [];
  let json = false;
  let fallbackLoss = null;
  let fallbackBot = null;

  for (let i = 0; i < tokens.length;) {
    const token = tokens[i];
    if (token === '--json') {
      json = true;
      i += 1;
      continue;
    }

    if (token === '--fallback-loss' || token.startsWith('--fallback-loss=')) {
      const parsed = readOptionValue(tokens, i, '--fallback-loss');
      fallbackLoss = parsePositiveApeAmount(parsed.value);
      if (!fallbackLoss) {
        throw new Error(`Invalid --fallback-loss value: "${parsed.value}".`);
      }
      i += parsed.consumed;
      continue;
    }

    if (token === '--fallback-bot' || token.startsWith('--fallback-bot=')) {
      const parsed = readOptionValue(tokens, i, '--fallback-bot');
      fallbackBot = String(parsed.value || '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]*$/.test(fallbackBot)) {
        throw new Error(`Invalid --fallback-bot value: "${parsed.value}".`);
      }
      i += parsed.consumed;
      continue;
    }

    remainingArgs.push(token);
    i += 1;
  }

  if ((fallbackLoss === null) !== (fallbackBot === null)) {
    throw new Error('--fallback-loss and --fallback-bot must be specified together.');
  }

  return {
    json,
    fallbackLoss,
    fallbackBot,
    remainingArgs,
  };
}

export function colorKey(key, colorOutput) {
  return colorOutput ? chalk.white.dim(`${key}:`) : `${key}:`;
}

export function colorPnl(value, pnlWei, colorOutput) {
  if (!colorOutput) return value;
  if (pnlWei > 0n) return chalk.greenBright.bold(value);
  if (pnlWei < 0n) return chalk.redBright.bold(value);
  return value;
}

export function colorBet(value, colorOutput) {
  return colorOutput ? chalk.magenta(value) : value;
}

export function colorCommand(value, colorOutput) {
  return colorOutput ? chalk.yellow(value) : value;
}

function shellQuoteToken(token) {
  const text = String(token);
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

export function formatCommandLine(tokens, { binaryName = 'apechurch-cli', colorOutput = false } = {}) {
  const command = [binaryName, 'play', ...tokens.map((token) => String(token))]
    .map(shellQuoteToken)
    .join(' ');
  return colorCommand(command, colorOutput);
}

export function formatBeforeGameLine({
  balanceApe,
  wins,
  gamesPlayed,
  totalPayoutWei,
  totalWagerWei,
  totalPnlWei,
  colorOutput = false,
}) {
  const fields = [
    `${colorKey('balance', colorOutput)} ${balanceApe}`,
    `${colorKey('win_rate', colorOutput)} ${wins}/${gamesPlayed}`,
    `${colorKey('payout_ape', colorOutput)} ${formatWeiAsApe(totalPayoutWei)}`,
    `${colorKey('wager_ape', colorOutput)} ${formatWeiAsApe(totalWagerWei)}`,
    `${colorKey('pnl', colorOutput)} ${colorPnl(formatWeiAsApe(totalPnlWei), totalPnlWei, colorOutput)}`,
  ];
  return `# ${fields.join(', ')}`;
}

export function formatAfterGameLine({ gameNumber, status, wagerWei, payoutWei, colorOutput = false }) {
  const fields = [
    `${colorKey('game_n', colorOutput)} ${gameNumber}`,
    `${colorKey('status', colorOutput)} ${status || 'unknown'}`,
    `${colorKey('bet', colorOutput)} ${colorBet(formatWeiAsApe(wagerWei), colorOutput)}`,
    `${colorKey('payout', colorOutput)} ${formatWeiAsApe(payoutWei)}`,
    `${colorKey('multiply', colorOutput)} ${formatWeiRatio(payoutWei, wagerWei)}`,
  ];
  return `# ${fields.join(', ')}`;
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

export function getPlayStatus(payload) {
  const rawStatus = firstPresent(payload?.status, payload?.state);
  if (rawStatus === 'HAND_COMPLETE') return 'complete';
  return rawStatus ? String(rawStatus) : 'unknown';
}

export function getSettledPlayEconomics(payload, gameNumber, botName = 'bot') {
  const wagerApe = firstPresent(
    payload?.result?.buy_in_ape,
    payload?.result?.wager_ape,
    payload?.wager_ape,
    payload?.totalBet,
    payload?.initialBet,
  );
  const payoutApe = firstPresent(
    payload?.result?.payout_ape,
    payload?.result?.payout,
    payload?.payout_ape,
  );

  if (!payload?.result || wagerApe === null || payoutApe === null) {
    throw new Error(`${botName} needs a settled result to compute real P&L; game ${gameNumber} returned status "${getPlayStatus(payload)}".`);
  }

  const wagerWei = parseApeToWei(wagerApe, 'wager_ape');
  const payoutWei = parseApeToWei(payoutApe, 'payout_ape');
  return {
    wagerWei,
    payoutWei,
    pnlWei: payoutWei - wagerWei,
  };
}

export function shouldTriggerFallback({ totalPnlWei, fallbackLoss }) {
  if (!fallbackLoss) return false;
  if (totalPnlWei >= 0n) return false;
  const thresholdWei = parseApeToWei(fallbackLoss, '--fallback-loss');
  return -totalPnlWei >= thresholdWei;
}
