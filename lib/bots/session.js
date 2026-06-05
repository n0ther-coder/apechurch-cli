import readline from 'readline';

import chalk, { Chalk } from 'chalk';
import { BOT_PLAIN_OUTPUT_ENV_VAR, FORCE_COLOR_ENV_VAR } from '../constants.js';
import {
  getLoopDelayMs,
  getHumanTimingCliValue,
  isHumanTimingOptionValue,
  normalizeHumanTiming,
} from '../stateful/timing.js';

const APE_SCALE = 10n ** 18n;
// Plain-output multipliers are intentionally fixed at two decimals; keep bot
// logs scan-stable and do not reintroduce variable precision here.
const RATIO_DECIMAL_PLACES = 2n;
const RATIO_SCALE = 10n ** RATIO_DECIMAL_PLACES;
const forcedChalk = new Chalk({ level: 1 });

const STANDARD_BOT_LOOP_APE_OPTIONS = new Map([
  ['--take-profit', 'takeProfit'],
  ['--min-profit', 'minProfit'],
  ['--recover-loss', 'recoverLoss'],
  ['--giveback-profit', 'givebackProfit'],
  ['--stop-loss', 'stopLoss'],
  ['--max-loss', 'maxLoss'],
  ['--bankroll', 'maxLoss'],
]);

const STANDARD_BOT_LOOP_VALUE_OPTIONS = new Map([
  ['--max-games', 'maxGames'],
  ['--gp-ape', 'gpApe'],
  ['--delay', 'delay'],
]);

const STANDARD_BOT_LOOP_BOOLEAN_OPTIONS = new Map([
  ['--human', 'human'],
]);

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
  if (denominatorWei === 0n) return '0.00';

  const numerator = BigInt(numeratorWei);
  const denominator = BigInt(denominatorWei);
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const scaled = ((absNumerator * RATIO_SCALE * 2n) + absDenominator) / (absDenominator * 2n);
  const whole = scaled / RATIO_SCALE;
  const fraction = scaled % RATIO_SCALE;
  const sign = negative && scaled !== 0n ? '-' : '';

  return `${sign}${whole.toString()}.${fraction.toString().padStart(Number(RATIO_DECIMAL_PLACES), '0')}`;
}

export function parsePositiveApeAmount(value) {
  const input = String(value || '').trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(input)) {
    return null;
  }

  const amount = Number(input);
  return Number.isFinite(amount) && amount > 0 ? input : null;
}

export function parseNonNegativeApeAmount(value) {
  const input = String(value ?? '').trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(input)) {
    return null;
  }

  const amount = Number(input);
  return Number.isFinite(amount) && amount >= 0 ? input : null;
}

function parsePositiveNumber(value, optionName) {
  const input = String(value ?? '').trim();
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${optionName} value: "${input}". Must be a positive number.`);
  }
  return input;
}

function parseNonNegativeNumber(value, optionName) {
  const input = String(value ?? '').trim();
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${optionName} value: "${input}". Must be a non-negative number.`);
  }
  return input;
}

function parsePositiveIntegerString(value, optionName) {
  const input = String(value ?? '').trim();
  const parsed = Number(input);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${optionName} value: "${input}". Must be a positive integer.`);
  }
  return String(parsed);
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

function readBooleanOption(tokens, index, name) {
  const token = tokens[index];
  const prefix = `${name}=`;
  if (token.startsWith(prefix)) {
    const rawValue = token.slice(prefix.length).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(rawValue)) {
      return { value: true, consumed: 1 };
    }
    if (['0', 'false', 'no', 'n'].includes(rawValue)) {
      return { value: false, consumed: 1 };
    }
    throw new Error(`Invalid ${name} value: "${token.slice(prefix.length)}". Must be true or false.`);
  }

  return { value: true, consumed: 1 };
}

function readHumanOption(tokens, index, name) {
  const toStoredValue = (rawValue) => {
    const humanTiming = normalizeHumanTiming(rawValue);
    if (!humanTiming) return false;
    return humanTiming.cliValue || true;
  };
  const token = tokens[index];
  const prefix = `${name}=`;
  if (token.startsWith(prefix)) {
    return { value: toStoredValue(token.slice(prefix.length)), consumed: 1 };
  }

  const value = tokens[index + 1];
  if (value !== undefined && !String(value).startsWith('--') && isHumanTimingOptionValue(value)) {
    return { value: toStoredValue(value), consumed: 2 };
  }

  return { value: true, consumed: 1 };
}

export function appendHumanTimingForwardTokens(tokens, human) {
  if (!normalizeHumanTiming(human)) {
    return tokens;
  }

  tokens.push('--human');
  const cliValue = getHumanTimingCliValue(human);
  if (cliValue) {
    tokens.push(cliValue);
  }
  return tokens;
}

function createEmptyStandardBotLoopControls() {
  return {
    takeProfit: null,
    minProfit: null,
    recoverLoss: null,
    givebackProfit: null,
    stopLoss: null,
    maxLoss: null,
    maxGames: null,
    gpApe: null,
    human: false,
    delay: null,
  };
}

export function parseStandardBotArgs(args = []) {
  const tokens = args.map((arg) => String(arg));
  const remainingArgs = [];
  let json = false;
  let color = false;
  let fallbackLoss = null;
  let fallbackBot = null;
  const loopControls = createEmptyStandardBotLoopControls();

  for (let i = 0; i < tokens.length;) {
    const token = tokens[i];
    if (token === '--json') {
      json = true;
      i += 1;
      continue;
    }

    if (token === '--color') {
      color = true;
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

    const apeOption = [...STANDARD_BOT_LOOP_APE_OPTIONS.keys()]
      .find((name) => token === name || token.startsWith(`${name}=`));
    if (apeOption) {
      const parsed = readOptionValue(tokens, i, apeOption);
      const amount = apeOption === '--stop-loss'
        ? parseNonNegativeApeAmount(parsed.value)
        : parsePositiveApeAmount(parsed.value);
      if (!amount) {
        const expectation = apeOption === '--stop-loss' ? 'non-negative' : 'positive';
        throw new Error(`Invalid ${apeOption} value: "${parsed.value}". Must be a ${expectation} APE amount.`);
      }
      loopControls[STANDARD_BOT_LOOP_APE_OPTIONS.get(apeOption)] = amount;
      i += parsed.consumed;
      continue;
    }

    const valueOption = [...STANDARD_BOT_LOOP_VALUE_OPTIONS.keys()]
      .find((name) => token === name || token.startsWith(`${name}=`));
    if (valueOption) {
      const parsed = readOptionValue(tokens, i, valueOption);
      const key = STANDARD_BOT_LOOP_VALUE_OPTIONS.get(valueOption);
      if (key === 'maxGames') {
        loopControls.maxGames = parsePositiveIntegerString(parsed.value, valueOption);
      } else if (key === 'delay') {
        loopControls.delay = parseNonNegativeNumber(parsed.value, valueOption);
      } else {
        loopControls[key] = parsePositiveNumber(parsed.value, valueOption);
      }
      i += parsed.consumed;
      continue;
    }

    const booleanOption = [...STANDARD_BOT_LOOP_BOOLEAN_OPTIONS.keys()]
      .find((name) => token === name || token.startsWith(`${name}=`));
    if (booleanOption) {
      const parsed = booleanOption === '--human'
        ? readHumanOption(tokens, i, booleanOption)
        : readBooleanOption(tokens, i, booleanOption);
      loopControls[STANDARD_BOT_LOOP_BOOLEAN_OPTIONS.get(booleanOption)] = parsed.value;
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
    color,
    fallbackLoss,
    fallbackBot,
    loopControls,
    remainingArgs,
  };
}

function formatApeNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }
  return numeric.toFixed(18).replace(/\.?0+$/, '');
}

function promptLine(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function confirmStandardBotWarning(message, { json = false } = {}) {
  if (json) {
    throw new Error(`${message} Add an explicit guard to run non-interactively.`);
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`${message} An interactive terminal is required to confirm this run.`);
  }

  const answer = await promptLine(`${message} Proceed? (Y/n) `);
  if (String(answer).trim().toLowerCase() === 'n') {
    throw new Error('Bot run cancelled.');
  }
}

export function createStandardBotLoopState() {
  return {
    recoverLossArmed: false,
    givebackProfitArmed: false,
  };
}

export function hasStandardBotLossGuard(loopControls = {}) {
  return Boolean(loopControls.stopLoss || loopControls.maxLoss);
}

export function hasStandardBotProfitGuard(loopControls = {}) {
  return Boolean(loopControls.takeProfit || loopControls.minProfit);
}

export async function prepareStandardBotLoopRuntime({
  loopControls = {},
  getBalanceApe,
  json = false,
  dryRun = false,
  botName = 'bot',
  confirmWarnings = true,
} = {}) {
  const controls = {
    ...createEmptyStandardBotLoopControls(),
    ...loopControls,
  };
  const runtime = {
    startingBalanceApe: null,
    cliTakeProfitApe: null,
    cliStopLossApe: null,
    state: createStandardBotLoopState(),
  };

  if (dryRun) {
    return runtime;
  }

  if (confirmWarnings && !hasStandardBotLossGuard(controls)) {
    await confirmStandardBotWarning(
      `${botName} was invoked without --stop-loss, --max-loss, or --bankroll; it could drain all available funds.`,
      { json },
    );
  }

  if (confirmWarnings && !hasStandardBotProfitGuard(controls)) {
    await confirmStandardBotWarning(
      `${botName} was invoked without --take-profit or --min-profit; it theoretically stops only in loss.`,
      { json },
    );
  }

  if (typeof getBalanceApe !== 'function') {
    return runtime;
  }

  const startingBalanceApe = Number(await getBalanceApe());
  if (!Number.isFinite(startingBalanceApe)) {
    throw new Error('Unable to resolve wallet balance for standard bot loop controls.');
  }
  runtime.startingBalanceApe = startingBalanceApe;

  if (controls.takeProfit !== null) {
    runtime.cliTakeProfitApe = formatApeNumber(controls.takeProfit);
  } else if (controls.minProfit !== null) {
    runtime.cliTakeProfitApe = formatApeNumber(startingBalanceApe + Number(controls.minProfit));
  }

  if (controls.stopLoss !== null) {
    runtime.cliStopLossApe = formatApeNumber(controls.stopLoss);
  } else if (controls.maxLoss !== null) {
    runtime.cliStopLossApe = formatApeNumber(Math.max(startingBalanceApe - Number(controls.maxLoss), 0));
    controls.stopLoss = runtime.cliStopLossApe;
    loopControls.stopLoss = runtime.cliStopLossApe;
  }

  if (controls.maxLoss === null && controls.stopLoss !== null) {
    controls.maxLoss = formatApeNumber(startingBalanceApe - Number(controls.stopLoss));
    loopControls.maxLoss = controls.maxLoss;
  }

  return runtime;
}

export function getStandardBotCliForwardTokens(loopControls = {}, runtime = {}) {
  const tokens = [];
  const controls = {
    ...createEmptyStandardBotLoopControls(),
    ...loopControls,
  };

  if (runtime.cliTakeProfitApe !== null && runtime.cliTakeProfitApe !== undefined) {
    tokens.push('--take-profit', String(runtime.cliTakeProfitApe));
  }
  if (runtime.cliStopLossApe !== null && runtime.cliStopLossApe !== undefined) {
    tokens.push('--stop-loss', String(runtime.cliStopLossApe));
  }
  if (controls.gpApe !== null) {
    tokens.push('--gp-ape', controls.gpApe);
  }
  appendHumanTimingForwardTokens(tokens, controls.human);
  if (controls.delay !== null) {
    tokens.push('--delay', controls.delay);
  }

  return tokens;
}

export function getStandardBotNestedBotForwardTokens(loopControls = {}, {
  remainingMaxGames = null,
  runtime = {},
} = {}) {
  const tokens = [];
  const controls = {
    ...createEmptyStandardBotLoopControls(),
    ...loopControls,
  };

  if (runtime.cliTakeProfitApe !== null && runtime.cliTakeProfitApe !== undefined) {
    tokens.push('--take-profit', String(runtime.cliTakeProfitApe));
  } else if (controls.takeProfit !== null) {
    tokens.push('--take-profit', controls.takeProfit);
  } else if (controls.minProfit !== null) {
    tokens.push('--min-profit', controls.minProfit);
  }

  if (controls.recoverLoss !== null) {
    tokens.push('--recover-loss', controls.recoverLoss);
  }
  if (controls.givebackProfit !== null) {
    tokens.push('--giveback-profit', controls.givebackProfit);
  }

  if (runtime.cliStopLossApe !== null && runtime.cliStopLossApe !== undefined) {
    tokens.push('--stop-loss', String(runtime.cliStopLossApe));
  } else if (controls.stopLoss !== null) {
    tokens.push('--stop-loss', controls.stopLoss);
  } else if (controls.maxLoss !== null) {
    tokens.push('--max-loss', controls.maxLoss);
  }
  if (remainingMaxGames !== null) {
    const normalizedRemaining = Math.max(Number(remainingMaxGames) || 0, 1);
    tokens.push('--max-games', String(normalizedRemaining));
  } else if (controls.maxGames !== null) {
    tokens.push('--max-games', controls.maxGames);
  }
  if (controls.gpApe !== null) {
    tokens.push('--gp-ape', controls.gpApe);
  }
  appendHumanTimingForwardTokens(tokens, controls.human);
  if (controls.delay !== null) {
    tokens.push('--delay', controls.delay);
  }

  return tokens;
}

export function hasStandardBotInternalPacing(loopControls = {}) {
  const controls = {
    ...createEmptyStandardBotLoopControls(),
    ...loopControls,
  };

  return controls.delay !== null || Boolean(normalizeHumanTiming(controls.human));
}

export function getStandardBotInternalDelayMs(loopControls = {}) {
  const controls = {
    ...createEmptyStandardBotLoopControls(),
    ...loopControls,
  };
  const delaySeconds = controls.delay === null ? 0 : Number(controls.delay);

  if (!Number.isFinite(delaySeconds) || delaySeconds < 0) {
    throw new Error(`Invalid --delay value: "${controls.delay}". Must be a non-negative number.`);
  }

  return hasStandardBotInternalPacing(controls)
    ? getLoopDelayMs({ delaySeconds, human: controls.human })
    : 0;
}

export function getStandardBotLoopCondition({
  loopControls = {},
  totalPnlWei = 0n,
  executions = 0,
  state = null,
  currentBalanceApe = null,
} = {}) {
  const controls = {
    ...createEmptyStandardBotLoopControls(),
    ...loopControls,
  };
  const pnlWei = BigInt(totalPnlWei);
  const loopState = state || createStandardBotLoopState();

  const thresholdWei = (amount) => (amount === null ? null : parseApeToWei(amount));
  const takeProfitWei = thresholdWei(controls.takeProfit);
  const minProfitWei = thresholdWei(controls.minProfit);
  const recoverLossWei = thresholdWei(controls.recoverLoss);
  const givebackProfitWei = thresholdWei(controls.givebackProfit);
  const stopLossWei = thresholdWei(controls.stopLoss);
  const maxLossWei = thresholdWei(controls.maxLoss);
  const maxGames = controls.maxGames === null ? null : Number(controls.maxGames);
  const currentBalanceWei = currentBalanceApe === null || currentBalanceApe === undefined
    ? null
    : parseApeToWei(currentBalanceApe, 'current balance');

  if (recoverLossWei !== null && pnlWei <= -recoverLossWei) {
    loopState.recoverLossArmed = true;
  }
  if (givebackProfitWei !== null && pnlWei >= givebackProfitWei) {
    loopState.givebackProfitArmed = true;
  }

  if (takeProfitWei !== null && currentBalanceWei !== null && currentBalanceWei >= takeProfitWei) {
    return {
      kind: 'take_profit',
      threshold_ape: controls.takeProfit,
      balance_ape: formatWeiAsApe(currentBalanceWei),
      pnl_ape: formatWeiAsApe(pnlWei),
      executions,
    };
  }
  if (minProfitWei !== null && pnlWei >= minProfitWei) {
    return { kind: 'min_profit', threshold_ape: controls.minProfit, pnl_ape: formatWeiAsApe(pnlWei), executions };
  }
  if (stopLossWei !== null && currentBalanceWei !== null && currentBalanceWei <= stopLossWei) {
    return {
      kind: 'stop_loss',
      threshold_ape: controls.stopLoss,
      balance_ape: formatWeiAsApe(currentBalanceWei),
      pnl_ape: formatWeiAsApe(pnlWei),
      executions,
    };
  }
  if (maxLossWei !== null && pnlWei <= -maxLossWei) {
    return { kind: 'max_loss', threshold_ape: controls.maxLoss, pnl_ape: formatWeiAsApe(pnlWei), executions };
  }
  if (recoverLossWei !== null && loopState.recoverLossArmed && pnlWei >= 0n) {
    return { kind: 'recover_loss', threshold_ape: controls.recoverLoss, pnl_ape: formatWeiAsApe(pnlWei), executions };
  }
  if (givebackProfitWei !== null && loopState.givebackProfitArmed && pnlWei <= 0n) {
    return { kind: 'giveback_profit', threshold_ape: controls.givebackProfit, pnl_ape: formatWeiAsApe(pnlWei), executions };
  }
  if (maxGames !== null && executions >= maxGames) {
    return { kind: 'max_games', threshold: maxGames, pnl_ape: formatWeiAsApe(pnlWei), executions };
  }

  return null;
}

export function colorKey(key, colorOutput) {
  const color = getPlainColorChalk(colorOutput);
  return color ? color.white.dim(`${key}:`) : `${key}:`;
}

export function colorPnl(value, pnlWei, colorOutput) {
  const color = getPlainColorChalk(colorOutput);
  if (!color) return value;
  if (pnlWei > 0n) return color.greenBright.bold(value);
  if (pnlWei < 0n) return color.redBright.bold(value);
  return value;
}

export function colorBet(value, colorOutput) {
  const color = getPlainColorChalk(colorOutput);
  return color ? color.magenta(value) : value;
}

export function colorCommand(value, colorOutput) {
  const color = getPlainColorChalk(colorOutput);
  return color ? color.yellow(value) : value;
}

export function colorBotCommand(value, colorOutput) {
  const color = getPlainColorChalk(colorOutput);
  return color ? color.yellow(value) : value;
}

// Only forwarded child play lines from nested bots use this dim wrapper. Direct
// bot command lines keep their normal yellow command and independently colored suffix.
export function colorNestedBotOutput(value, colorOutput) {
  const color = getPlainColorChalk(colorOutput);
  return color ? color.yellow.dim(value) : value;
}

export function colorValue(value, colorOutput) {
  const color = getPlainColorChalk(colorOutput);
  return color ? color.white(value) : value;
}

export function shouldPrintPlainOutput({ json = false } = {}) {
  return !json || process.env[BOT_PLAIN_OUTPUT_ENV_VAR] === '1';
}

export function resolvePlainOutputStream({ json = false } = {}) {
  if (!shouldPrintPlainOutput({ json })) {
    return null;
  }

  return json ? process.stderr : process.stdout;
}

export function shouldUsePlainColorOutput({ json = false } = {}) {
  const stream = resolvePlainOutputStream({ json });
  if (!stream) return false;
  return Boolean(stream.isTTY || shouldForcePlainColorOutput({ json }));
}

export function shouldForcePlainColorOutput({ json = false } = {}) {
  return !json && process.env[FORCE_COLOR_ENV_VAR] === '1';
}

function getPlainColorChalk(colorOutput) {
  if (!colorOutput) return null;
  if (chalk.level > 0) return chalk;
  return process.env[FORCE_COLOR_ENV_VAR] === '1' ? forcedChalk : null;
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

export function formatBotCommandLine(botName, tokens = [], { binaryName = 'apechurch-cli', colorOutput = false } = {}) {
  const command = [binaryName, 'bot', botName, ...tokens.map((token) => String(token))]
    .map(shellQuoteToken)
    .join(' ');
  return colorBotCommand(command, colorOutput);
}

function formatWeiAsApeRounded(wei, decimals = 6) {
  const amountWei = BigInt(wei);
  if (amountWei === 0n) return '0';

  const sign = amountWei < 0n ? '-' : '';
  const absWei = amountWei < 0n ? -amountWei : amountWei;
  const scaleDelta = 18 - decimals;
  const roundingFactor = 10n ** BigInt(scaleDelta);
  const rounded = (absWei + (roundingFactor / 2n)) / roundingFactor;
  const fractionalScale = 10n ** BigInt(decimals);
  const whole = rounded / fractionalScale;
  const fraction = rounded % fractionalScale;

  if (fraction === 0n) {
    return `${sign}${whole.toString()}`;
  }

  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${sign}${whole.toString()}.${fractionText}`;
}

function formatSignedWeiAsApeRounded(wei, decimals = 6) {
  const amountWei = BigInt(wei);
  if (amountWei === 0n) return '0';
  if (amountWei > 0n) return `+${formatWeiAsApeRounded(amountWei, decimals)}`;
  return formatWeiAsApeRounded(amountWei, decimals);
}

function colorPayout(value, payoutWei, wagerWei, colorOutput) {
  const color = getPlainColorChalk(colorOutput);
  if (!color) return value;
  if (payoutWei > wagerWei) return color.green(value);
  if (payoutWei === wagerWei) return color.magenta(value);
  return color.red(value);
}

function colorCommandDelta(value, pnlWei, colorOutput) {
  const color = getPlainColorChalk(colorOutput);
  if (!color) return value;
  if (pnlWei === 0n) return color.magentaBright.bold(value);
  return colorPnl(value, pnlWei, colorOutput);
}

// Standard suffix for bot-launched play and bot command lines: payout values
// keep their non-bold outcome color, while only the gross P&L delta is bold.
export function formatCommandEconomicsSuffix({ wagerWei, payoutWei }, { colorOutput = false } = {}) {
  const wager = BigInt(wagerWei);
  const payout = BigInt(payoutWei);
  const pnlWei = payout - wager;
  const betText = formatWeiAsApeRounded(wager);
  const payoutText = formatWeiAsApeRounded(payout);
  const delta = formatSignedWeiAsApeRounded(pnlWei);
  return `  # bet: ${colorBet(betText, colorOutput)}, payout: ${colorPayout(
    payoutText,
    payout,
    wager,
    colorOutput,
  )} (${colorCommandDelta(delta, pnlWei, colorOutput)})`;
}

export function formatBeforeGameLine({
  balanceApe,
  totalPayoutWei,
  totalWagerWei,
  totalPnlWei,
  colorOutput = false,
}) {
  const fields = [
    `${colorKey('balance', colorOutput)} ${balanceApe}`,
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
  if (payload?.isComplete === true) return 'complete';

  const rawStatus = firstPresent(payload?.status, payload?.state, payload?.gameStateName);
  if (rawStatus === 'HAND_COMPLETE') return 'complete';
  return rawStatus ? String(rawStatus) : 'unknown';
}

function getPlayAmounts(payload) {
  const wagerApe = firstPresent(
    payload?.result?.buy_in_ape,
    payload?.result?.wager_ape,
    payload?.wager_ape,
    payload?.betAmountApe,
    payload?.totalBet,
    payload?.initialBet,
  );
  const payoutApe = firstPresent(
    payload?.result?.payout_ape,
    payload?.result?.payout,
    payload?.payout_ape,
    payload?.totalPayoutApe,
  );

  if (wagerApe === null || payoutApe === null) {
    return null;
  }

  try {
    return {
      wagerWei: parseApeToWei(wagerApe, 'wager_ape'),
      payoutWei: parseApeToWei(payoutApe, 'payout_ape'),
    };
  } catch {
    return null;
  }
}

export function formatPlayCommandSuffix(payload, { colorOutput = false } = {}) {
  const status = getPlayStatus(payload);
  const amounts = getPlayAmounts(payload);

  if (status !== 'complete' || !amounts) {
    return `  # ${status}`;
  }

  return formatCommandEconomicsSuffix(amounts, { colorOutput });
}

export function formatIterationSummaryLine({
  gameNumber,
  totalWagerWei,
  totalPayoutWei,
  totalPnlWei,
  colorOutput = false,
}) {
  const fields = [
    `${colorKey('routine', colorOutput)} ${colorValue(String(gameNumber), colorOutput)}`,
    `${colorKey('wagered', colorOutput)} ${colorValue(formatWeiAsApe(totalWagerWei), colorOutput)}`,
    `${colorKey('pnl', colorOutput)} ${colorValue(formatWeiAsApe(totalPnlWei), colorOutput)}`,
    `${colorKey('multiply', colorOutput)} ${colorValue(formatWeiRatio(totalPayoutWei, totalWagerWei), colorOutput)}`,
  ];
  return `# ${fields.join(', ')}`;
}

export function getSettledPlayEconomics(payload, gameNumber, botName = 'bot') {
  if (payload?.error) {
    throw new Error(`${botName} needs a settled result to compute real P&L; game ${gameNumber} returned error: ${payload.error}`);
  }

  const amounts = getPlayAmounts(payload);
  const status = getPlayStatus(payload);

  if ((!payload?.result && status !== 'complete') || !amounts) {
    throw new Error(`${botName} needs a settled result to compute real P&L; game ${gameNumber} returned status "${status}".`);
  }

  return {
    wagerWei: amounts.wagerWei,
    payoutWei: amounts.payoutWei,
    pnlWei: amounts.payoutWei - amounts.wagerWei,
  };
}

export function getNestedBotEconomics(payload, runNumber, botName = 'bot') {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`${botName} needs a nested bot JSON payload for run ${runNumber}.`);
  }

  const wagerApe = firstPresent(payload?.total_wager_ape, payload?.wager_ape);
  const payoutApe = firstPresent(payload?.total_payout_ape, payload?.payout_ape);

  if (wagerApe === null || payoutApe === null) {
    throw new Error(`${botName} needs nested bot economics for run ${runNumber}.`);
  }

  const wagerWei = parseApeToWei(wagerApe, `${botName} total_wager_ape`);
  const payoutWei = parseApeToWei(payoutApe, `${botName} total_payout_ape`);
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
