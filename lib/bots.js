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
  BOTS_DIR_BASENAME,
  BINARY_NAME,
  FORCE_CHIME_ENV_VAR,
  PLUGINS_DIR_ENV_VAR,
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
  const baseDir = process.env[PLUGINS_DIR_ENV_VAR] || APECHURCH_DIR;
  return path.join(baseDir, BOTS_DIR_BASENAME);
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

function runChildProcessCapture(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      forwardTerminalBells(chunk, env);
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Child process exited via signal ${signal}.`));
        return;
      }
      resolve({
        code: Number.isInteger(code) ? code : 1,
        stdout,
        stderr,
      });
    });
  });
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
  const result = await runChildProcessCapture(process.execPath, [cliPath, 'bot', command, ...tokens, '--json'], env);
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
    args: rawArgs.map((arg) => String(arg)),
    binaryName: BINARY_NAME,
    bot: {
      name: bot.name,
      command: bot.command,
      description: bot.description,
      directory: bot.directory,
      manifestPath: bot.manifestPath,
      entryPath: bot.entryPath,
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
      return runBotJson(cliPath, name, args, options);
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

export async function runBot(bot, runtimeOptions = {}) {
  const handler = await importBotHandler(bot.entryPath);
  const ctx = createBotRuntimeContext(bot, runtimeOptions);
  const result = await handler(ctx);
  return Number.isInteger(result) ? result : 0;
}
