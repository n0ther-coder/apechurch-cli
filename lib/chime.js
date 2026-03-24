/**
 * Terminal win chimes using the BEL control character.
 *
 * The sequence is intentionally fire-and-forget:
 * - no audio files or external sounds
 * - no awaiting on the gameplay path
 * - queued timers are unref'd so they never hold the process open
 */

const SLOT_BELL = '\x07';
const SLOT_CADENCE_MS = [90, 115, 130, 110];
const SLOT_SEQUENCE_GAP_MS = 220;

let nextBellAtMs = 0;

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
 * Deterministic slot-like cadence for a series of beeps.
 */
export function getWinChimeIntervals(beepCount) {
  const count = Number.isFinite(beepCount) ? Math.max(0, Math.ceil(beepCount)) : 0;
  const intervals = [];

  for (let i = 0; i < count; i++) {
    intervals.push(SLOT_CADENCE_MS[i % SLOT_CADENCE_MS.length]);
  }

  return intervals;
}

export function canEmitWinChime({ isJson = false, stream = process.stderr } = {}) {
  return !isJson && Boolean(stream?.isTTY && typeof stream.write === 'function');
}

function emitBell(stream) {
  try {
    stream.write(SLOT_BELL);
  } catch {
    // Ignore terminal write errors: the chime must never impact gameplay.
  }
}

/**
 * Queue a non-blocking terminal bell sequence.
 */
export function queueWinChime(beepCount, { isJson = false, stream = process.stderr } = {}) {
  if (!canEmitWinChime({ isJson, stream })) {
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

export function queueWinChimeFromWei({ payoutWei, wagerWei, isJson = false, stream = process.stderr } = {}) {
  const roundedMultiplier = getRoundedWinMultiplier(payoutWei, wagerWei);
  return queueWinChime(roundedMultiplier, { isJson, stream });
}
