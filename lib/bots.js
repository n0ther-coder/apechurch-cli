/**
 * @fileoverview External bot loader for private gameplay automation.
 *
 * Bots are discovered from a filesystem directory and exposed through the
 * `apechurch-cli bot <name> ...` surface.
 * Each bot receives a narrow context whose main capability is `play()`, which
 * re-invokes the public CLI `play` command.
 *
 * @module lib/bots
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { formatEther } from 'viem';

import {
  APECHURCH_DIR,
  BOT_PLAIN_OUTPUT_ENV_VAR,
  BOTS_DIR,
  BINARY_NAME,
  FORCE_CHIME_ENV_VAR,
  FORCE_COLOR_ENV_VAR,
  LOG_DIR,
  SUPPRESS_CHIME_ENV_VAR,
  SUPPRESS_VERSION_BANNER_ENV_VAR,
} from './constants.js';
import {
  createClients,
  getBalanceWithRetry,
  getWallet,
} from './wallet.js';
import { queueWinChime } from './chime.js';
import * as botSession from './bots/session.js';

const BOT_MANIFEST_FILE = 'bot.json';
const DEFAULT_BOT_ENTRY = './index.js';
const BOT_COMMAND_TOKEN_RE = /^[a-z0-9][a-z0-9-]*$/;
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const BOT_TERMINATION_SIGNALS = ['SIGINT', 'SIGTERM'];
const BOT_ROOT_RUN_ID_ENV_VAR = 'APECHURCH_CLI_BOT_ROOT_RUN_ID';
const BOT_PARENT_RUN_ID_ENV_VAR = 'APECHURCH_CLI_BOT_PARENT_RUN_ID';
const BOT_PARENT_CALL_ID_ENV_VAR = 'APECHURCH_CLI_BOT_PARENT_CALL_ID';
const BOT_PARENT_BOT_ENV_VAR = 'APECHURCH_CLI_BOT_PARENT_BOT';
const BOT_CALL_DEPTH_ENV_VAR = 'APECHURCH_CLI_BOT_CALL_DEPTH';

function normalizeBotCommandToken(value, fallback = '') {
  return String(value || fallback).trim().toLowerCase();
}

function validateBotCommandToken(value, fieldName) {
  const normalized = normalizeBotCommandToken(value);
  if (!normalized || !BOT_COMMAND_TOKEN_RE.test(normalized)) {
    throw new Error(`Invalid ${fieldName}: expected lowercase letters, numbers, or hyphens.`);
  }
  return normalized;
}

function parseBotManifest(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to parse ${BOT_MANIFEST_FILE}: ${error.message}`);
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`Invalid ${BOT_MANIFEST_FILE}: expected a JSON object.`);
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    throw new Error(`Invalid ${BOT_MANIFEST_FILE}: "name" is required.`);
  }

  if (manifest.description !== undefined && typeof manifest.description !== 'string') {
    throw new Error(`Invalid ${BOT_MANIFEST_FILE}: "description" must be a string when present.`);
  }

  if (manifest.entry !== undefined && typeof manifest.entry !== 'string') {
    throw new Error(`Invalid ${BOT_MANIFEST_FILE}: "entry" must be a string when present.`);
  }

  if (manifest.command !== undefined && typeof manifest.command !== 'string') {
    throw new Error(`Invalid ${BOT_MANIFEST_FILE}: "command" must be a string when present.`);
  }

  return manifest;
}

export function resolveBotsDir() {
  return BOTS_DIR;
}

export function discoverBotDefinitions() {
  const botsDir = resolveBotsDir();
  const bots = [];
  const errors = [];
  const seenCommands = new Set();

  if (!fs.existsSync(botsDir)) {
    return { botsDir, bots, errors };
  }

  const entries = fs.readdirSync(botsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const botDir = path.join(botsDir, entry.name);
    const manifestPath = path.join(botDir, BOT_MANIFEST_FILE);
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    try {
      const manifest = parseBotManifest(manifestPath);
      const command = validateBotCommandToken(manifest.command ?? entry.name, 'command');
      if (seenCommands.has(command)) {
        throw new Error(`Duplicate bot command: "${command}".`);
      }
      seenCommands.add(command);

      const entryPath = path.resolve(botDir, manifest.entry || DEFAULT_BOT_ENTRY);
      if (!fs.existsSync(entryPath)) {
        throw new Error(`Bot entry file not found: ${path.relative(botDir, entryPath)}`);
      }

      bots.push({
        name: String(manifest.name).trim(),
        description: String(manifest.description || '').trim(),
        command,
        directory: botDir,
        manifestPath,
        entryPath,
      });
    } catch (error) {
      errors.push({
        botDirectory: botDir,
        manifestPath,
        message: error.message,
      });
    }
  }

  return { botsDir, bots, errors };
}

async function importBotModule(entryPath) {
  const mod = await import(pathToFileURL(entryPath).href);
  return mod;
}

async function importBotHandler(entryPath) {
  const mod = await importBotModule(entryPath);
  const handler = mod.default || mod.run;
  if (typeof handler !== 'function') {
    throw new Error('Bot entry must export a default function or named "run" function.');
  }
  return handler;
}

function runChildProcess(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Child process exited via signal ${signal}.`));
        return;
      }
      resolve(Number.isInteger(code) ? code : 1);
    });
  });
}

function runChildProcessCapture(command, args, env, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    let stdout = '';
    let stderr = '';
    let forwardedStderrRemainder = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (options.forwardStderr) {
        forwardedStderrRemainder = forwardNestedBotStderrChunk(chunk, forwardedStderrRemainder, {
          colorOutput: process.stderr.isTTY || botSession.shouldForcePlainColorOutput(),
        });
      }
      forwardTerminalBells(chunk, env);
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Child process exited via signal ${signal}.`));
        return;
      }
      if (options.forwardStderr && forwardedStderrRemainder) {
        forwardNestedBotStderrLine(forwardedStderrRemainder, {
          colorOutput: process.stderr.isTTY || botSession.shouldForcePlainColorOutput(),
        });
      }
      resolve({
        code: Number.isInteger(code) ? code : 1,
        stdout,
        stderr,
      });
    });
  });
}

function stripAnsi(value) {
  return String(value || '').replace(ANSI_RE, '');
}

function forwardNestedBotStderrChunk(chunk, remainder, { colorOutput = false } = {}) {
  const text = `${remainder || ''}${chunk}`;
  const lines = text.split('\n');
  const nextRemainder = lines.pop() || '';

  for (const line of lines) {
    forwardNestedBotStderrLine(line, { colorOutput, newline: true });
  }

  return nextRemainder;
}

function forwardNestedBotStderrLine(line, { colorOutput = false, newline = false } = {}) {
  const lineWithoutBells = String(line || '').replace(/\x07/g, '');
  const normalized = stripAnsi(lineWithoutBells).replace(/\r$/, '');
  if (!normalized.trim() || normalized.startsWith('#')) {
    return;
  }

  const output = `${lineWithoutBells}${newline ? '\n' : ''}`;
  process.stderr.write(botSession.colorNestedBotOutput(output, colorOutput));
}

function forwardTerminalBells(chunk, env = {}) {
  if (env[FORCE_CHIME_ENV_VAR] !== '1') return;
  if (env[SUPPRESS_CHIME_ENV_VAR] === '1') return;

  const bellCount = (String(chunk).match(/\x07/g) || []).length;
  if (bellCount > 0) {
    if (!process.stderr?.isTTY && typeof process.stderr?.write === 'function') {
      try {
        process.stderr.write('\x07'.repeat(bellCount));
      } catch {
        // Ignore terminal write errors: sound must never impact gameplay.
      }
      return;
    }

    queueWinChime(bellCount, { isJson: false, stream: process.stderr });
  }
}

function normalizePlayArgs(args) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error('ctx.play(...) expects a non-empty array of CLI tokens.');
  }

  return args.map((arg) => String(arg));
}

function normalizeJsonPlayArgs(args) {
  const tokens = normalizePlayArgs(args);
  return tokens.includes('--json') ? tokens : [...tokens, '--json'];
}

function createNestedPlayEnv(options = {}) {
  const extraEnv = options && typeof options === 'object' && options.env && typeof options.env === 'object'
    ? options.env
    : {};
  const suppressChime = options.suppressChime === true
    ? '1'
    : (options.suppressChime === false
      ? ''
      : (extraEnv[SUPPRESS_CHIME_ENV_VAR] ?? process.env[SUPPRESS_CHIME_ENV_VAR] ?? ''));
  const forceChime = suppressChime === '1'
    ? ''
    : (options.forceChime === false
      ? ''
      : (options.forceChime === true
        ? '1'
        : (extraEnv[FORCE_CHIME_ENV_VAR] ?? process.env[FORCE_CHIME_ENV_VAR] ?? '')));

  return {
    ...process.env,
    ...extraEnv,
    [FORCE_CHIME_ENV_VAR]: forceChime,
    [FORCE_COLOR_ENV_VAR]: extraEnv[FORCE_COLOR_ENV_VAR] ?? process.env[FORCE_COLOR_ENV_VAR] ?? '',
    [SUPPRESS_CHIME_ENV_VAR]: suppressChime,
    [SUPPRESS_VERSION_BANNER_ENV_VAR]: '1',
    [BOT_PLAIN_OUTPUT_ENV_VAR]: options.streamPlainOutput ? '1' : (extraEnv[BOT_PLAIN_OUTPUT_ENV_VAR] || ''),
  };
}

function createNestedBotEnv(metadata) {
  if (!metadata) return {};

  return {
    [BOT_ROOT_RUN_ID_ENV_VAR]: metadata.rootRunId,
    [BOT_PARENT_RUN_ID_ENV_VAR]: metadata.parentRunId,
    [BOT_PARENT_CALL_ID_ENV_VAR]: metadata.parentCallId,
    [BOT_PARENT_BOT_ENV_VAR]: metadata.parentBot,
    [BOT_CALL_DEPTH_ENV_VAR]: String(metadata.callDepth),
  };
}

function tryParseJsonPayload(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return extractLastJsonPayload(trimmed);
  }
}

function extractLastJsonPayload(text) {
  let lastPayload = null;

  for (let start = 0; start < text.length; start += 1) {
    const opener = text[start];
    if (opener !== '{' && opener !== '[') continue;

    const closer = opener === '{' ? '}' : ']';
    const stack = [closer];
    let inString = false;
    let escaped = false;

    for (let index = start + 1; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        stack.push('}');
        continue;
      }
      if (char === '[') {
        stack.push(']');
        continue;
      }

      if (char !== '}' && char !== ']') continue;
      if (stack.pop() !== char) break;
      if (stack.length > 0) continue;

      try {
        lastPayload = JSON.parse(text.slice(start, index + 1));
        start = index;
      } catch {
        // Keep scanning: stateful game output may contain non-JSON card text.
      }
      break;
    }
  }

  return lastPayload;
}

function formatPlayJsonErrorMessage(result) {
  const parsedError = tryParseJsonPayload(result.stderr) || tryParseJsonPayload(result.stdout);
  if (parsedError?.error) return String(parsedError.error);
  const fallback = String(result.stderr || result.stdout || '').trim();
  return fallback || `play --json exited with code ${result.code}`;
}

function formatCommandJsonErrorMessage(commandName, result) {
  const parsedError = tryParseJsonPayload(result.stderr) || tryParseJsonPayload(result.stdout);
  if (parsedError?.error) return String(parsedError.error);
  const fallback = String(result.stderr || result.stdout || '').trim();
  return fallback || `${commandName} --json exited with code ${result.code}`;
}

function getPayloadErrorMessage(payload) {
  const message = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload.error
    : null;
  return message === undefined || message === null || message === '' ? null : String(message);
}

function throwJsonPayloadError(commandName, payload, result) {
  const error = new Error(getPayloadErrorMessage(payload));
  error.code = result.code;
  error.stdout = result.stdout;
  error.stderr = result.stderr;
  error.payload = payload;
  error.commandName = commandName;
  throw error;
}

async function runCliJson(cliPath, commandName, args = [], options = {}) {
  const tokens = Array.isArray(args) ? args.map((arg) => String(arg)) : [];
  const env = createNestedPlayEnv(options);
  const result = await runChildProcessCapture(process.execPath, [cliPath, commandName, ...tokens, '--json'], env);
  const payload = tryParseJsonPayload(result.stdout);

  if (result.code !== 0) {
    const error = new Error(formatCommandJsonErrorMessage(commandName, result));
    error.code = result.code;
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    error.payload = payload || tryParseJsonPayload(result.stderr);
    throw error;
  }

  if (!payload) {
    const error = new Error(`${commandName} --json did not return valid JSON.`);
    error.code = result.code;
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    throw error;
  }
  if (getPayloadErrorMessage(payload)) {
    throwJsonPayloadError(commandName, payload, result);
  }

  return payload;
}

async function runBotJson(cliPath, botName, args = [], options = {}) {
  const command = normalizeBotCommandToken(botName);
  if (!command) {
    throw new Error('ctx.botJson(...) requires a bot name.');
  }

  const tokens = Array.isArray(args) ? args.map((arg) => String(arg)) : [];
  const env = createNestedPlayEnv(options);
  const result = await runChildProcessCapture(
    process.execPath,
    [cliPath, 'bot', command, ...tokens, '--json'],
    env,
    { forwardStderr: options.streamPlainOutput === true },
  );
  const payload = tryParseJsonPayload(result.stdout);

  if (result.code !== 0) {
    const error = new Error(formatCommandJsonErrorMessage(`bot ${command}`, result));
    error.code = result.code;
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    error.payload = payload || tryParseJsonPayload(result.stderr);
    throw error;
  }

  if (!payload) {
    const error = new Error(`bot ${command} --json did not return valid JSON.`);
    error.code = result.code;
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    throw error;
  }
  if (getPayloadErrorMessage(payload)) {
    throwJsonPayloadError(`bot ${command}`, payload, result);
  }

  return payload;
}

export async function validateBotInvocation(bot, args = [], {
  session = botSession,
} = {}) {
  if (!bot?.entryPath) {
    throw new Error('Bot validation requires a resolved bot definition.');
  }

  const tokens = Array.isArray(args) ? args.map((arg) => String(arg)) : [];
  if (isHelpBotInvocation(tokens)) {
    return {
      status: 'valid',
      command: 'bot',
      bot: bot.command,
      args: tokens,
      help: true,
    };
  }

  const mod = await importBotModule(bot.entryPath);
  const validator = typeof mod.validateArgs === 'function'
    ? mod.validateArgs
    : (typeof mod.parseArgs === 'function' ? mod.parseArgs : null);

  if (!validator) {
    throw new Error(`Bot "${bot.command}" does not expose startup argument validation.`);
  }

  await validator(tokens, session);
  return {
    status: 'valid',
    command: 'bot',
    bot: bot.command,
    args: tokens,
  };
}

function normalizeOptionalEnvValue(value) {
  const text = String(value || '').trim();
  return text || null;
}

function parseBotCallDepth(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function createBotRunMetadata(bot, runtimeOptions = {}) {
  const rawArgs = Array.isArray(runtimeOptions.rawArgs)
    ? runtimeOptions.rawArgs.map((arg) => String(arg))
    : [];
  const runId = randomUUID();
  const parentRunId = normalizeOptionalEnvValue(process.env[BOT_PARENT_RUN_ID_ENV_VAR]);
  const rootRunId = normalizeOptionalEnvValue(process.env[BOT_ROOT_RUN_ID_ENV_VAR]) || runId;

  return {
    runId,
    rootRunId,
    parentRunId,
    parentCallId: normalizeOptionalEnvValue(process.env[BOT_PARENT_CALL_ID_ENV_VAR]),
    parentBot: normalizeOptionalEnvValue(process.env[BOT_PARENT_BOT_ENV_VAR]),
    callDepth: parseBotCallDepth(process.env[BOT_CALL_DEPTH_ENV_VAR]),
    startedAt: new Date().toISOString(),
    rawArgs,
    botCommand: bot.command,
    botName: bot.name,
  };
}

function buildBotRunSummaryFields(metadata, {
  endedAt = new Date().toISOString(),
  includeEndedAt = true,
} = {}) {
  const fields = {
    run_id: metadata.runId,
    root_run_id: metadata.rootRunId,
    parent_run_id: metadata.parentRunId,
    parent_call_id: metadata.parentCallId,
    parent_bot: metadata.parentBot,
    call_depth: metadata.callDepth,
    args: metadata.rawArgs,
    started_at_utc: metadata.startedAt,
  };

  if (includeEndedAt) {
    fields.ended_at_utc = endedAt;
  }

  return fields;
}

function serializeNestedBotCallError(error) {
  return serializeBotRunError(error);
}

function getSummaryRunId(payload) {
  return normalizeOptionalEnvValue(payload?.run_id);
}

function getSummaryStatus(payload) {
  return normalizeOptionalEnvValue(payload?.status);
}

function tryParseApeToWei(value) {
  try {
    return botSession.parseApeToWei(value);
  } catch {
    return null;
  }
}

function normalizeWeiField(value) {
  if (value === undefined || value === null) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function addIfPresent(target, key, value) {
  if (value !== undefined && value !== null) {
    target[key] = value;
  }
}

export function createBotRuntimeContext(bot, {
  cliPath,
  rawArgs = [],
  runMetadata = null,
  runLogger = null,
} = {}) {
  if (!cliPath) {
    throw new Error('createBotRuntimeContext requires cliPath.');
  }

  let runtimeAccount = null;
  let runtimePublicClient = null;
  let balanceStartWei = null;
  let balanceBaselineWei = null;
  let nestedBotCallSequence = 0;
  const runtimeArgs = rawArgs.map((arg) => String(arg));
  let metadata = runMetadata || createBotRunMetadata(bot, { rawArgs: runtimeArgs });
  const balanceSnapshots = [];
  const nestedBotCalls = [];
  const plainOutputEnabled = botSession.shouldPrintPlainOutput({
    json: runtimeArgs.includes('--json'),
  });
  const botLogDir = resolveBotSummaryLogDir(bot.command);
  fs.mkdirSync(botLogDir, { recursive: true });

  function getRuntimeAccount() {
    if (!runtimeAccount) {
      runtimeAccount = getWallet();
    }
    return runtimeAccount;
  }

  function getRuntimePublicClient() {
    if (!runtimePublicClient) {
      ({ publicClient: runtimePublicClient } = createClients());
    }
    return runtimePublicClient;
  }

  async function readRuntimeBalanceJson() {
    const account = getRuntimeAccount();
    const publicClient = getRuntimePublicClient();
    const balance = await getBalanceWithRetry(publicClient, account.address);
    const balanceApeExact = formatEther(balance);
    const balanceApeDisplay = Number.parseFloat(balanceApeExact);

    return {
      address: account.address,
      balance: Number.isFinite(balanceApeDisplay) ? balanceApeDisplay.toFixed(4) : balanceApeExact,
      balance_ape: balanceApeExact,
      balance_wei: balance.toString(),
    };
  }

  function createNestedBotCall(command, tokens, mode) {
    nestedBotCallSequence += 1;
    const call = {
      call_id: randomUUID(),
      sequence: nestedBotCallSequence,
      mode,
      parent_run_id: metadata.runId,
      root_run_id: metadata.rootRunId,
      child_bot: command,
      args: tokens,
      started_at_utc: new Date().toISOString(),
      status: 'running',
    };
    nestedBotCalls.push(call);
    return call;
  }

  function getNestedBotCallEnv(call) {
    return createNestedBotEnv({
      rootRunId: metadata.rootRunId,
      parentRunId: metadata.runId,
      parentCallId: call.call_id,
      parentBot: bot.command,
      callDepth: metadata.callDepth + 1,
    });
  }

  function shouldForceChildPlayChime() {
    if (process.env[SUPPRESS_CHIME_ENV_VAR] === '1') return false;
    return metadata.callDepth === 0 || process.env[FORCE_CHIME_ENV_VAR] === '1';
  }

  function finalizeNestedBotCall(call, status, { payload = null, error = null } = {}) {
    call.status = status;
    call.ended_at_utc = new Date().toISOString();
    if (payload) {
      addIfPresent(call, 'child_run_id', getSummaryRunId(payload));
      addIfPresent(call, 'child_status', getSummaryStatus(payload));
    }
    if (error) {
      call.error = serializeNestedBotCallError(error);
      if (error.payload) {
        addIfPresent(call, 'child_run_id', getSummaryRunId(error.payload));
        addIfPresent(call, 'child_status', getSummaryStatus(error.payload));
      }
    }
  }

  async function recordBalanceSnapshot(details = {}) {
    const balance = await readRuntimeBalanceJson();
    const balanceWei = normalizeWeiField(balance.balance_wei) ?? tryParseApeToWei(balance.balance_ape);
    const totalPayoutWei = normalizeWeiField(details.totalPayoutWei);
    const totalWagerWei = normalizeWeiField(details.totalWagerWei);
    const totalPnlWei = normalizeWeiField(details.totalPnlWei);
    const sequence = balanceSnapshots.length + 1;
    const snapshot = {
      sequence,
      timestamp_utc: new Date().toISOString(),
      run_id: metadata.runId,
      label: details.label || null,
      command_kind: details.commandKind || details.command_kind || null,
      command: details.command || null,
      address: balance.address,
      balance_ape: balance.balance_ape,
      balance_display_ape: balance.balance,
      balance_wei: balance.balance_wei,
    };

    addIfPresent(snapshot, 'game', details.game);
    addIfPresent(snapshot, 'child_bot', details.childBot || details.child_bot);
    addIfPresent(snapshot, 'game_n', details.gameNumber ?? details.game_n);
    addIfPresent(snapshot, 'run_n', details.runNumber ?? details.run_n);

    if (totalPayoutWei !== null) {
      snapshot.total_payout_ape = botSession.formatWeiAsApe(totalPayoutWei);
    }
    if (totalWagerWei !== null) {
      snapshot.total_wager_ape = botSession.formatWeiAsApe(totalWagerWei);
    }
    if (totalPnlWei !== null) {
      snapshot.total_pnl_ape = botSession.formatWeiAsApe(totalPnlWei);
    }

    if (balanceWei !== null) {
      if (balanceStartWei === null) {
        balanceStartWei = balanceWei;
      }
      if (balanceBaselineWei === null) {
        balanceBaselineWei = totalPnlWei === null ? balanceWei : balanceWei - totalPnlWei;
      }

      snapshot.balance_delta_from_start_ape = botSession.formatWeiAsApe(balanceWei - balanceStartWei);

      if (totalPnlWei !== null) {
        const expectedBalanceWei = balanceBaselineWei + totalPnlWei;
        snapshot.expected_balance_ape = botSession.formatWeiAsApe(expectedBalanceWei);
        snapshot.untracked_balance_delta_ape = botSession.formatWeiAsApe(balanceWei - expectedBalanceWei);
      }
    }

    balanceSnapshots.push(snapshot);
    return {
      ...balance,
      snapshot,
    };
  }

  const runtimeContext = {
    args: runtimeArgs,
    binaryName: BINARY_NAME,
    bot: {
      name: bot.name,
      command: bot.command,
      description: bot.description,
      directory: bot.directory,
      manifestPath: bot.manifestPath,
      entryPath: bot.entryPath,
      logDir: botLogDir,
    },
    paths: {
      configDir: APECHURCH_DIR,
      botsDir: BOTS_DIR,
      logDir: LOG_DIR,
    },
    session: botSession,
    async play(args, options = {}) {
      const tokens = normalizePlayArgs(args);
      const env = createNestedPlayEnv({
        forceChime: shouldForceChildPlayChime(),
        ...options,
      });
      return runChildProcess(process.execPath, [cliPath, 'play', ...tokens], env);
    },
    async botRun(name, args = [], options = {}) {
      const command = normalizeBotCommandToken(name);
      if (!command) {
        throw new Error('ctx.botRun(...) requires a bot name.');
      }
      const tokens = Array.isArray(args) ? args.map((arg) => String(arg)) : [];
      const call = createNestedBotCall(command, tokens, 'plain');
      const env = createNestedPlayEnv({
        forceChime: shouldForceChildPlayChime(),
        ...options,
        env: {
          ...(options.env || {}),
          ...getNestedBotCallEnv(call),
        },
      });
      try {
        const code = await runChildProcess(process.execPath, [cliPath, 'bot', command, ...tokens], env);
        finalizeNestedBotCall(call, code === 0 ? 'ok' : 'error');
        return code;
      } catch (error) {
        finalizeNestedBotCall(call, 'error', { error });
        throw error;
      }
    },
    async botJson(name, args = [], options = {}) {
      const command = normalizeBotCommandToken(name);
      if (!command) {
        throw new Error('ctx.botJson(...) requires a bot name.');
      }
      const tokens = Array.isArray(args) ? args.map((arg) => String(arg)) : [];
      const call = createNestedBotCall(command, [...tokens, '--json'], 'json');
      try {
        const payload = await runBotJson(cliPath, command, tokens, {
          forceChime: shouldForceChildPlayChime(),
          ...options,
          env: {
            ...(options.env || {}),
            ...getNestedBotCallEnv(call),
          },
          streamPlainOutput: plainOutputEnabled,
        });
        finalizeNestedBotCall(call, 'ok', { payload });
        return payload;
      } catch (error) {
        finalizeNestedBotCall(call, 'error', { error });
        throw error;
      }
    },
    async validateBotArgs(name, args = [], options = {}) {
      const command = normalizeBotCommandToken(name);
      if (!command) {
        throw new Error('ctx.validateBotArgs(...) requires a bot name.');
      }
      const tokens = Array.isArray(args) ? args.map((arg) => String(arg)) : [];
      return runCliJson(cliPath, 'bot', [command, ...tokens, '--validate-only'], options);
    },
    async validatePlayArgs(args, options = {}) {
      const tokens = normalizePlayArgs(args);
      return runCliJson(cliPath, 'play', [...tokens, '--validate-only'], options);
    },
    async playJson(args, options = {}) {
      const tokens = normalizeJsonPlayArgs(args);
      const env = createNestedPlayEnv({
        forceChime: shouldForceChildPlayChime(),
        ...options,
      });
      const result = await runChildProcessCapture(process.execPath, [cliPath, 'play', ...tokens], env);
      const payload = tryParseJsonPayload(result.stdout);

      if (result.code !== 0) {
        const error = new Error(formatPlayJsonErrorMessage(result));
        error.code = result.code;
        error.stdout = result.stdout;
        error.stderr = result.stderr;
        error.payload = payload || tryParseJsonPayload(result.stderr);
        throw error;
      }

      if (!payload) {
        const error = new Error('play --json did not return valid JSON.');
        error.code = result.code;
        error.stdout = result.stdout;
        error.stderr = result.stderr;
        throw error;
      }
      if (getPayloadErrorMessage(payload)) {
        throwJsonPayloadError('play', payload, result);
      }

      return payload;
    },
    async statusJson(options = {}) {
      return runCliJson(cliPath, 'status', [], options);
    },
    async balanceJson() {
      return readRuntimeBalanceJson();
    },
    async captureBalanceSnapshot(details = {}) {
      return recordBalanceSnapshot(details);
    },
    updateRunSummary(summary = {}) {
      if (typeof runLogger?.writeProgress !== 'function') {
        return null;
      }
      return runLogger.writeProgress(summary, { ctx: runtimeContext });
    },
    resetRunSummaryLog(summary = {}) {
      if (typeof runLogger?.rotateSummary !== 'function') {
        return null;
      }
      const result = runLogger.rotateSummary(summary, { ctx: runtimeContext });
      if (result?.metadata) {
        metadata = result.metadata;
        balanceStartWei = null;
        balanceBaselineWei = null;
        nestedBotCallSequence = 0;
        balanceSnapshots.length = 0;
        nestedBotCalls.length = 0;
      }
      return result;
    },
    getRuntimeSummaryMetadata() {
      return {
        balanceSnapshots: [...balanceSnapshots],
        nestedBotCalls: nestedBotCalls.map((call) => ({ ...call })),
      };
    },
  };

  return runtimeContext;
}

function normalizeBotRuntimeResult(result) {
  if (result && typeof result === 'object' && !Array.isArray(result) && Number.isInteger(result.exitCode)) {
    return {
      exitCode: result.exitCode,
      summary: result.summary ?? null,
    };
  }

  return {
    exitCode: Number.isInteger(result) ? result : 0,
    summary: null,
  };
}

function formatUtcTimestamp(date = new Date()) {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function resolveBotSummaryLogDir(botCommand) {
  return path.join(LOG_DIR, normalizeBotCommandToken(botCommand));
}

function allocateBotSummaryLogPath(botCommand, date = new Date()) {
  const botLogDir = resolveBotSummaryLogDir(botCommand);
  fs.mkdirSync(botLogDir, { recursive: true });
  const timestamp = formatUtcTimestamp(date);
  const basePath = path.join(botLogDir, `${botCommand}.${timestamp}.json`);
  let filePath = basePath;
  let suffix = 1;

  while (fs.existsSync(filePath)) {
    filePath = path.join(botLogDir, `${botCommand}.${timestamp}.${suffix}.json`);
    suffix += 1;
  }

  return filePath;
}

function writeBotSummaryLogFile(filePath, summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return null;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
  return filePath;
}

function writeBotSummaryLogFileSafely(filePath, summary) {
  try {
    return writeBotSummaryLogFile(filePath, summary);
  } catch {
    return null;
  }
}

function serializeBotRunError(error) {
  const serialized = {
    message: String(error?.message || error || 'Unknown bot error.'),
  };

  if (error?.name) {
    serialized.name = String(error.name);
  }
  if (error?.code !== undefined) {
    serialized.code = String(error.code);
  }

  return serialized;
}

function getSignalExitCode(signal) {
  if (signal === 'SIGINT') return 130;
  if (signal === 'SIGTERM') return 143;
  return 1;
}

function enrichBotRunSummary(summary, bot, metadata, ctx = null, options = {}) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return summary;
  }

  const runtime = typeof ctx?.getRuntimeSummaryMetadata === 'function'
    ? ctx.getRuntimeSummaryMetadata()
    : {};
  const enriched = {
    ...summary,
    bot: summary.bot || bot.command,
    bot_name: summary.bot_name || bot.name,
    ...buildBotRunSummaryFields(metadata, options),
  };

  if (Array.isArray(runtime.balanceSnapshots) && runtime.balanceSnapshots.length > 0) {
    enriched.balance_snapshots = Array.isArray(summary.balance_snapshots)
      ? [...summary.balance_snapshots, ...runtime.balanceSnapshots]
      : runtime.balanceSnapshots;
  }

  if (Array.isArray(runtime.nestedBotCalls) && runtime.nestedBotCalls.length > 0) {
    enriched.nested_bot_calls = Array.isArray(summary.nested_bot_calls)
      ? [...summary.nested_bot_calls, ...runtime.nestedBotCalls]
      : runtime.nestedBotCalls;
  }

  return enriched;
}

function createBotRunLogFinalizer(bot, metadata) {
  const signalHandlers = [];
  let currentMetadata = metadata;
  let filePath = allocateBotSummaryLogPath(bot.command, new Date(currentMetadata.startedAt));
  let lastRawSummary = null;
  let lastWrittenSummary = null;
  let runtimeContext = null;
  let wroteTerminalLog = false;

  function setRuntimeContext(ctx) {
    runtimeContext = ctx || null;
  }

  function normalizeRawSummary(summary) {
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
      return null;
    }
    return { ...summary };
  }

  function buildWritableSummary(summary, { ctx = runtimeContext, terminal = false } = {}) {
    const rawSummary = normalizeRawSummary(summary) || { status: 'running' };
    const now = new Date().toISOString();
    const enriched = enrichBotRunSummary(rawSummary, bot, currentMetadata, ctx, {
      endedAt: now,
      includeEndedAt: terminal,
    });

    if (!terminal) {
      delete enriched.ended_at_utc;
      enriched.updated_at_utc = now;
    }

    return enriched;
  }

  function writeRawSummary(summary, { ctx = runtimeContext, safe = false, terminal = false } = {}) {
    if (wroteTerminalLog && !terminal) {
      return lastWrittenSummary;
    }

    const rawSummary = normalizeRawSummary(summary);
    if (!rawSummary) return null;

    lastRawSummary = rawSummary;
    const writableSummary = buildWritableSummary(rawSummary, { ctx, terminal });
    if (safe) {
      writeBotSummaryLogFileSafely(filePath, writableSummary);
    } else {
      writeBotSummaryLogFile(filePath, writableSummary);
    }

    lastWrittenSummary = writableSummary;
    if (terminal) {
      wroteTerminalLog = true;
    }
    return writableSummary;
  }

  function writeProgress(summary, { ctx = runtimeContext, safe = true } = {}) {
    return writeRawSummary({
      status: 'running',
      ...(normalizeRawSummary(summary) || {}),
    }, { ctx, safe, terminal: false });
  }

  function writeSummary(summary, { ctx = runtimeContext, safe = false } = {}) {
    return writeRawSummary(summary, { ctx, safe, terminal: true });
  }

  function rotateSummary(summary, { ctx = runtimeContext, safe = false } = {}) {
    const writtenSummary = writeSummary(summary, { ctx, safe });
    currentMetadata = createBotRunMetadata(bot, { rawArgs: currentMetadata.rawArgs });
    filePath = allocateBotSummaryLogPath(bot.command, new Date(currentMetadata.startedAt));
    lastRawSummary = null;
    lastWrittenSummary = null;
    wroteTerminalLog = false;
    return {
      previousSummary: writtenSummary,
      metadata: currentMetadata,
      filePath,
    };
  }

  function buildFailureSummary(status, { error = null, signal = null } = {}) {
    const summary = {
      ...(normalizeRawSummary(lastRawSummary) || {}),
      bot: bot.command,
      bot_name: bot.name,
      status,
    };

    if (signal) {
      summary.signal = signal;
    }
    if (error) {
      summary.error = serializeBotRunError(error);
    }

    return summary;
  }

  function writeFailure(status, details = {}) {
    return writeSummary(buildFailureSummary(status, details), {
      ctx: details.ctx || runtimeContext,
      safe: true,
    });
  }

  function cleanupSignalHandlers() {
    for (const [signal, handler] of signalHandlers) {
      process.removeListener(signal, handler);
    }
    signalHandlers.length = 0;
  }

  function installSignalHandlers() {
    for (const signal of BOT_TERMINATION_SIGNALS) {
      const handler = () => {
        writeFailure('interrupted', { signal });
        cleanupSignalHandlers();
        process.exit(getSignalExitCode(signal));
      };
      process.once(signal, handler);
      signalHandlers.push([signal, handler]);
    }
  }

  return {
    cleanupSignalHandlers,
    installSignalHandlers,
    rotateSummary,
    setRuntimeContext,
    writeFailure,
    writeProgress,
    writeSummary,
  };
}

function isHelpBotInvocation(rawArgs = []) {
  const tokens = Array.isArray(rawArgs) ? rawArgs.map((arg) => String(arg)) : [];
  return tokens.includes('--help') || tokens.includes('-h');
}

function isBotUsageError(error) {
  return error?.botUsageError === true || error?.code === 'BOT_USAGE_ERROR';
}

export async function runBot(bot, runtimeOptions = {}) {
  const runMetadata = createBotRunMetadata(bot, runtimeOptions);
  const logFinalizer = createBotRunLogFinalizer(bot, runMetadata);
  logFinalizer.installSignalHandlers();
  let ctx = null;

  try {
    const handler = await importBotHandler(bot.entryPath);
    ctx = createBotRuntimeContext(bot, {
      ...runtimeOptions,
      runMetadata,
      runLogger: logFinalizer,
    });
    logFinalizer.setRuntimeContext(ctx);
    const result = normalizeBotRuntimeResult(await handler(ctx));

    if (result.summary) {
      const summary = logFinalizer.writeSummary(result.summary, { ctx });
      if (runtimeOptions.rawArgs?.includes('--json')) {
        process.stdout.write(`${JSON.stringify(summary)}\n`);
      }
    } else if (!isHelpBotInvocation(runtimeOptions.rawArgs)) {
      logFinalizer.writeSummary({
        status: result.exitCode === 0 ? 'completed' : 'failed',
      }, { ctx, safe: true });
    }

    return result.exitCode;
  } catch (error) {
    if (!isBotUsageError(error) && !isHelpBotInvocation(runtimeOptions.rawArgs)) {
      logFinalizer.writeFailure('error', { error, ctx });
    }
    throw error;
  } finally {
    logFinalizer.cleanupSignalHandlers();
  }
}
