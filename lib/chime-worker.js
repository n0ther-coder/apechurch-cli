/**
 * Detached audio worker for win chimes.
 *
 * Synthesizes a short, slot-like ding sequence directly in memory through the
 * optional "speaker" dependency. The main process decides whether to fall back
 * to BEL, so this worker stays silent on failure.
 */
import { getWinChimeNotes } from './chime.js';

const SAMPLE_RATE = 24000;
const BIT_DEPTH = 16;
const CHANNELS = 1;
const MAX_SAMPLE = 0x7fff;
const BASE_GAIN = 0.35;
function clampSample(value) {
  return Math.max(-MAX_SAMPLE, Math.min(MAX_SAMPLE, Math.round(value)));
}

function renderPcmBuffer(beepCount) {
  const notes = getWinChimeNotes(beepCount);
  if (notes.length === 0) {
    return Buffer.alloc(0);
  }

  let totalSamples = 0;
  for (const note of notes) {
    totalSamples += Math.ceil((note.durationMs / 1000) * SAMPLE_RATE);
    totalSamples += Math.ceil((note.gapMs / 1000) * SAMPLE_RATE);
  }

  const pcm = Buffer.alloc(totalSamples * 2);
  let sampleIndex = 0;

  for (const note of notes) {
    const durationSamples = Math.ceil((note.durationMs / 1000) * SAMPLE_RATE);
    const gapSamples = Math.ceil((note.gapMs / 1000) * SAMPLE_RATE);
    const attackSamples = Math.max(1, Math.floor(SAMPLE_RATE * 0.004));

    for (let i = 0; i < durationSamples; i++) {
      const t = i / SAMPLE_RATE;
      const progress = i / durationSamples;
      const attack = Math.min(1, i / attackSamples);
      const decay = Math.exp(-4.5 * progress);
      const envelope = attack * decay;

      const fundamental = Math.sin(2 * Math.PI * note.frequency * t);
      const shimmer = 0.28 * Math.sin(2 * Math.PI * note.frequency * 2 * t + 0.35);
      const sparkle = 0.12 * Math.sin(2 * Math.PI * note.frequency * 3 * t + 0.9);
      const sample = (fundamental + shimmer + sparkle) * envelope * BASE_GAIN * MAX_SAMPLE;

      pcm.writeInt16LE(clampSample(sample), sampleIndex * 2);
      sampleIndex++;
    }

    sampleIndex += gapSamples;
  }

  return pcm;
}

async function playWithSpeaker(beepCount) {
  let Speaker;

  try {
    const module = await import('speaker');
    Speaker = module.default || module;
  } catch {
    return false;
  }

  if (!Speaker) {
    return false;
  }

  const buffer = renderPcmBuffer(beepCount);
  if (buffer.length === 0) {
    return true;
  }

  try {
    const speaker = new Speaker({
      channels: CHANNELS,
      bitDepth: BIT_DEPTH,
      sampleRate: SAMPLE_RATE,
      signed: true,
      float: false,
    });

    await new Promise((resolve, reject) => {
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        speaker.off('error', fail);
        speaker.off('close', finish);
        speaker.off('finish', finish);
      };

      speaker.once('error', fail);
      speaker.once('close', finish);
      speaker.once('finish', finish);
      speaker.end(buffer);
    });

    return true;
  } catch {
    return false;
  }
}

async function main() {
  const beepCount = Math.max(0, Math.ceil(Number.parseFloat(process.argv[2] || '0')));
  if (!beepCount) {
    return;
  }

  await playWithSpeaker(beepCount);
}

try {
  await main();
} finally {
  process.exit(0);
}
