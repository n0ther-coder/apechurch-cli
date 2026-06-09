/**
 * Compact fee analysis for Ape Church game contracts.
 *
 * This module keeps a per-game aggregate index under LOG_DIR/fees. It is
 * intentionally separate from per-wallet history: scans enumerate all players
 * for a game contract and persist aggregate stats, not raw event streams.
 */
import fs from 'fs';
import path from 'path';
import { formatEther } from 'viem';
import {
  apechain,
  GAME_CONTRACT_ABI,
  LOG_DIR,
} from './constants.js';
import { ensureDir, sanitizeError } from './utils.js';
import {
  GAME_REGISTRY,
  getGameDisplayName,
  listGames,
  resolveGame,
} from '../registry.js';

export const FEE_ANALYSIS_SCHEMA_VERSION = 4;
export const DEFAULT_FEE_ANALYSIS_CHUNK_SIZE = 50_000n;
export const DEFAULT_FEE_ANALYSIS_MAX_CHUNKS = 0;
export const DEFAULT_FEE_ANALYSIS_CAP_BYTES = 10 * 1024 * 1024;

const GAME_ENDED_EVENT = GAME_CONTRACT_ABI.find((item) => item.type === 'event' && item.name === 'GameEnded');
const GAME_STARTED_EVENT = {
  type: 'event',
  name: 'GameStarted',
  anonymous: false,
  inputs: [
    { name: 'user', type: 'address', indexed: true },
    { name: 'gameId', type: 'uint256', indexed: false },
  ],
};
const TX_METADATA_BATCH_SIZE = 10;
const GAME_STARTED_LOOKBACK_BLOCKS = 10_000n;

function normalizeAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function parseBigIntField(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.trim()) {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function addBigIntStrings(left, right) {
  return (parseBigIntField(left) + parseBigIntField(right)).toString();
}

function subtractBigIntStrings(left, right) {
  const next = parseBigIntField(left) - parseBigIntField(right);
  return (next > 0n ? next : 0n).toString();
}

function compareBigInts(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function minBigInt(left, right) {
  return left < right ? left : right;
}

function maxBigInt(left, right) {
  return left > right ? left : right;
}

function toDecimalString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return parseBigIntField(value).toString();
}

function emptyAggregate() {
  return {
    n: 0,
    w: 0,
    p: 0,
    l: 0,
    s: 0,
    bw: '0',
    po: '0',
    fw: '0',
    gw: '0',
    minf: null,
    maxf: null,
    minfb: null,
    maxfb: null,
    ming: null,
    maxg: null,
  };
}

function normalizeAggregate(aggregate) {
  return {
    ...emptyAggregate(),
    ...(aggregate && typeof aggregate === 'object' ? aggregate : {}),
    n: Number(aggregate?.n || 0),
    w: Number(aggregate?.w || 0),
    p: Number(aggregate?.p || 0),
    l: Number(aggregate?.l || 0),
    s: Number(aggregate?.s || 0),
    bw: toDecimalString(aggregate?.bw) ?? '0',
    po: toDecimalString(aggregate?.po) ?? '0',
    fw: toDecimalString(aggregate?.fw) ?? '0',
    gw: toDecimalString(aggregate?.gw) ?? '0',
    minf: toDecimalString(aggregate?.minf),
    maxf: toDecimalString(aggregate?.maxf),
    minfb: toDecimalString(aggregate?.minfb),
    maxfb: toDecimalString(aggregate?.maxfb),
    ming: toDecimalString(aggregate?.ming),
    maxg: toDecimalString(aggregate?.maxg),
  };
}

function cloneAggregate(aggregate) {
  return normalizeAggregate(aggregate);
}

function updateMinMax(aggregate, minKey, maxKey, value) {
  const numeric = parseBigIntField(value);
  const currentMin = aggregate[minKey] === null ? null : parseBigIntField(aggregate[minKey]);
  const currentMax = aggregate[maxKey] === null ? null : parseBigIntField(aggregate[maxKey]);

  if (currentMin === null || numeric < currentMin) {
    aggregate[minKey] = numeric.toString();
  }
  if (currentMax === null || numeric > currentMax) {
    aggregate[maxKey] = numeric.toString();
  }
}

function combineAggregates(left, right) {
  const output = cloneAggregate(left);
  const source = normalizeAggregate(right);

  output.n += source.n;
  output.w += source.w;
  output.p += source.p;
  output.l += source.l;
  output.s += source.s;
  output.bw = addBigIntStrings(output.bw, source.bw);
  output.po = addBigIntStrings(output.po, source.po);
  output.fw = addBigIntStrings(output.fw, source.fw);
  output.gw = addBigIntStrings(output.gw, source.gw);

  for (const [minKey, maxKey] of [
    ['minf', 'maxf'],
    ['minfb', 'maxfb'],
    ['ming', 'maxg'],
  ]) {
    if (source[minKey] !== null) {
      updateMinMax(output, minKey, maxKey, source[minKey]);
    }
    if (source[maxKey] !== null) {
      updateMinMax(output, minKey, maxKey, source[maxKey]);
    }
  }

  return output;
}

function subtractAggregates(left, right) {
  const source = normalizeAggregate(left);
  const removed = normalizeAggregate(right);
  const output = emptyAggregate();

  output.n = Math.max(0, source.n - removed.n);
  output.w = Math.max(0, source.w - removed.w);
  output.p = Math.max(0, source.p - removed.p);
  output.l = Math.max(0, source.l - removed.l);
  output.s = Math.max(0, source.s - removed.s);
  output.bw = subtractBigIntStrings(source.bw, removed.bw);
  output.po = subtractBigIntStrings(source.po, removed.po);
  output.fw = subtractBigIntStrings(source.fw, removed.fw);
  output.gw = subtractBigIntStrings(source.gw, removed.gw);
  return output;
}

function feeBps(feeWei, wagerWei) {
  if (wagerWei <= 0n) {
    return null;
  }
  return (feeWei * 10_000n) / wagerWei;
}

function applyRecordToAggregate(aggregate, record) {
  const wagerWei = parseBigIntField(record.wagerWei);
  const payoutWei = parseBigIntField(record.payoutWei);
  const feeWei = parseBigIntField(record.feeWei);
  const gasWei = parseBigIntField(record.gasWei);
  const observedFeeBps = feeBps(feeWei, wagerWei);

  aggregate.n += 1;
  if (payoutWei > wagerWei) {
    aggregate.w += 1;
  } else if (payoutWei === wagerWei && payoutWei > 0n) {
    aggregate.p += 1;
  } else {
    aggregate.l += 1;
  }

  if (record.sponsored) {
    aggregate.s += 1;
  }

  aggregate.bw = addBigIntStrings(aggregate.bw, wagerWei);
  aggregate.po = addBigIntStrings(aggregate.po, payoutWei);
  aggregate.fw = addBigIntStrings(aggregate.fw, feeWei);
  aggregate.gw = addBigIntStrings(aggregate.gw, gasWei);
  updateMinMax(aggregate, 'minf', 'maxf', feeWei);
  updateMinMax(aggregate, 'ming', 'maxg', gasWei);
  if (observedFeeBps !== null) {
    updateMinMax(aggregate, 'minfb', 'maxfb', observedFeeBps);
  }
}

function compactExtremeRecord(record, metricValue, feeBpsValue = null) {
  return {
    v: parseBigIntField(metricValue).toString(),
    fb: feeBpsValue === null ? null : parseBigIntField(feeBpsValue).toString(),
    b: String(record.blockNumber || ''),
    tx: String(record.txHash || ''),
    w: normalizeAddress(record.wallet),
    p: normalizeAddress(record.payer),
    id: String(record.gameId || ''),
    bw: parseBigIntField(record.wagerWei).toString(),
    po: parseBigIntField(record.payoutWei).toString(),
  };
}

function shouldReplaceExtreme(current, candidateValue, direction) {
  if (!current) {
    return true;
  }

  const currentValue = parseBigIntField(current.v);
  if (direction === 'min') {
    return candidateValue < currentValue;
  }
  return candidateValue > currentValue;
}

function updateExtremes(snapshot, record) {
  const feeWei = parseBigIntField(record.feeWei);
  const gasWei = parseBigIntField(record.gasWei);
  const observedFeeBps = feeBps(feeWei, parseBigIntField(record.wagerWei));
  snapshot.x ||= {};

  if (shouldReplaceExtreme(snapshot.x.minf, feeWei, 'min')) {
    snapshot.x.minf = compactExtremeRecord(record, feeWei, observedFeeBps);
  }
  if (shouldReplaceExtreme(snapshot.x.maxf, feeWei, 'max')) {
    snapshot.x.maxf = compactExtremeRecord(record, feeWei, observedFeeBps);
  }
  if (shouldReplaceExtreme(snapshot.x.ming, gasWei, 'min')) {
    snapshot.x.ming = compactExtremeRecord(record, gasWei, observedFeeBps);
  }
  if (shouldReplaceExtreme(snapshot.x.maxg, gasWei, 'max')) {
    snapshot.x.maxg = compactExtremeRecord(record, gasWei, observedFeeBps);
  }

  if (observedFeeBps !== null) {
    if (shouldReplaceExtreme(snapshot.x.minfb, observedFeeBps, 'min')) {
      snapshot.x.minfb = compactExtremeRecord(record, observedFeeBps, observedFeeBps);
    }
    if (shouldReplaceExtreme(snapshot.x.maxfb, observedFeeBps, 'max')) {
      snapshot.x.maxfb = compactExtremeRecord(record, observedFeeBps, observedFeeBps);
    }
  }
}

function safeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

export function getFeeAnalysisDir() {
  return path.join(LOG_DIR, 'fees');
}

export function getFeeSnapshotPath(gameKey) {
  return path.join(getFeeAnalysisDir(), `${safeSlug(gameKey)}.json`);
}

export function resolveFeeAnalysisGame(input) {
  const game = resolveGame(input);
  if (!game) {
    throw new Error(`Unknown fee-analysis game: ${input}. Available games: ${listGames().join(' | ')}`);
  }

  if (!GAME_REGISTRY.some((entry) => entry.key === game.key)) {
    throw new Error(`Fee analysis currently supports stateless GameEnded games only: ${input}`);
  }

  return game;
}

export function createEmptyFeeSnapshot(game, { capBytes = DEFAULT_FEE_ANALYSIS_CAP_BYTES } = {}) {
  return {
    v: FEE_ANALYSIS_SCHEMA_VERSION,
    ch: apechain.id,
    game: game.key,
    name: getGameDisplayName(game),
    contract: game.contract,
    cap: Number(capBytes),
    created: new Date().toISOString(),
    updated: null,
    lb: null,
    ob: null,
    floor: null,
    r: [],
    chunks: 0,
    logs: 0,
    missing: 0,
    g: emptyAggregate(),
    t: {},
    x: {},
  };
}

function normalizeRangeEntry(range) {
  if (!Array.isArray(range) || range.length !== 2) {
    return null;
  }

  try {
    const from = BigInt(range[0]);
    const to = BigInt(range[1]);
    if (from > to) {
      return null;
    }
    return [from, to];
  } catch {
    return null;
  }
}

export function mergeCoveredRanges(ranges = []) {
  const sorted = ranges
    .map(normalizeRangeEntry)
    .filter(Boolean)
    .sort((left, right) => compareBigInts(left[0], right[0]));
  const merged = [];

  for (const [from, to] of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || from > previous[1] + 1n) {
      merged.push([from, to]);
      continue;
    }
    previous[1] = maxBigInt(previous[1], to);
  }

  return merged;
}

function serializeRanges(ranges) {
  return mergeCoveredRanges(ranges).map(([from, to]) => [from.toString(), to.toString()]);
}

function updateSnapshotBounds(snapshot) {
  const ranges = mergeCoveredRanges(snapshot.r || []);
  snapshot.r = serializeRanges(ranges);

  if (ranges.length === 0) {
    snapshot.lb = null;
    snapshot.ob = null;
    return;
  }

  snapshot.ob = ranges.reduce((min, [from]) => minBigInt(min, from), ranges[0][0]).toString();
  snapshot.lb = ranges.reduce((max, [, to]) => maxBigInt(max, to), ranges[0][1]).toString();
}

export function addCoveredRange(snapshot, fromBlock, toBlock) {
  snapshot.r = serializeRanges([
    ...(snapshot.r || []),
    [BigInt(fromBlock), BigInt(toBlock)],
  ]);
  updateSnapshotBounds(snapshot);
}

export function subtractCoveredRanges(fromBlock, toBlock, coveredRanges = []) {
  let segments = [[BigInt(fromBlock), BigInt(toBlock)]];

  for (const [coveredFrom, coveredTo] of mergeCoveredRanges(coveredRanges)) {
    const next = [];
    for (const [from, to] of segments) {
      if (coveredTo < from || coveredFrom > to) {
        next.push([from, to]);
        continue;
      }
      if (coveredFrom > from) {
        next.push([from, coveredFrom - 1n]);
      }
      if (coveredTo < to) {
        next.push([coveredTo + 1n, to]);
      }
    }
    segments = next;
    if (segments.length === 0) {
      break;
    }
  }

  return segments;
}

function splitForwardRange(fromBlock, toBlock, chunkSize) {
  const chunks = [];
  for (let start = BigInt(fromBlock); start <= BigInt(toBlock); start += chunkSize) {
    const end = minBigInt(start + chunkSize - 1n, BigInt(toBlock));
    chunks.push({ fromBlock: start, toBlock: end });
  }
  return chunks;
}

function splitBackwardRange(fromBlock, toBlock, chunkSize) {
  const chunks = [];
  for (let end = BigInt(toBlock); end >= BigInt(fromBlock); end -= chunkSize) {
    const start = maxBigInt(BigInt(fromBlock), end - chunkSize + 1n);
    chunks.push({ fromBlock: start, toBlock: end });
    if (start === BigInt(fromBlock)) {
      break;
    }
  }
  return chunks;
}

async function hasContractCodeAtBlock(publicClient, address, blockNumber) {
  try {
    const code = await publicClient.getCode({
      address,
      blockNumber: BigInt(blockNumber),
    });
    return typeof code === 'string' && code !== '0x';
  } catch {
    return null;
  }
}

export async function discoverContractDeploymentBlock(publicClient, address, latestBlock) {
  if (!publicClient?.getCode) {
    return null;
  }

  const highBlock = BigInt(latestBlock);
  const hasLatestCode = await hasContractCodeAtBlock(publicClient, address, highBlock);
  if (hasLatestCode !== true) {
    return null;
  }

  const hasGenesisCode = await hasContractCodeAtBlock(publicClient, address, 0n);
  if (hasGenesisCode === true) {
    return 0n;
  }
  if (hasGenesisCode === null) {
    return null;
  }

  let low = 0n;
  let high = highBlock;
  while (low < high) {
    const mid = (low + high) / 2n;
    const hasCode = await hasContractCodeAtBlock(publicClient, address, mid);
    if (hasCode === null) {
      return null;
    }
    if (hasCode) {
      high = mid;
    } else {
      low = mid + 1n;
    }
  }

  return low;
}

async function resolveFeeScanFloorBlock(publicClient, game, snapshot, {
  latestBlock,
  floorBlock,
  fromBlock,
} = {}) {
  if (floorBlock !== undefined) {
    return BigInt(floorBlock);
  }
  if (fromBlock !== undefined) {
    return BigInt(fromBlock);
  }

  const savedFloor = snapshot?.floor !== null && snapshot?.floor !== undefined
    ? BigInt(snapshot.floor)
    : null;
  const deploymentBlock = await discoverContractDeploymentBlock(publicClient, game.contract, latestBlock);
  if (savedFloor !== null && savedFloor > 0n) {
    return deploymentBlock !== null && deploymentBlock < savedFloor ? deploymentBlock : savedFloor;
  }
  return deploymentBlock ?? savedFloor ?? 0n;
}

function pushUncoveredChunks(chunks, candidate, coveredRanges, chunkSize, direction, remaining) {
  if (remaining <= 0) {
    return 0;
  }

  const uncovered = subtractCoveredRanges(candidate.fromBlock, candidate.toBlock, coveredRanges);
  const ordered = direction === 'backward' ? uncovered.reverse() : uncovered;
  let added = 0;

  for (const [from, to] of ordered) {
    const pieces = direction === 'backward'
      ? splitBackwardRange(from, to, chunkSize)
      : splitForwardRange(from, to, chunkSize);

    for (const piece of pieces) {
      if (added >= remaining) {
        return added;
      }
      chunks.push(piece);
      added += 1;
    }
  }

  return added;
}

export function planFeeScanRanges(snapshot, {
  latestBlock,
  floorBlock = 0n,
  fromBlock,
  toBlock,
  chunkSize = DEFAULT_FEE_ANALYSIS_CHUNK_SIZE,
  maxChunks = DEFAULT_FEE_ANALYSIS_MAX_CHUNKS,
} = {}) {
  const coveredRanges = mergeCoveredRanges(snapshot?.r || []);
  const chunks = [];
  const maxChunkCount = Number(maxChunks);
  const unlimited = maxChunkCount === 0;
  const remaining = () => unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, maxChunkCount - chunks.length);
  const effectiveLatestBlock = BigInt(latestBlock);
  const effectiveFloorBlock = BigInt(floorBlock);

  if (fromBlock !== undefined) {
    const explicitFrom = BigInt(fromBlock);
    const explicitTo = toBlock !== undefined ? BigInt(toBlock) : effectiveLatestBlock;
    if (explicitTo < explicitFrom) {
      throw new Error('to-block must be greater than or equal to from-block.');
    }
    pushUncoveredChunks(
      chunks,
      { fromBlock: explicitFrom, toBlock: explicitTo },
      coveredRanges,
      BigInt(chunkSize),
      'forward',
      remaining()
    );
    return chunks;
  }

  const lastLatest = snapshot?.lb !== null && snapshot?.lb !== undefined
    ? BigInt(snapshot.lb)
    : null;
  const oldest = snapshot?.ob !== null && snapshot?.ob !== undefined
    ? BigInt(snapshot.ob)
    : null;

  if (lastLatest !== null && effectiveLatestBlock > lastLatest) {
    pushUncoveredChunks(
      chunks,
      { fromBlock: lastLatest + 1n, toBlock: effectiveLatestBlock },
      coveredRanges,
      BigInt(chunkSize),
      'forward',
      remaining()
    );
  }

  if (remaining() <= 0) {
    return chunks;
  }

  const backfillTo = oldest !== null ? oldest - 1n : effectiveLatestBlock;
  if (backfillTo >= effectiveFloorBlock) {
    pushUncoveredChunks(
      chunks,
      { fromBlock: effectiveFloorBlock, toBlock: backfillTo },
      coveredRanges,
      BigInt(chunkSize),
      'backward',
      remaining()
    );
  }

  return chunks;
}

export function normalizeFeeSnapshot(snapshot, game, { capBytes = DEFAULT_FEE_ANALYSIS_CAP_BYTES } = {}) {
  const base = createEmptyFeeSnapshot(game, { capBytes });
  const raw = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const normalized = {
    ...base,
    ...raw,
    v: FEE_ANALYSIS_SCHEMA_VERSION,
    ch: apechain.id,
    game: game.key,
    name: getGameDisplayName(game),
    contract: game.contract,
    cap: Number(raw.cap || capBytes),
    g: normalizeAggregate(raw.g),
    t: {},
    x: raw.x && typeof raw.x === 'object' ? raw.x : {},
  };

  for (const [wallet, target] of Object.entries(raw.t || {})) {
    const normalizedWallet = normalizeAddress(wallet);
    if (normalizedWallet) {
      normalized.t[normalizedWallet] = {
        a: normalizeAggregate(target?.a),
        r: serializeRanges(target?.r || []),
      };
    }
  }

  updateSnapshotBounds(normalized);
  return normalized;
}

export function loadFeeSnapshot(gameInput, { capBytes = DEFAULT_FEE_ANALYSIS_CAP_BYTES } = {}) {
  const game = resolveFeeAnalysisGame(gameInput);
  const filePath = getFeeSnapshotPath(game.key);

  if (!fs.existsSync(filePath)) {
    return {
      game,
      filePath,
      snapshot: createEmptyFeeSnapshot(game, { capBytes }),
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (raw?.v !== FEE_ANALYSIS_SCHEMA_VERSION) {
      return {
        game,
        filePath,
        snapshot: createEmptyFeeSnapshot(game, { capBytes }),
        staleSchemaVersion: raw?.v ?? null,
      };
    }
    return {
      game,
      filePath,
      snapshot: normalizeFeeSnapshot(raw, game, { capBytes }),
    };
  } catch {
    return {
      game,
      filePath,
      snapshot: createEmptyFeeSnapshot(game, { capBytes }),
    };
  }
}

function snapshotByteSize(snapshot) {
  return Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
}

function prepareSnapshotForSave(snapshot) {
  const output = {
    ...snapshot,
    t: {},
  };

  for (const [wallet, target] of Object.entries(snapshot.t || {})) {
    const normalizedWallet = normalizeAddress(wallet);
    if (!normalizedWallet) {
      continue;
    }
    output.t[normalizedWallet] = {
      a: normalizeAggregate(target?.a),
      r: serializeRanges(target?.r || []),
    };
  }

  delete output.c;
  delete output.w;
  delete output.ow;
  delete output.wt;
  return output;
}

export function saveFeeSnapshot(snapshot, { capBytes = snapshot?.cap || DEFAULT_FEE_ANALYSIS_CAP_BYTES } = {}) {
  ensureDir(getFeeAnalysisDir());
  const normalizedCap = Number(capBytes || DEFAULT_FEE_ANALYSIS_CAP_BYTES);
  const nextSnapshot = prepareSnapshotForSave({
    ...snapshot,
    cap: normalizedCap,
    updated: new Date().toISOString(),
  });
  const filePath = getFeeSnapshotPath(nextSnapshot.game);
  fs.writeFileSync(filePath, JSON.stringify(nextSnapshot));
  const size = fs.statSync(filePath).size;
  return {
    filePath,
    snapshot: nextSnapshot,
    size,
    prunedWallets: 0,
    overCap: size > normalizedCap,
  };
}

function ensureTargetSnapshot(snapshot, wallet) {
  const normalizedWallet = normalizeAddress(wallet);
  if (!normalizedWallet) {
    return null;
  }

  snapshot.t ||= {};
  snapshot.t[normalizedWallet] ||= {
    a: emptyAggregate(),
    r: [],
  };
  snapshot.t[normalizedWallet].a = normalizeAggregate(snapshot.t[normalizedWallet].a);
  return snapshot.t[normalizedWallet];
}

function addTargetCoveredRange(snapshot, wallet, fromBlock, toBlock) {
  const target = ensureTargetSnapshot(snapshot, wallet);
  if (!target) {
    return;
  }
  target.r = serializeRanges([
    ...(target.r || []),
    [BigInt(fromBlock), BigInt(toBlock)],
  ]);
}

export function applyFeeRecord(snapshot, record, { targetWallet = null, updateGlobal = true } = {}) {
  const wallet = normalizeAddress(record.wallet);
  const normalizedTargetWallet = normalizeAddress(targetWallet);

  if (updateGlobal) {
    snapshot.g = normalizeAggregate(snapshot.g);
    applyRecordToAggregate(snapshot.g, record);
    updateExtremes(snapshot, record);
    snapshot.logs = Number(snapshot.logs || 0) + 1;
  }

  if (normalizedTargetWallet && wallet === normalizedTargetWallet) {
    const target = ensureTargetSnapshot(snapshot, normalizedTargetWallet);
    applyRecordToAggregate(target.a, record);
  }
}

async function runInBatches(items, batchSize, mapper) {
  const results = [];
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    results.push(...await Promise.all(batch.map(mapper)));
  }
  return results;
}

async function fetchTransactionMetadata(publicClient, hashes) {
  const uniqueHashes = [...new Set(hashes.filter(Boolean).map((hash) => String(hash).toLowerCase()))];
  const results = await runInBatches(uniqueHashes, TX_METADATA_BATCH_SIZE, async (hash) => {
    try {
      const [tx, receipt] = await Promise.all([
        publicClient.getTransaction({ hash }),
        publicClient.getTransactionReceipt({ hash }),
      ]);
      return { hash, tx, receipt };
    } catch (error) {
      return { hash, tx: null, receipt: null, error: sanitizeError(error) };
    }
  });

  return new Map(results.map((result) => [result.hash, result]));
}

function gameIdKey(value) {
  return String(value ?? '').trim();
}

function mapGameStartsById(logs = []) {
  const mapped = new Map();
  for (const log of logs) {
    const gameId = gameIdKey(log.args?.gameId);
    if (gameId) {
      mapped.set(gameId, log);
    }
  }
  return mapped;
}

function subtractBlockWithFloor(blockNumber, delta) {
  const value = BigInt(blockNumber);
  const amount = BigInt(delta);
  return value > amount ? value - amount : 0n;
}

export function buildFeeRecordFromLog(log, txMeta, { observedWagerWei = null, paymentLog = null } = {}) {
  const tx = txMeta?.tx || null;
  const receipt = txMeta?.receipt || null;
  if (!tx || !receipt) {
    return null;
  }

  const wallet = normalizeAddress(log.args?.user);
  const payer = normalizeAddress(tx.from);
  const txValueWei = parseBigIntField(tx.value);
  const eventBuyInWei = parseBigIntField(log.args?.buyIn);
  const overrideWagerWei = parseBigIntField(observedWagerWei);
  const wagerWei = overrideWagerWei > 0n && overrideWagerWei <= txValueWei
    ? overrideWagerWei
    : eventBuyInWei;
  const payoutWei = parseBigIntField(log.args?.payout);
  const feeWei = txValueWei > wagerWei ? txValueWei - wagerWei : 0n;
  const gasPriceWei = parseBigIntField(receipt.effectiveGasPrice ?? tx.gasPrice);
  const gasWei = parseBigIntField(receipt.gasUsed) * gasPriceWei;

  return {
    wallet,
    payer,
    sponsored: Boolean(wallet && payer && wallet !== payer),
    gameId: String(log.args?.gameId ?? ''),
    blockNumber: paymentLog?.blockNumber?.toString() || log.blockNumber?.toString() || null,
    txHash: String(paymentLog?.transactionHash || log.transactionHash || ''),
    wagerWei,
    payoutWei,
    feeWei,
    gasWei,
  };
}

async function scanFeeChunk(publicClient, game, snapshot, {
  fromBlock,
  toBlock,
  targetWallet = null,
  targetOnly = false,
}) {
  const normalizedTargetWallet = normalizeAddress(targetWallet);
  const logs = await publicClient.getLogs({
    address: game.contract,
    event: GAME_ENDED_EVENT,
    ...(targetOnly && normalizedTargetWallet ? { args: { user: normalizedTargetWallet } } : {}),
    fromBlock,
    toBlock,
  });
  const usableLogs = logs.filter((log) => !log.removed);
  const startedLogs = await publicClient.getLogs({
    address: game.contract,
    event: GAME_STARTED_EVENT,
    ...(targetOnly && normalizedTargetWallet ? { args: { user: normalizedTargetWallet } } : {}),
    fromBlock: subtractBlockWithFloor(fromBlock, GAME_STARTED_LOOKBACK_BLOCKS),
    toBlock,
  });
  const startsByGameId = mapGameStartsById(startedLogs.filter((log) => !log.removed));
  const paymentLogs = usableLogs
    .map((log) => startsByGameId.get(gameIdKey(log.args?.gameId)))
    .filter(Boolean);
  const metadata = await fetchTransactionMetadata(
    publicClient,
    paymentLogs.map((log) => log.transactionHash)
  );
  let processed = 0;
  let missing = 0;

  for (const log of usableLogs) {
    const paymentLog = startsByGameId.get(gameIdKey(log.args?.gameId));
    const txMeta = metadata.get(String(paymentLog?.transactionHash || '').toLowerCase());
    const record = buildFeeRecordFromLog(log, txMeta, {
      paymentLog,
    });
    if (!record) {
      missing += 1;
      continue;
    }
    applyFeeRecord(snapshot, record, {
      targetWallet: normalizedTargetWallet,
      updateGlobal: !targetOnly,
    });
    processed += 1;
  }

  snapshot.missing = Number(snapshot.missing || 0) + missing;
  snapshot.chunks = Number(snapshot.chunks || 0) + 1;
  if (targetOnly) {
    addTargetCoveredRange(snapshot, normalizedTargetWallet, fromBlock, toBlock);
  } else {
    addCoveredRange(snapshot, fromBlock, toBlock);
    if (normalizedTargetWallet) {
      addTargetCoveredRange(snapshot, normalizedTargetWallet, fromBlock, toBlock);
    }
  }

  return {
    from_block: fromBlock.toString(),
    to_block: toBlock.toString(),
    logs: usableLogs.length,
    processed,
    target_only: Boolean(targetOnly),
    missing_transaction_metadata: missing,
  };
}

export function planTargetOnlyScanRanges(snapshot, wallet, {
  fromBlock,
  toBlock,
  chunkSize = DEFAULT_FEE_ANALYSIS_CHUNK_SIZE,
  maxChunks = DEFAULT_FEE_ANALYSIS_MAX_CHUNKS,
} = {}) {
  const normalizedWallet = normalizeAddress(wallet);
  if (!normalizedWallet) {
    return [];
  }

  const globalRanges = mergeCoveredRanges(snapshot.r || []);
  const targetRanges = mergeCoveredRanges(snapshot.t?.[normalizedWallet]?.r || []);
  const chunks = [];
  const maxChunkCount = Number(maxChunks);
  const unlimited = maxChunkCount === 0;
  const remaining = () => unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, maxChunkCount - chunks.length);
  const explicitFrom = fromBlock !== undefined ? BigInt(fromBlock) : null;
  const explicitTo = toBlock !== undefined ? BigInt(toBlock) : null;

  for (const [globalFrom, globalTo] of [...globalRanges].reverse()) {
    const candidateFrom = explicitFrom === null ? globalFrom : maxBigInt(globalFrom, explicitFrom);
    const candidateTo = explicitTo === null ? globalTo : minBigInt(globalTo, explicitTo);
    if (candidateTo < candidateFrom) {
      continue;
    }
    pushUncoveredChunks(
      chunks,
      { fromBlock: candidateFrom, toBlock: candidateTo },
      targetRanges,
      BigInt(chunkSize),
      'backward',
      remaining()
    );
    if (remaining() <= 0) {
      break;
    }
  }

  return chunks;
}

export async function scanGameFees(publicClient, gameInput, {
  fromBlock,
  toBlock,
  floorBlock,
  targetWallet = null,
  chunkSize = DEFAULT_FEE_ANALYSIS_CHUNK_SIZE,
  maxChunks = DEFAULT_FEE_ANALYSIS_MAX_CHUNKS,
  capBytes = DEFAULT_FEE_ANALYSIS_CAP_BYTES,
  onChunk = null,
} = {}) {
  const loaded = loadFeeSnapshot(gameInput, { capBytes });
  const { game, filePath } = loaded;
  let { snapshot } = loaded;
  const latestBlock = toBlock !== undefined ? BigInt(toBlock) : await publicClient.getBlockNumber();
  const effectiveFloorBlock = await resolveFeeScanFloorBlock(publicClient, game, snapshot, {
    latestBlock,
    floorBlock,
    fromBlock,
  });

  snapshot.floor = effectiveFloorBlock.toString();
  const chunks = planFeeScanRanges(snapshot, {
    latestBlock,
    floorBlock: effectiveFloorBlock,
    fromBlock,
    toBlock,
    chunkSize,
    maxChunks,
  });
  const remainingTargetChunks = Number(maxChunks) === 0
    ? 0
    : Math.max(0, Number(maxChunks) - chunks.length);
  const canScanTargetChunks = Boolean(targetWallet) && (Number(maxChunks) === 0 || remainingTargetChunks > 0);
  const targetChunks = canScanTargetChunks
    ? planTargetOnlyScanRanges(snapshot, targetWallet, {
        fromBlock,
        toBlock,
        chunkSize,
        maxChunks: Number(maxChunks) === 0 ? 0 : remainingTargetChunks,
      })
    : [];
  const chunkResults = [];
  const targetChunkResults = [];
  let saveResult = {
    filePath,
    snapshot,
    size: fs.existsSync(filePath) ? fs.statSync(filePath).size : snapshotByteSize(snapshot),
    prunedWallets: 0,
    overCap: false,
  };

  for (const chunk of chunks) {
    const result = await scanFeeChunk(publicClient, game, snapshot, {
      ...chunk,
      targetWallet,
    });
    saveResult = saveFeeSnapshot(snapshot, { capBytes });
    snapshot = saveResult.snapshot;
    chunkResults.push(result);

    if (typeof onChunk === 'function') {
      onChunk({
        ...result,
        game: game.key,
        file_path: saveResult.filePath,
        file_size_bytes: saveResult.size,
      });
    }
  }

  for (const chunk of targetChunks) {
    const result = await scanFeeChunk(publicClient, game, snapshot, {
      ...chunk,
      targetWallet,
      targetOnly: true,
    });
    saveResult = saveFeeSnapshot(snapshot, { capBytes });
    snapshot = saveResult.snapshot;
    targetChunkResults.push(result);

    if (typeof onChunk === 'function') {
      onChunk({
        ...result,
        game: game.key,
        file_path: saveResult.filePath,
        file_size_bytes: saveResult.size,
      });
    }
  }

  if (chunks.length === 0 && targetChunks.length === 0) {
    saveResult = saveFeeSnapshot(snapshot, { capBytes });
  }

  const normalizedTargetWallet = normalizeAddress(targetWallet);
  return {
    game: game.key,
    name: getGameDisplayName(game),
    contract: game.contract,
    stale_schema_version: loaded.staleSchemaVersion ?? null,
    target_wallet: normalizedTargetWallet || null,
    file_path: saveResult.filePath,
    file_size_bytes: saveResult.size,
    cap_bytes: Number(capBytes),
    over_cap: Boolean(saveResult.overCap),
    pruned_wallets: Number(saveResult.prunedWallets || 0),
    planned_chunks: chunks.length + targetChunks.length,
    scanned_chunks: chunkResults.length + targetChunkResults.length,
    global_scanned_chunks: chunkResults.length,
    target_scanned_chunks: targetChunkResults.length,
    chunks: chunkResults,
    target_chunks: targetChunkResults,
    floor_block: snapshot.floor,
    latest_block: latestBlock.toString(),
    oldest_scanned_block: snapshot.ob,
    latest_scanned_block: snapshot.lb,
    scanned_ranges: snapshot.r,
    target_scanned_ranges: normalizedTargetWallet ? (snapshot.t?.[normalizedTargetWallet]?.r || []) : [],
    games: Number(snapshot.g?.n || 0),
    missing_transaction_metadata: Number(snapshot.missing || 0),
    tracked_wallets: Object.keys(snapshot.t || {}).length,
  };
}

function toApe(value) {
  return formatEther(parseBigIntField(value));
}

function ratioBpsNumber(numeratorWei, denominatorWei, digits = 2) {
  const denominator = parseBigIntField(denominatorWei);
  if (denominator <= 0n) {
    return null;
  }
  const numerator = parseBigIntField(numeratorWei);
  const scale = 10n ** BigInt(digits);
  const scaled = (numerator * 10_000n * scale) / denominator;
  return Number(scaled) / Number(scale);
}

function percentNumber(numerator, denominator, digits = 2) {
  const denom = Number(denominator || 0);
  if (!Number.isFinite(denom) || denom <= 0) {
    return 0;
  }
  return Number(((Number(numerator || 0) / denom) * 100).toFixed(digits));
}

function expandAggregate(aggregate) {
  const normalized = normalizeAggregate(aggregate);
  return {
    games: normalized.n,
    wins: normalized.w,
    pushes: normalized.p,
    losses: normalized.l,
    sponsored_games: normalized.s,
    wager_wei: normalized.bw,
    wager_ape: toApe(normalized.bw),
    payout_wei: normalized.po,
    payout_ape: toApe(normalized.po),
    fee_wei: normalized.fw,
    fee_ape: toApe(normalized.fw),
    gas_wei: normalized.gw,
    gas_ape: toApe(normalized.gw),
    avg_fee_wei: normalized.n > 0 ? (parseBigIntField(normalized.fw) / BigInt(normalized.n)).toString() : '0',
    avg_fee_ape: normalized.n > 0 ? toApe(parseBigIntField(normalized.fw) / BigInt(normalized.n)) : '0',
    avg_fee_bps: ratioBpsNumber(normalized.fw, normalized.bw),
    avg_gas_wei: normalized.n > 0 ? (parseBigIntField(normalized.gw) / BigInt(normalized.n)).toString() : '0',
    avg_gas_ape: normalized.n > 0 ? toApe(parseBigIntField(normalized.gw) / BigInt(normalized.n)) : '0',
    min_fee_wei: normalized.minf,
    min_fee_ape: normalized.minf === null ? null : toApe(normalized.minf),
    max_fee_wei: normalized.maxf,
    max_fee_ape: normalized.maxf === null ? null : toApe(normalized.maxf),
    min_fee_bps: normalized.minfb === null ? null : Number(normalized.minfb),
    max_fee_bps: normalized.maxfb === null ? null : Number(normalized.maxfb),
    min_gas_wei: normalized.ming,
    min_gas_ape: normalized.ming === null ? null : toApe(normalized.ming),
    max_gas_wei: normalized.maxg,
    max_gas_ape: normalized.maxg === null ? null : toApe(normalized.maxg),
    win_rate: percentNumber(normalized.w, normalized.n),
    push_rate: percentNumber(normalized.p, normalized.n),
    loss_rate: percentNumber(normalized.l, normalized.n),
  };
}

function walletAverageFeeBps(aggregate) {
  return ratioBpsNumber(aggregate.fw, aggregate.bw);
}

function targetCoversGlobalRanges(snapshot, wallet) {
  const normalizedWallet = normalizeAddress(wallet);
  if (!normalizedWallet) {
    return false;
  }

  const targetRanges = snapshot.t?.[normalizedWallet]?.r || [];
  for (const [from, to] of mergeCoveredRanges(snapshot.r || [])) {
    if (subtractCoveredRanges(from, to, targetRanges).length > 0) {
      return false;
    }
  }
  return true;
}

function buildWalletLeaders(snapshot, { minGames = 1 } = {}) {
  const candidates = Object.entries(snapshot.t || {})
    .map(([wallet, target]) => [wallet, normalizeAggregate(target?.a)])
    .filter(([, aggregate]) => aggregate.n >= minGames && parseBigIntField(aggregate.bw) > 0n)
    .map(([wallet, aggregate]) => ({
      wallet,
      games: aggregate.n,
      wager_ape: toApe(aggregate.bw),
      fee_ape: toApe(aggregate.fw),
      avg_fee_bps: walletAverageFeeBps(aggregate),
      win_rate: percentNumber(aggregate.w, aggregate.n),
    }))
    .filter((entry) => entry.avg_fee_bps !== null);

  const byFeeAsc = [...candidates].sort((left, right) => left.avg_fee_bps - right.avg_fee_bps);
  const byWinRateDesc = [...candidates].sort((left, right) => {
    if (right.win_rate !== left.win_rate) return right.win_rate - left.win_rate;
    return right.games - left.games;
  });

  return {
    cheapest_avg_fee_wallet: byFeeAsc[0] || null,
    highest_avg_fee_wallet: byFeeAsc.length ? byFeeAsc[byFeeAsc.length - 1] : null,
    best_success_wallet: byWinRateDesc[0] || null,
    retained_wallets: candidates.length,
    scope: 'tracked_targets',
    min_games: minGames,
  };
}

function expandExtreme(extreme) {
  if (!extreme) {
    return null;
  }

  return {
    value: extreme.v,
    value_ape: toApe(extreme.v),
    fee_bps: extreme.fb === null || extreme.fb === undefined ? null : Number(extreme.fb),
    block_number: extreme.b,
    tx: extreme.tx,
    wallet: extreme.w,
    payer: extreme.p,
    game_id: extreme.id,
    wager_wei: extreme.bw,
    wager_ape: toApe(extreme.bw),
    payout_wei: extreme.po,
    payout_ape: toApe(extreme.po),
  };
}

export function buildFeeReport(gameInput, {
  wallet = null,
  minGames = 1,
  capBytes = DEFAULT_FEE_ANALYSIS_CAP_BYTES,
} = {}) {
  const { game, filePath, snapshot, staleSchemaVersion = null } = loadFeeSnapshot(gameInput, { capBytes });
  const normalizedWallet = wallet ? normalizeAddress(wallet) : null;
  const walletAggregate = normalizedWallet ? normalizeAggregate(snapshot.t?.[normalizedWallet]?.a) : emptyAggregate();
  const hasGlobalCoverage = mergeCoveredRanges(snapshot.r || []).length > 0;
  const walletExact = normalizedWallet
    ? !hasGlobalCoverage || (Boolean(snapshot.t?.[normalizedWallet]) && targetCoversGlobalRanges(snapshot, normalizedWallet))
    : true;
  const restAggregate = normalizedWallet
    ? subtractAggregates(snapshot.g, walletAggregate)
    : combineAggregates(snapshot.g, emptyAggregate());
  const fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;

  return {
    game: game.key,
    name: getGameDisplayName(game),
    contract: game.contract,
    stale_schema_version: staleSchemaVersion,
    file_path: filePath,
    file_size_bytes: fileSize,
    cap_bytes: Number(snapshot.cap || capBytes),
    tracked_wallets: Object.keys(snapshot.t || {}).length,
    wallet: normalizedWallet,
    wallet_exact: walletExact,
    scan: {
      latest_scanned_block: snapshot.lb,
      oldest_scanned_block: snapshot.ob,
      target_floor_block: snapshot.floor,
      scanned_ranges: snapshot.r,
      chunks: Number(snapshot.chunks || 0),
      observed_logs: Number(snapshot.logs || 0),
      missing_transaction_metadata: Number(snapshot.missing || 0),
      updated: snapshot.updated,
      target_scanned_ranges: normalizedWallet ? (snapshot.t?.[normalizedWallet]?.r || []) : [],
    },
    global: expandAggregate(snapshot.g),
    wallet_stats: expandAggregate(walletAggregate),
    rest_stats: expandAggregate(restAggregate),
    leaders: buildWalletLeaders(snapshot, { minGames }),
    extremes: {
      min_fee: expandExtreme(snapshot.x?.minf),
      max_fee: expandExtreme(snapshot.x?.maxf),
      min_fee_bps: expandExtreme(snapshot.x?.minfb),
      max_fee_bps: expandExtreme(snapshot.x?.maxfb),
      min_gas: expandExtreme(snapshot.x?.ming),
      max_gas: expandExtreme(snapshot.x?.maxg),
    },
  };
}
