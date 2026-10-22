import { readAdditionalCostsWei, aggregateEconomicsPayloads, pickEconomicsFields, createEconomics, serializeEconomics, sumTransactionCosts } from '../economics.js';
export { aggregateEconomicsPayloads, pickEconomicsFields, formatPnlProfitPercent } from '../economics.js';
import { normalizePnlThreshold, pnlThresholdWei } from '../result-thresholds.js';
export { normalizePnlThreshold, pnlThresholdWei } from '../result-thresholds.js';
import readline from 'readline';

import chalk, { Chalk } from 'chalk';
import { BOT_PLAIN_OUTPUT_ENV_VAR, FORCE_COLOR_ENV_VAR } from '../constants.js';
import {
  getLoopDelayMs,
  getHumanLoopDelayMs,
  getHumanTimingCliValue,
  isHumanTimingOptionValue,
  normalizeHumanTiming,
} from '../stateful/timing.js';
import { formatTerminalTimestamp } from '../terminal-time.js';

const APE_SCALE = 10n ** 18n;
// Plain-output multipliers are intentionally fixed at two decimals; keep bot
// logs scan-stable and do not reintroduce variable precision here.
const RATIO_DECIMAL_PLACES = 2n;
const RATIO_SCALE = 10n ** RATIO_DECIMAL_PLACES;
const forcedChalk = new Chalk({ level: 1 });

const STANDARD_BOT_LOOP_APE_OPTIONS = new Map([
  ['--max-balance', 'maxBalance'],
  ['--min-profit', 'minProfit'],
  ['--take-profit', 'minProfit'],
  ['--stop-loss', 'maxLoss'],
  ['--recover-loss', 'recoverLoss'],
  ['--giveback-profit', 'givebackProfit'],
  ['--min-balance', 'minBalance'],
  ['--max-loss', 'maxLoss'],
  ['--bankroll', 'maxLoss'],
  ['--retrace', 'retrace'],
]);

const STANDARD_BOT_LOOP_VALUE_OPTIONS = new Map([
  ['--max-routines', 'maxGames'],
  ['--gp-ape', 'gpApe'],
  ['--delay', 'delay'],
  ['--preflight', 'preflight'],
]);

const STANDARD_BOT_LOOP_BOOLEAN_OPTIONS = new Map([
  ['--human', 'human'],
  ['--resilient', 'resilient'],
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
  if (BigInt(denominatorWei) === 0n) return null;

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
  if (token.startsWith(`${name}=`)) {
    throw new Error(`${name} does not accept a value. Use ${name} to enable it or --no-resilient to disable it.`);
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
    maxBalance: null,
    minProfit: null,
    recoverLoss: null,
    givebackProfit: null,
    minBalance: null,
    maxLoss: null,
    retrace: null,
    maxGames: null,
    gpApe: null,
    human: false,
    resilient: false,
    delay: null,
    preflight: null,
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

    if (token === '--no-resilient') {
      loopControls.resilient = false;
      i += 1;
      continue;
    }

    if (token === '--max-games' || token.startsWith('--max-games=')) {
      throw new Error('--max-games is not a bot option. Use --max-routines for the main bot routine limit; child play targets may still use their own --max-games.');
    }

    if (token === '--fallback-loss' || token.startsWith('--fallback-loss=')) {
      const parsed = readOptionValue(tokens, i, '--fallback-loss');
      fallbackLoss = normalizePnlThreshold(parsed.value, '--fallback-loss');
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
      const amount = !['--min-balance', '--max-balance', '--bankroll'].includes(apeOption) && String(parsed.value).endsWith('%')
        ? normalizePnlThreshold(parsed.value, apeOption)
        : apeOption === '--min-balance'
        ? parseNonNegativeApeAmount(parsed.value)
        : parsePositiveApeAmount(parsed.value);
      if (!amount) {
        const expectation = apeOption === '--min-balance' ? 'non-negative' : 'positive';
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
      } else if (key === 'delay' || key === 'preflight') {
        loopControls[key] = parseNonNegativeNumber(parsed.value, valueOption);
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

export async function confirmStandardBotWarning(message, { json = false, explicit = false } = {}) {
  if (json) {
    throw new Error(`${message} Add an explicit guard to run non-interactively.`);
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`${message} An interactive terminal is required to confirm this run.`);
  }

  const answer = await promptLine(explicit ? `${message} Type YES to continue: ` : `${message} Proceed? (Y/n) `);
  const normalized = String(answer).trim().toLowerCase();
  if (explicit && normalized !== 'yes') {
    throw new Error('Bot run cancelled.');
  }
  if (!explicit && normalized === 'n') {
    throw new Error('Bot run cancelled.');
  }
}

export function createStandardBotLoopState() {
  return {
    recoverLossArmed: false,
    givebackProfitArmed: false,
    minPnlWei: null,
    maxPnlWei: null,
    startingBalanceWei: null,
  };
}

export function hasStandardBotLossGuard(loopControls = {}) {
  return Boolean(loopControls.minBalance || loopControls.maxLoss || loopControls.retrace);
}

export function hasStandardBotProfitGuard(loopControls = {}) {
  return Boolean(loopControls.maxBalance || loopControls.minProfit);
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
    cliMaxBalanceApe: null,
    cliMinBalanceApe: null,
    state: createStandardBotLoopState(),
  };

  if (dryRun) {
    return runtime;
  }

  if (confirmWarnings && !hasStandardBotLossGuard(controls)) {
    await confirmStandardBotWarning(
      `${botName} was invoked without --min-balance, --max-loss, or --bankroll; it could drain all available funds.`,
      { json },
    );
  }

  if (confirmWarnings && !hasStandardBotProfitGuard(controls)) {
    await confirmStandardBotWarning(
      `${botName} was invoked without --max-balance or --min-profit; it theoretically stops only in loss.`,
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
  runtime.state.startingBalanceWei = parseApeToWei(formatApeNumber(startingBalanceApe), 'starting balance');

  if (controls.maxBalance !== null) {
    runtime.cliMaxBalanceApe = formatApeNumber(controls.maxBalance);

  }

  if (controls.minBalance !== null) {
    runtime.cliMinBalanceApe = formatApeNumber(controls.minBalance);
  }

  return runtime;
}

export function getStandardBotCliForwardTokens(loopControls = {}, runtime = {}) {
  const tokens = [];
  const controls = {
    ...createEmptyStandardBotLoopControls(),
    ...loopControls,
  };

  if (runtime.cliMaxBalanceApe !== null && runtime.cliMaxBalanceApe !== undefined) {
    tokens.push('--max-balance', String(runtime.cliMaxBalanceApe));
  }
  if (runtime.cliMinBalanceApe !== null && runtime.cliMinBalanceApe !== undefined) {
    tokens.push('--min-balance', String(runtime.cliMinBalanceApe));
  }
  if (controls.gpApe !== null) {
    tokens.push('--gp-ape', controls.gpApe);
  }
  if (controls.resilient) {
    tokens.push('--resilient');
  }
  appendHumanTimingForwardTokens(tokens, controls.human);

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

  if (runtime.cliMaxBalanceApe !== null && runtime.cliMaxBalanceApe !== undefined) {
    tokens.push('--max-balance', String(runtime.cliMaxBalanceApe));
  } else if (controls.maxBalance !== null) {
    tokens.push('--max-balance', controls.maxBalance);
  } else if (controls.minProfit !== null) {
    tokens.push('--min-profit', controls.minProfit);
  }

  if (controls.recoverLoss !== null) {
    tokens.push('--recover-loss', controls.recoverLoss);
  }
  if (controls.givebackProfit !== null) {
    tokens.push('--giveback-profit', controls.givebackProfit);
  }

  if (runtime.cliMinBalanceApe !== null && runtime.cliMinBalanceApe !== undefined) {
    tokens.push('--min-balance', String(runtime.cliMinBalanceApe));
  } else if (controls.minBalance !== null) {
    tokens.push('--min-balance', controls.minBalance);
  } else if (controls.maxLoss !== null) {
    tokens.push('--max-loss', controls.maxLoss);
  }
  void remainingMaxGames;
  if (controls.gpApe !== null) {
    tokens.push('--gp-ape', controls.gpApe);
  }
  if (controls.resilient) {
    tokens.push('--resilient');
  }
  appendHumanTimingForwardTokens(tokens, controls.human);

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

export function getStandardBotPreflightDelayMs(loopControls = {}, defaultSeconds = 0) {
  const controls = {
    ...createEmptyStandardBotLoopControls(),
    ...loopControls,
  };
  const rawSeconds = controls.preflight === null || controls.preflight === undefined
    ? defaultSeconds
    : controls.preflight;
  const seconds = Number(rawSeconds);

  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`Invalid --preflight value: "${rawSeconds}". Must be a non-negative number.`);
  }

  return Math.round(seconds * 1000);
}

export function getStandardBotChildDelayMs(loopControls = {}) {
  const controls = {
    ...createEmptyStandardBotLoopControls(),
    ...loopControls,
  };

  return normalizeHumanTiming(controls.human) ? getHumanLoopDelayMs(controls.human) : 0;
}

function parseOptionalApeToWei(value, label) {
  if (value === null || value === undefined) return null;
  return parseApeToWei(String(value), label);
}

function updateStandardBotPnlExtrema(loopState, pnlWei) {
  if (loopState.minPnlWei === null || loopState.minPnlWei === undefined) {
    loopState.minPnlWei = pnlWei;
  } else if (pnlWei < loopState.minPnlWei) {
    loopState.minPnlWei = pnlWei;
  }

  if (loopState.maxPnlWei === null || loopState.maxPnlWei === undefined) {
    loopState.maxPnlWei = pnlWei;
  } else if (pnlWei > loopState.maxPnlWei) {
    loopState.maxPnlWei = pnlWei;
  }
}

export function getStandardBotLoopCondition({
  loopControls = {},
  totalPnlWei = 0n,
  routinePnlWei = null,
  totalWagerWei = 0n,
  routineWagerWei = totalWagerWei,
  executions = 0,
  state = null,
  currentBalanceApe = null,
  startingBalanceApe = null,
} = {}) {
  const controls = {
    ...createEmptyStandardBotLoopControls(),
    ...loopControls,
  };
  const pnlWei = BigInt(totalPnlWei);
  const loopState = state || createStandardBotLoopState();
  const currentBalanceWei = parseOptionalApeToWei(currentBalanceApe, 'current balance');
  const trailingPnlWei = pnlWei;
  const trailingPnlBasis = 'net';
  updateStandardBotPnlExtrema(loopState, trailingPnlWei);

  const thresholdWei = (amount) => (amount === null ? null : parseApeToWei(amount));
  const maxBalanceWei = thresholdWei(controls.maxBalance);
  const minProfitWei = pnlThresholdWei(controls.minProfit, totalWagerWei);
  const recoverLossWei = pnlThresholdWei(controls.recoverLoss, totalWagerWei);
  const givebackProfitWei = pnlThresholdWei(controls.givebackProfit, totalWagerWei);
  const minBalanceWei = thresholdWei(controls.minBalance);
  const maxLossWei = pnlThresholdWei(controls.maxLoss, totalWagerWei);
  const retraceWei = pnlThresholdWei(controls.retrace, routineWagerWei);
  const routinePnl = routinePnlWei === null || routinePnlWei === undefined
    ? null
    : BigInt(routinePnlWei);
  const maxGames = controls.maxGames === null ? null : Number(controls.maxGames);

  if (recoverLossWei !== null && loopState.minPnlWei <= -recoverLossWei) {
    loopState.recoverLossArmed = true;
  }
  if (givebackProfitWei !== null && loopState.maxPnlWei >= givebackProfitWei) {
    loopState.givebackProfitArmed = true;
  }

  if (maxBalanceWei !== null && currentBalanceWei !== null && currentBalanceWei >= maxBalanceWei) {
    return {
      kind: 'max_balance',
      threshold_ape: controls.maxBalance,
      balance_ape: formatWeiAsApe(currentBalanceWei),
      pnl_ape: formatWeiAsApe(pnlWei),
      executions,
    };
  }
  if (minProfitWei !== null && pnlWei >= minProfitWei) {
    return { kind: 'min_profit', threshold_ape: controls.minProfit, pnl_ape: formatWeiAsApe(pnlWei), executions };
  }
  if (minBalanceWei !== null && currentBalanceWei !== null && currentBalanceWei <= minBalanceWei) {
    return {
      kind: 'min_balance',
      threshold_ape: controls.minBalance,
      balance_ape: formatWeiAsApe(currentBalanceWei),
      pnl_ape: formatWeiAsApe(pnlWei),
      executions,
    };
  }
  if (maxLossWei !== null && pnlWei <= -maxLossWei) {
    return { kind: 'max_loss', threshold_ape: controls.maxLoss, pnl_ape: formatWeiAsApe(pnlWei), executions };
  }
  if (retraceWei !== null && routinePnl !== null && routinePnl <= -retraceWei) {
    return {
      kind: 'retrace',
      threshold_ape: controls.retrace,
      routine_pnl_ape: formatWeiAsApe(routinePnl),
      pnl_ape: formatWeiAsApe(pnlWei),
      executions,
    };
  }
  if (recoverLossWei !== null && loopState.recoverLossArmed && trailingPnlWei >= 0n) {
    const recoveredWei = trailingPnlWei - loopState.minPnlWei;
    return {
      kind: 'recover_loss',
      threshold_ape: controls.recoverLoss,
      pnl_ape: formatWeiAsApe(trailingPnlWei),
      min_pnl_ape: formatWeiAsApe(loopState.minPnlWei),
      recovered_ape: formatWeiAsApe(recoveredWei),
      pnl_basis: trailingPnlBasis,
      executions,
    };
  }
  if (givebackProfitWei !== null && loopState.givebackProfitArmed && trailingPnlWei <= 0n) {
    const givebackWei = loopState.maxPnlWei - trailingPnlWei;
    return {
      kind: 'giveback_profit',
      threshold_ape: controls.givebackProfit,
      pnl_ape: formatWeiAsApe(trailingPnlWei),
      max_pnl_ape: formatWeiAsApe(loopState.maxPnlWei),
      giveback_ape: formatWeiAsApe(givebackWei),
      pnl_basis: trailingPnlBasis,
      executions,
    };
  }
  if (maxGames !== null && executions >= maxGames) {
    return { kind: 'max_routines', threshold: maxGames, pnl_ape: formatWeiAsApe(pnlWei), executions };
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

function colorTimestamp(value, colorOutput) {
  const color = getPlainColorChalk(colorOutput);
  return color ? color.cyan(value) : value;
}

// Standard suffix for bot-launched play and bot command lines: payout values
// keep their non-bold outcome color, while only the net PnL is bold.
export function formatCommandEconomicsSuffix({ wagerWei, payoutWei, pnlWei = null }, { colorOutput = false } = {}) {
  const wager = BigInt(wagerWei);
  const payout = BigInt(payoutWei);
  pnlWei = pnlWei === null ? null : BigInt(pnlWei);
  const betText = formatWeiAsApeRounded(wager);
  const payoutText = formatWeiAsApeRounded(payout);
  const delta = pnlWei === null ? null : formatSignedWeiAsApeRounded(pnlWei);
  return `  # bet: ${colorBet(betText, colorOutput)}, payout: ${colorPayout(
    payoutText,
    payout,
    wager,
    colorOutput,
  )}, net PnL: ${delta === null ? 'unavailable' : colorCommandDelta(delta, pnlWei, colorOutput)}`;
}

export function formatBeforeGameLine({
  balanceApe,
  totalPayoutWei,
  totalWagerWei,
  totalPnlWei,
  pnlBasis = 'net',
  timestamp = new Date(),
  colorOutput = false,
}) {
  const timestampText = formatTerminalTimestamp(timestamp) || 'unknown timestamp';
  const fields = [
    `${colorKey('balance', colorOutput)} ${balanceApe}`,
    `${colorKey('payout_ape', colorOutput)} ${formatWeiAsApe(totalPayoutWei)}`,
    `${colorKey('wager_ape', colorOutput)} ${formatWeiAsApe(totalWagerWei)}`,
    `${colorKey('net PnL', colorOutput)} ${colorPnl(formatWeiAsApe(totalPnlWei), totalPnlWei, colorOutput)}`,
  ];
  return `# ${colorTimestamp(timestampText, colorOutput)} | ${fields.join(', ')}`;
}

export function formatAfterGameLine({ gameNumber, status, wagerWei, payoutWei, colorOutput = false }) {
  const fields = [
    `${colorKey('game_n', colorOutput)} ${gameNumber}`,
    `${colorKey('status', colorOutput)} ${status || 'unknown'}`,
    `${colorKey('bet', colorOutput)} ${colorBet(formatWeiAsApe(wagerWei), colorOutput)}`,
    `${colorKey('payout', colorOutput)} ${formatWeiAsApe(payoutWei)}`,
    `${colorKey('multiplier', colorOutput)} ${BigInt(wagerWei) > 0n ? `${formatWeiRatio(payoutWei, wagerWei)}×` : 'n/a'}`,
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

  return formatCommandEconomicsSuffix({ ...amounts, ...resolvePayloadNetEconomics(payload, amounts) }, { colorOutput });
}

export function formatIterationSummaryLine({
  gameNumber,
  totalWagerWei,
  totalPayoutWei,
  totalPnlWei,
  pnlBasis = 'net',
  colorOutput = false,
}) {
  const fields = [
    `${colorKey('routine', colorOutput)} ${colorValue(String(gameNumber), colorOutput)}`,
    `${colorKey('wagered', colorOutput)} ${colorValue(formatWeiAsApe(totalWagerWei), colorOutput)}`,
    `${colorKey('net PnL', colorOutput)} ${colorValue(formatWeiAsApe(totalPnlWei), colorOutput)}`,
    `${colorKey('multiplier', colorOutput)} ${colorValue(BigInt(totalWagerWei) > 0n ? `${formatWeiRatio(totalPayoutWei, totalWagerWei)}×` : 'n/a', colorOutput)}`,
  ];
  return `# ${fields.join(', ')}`;
}

function resolvePayloadNetEconomics(payload, { wagerWei, payoutWei }) {
  const source = payload?.accounting_version ? payload : payload?.result?.accounting_version ? payload.result : payload;
  const costsWei = readAdditionalCostsWei(source);
  if (source?.accounting_version >= 2 && costsWei === null) {
    const error = new Error('Settled transaction costs are incomplete; reconcile the receipts before continuing.');
    error.code = 'ACCOUNTING_INCOMPLETE';
    throw error;
  }
  // Legacy payloads have no receipt ledger. Keep their known fees distinct and
  // expose completeness; version-2 callers must provide the complete ledger.
  const knownCostsWei = costsWei ?? 0n;
  return {
    grossProfitWei: payoutWei - wagerWei,
    costsWei: knownCostsWei,
    costsComplete: costsWei !== null,
    costs: source?.costs ?? null,
    pnlWei: payoutWei - wagerWei - knownCostsWei,
  };
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
    ...resolvePayloadNetEconomics(payload, amounts),
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
    ...resolvePayloadNetEconomics(payload, { wagerWei, payoutWei }),
  };
}

export function getBotEconomicsFields({ totalWagerWei, totalPayoutWei, totalPnlWei, children = [] }) {
  const costWei = BigInt(totalPayoutWei) - BigInt(totalWagerWei) - BigInt(totalPnlWei);
  const transactions = children.flatMap((child) => (child?.payload ?? child)?.costs?.transactions ?? []);
  const costs = sumTransactionCosts(transactions);
  const recordedWei = BigInt(costs.confirmed_total_wei);
  if (recordedWei !== costWei || transactions.length === 0) {
    // Legacy child records can report a known total without a receipt ledger.
    costs.other_wei = (BigInt(costs.other_wei) + costWei - recordedWei).toString();
    costs.other_ape = formatWeiAsApe(BigInt(costs.other_wei));
    costs.total_wei = costWei.toString();
    costs.total_ape = formatWeiAsApe(costWei);
    costs.complete = transactions.length > 0 && recordedWei === costWei;
  }
  return { ...serializeEconomics(createEconomics({ wagerWei: totalWagerWei, payoutWei: totalPayoutWei, costsWei: costWei }), costs),
    total_cost_ape: formatWeiAsApe(costWei), total_pnl_ape: formatWeiAsApe(totalPnlWei) };
}

export function shouldTriggerFallback({ totalPnlWei, totalWagerWei = 0n, fallbackLoss }) {
  if (!fallbackLoss) return false;
  if (totalPnlWei >= 0n) return false;
  const thresholdWei = pnlThresholdWei(fallbackLoss, totalWagerWei);
  return thresholdWei !== null && -totalPnlWei >= thresholdWei;
}
