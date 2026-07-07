/**
 * @fileoverview JSON command scripts and watcher.
 *
 * Command scripts live under APECHURCH_CLI_SCR_DIR and store argv-like command
 * definitions that can be rendered back to shell text or watched/relaunched.
 *
 * @module lib/scripts
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { formatEther, parseEther } from 'viem';

import {
  APECHURCH_DIR,
  BINARY_NAME,
  SCR_DIR,
} from './constants.js';
import {
  createClients,
  getBalanceWithRetry,
  getWalletPublicMetadata,
  walletExists,
} from './wallet.js';

const WATCH_STATE_DIR = path.join(APECHURCH_DIR, 'watch');
const WATCH_STATE_VERSION = 1;
const DEFAULT_EVERY_SECONDS = 60;
const SCRIPT_FILE_EXTENSION = '.json';
const ASSIGNMENT_TOKEN_RE = /^([^=\s]+)=(.*)$/s;
const ASSIGNMENT_START_RE = /^[A-Za-z_][A-Za-z0-9_-]*=/;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeErrorMessage(error) {
  return String(error?.message || error || 'Unknown error.');
}

function isPathInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function safeStateSlug(scriptName, scriptPath) {
  const hash = crypto
    .createHash('sha256')
    .update(`${scriptName}\0${scriptPath}`)
    .digest('hex')
    .slice(0, 16);
  const safeName = scriptName.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 64) || 'script';
  return `${safeName}-${hash}`;
}

function parseNonNegativeApeToWei(value, optionName) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new Error(`${optionName} requires an APE amount.`);
  }
  if (text.startsWith('-')) {
    throw new Error(`${optionName} must be a non-negative APE amount.`);
  }
  try {
    return parseEther(text);
  } catch {
    throw new Error(`Invalid ${optionName} value: "${value}".`);
  }
}

function parseEverySeconds(value = DEFAULT_EVERY_SECONDS) {
  const text = String(value ?? '').trim();
  const parsed = Number.parseInt(text, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== text || parsed <= 0) {
    throw new Error('--every must be a positive integer number of seconds.');
  }
  return parsed;
}

export function parseWatchOptions(options = {}) {
  const everySeconds = parseEverySeconds(options.every ?? DEFAULT_EVERY_SECONDS);
  const ifBalanceOverWei = options.ifBalanceOver === undefined
    ? null
    : parseNonNegativeApeToWei(options.ifBalanceOver, '--if-balance-over');
  const ifBalanceUnderWei = options.ifBalanceUnder === undefined
    ? null
    : parseNonNegativeApeToWei(options.ifBalanceUnder, '--if-balance-under');

  if (
    ifBalanceOverWei !== null
    && ifBalanceUnderWei !== null
    && ifBalanceOverWei >= ifBalanceUnderWei
  ) {
    throw new Error('--if-balance-over must be lower than --if-balance-under when both are set.');
  }

  return {
    everySeconds,
    ifBalanceOverWei,
    ifBalanceUnderWei,
  };
}

export function parseWatchArgv(args = []) {
  const tokens = args.map((arg) => String(arg));
  const options = {};

  for (let index = 0; index < tokens.length;) {
    const token = tokens[index];
    const readValue = (optionName) => {
      if (token.startsWith(`${optionName}=`)) {
        return {
          value: token.slice(optionName.length + 1),
          consumed: 1,
        };
      }
      const value = tokens[index + 1];
      if (value === undefined) {
        throw new Error(`${optionName} requires a value.`);
      }
      return {
        value,
        consumed: 2,
      };
    };

    if (token === '--every' || token.startsWith('--every=')) {
      const parsed = readValue('--every');
      options.every = parsed.value;
      index += parsed.consumed;
      continue;
    }

    if (token === '--if-balance-over' || token.startsWith('--if-balance-over=')) {
      const parsed = readValue('--if-balance-over');
      options.ifBalanceOver = parsed.value;
      index += parsed.consumed;
      continue;
    }

    if (token === '--if-balance-under' || token.startsWith('--if-balance-under=')) {
      const parsed = readValue('--if-balance-under');
      options.ifBalanceUnder = parsed.value;
      index += parsed.consumed;
      continue;
    }

    throw new Error(`Unknown script watch option: ${token}`);
  }

  return parseWatchOptions(options);
}

export function validateScriptName(scriptName) {
  const name = String(scriptName || '').trim();
  if (!name) {
    throw new Error('Missing script name.');
  }
  if (name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new Error('Invalid script name: use a file name from the script directory, without path separators.');
  }
  return name.toLowerCase().endsWith(SCRIPT_FILE_EXTENSION)
    ? name
    : `${name}${SCRIPT_FILE_EXTENSION}`;
}

export function resolveScriptFile(scriptName, scriptDir = SCR_DIR) {
  const name = validateScriptName(scriptName);
  const root = path.resolve(scriptDir);
  const scriptPath = path.resolve(root, name);

  if (!isPathInside(root, scriptPath)) {
    throw new Error('Invalid script path.');
  }

  return {
    name,
    scriptDir: root,
    scriptPath,
  };
}

export function getWatchStatePaths(scriptName, scriptPath) {
  const slug = safeStateSlug(scriptName, scriptPath);
  return {
    stateDir: WATCH_STATE_DIR,
    statePath: path.join(WATCH_STATE_DIR, `${slug}.json`),
    lockDir: path.join(WATCH_STATE_DIR, `${slug}.lock`),
  };
}

export function isPidAlive(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return false;
  try {
    process.kill(numericPid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function isProcessGroupAlive(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return false;
  try {
    process.kill(-numericPid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'EPERM') return true;
    if (error?.code === 'EINVAL') return isPidAlive(numericPid);
    return false;
  }
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function readWatchState(statePath) {
  const state = readJsonFile(statePath);
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  return state;
}

function writeWatchState(statePath, patch) {
  const previous = readWatchState(statePath) || {};
  const next = {
    ...previous,
    ...patch,
    version: WATCH_STATE_VERSION,
    updated_at_utc: nowIso(),
  };
  writeJsonFile(statePath, next);
  return next;
}

function getStateChildPid(state) {
  const pid = Number(state?.child_pid);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

export function getRunningScriptProcess(statePath) {
  const state = readWatchState(statePath);
  const processGroupPid = Number(state?.process_group_pid);
  if (Number.isInteger(processGroupPid) && processGroupPid > 0 && isProcessGroupAlive(processGroupPid)) {
    return {
      pid: processGroupPid,
      processGroupPid,
      state,
    };
  }
  const childPid = getStateChildPid(state);
  if (!childPid) return null;
  if (!isPidAlive(childPid)) return null;
  return {
    pid: childPid,
    state,
  };
}

function removeLockDir(lockDir) {
  fs.rmSync(lockDir, { recursive: true, force: true });
}

function acquireWatchLock(lockDir) {
  fs.mkdirSync(WATCH_STATE_DIR, { recursive: true });

  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      writeJsonFile(path.join(lockDir, 'watcher.json'), {
        version: WATCH_STATE_VERSION,
        watcher_pid: process.pid,
        started_at_utc: nowIso(),
      });
      return () => removeLockDir(lockDir);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const watcher = readJsonFile(path.join(lockDir, 'watcher.json'));
      const watcherPid = Number(watcher?.watcher_pid);
      if (Number.isInteger(watcherPid) && watcherPid > 0 && isPidAlive(watcherPid)) {
        throw new Error(`A watcher is already running for this script (pid ${watcherPid}).`);
      }
      removeLockDir(lockDir);
    }
  }
}

function splitStructuredArgValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return [''];

  const segments = [];
  let current = '';
  let quote = null;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '\'' || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (/\s/.test(char)) {
      let nextIndex = index;
      while (nextIndex < text.length && /\s/.test(text[nextIndex])) {
        nextIndex += 1;
      }
      const remainder = text.slice(nextIndex);
      if (current.trim() && ASSIGNMENT_START_RE.test(remainder)) {
        segments.push(current.trim());
        current = '';
        index = nextIndex - 1;
        continue;
      }
    }

    current += char;
  }

  if (current.trim() || segments.length === 0) {
    segments.push(current.trim());
  }

  return segments;
}

function normalizeWriteToken(token) {
  const text = String(token);
  const match = text.match(ASSIGNMENT_TOKEN_RE);
  if (!match) return text;

  const [, arg, value] = match;
  if (!/\s/.test(value)) return text;

  return {
    arg,
    value: splitStructuredArgValue(value),
  };
}

export function buildScriptPayloadFromArgs(args = []) {
  const command = args.map(normalizeWriteToken);
  if (command.length === 0) {
    throw new Error('script write requires command arguments after the script name.');
  }
  return { command };
}

function normalizeArgObject(entry, index) {
  const arg = String(entry?.arg ?? '').trim();
  if (!arg || /\s/.test(arg) || arg.includes('=')) {
    throw new Error(`Invalid command entry at index ${index}: object arg must be a non-empty token without spaces or "=".`);
  }

  const rawValue = entry.value;
  let valueParts;
  if (Array.isArray(rawValue)) {
    valueParts = rawValue.map((part) => String(part));
  } else if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
    valueParts = [String(rawValue)];
  } else {
    throw new Error(`Invalid command entry at index ${index}: object value must be a string or array of strings.`);
  }

  return `${arg}=${valueParts.join(' ').trim()}`;
}

export function normalizeScriptCommand(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid script JSON: expected an object.');
  }
  if (!Array.isArray(payload.command)) {
    throw new Error('Invalid script JSON: "command" must be an array.');
  }
  if (payload.command.length === 0) {
    throw new Error('Invalid script JSON: "command" must not be empty.');
  }

  return payload.command.map((entry, index) => {
    if (typeof entry === 'string') {
      return entry;
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return normalizeArgObject(entry, index);
    }
    throw new Error(`Invalid command entry at index ${index}: expected a string or { "arg", "value" } object.`);
  });
}

export function readCommandScript(scriptName, scriptDir = SCR_DIR) {
  const resolved = resolveScriptFile(scriptName, scriptDir);
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(resolved.scriptPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Script not found: ${resolved.scriptPath}`);
    }
    throw new Error(`Failed to parse script JSON: ${sanitizeErrorMessage(error)}`);
  }

  return {
    ...resolved,
    payload,
    command: normalizeScriptCommand(payload),
  };
}

export function writeCommandScript(scriptName, args = [], scriptDir = SCR_DIR) {
  const resolved = resolveScriptFile(scriptName, scriptDir);
  const payload = buildScriptPayloadFromArgs(args);
  writeJsonFile(resolved.scriptPath, payload);
  return {
    ...resolved,
    payload,
    command: normalizeScriptCommand(payload),
  };
}

function shellQuoteToken(token) {
  const text = String(token);
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(text)) return text;
  if (!text.includes("'")) {
    return `'${text}'`;
  }
  if (!/[`"$\\]/.test(text)) {
    return `"${text}"`;
  }
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

export function renderScriptCommand(command, { binaryName = BINARY_NAME } = {}) {
  const tokens = normalizeScriptCommand({ command });
  return [binaryName, ...tokens].map(shellQuoteToken).join(' ');
}

async function readBalanceWei() {
  if (!walletExists()) {
    throw new Error(`No wallet found. Run: ${BINARY_NAME} install`);
  }
  const metadata = getWalletPublicMetadata();
  if (!metadata?.address) {
    throw new Error('Selected wallet metadata is missing an address.');
  }
  const { publicClient } = createClients();
  const balance = await getBalanceWithRetry(publicClient, metadata.address);
  return {
    address: metadata.address,
    balanceWei: balance,
  };
}

export function getBalanceConditionResult(balanceWei, conditions) {
  if (conditions.ifBalanceOverWei !== null && !(balanceWei > conditions.ifBalanceOverWei)) {
    return {
      ok: false,
      reason: `balance is not over ${formatEther(conditions.ifBalanceOverWei)} APE`,
    };
  }
  if (conditions.ifBalanceUnderWei !== null && !(balanceWei < conditions.ifBalanceUnderWei)) {
    return {
      ok: false,
      reason: `balance is not under ${formatEther(conditions.ifBalanceUnderWei)} APE`,
    };
  }
  return {
    ok: true,
    reason: null,
  };
}

async function shouldLaunchForConditions(conditions) {
  if (conditions.ifBalanceOverWei === null && conditions.ifBalanceUnderWei === null) {
    return {
      ok: true,
      balance: null,
      reason: null,
    };
  }

  const balance = await readBalanceWei();
  const result = getBalanceConditionResult(balance.balanceWei, conditions);
  return {
    ...result,
    balance,
  };
}

function printWatchLine(message) {
  process.stderr.write(`${message}\n`);
}

function spawnScriptCommand(cliPath, command) {
  return spawn(process.execPath, [cliPath, ...command], {
    stdio: 'inherit',
    env: process.env,
    detached: true,
  });
}

async function waitForProcessGroupExit(processGroupPid) {
  while (isProcessGroupAlive(processGroupPid)) {
    await wait(1_000);
  }
}

function waitForChildExit(child, {
  onExit,
} = {}) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (typeof onExit === 'function') {
        onExit(code, signal);
      }
      resolve({ code, signal });
    });
  });
}

export async function watchCommandScript(scriptName, options = {}, {
  cliPath,
} = {}) {
  if (!cliPath) {
    throw new Error('script watch requires a CLI path.');
  }

  const script = readCommandScript(scriptName);
  const conditions = parseWatchOptions(options);
  const { statePath, lockDir } = getWatchStatePaths(script.name, script.scriptPath);
  const releaseLock = acquireWatchLock(lockDir);
  let activeChild = null;
  let stopping = false;

  function stop(signal) {
    stopping = true;
    if (activeChild && isPidAlive(activeChild.pid)) {
      try {
        process.kill(-activeChild.pid, signal);
      } catch {
        activeChild.kill(signal);
      }
    }
  }

  const sigintHandler = () => stop('SIGINT');
  const sigtermHandler = () => stop('SIGTERM');
  process.once('SIGINT', sigintHandler);
  process.once('SIGTERM', sigtermHandler);

  try {
    writeWatchState(statePath, {
      script: script.name,
      script_path: script.scriptPath,
      script_dir: script.scriptDir,
      command: script.command,
      watcher_pid: process.pid,
      watcher_started_at_utc: nowIso(),
      every_seconds: conditions.everySeconds,
    });

    printWatchLine(`Watching script: ${script.name}`);
    printWatchLine(`Script path: ${script.scriptPath}`);
    printWatchLine(`Command: ${renderScriptCommand(script.command)}`);
    printWatchLine(`Interval: ${conditions.everySeconds}s`);

    while (!stopping) {
      const running = getRunningScriptProcess(statePath);
      if (running) {
        printWatchLine(`Script already running as pid ${running.pid}; waiting.`);
        await wait(conditions.everySeconds * 1000);
        continue;
      }

      let conditionResult;
      try {
        conditionResult = await shouldLaunchForConditions(conditions);
      } catch (error) {
        printWatchLine(`Condition check failed: ${sanitizeErrorMessage(error)}`);
        await wait(conditions.everySeconds * 1000);
        continue;
      }

      if (!conditionResult.ok) {
        const balanceText = conditionResult.balance
          ? ` (balance ${formatEther(conditionResult.balance.balanceWei)} APE)`
          : '';
        printWatchLine(`Conditions not met: ${conditionResult.reason}${balanceText}`);
        await wait(conditions.everySeconds * 1000);
        continue;
      }

      const child = spawnScriptCommand(cliPath, script.command);
      activeChild = child;
      writeWatchState(statePath, {
        script: script.name,
        script_path: script.scriptPath,
        command: script.command,
        child_pid: child.pid,
        process_group_pid: child.pid,
        child_started_at_utc: nowIso(),
        child_exit_code: null,
        child_exit_signal: null,
        child_exited_at_utc: null,
      });
      printWatchLine(`Started ${script.name} as pid ${child.pid}.`);

      try {
        const exit = await waitForChildExit(child, {
          onExit: (code, signal) => {
            writeWatchState(statePath, {
              child_exit_code: Number.isInteger(code) ? code : null,
              child_exit_signal: signal || null,
              child_exited_at_utc: nowIso(),
            });
          },
        });
        if (isProcessGroupAlive(child.pid)) {
          printWatchLine(`Script process group ${child.pid} is still running; waiting.`);
          await waitForProcessGroupExit(child.pid);
        }
        writeWatchState(statePath, {
          child_pid: null,
          process_group_pid: null,
        });
        printWatchLine(`Script exited${Number.isInteger(exit.code) ? ` with code ${exit.code}` : ''}${exit.signal ? ` via ${exit.signal}` : ''}.`);
      } catch (error) {
        writeWatchState(statePath, {
          child_pid: null,
          process_group_pid: null,
          child_error: sanitizeErrorMessage(error),
          child_exited_at_utc: nowIso(),
        });
        printWatchLine(`Script failed to start: ${sanitizeErrorMessage(error)}`);
      } finally {
        activeChild = null;
      }

      if (!stopping) {
        await wait(conditions.everySeconds * 1000);
      }
    }
  } finally {
    process.removeListener('SIGINT', sigintHandler);
    process.removeListener('SIGTERM', sigtermHandler);
    writeWatchState(statePath, {
      watcher_pid: null,
      watcher_exited_at_utc: nowIso(),
    });
    releaseLock();
  }
}
