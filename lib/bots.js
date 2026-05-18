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
import { formatEther } from 'viem';

import {
  APECHURCH_DIR,
  BOT_PLAIN_OUTPUT_ENV_VAR,
  BOTS_DIR,
  BINARY_NAME,
  FORCE_CHIME_ENV_VAR,
  LOG_DIR,
  SUPPRESS_VERSION_BANNER_ENV_VAR,
} from './constants.js';
import {
  createClients,
  getBalanceWithRetry,
  getWallet,
} from './wallet.js';
import * as botSession from './bots/session.js';

const BOT_MANIFEST_FILE = 'bot.json';
const DEFAULT_BOT_ENTRY = './index.js';
const BOT_COMMAND_TOKEN_RE = /^[a-z0-9][a-z0-9-]*$/;
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const BOT_TERMINATION_SIGNALS = ['SIGINT', 'SIGTERM'];

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

async function importBotHandler(entryPath) {
  const mod = await import(pathToFileURL(entryPath).href);
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
          colorOutput: process.stderr.isTTY,
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
        forwardNestedBotStderrLine(forwardedStderrRemainder, { colorOutput: process.stderr.isTTY });
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
  const normalized = stripAnsi(line).replace(/\r$/, '');
  if (!normalized.trim() || normalized.startsWith('#')) {
    return;
  }

  const output = `${line}${newline ? '\n' : ''}`;
  process.stderr.write(botSession.colorNestedBotOutput(output, colorOutput));
}

function forwardTerminalBells(chunk, env = {}) {
  if (env[FORCE_CHIME_ENV_VAR] !== '1') return;

  const bellCount = (String(chunk).match(/\x07/g) || []).length;
  if (bellCount > 0) {
    process.stderr.write('\x07'.repeat(bellCount));
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

  return {
    ...process.env,
    ...extraEnv,
    [FORCE_CHIME_ENV_VAR]: options.forceChime === false ? process.env[FORCE_CHIME_ENV_VAR] : '1',
    [SUPPRESS_VERSION_BANNER_ENV_VAR]: '1',
    [BOT_PLAIN_OUTPUT_ENV_VAR]: options.streamPlainOutput ? '1' : (extraEnv[BOT_PLAIN_OUTPUT_ENV_VAR] || ''),
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

  return payload;
}

export function createBotRuntimeContext(bot, { cliPath, rawArgs = [] } = {}) {
  if (!cliPath) {
    throw new Error('createBotRuntimeContext requires cliPath.');
  }

  let runtimeAccount = null;
  let runtimePublicClient = null;
  const runtimeArgs = rawArgs.map((arg) => String(arg));
  const plainOutputEnabled = botSession.shouldPrintPlainOutput({
    json: runtimeArgs.includes('--json'),
  });
  fs.mkdirSync(LOG_DIR, { recursive: true });

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

  return {
    args: runtimeArgs,
    binaryName: BINARY_NAME,
    bot: {
      name: bot.name,
      command: bot.command,
      description: bot.description,
      directory: bot.directory,
      manifestPath: bot.manifestPath,
      entryPath: bot.entryPath,
      logDir: LOG_DIR,
    },
    paths: {
      configDir: APECHURCH_DIR,
      botsDir: BOTS_DIR,
      logDir: LOG_DIR,
    },
    session: botSession,
    async play(args, options = {}) {
      const tokens = normalizePlayArgs(args);
      const env = createNestedPlayEnv(options);
      return runChildProcess(process.execPath, [cliPath, 'play', ...tokens], env);
    },
    async botRun(name, args = [], options = {}) {
      const command = normalizeBotCommandToken(name);
      if (!command) {
        throw new Error('ctx.botRun(...) requires a bot name.');
      }
      const tokens = Array.isArray(args) ? args.map((arg) => String(arg)) : [];
      const env = createNestedPlayEnv(options);
      return runChildProcess(process.execPath, [cliPath, 'bot', command, ...tokens], env);
    },
    async botJson(name, args = [], options = {}) {
      return runBotJson(cliPath, name, args, {
        ...options,
        streamPlainOutput: plainOutputEnabled,
      });
    },
    async playJson(args, options = {}) {
      const tokens = normalizeJsonPlayArgs(args);
      const env = createNestedPlayEnv(options);
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

      return payload;
    },
    async statusJson(options = {}) {
      return runCliJson(cliPath, 'status', [], options);
    },
    async balanceJson() {
      const account = getRuntimeAccount();
      const publicClient = getRuntimePublicClient();
      const balance = await getBalanceWithRetry(publicClient, account.address);
      const balanceApe = Number.parseFloat(formatEther(balance));

      return {
        address: account.address,
        balance: balanceApe.toFixed(4),
      };
    },
  };
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

function writeBotSummaryLog(botCommand, summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return null;
  }

  fs.mkdirSync(LOG_DIR, { recursive: true });
  const timestamp = formatUtcTimestamp();
  const basePath = path.join(LOG_DIR, `${botCommand}.${timestamp}.log`);
  let filePath = basePath;
  let suffix = 1;

  while (fs.existsSync(filePath)) {
    filePath = path.join(LOG_DIR, `${botCommand}.${timestamp}.${suffix}.log`);
    suffix += 1;
  }

  fs.writeFileSync(filePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return filePath;
}

function writeBotSummaryLogSafely(botCommand, summary) {
  try {
    return writeBotSummaryLog(botCommand, summary);
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

function createBotRunLogFinalizer(bot, runtimeOptions = {}) {
  const startedAt = new Date().toISOString();
  const rawArgs = Array.isArray(runtimeOptions.rawArgs)
    ? runtimeOptions.rawArgs.map((arg) => String(arg))
    : [];
  const signalHandlers = [];
  let wroteLog = false;

  function writeSummary(summary, { safe = false } = {}) {
    if (wroteLog) return null;

    const filePath = safe
      ? writeBotSummaryLogSafely(bot.command, summary)
      : writeBotSummaryLog(bot.command, summary);
    if (filePath) {
      wroteLog = true;
    }
    return filePath;
  }

  function buildFailureSummary(status, { error = null, signal = null } = {}) {
    const summary = {
      bot: bot.command,
      bot_name: bot.name,
      status,
      args: rawArgs,
      started_at_utc: startedAt,
      ended_at_utc: new Date().toISOString(),
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
    return writeSummary(buildFailureSummary(status, details), { safe: true });
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
    writeFailure,
    writeSummary,
  };
}

export async function runBot(bot, runtimeOptions = {}) {
  const logFinalizer = createBotRunLogFinalizer(bot, runtimeOptions);
  logFinalizer.installSignalHandlers();

  try {
    const handler = await importBotHandler(bot.entryPath);
    const ctx = createBotRuntimeContext(bot, runtimeOptions);
    const result = normalizeBotRuntimeResult(await handler(ctx));

    if (result.summary) {
      logFinalizer.writeSummary(result.summary);
      if (runtimeOptions.rawArgs?.includes('--json')) {
        process.stdout.write(`${JSON.stringify(result.summary)}\n`);
      }
    }

    return result.exitCode;
  } catch (error) {
    logFinalizer.writeFailure('error', { error });
    throw error;
  } finally {
    logFinalizer.cleanupSignalHandlers();
  }
}
