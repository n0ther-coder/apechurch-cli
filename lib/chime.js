/**
 * Cross-platform win chime orchestration.
 *
 * Primary path:
 * - fire-and-forget detached worker
 * - worker attempts PCM synthesis through optional "speaker" dependency
 * - falls back to terminal BEL if audio backend is unavailable
 *
 * Fallback path in this process:
 * - best-effort BEL sequence if worker spawn itself fails
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SLOT_BELL = '\x07';
const SLOT_CADENCE_MS = [90, 115, 130, 110, 140];
const SLOT_CHIME_FREQUENCIES = [1046.5, 1318.51, 1567.98, 1318.51, 1760];
const SLOT_SEQUENCE_GAP_MS = 220;
const CHIME_WORKER_PATH = fileURLToPath(new URL('./chime-worker.js', import.meta.url));
const require = createRequire(import.meta.url);

let nextBellAtMs = 0;
let speakerBackendAvailable;

/**
 * Round payout / wager up to the next integer multiplier.
 */
export function getRoundedWinMultiplier(payoutWei, wagerWei) {
  try {
    const payout = BigInt(payoutWei);
    const wager = BigInt(wagerWei);

    if (payout <= 0n || wager <= 0n) {
      return 0;
    }

    return Number((payout + wager - 1n) / wager);
  } catch {
    return 0;
  }
}

/**
 * Deterministic slot-like cadence for a series of dings.
 */
export function getWinChimeIntervals(beepCount) {
  const count = Number.isFinite(beepCount) ? Math.max(0, Math.ceil(beepCount)) : 0;
  const intervals = [];

  for (let i = 0; i < count; i++) {
    intervals.push(SLOT_CADENCE_MS[i % SLOT_CADENCE_MS.length]);
  }

  return intervals;
}

/**
 * Map each ding to a bright pitch and a short gap, so a backend can synthesize
 * something more slot-like than a plain BEL.
 */
export function getWinChimeNotes(beepCount) {
  return getWinChimeIntervals(beepCount).map((intervalMs, index) => {
    const gapMs = Math.max(18, Math.round(intervalMs * 0.22));
    return {
      frequency: SLOT_CHIME_FREQUENCIES[index % SLOT_CHIME_FREQUENCIES.length],
      durationMs: Math.max(55, intervalMs - gapMs),
      gapMs,
    };
  });
}

export function canEmitWinChime({ isJson = false } = {}) {
  return !isJson;
}

function hasSpeakerBackend() {
  if (speakerBackendAvailable !== undefined) {
    return speakerBackendAvailable;
  }

  try {
    require.resolve('speaker');
    speakerBackendAvailable = true;
  } catch {
    speakerBackendAvailable = false;
  }

  return speakerBackendAvailable;
}

function canEmitBellFallback(stream = process.stderr) {
  return Boolean(stream?.isTTY && typeof stream.write === 'function');
}

function emitBell(stream) {
  try {
    stream.write(SLOT_BELL);
  } catch {
    // Ignore terminal write errors: sound must never impact gameplay.
  }
}

function queueTerminalBellFallback(beepCount, stream = process.stderr) {
  if (!canEmitBellFallback(stream)) {
    return 0;
  }

  const intervals = getWinChimeIntervals(beepCount);
  if (intervals.length === 0) {
    return 0;
  }

  const now = Date.now();
  let scheduledAtMs = Math.max(now, nextBellAtMs);

  for (let i = 0; i < intervals.length; i++) {
    const delayMs = scheduledAtMs - now;

    if (delayMs <= 0) {
      emitBell(stream);
    } else {
      const timer = setTimeout(() => emitBell(stream), delayMs);
      timer.unref?.();
    }

    scheduledAtMs += intervals[i];
  }

  nextBellAtMs = scheduledAtMs + SLOT_SEQUENCE_GAP_MS;
  return intervals.length;
}

/**
 * Queue a non-blocking win chime.
 */
export function queueWinChime(beepCount, { isJson = false, stream = process.stderr } = {}) {
  if (!canEmitWinChime({ isJson })) {
    return 0;
  }

  const count = Number.isFinite(beepCount) ? Math.max(0, Math.ceil(beepCount)) : 0;
  if (count === 0) {
    return 0;
  }

  try {
    if (!hasSpeakerBackend()) {
      return queueTerminalBellFallback(count, stream);
    }

    const child = spawn(process.execPath, [CHIME_WORKER_PATH, String(count)], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    });
    child.unref();
    return count;
  } catch {
    return queueTerminalBellFallback(count, stream);
  }
}

export function queueWinChimeFromWei({ payoutWei, wagerWei, isJson = false, stream = process.stderr } = {}) {
  const roundedMultiplier = getRoundedWinMultiplier(payoutWei, wagerWei);
  return queueWinChime(roundedMultiplier, { isJson, stream });
}
