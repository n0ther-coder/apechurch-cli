import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { APECHURCH_DIR, apechain } from './constants.js';

export const GAS_CACHE_FILE = path.join(APECHURCH_DIR, 'cache', 'play-gas.json');
export const GAS_SAMPLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MODES = 128;
const MAX_SAMPLES = 32;
const MIN_SAMPLES = 5;
const memory = new Map();
const modeFields = ['mode', 'difficulty', 'gridMode', 'range', 'cover', 'split',
  'survive', 'compounding', 'picks', 'bonus', 'numWinIntervals', 'numBets',
  'betType', 'isBanker', 'multiplierBasisPoints'];

export function gasModeKey({ chainId = apechain.id, contract, config = {} }) {
  if (!/^0x[0-9a-f]{40}$/i.test(String(contract))) throw new Error('Invalid gas estimate contract.');
  const mode = Object.fromEntries(modeFields.filter(key => config[key] != null)
    .map(key => [key, String(config[key])]));
  const digest = createHash('sha256').update(JSON.stringify(mode)).digest('hex');
  return `${chainId}:${contract.toLowerCase()}:${digest}`;
}

function loadCache(file) {
  try {
    const stat = fs.statSync(file);
    if (stat.size > 2_000_000) return {};
    const signature = `${stat.ino}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
    const cached = memory.get(file);
    if (cached?.signature === signature) return cached.modes;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const modes = data?.version === 1 && data.modes && !Array.isArray(data.modes) ? data.modes : {};
    memory.set(file, { signature, modes });
    return modes;
  } catch { return {}; }
}

function validSamples(value, now) {
  if (!Array.isArray(value)) return [];
  return value.filter(sample => /^0x[0-9a-f]{64}$/i.test(sample?.tx)
    && /^[1-9][0-9]{0,19}$/.test(sample?.gas)
    && Number.isSafeInteger(sample?.at) && sample.at <= now
    && now - sample.at <= GAS_SAMPLE_TTL_MS).slice(-MAX_SAMPLES);
}

// Cache writes are best effort and never alter transaction accounting. The lock
// prevents concurrent bot subprocesses from overwriting each other's samples.
export function observeGasReceipt({ chainId, contract, config, hash, receipt,
  cacheFile = GAS_CACHE_FILE, now = Date.now() }) {
  if (!(receipt?.status === 'success' || receipt?.status === 1)
    || !/^0x[0-9a-f]{64}$/i.test(String(hash))) return false;
  let lock;
  let lockIdentity;
  let temporary;
  try {
    const gas = BigInt(receipt.gasUsed);
    if (gas <= 0n || gas > 10n ** 19n) return false;
    const key = gasModeKey({ chainId, contract, config });
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true, mode: 0o700 });
    const lockPath = `${cacheFile}.lock`;
    try {
      if (now - fs.statSync(lockPath).mtimeMs > 30_000) fs.unlinkSync(lockPath);
    } catch { /* No existing lock. */ }
    lock = fs.openSync(lockPath, 'wx', 0o600);
    lockIdentity = fs.fstatSync(lock);
    const modes = Object.fromEntries(Object.entries(loadCache(cacheFile))
      .map(([mode, samples]) => [mode, validSamples(samples, now)])
      .filter(([, samples]) => samples.length));
    const samples = modes[key] ?? [];
    const tx = hash.toLowerCase();
    if (samples.some(sample => sample.tx === tx)) return false;
    modes[key] = [...samples, { tx, gas: gas.toString(), at: now }].slice(-MAX_SAMPLES);
    const recent = Object.entries(modes).sort((a, b) => b[1].at(-1).at - a[1].at(-1).at)
      .slice(0, MAX_MODES);
    temporary = `${cacheFile}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, modes: Object.fromEntries(recent) }), { mode: 0o600 });
    fs.renameSync(temporary, cacheFile);
    memory.delete(cacheFile);
    return true;
  } catch { return false; }
  finally {
    if (temporary) try { fs.unlinkSync(temporary); } catch { /* Already renamed. */ }
    if (lock !== undefined) {
      try {
        const current = fs.statSync(`${cacheFile}.lock`);
        if (current.ino === lockIdentity.ino && current.dev === lockIdentity.dev) fs.unlinkSync(`${cacheFile}.lock`);
      } catch { /* Best effort. */ }
      try { fs.closeSync(lock); } catch { /* Best effort. */ }
    }
  }
}

export function estimateGasUnits({ chainId, contract, config, rpcGas = null,
  gasUnits = null, cacheFile = GAS_CACHE_FILE, now = Date.now() }) {
  const samples = validSamples(loadCache(cacheFile)[gasModeKey({ chainId, contract, config })], now);
  const sorted = samples.map(sample => BigInt(sample.gas)).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const historical = sorted.length >= MIN_SAMPLES
    ? sorted.at(-1) : null;
  const rpc = rpcGas == null ? null : BigInt(rpcGas);
  if (rpc !== null && rpc <= 0n) throw new Error('RPC gas estimate must be positive.');
  const explicit = gasUnits == null ? null : BigInt(gasUnits);
  if (explicit !== null && explicit <= 0n) throw new Error('gasUnits must be positive.');
  // An isolated expensive receipt raises the reserve immediately; a lower
  // baseline requires enough recent successful samples of the same mode.
  let baseline = rpc ?? (historical === null ? 400000n : historical);
  let source = rpc !== null ? 'rpc' : historical !== null ? 'receipts' : 'fallback';
  for (const value of sorted) if (value > baseline) { baseline = value; source = 'receipts'; }
  const buffered = (baseline * 115n + 99n) / 100n;
  return {
    gasUnits: explicit !== null && explicit > buffered ? explicit : buffered,
    source: explicit !== null && explicit > buffered ? 'manual_floor' : source,
  };
}
