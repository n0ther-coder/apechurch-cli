/**
 * @fileoverview External bot loader for private gameplay automation.
 *
 * Bots are discovered from a filesystem directory and exposed only through
 * the `apechurch-cli bot <name> ...` surface. Each bot has a manifest and
 * an entry module. The entry module receives a narrow context whose main
 * capability is `play()`, which re-invokes the public CLI `play` command.
 *
 * @module lib/bots
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { spawn } from 'child_process';

import {
  APECHURCH_DIR,
  BOTS_DIR_BASENAME,
  BINARY_NAME,
  PLUGINS_DIR_ENV_VAR,
  SUPPRESS_VERSION_BANNER_ENV_VAR,
} from './constants.js';

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
  if (!fs.existsSync(botsDir)) {
    return { botsDir, bots: [], errors: [] };
  }

  const entries = fs.readdirSync(botsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const bots = [];
  const errors = [];
  const seenCommands = new Set();

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

function normalizePlayArgs(args) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error('ctx.play(...) expects a non-empty array of CLI tokens.');
  }

  return args.map((arg) => String(arg));
}

export function createBotRuntimeContext(bot, { cliPath, rawArgs = [] } = {}) {
  if (!cliPath) {
    throw new Error('createBotRuntimeContext requires cliPath.');
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
    async play(args, options = {}) {
      const tokens = normalizePlayArgs(args);
      const extraEnv = options && typeof options === 'object' && options.env && typeof options.env === 'object'
        ? options.env
        : {};
      const env = {
        ...process.env,
        ...extraEnv,
        [SUPPRESS_VERSION_BANNER_ENV_VAR]: '1',
      };

      return runChildProcess(process.execPath, [cliPath, 'play', ...tokens], env);
    },
  };
}

export async function runBot(bot, runtimeOptions = {}) {
  const handler = await importBotHandler(bot.entryPath);
  const ctx = createBotRuntimeContext(bot, runtimeOptions);
  const result = await handler(ctx);
  return Number.isInteger(result) ? result : 0;
}
