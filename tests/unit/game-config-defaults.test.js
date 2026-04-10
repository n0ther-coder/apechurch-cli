import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getApestrongConfig } from '../../lib/games/apestrong.js';
import { getBearDiceConfig } from '../../lib/games/beardice.js';
import { getBlocksConfig } from '../../lib/games/blocks.js';
import { getKenoConfig } from '../../lib/games/keno.js';
import { getMonkeyMatchConfig } from '../../lib/games/monkeymatch.js';
import { getPlinkoConfig } from '../../lib/games/plinko.js';
import { getPrimesConfig } from '../../lib/games/primes.js';
import { getSpeedKenoConfig } from '../../lib/games/speedkeno.js';

describe('Manual fixed-game defaults', () => {
  const randomIntInclusive = () => 99;

  it('uses the registry defaults for ApeStrong, Keno, and Speed Keno when requested', () => {
    const apeStrong = getApestrongConfig(
      {},
      {},
      { config: { range: { default: 50 } } },
      { apestrong: { range: [40, 60] } },
      randomIntInclusive,
      { preferGameDefault: true }
    );
    const keno = getKenoConfig(
      {},
      {},
      { config: { picks: { default: 5 } } },
      { keno: { picks: [3, 6] } },
      randomIntInclusive,
      { preferGameDefault: true }
    );
    const speedKeno = getSpeedKenoConfig(
      {},
      {},
      { config: { picks: { default: 3 }, games: { default: 5 } } },
      {},
      randomIntInclusive,
      { preferGameDefault: true }
    );

    assert.deepStrictEqual(apeStrong, { range: 50 });
    assert.deepStrictEqual(keno, { picks: 5 });
    assert.deepStrictEqual(speedKeno, { games: 5, picks: 3 });
  });

  it('uses the registry defaults for Plinko, Blocks, and Primes when requested', () => {
    const plinko = getPlinkoConfig(
      {},
      {},
      { config: { mode: { default: 2, min: 0, max: 4 }, balls: { default: 50, min: 1, max: 100 } } },
      { plinko: { mode: [1, 3], balls: [20, 80] } },
      randomIntInclusive,
      { preferGameDefault: true }
    );
    const blocks = getBlocksConfig(
      {},
      {},
      { config: { mode: { default: 0, min: 0, max: 1 }, runs: { default: 1, min: 1, max: 5 } } },
      { blocks: { mode: [0, 1], runs: [2, 4] } },
      randomIntInclusive,
      { preferGameDefault: true }
    );
    const primes = getPrimesConfig(
      {},
      {},
      { config: { difficulty: { default: 0 }, runs: { default: 10 } } },
      { primes: { difficulty: [1, 2], runs: [4, 12] } },
      randomIntInclusive,
      { preferGameDefault: true }
    );

    assert.deepStrictEqual(plinko, { mode: 2, balls: 50 });
    assert.deepStrictEqual(blocks, { mode: 0, runs: 1 });
    assert.deepStrictEqual(primes, { difficulty: 0, runs: 10 });
  });

  it('uses the registry defaults for Monkey Match and Bear-A-Dice when requested', () => {
    const monkey = getMonkeyMatchConfig(
      {},
      {},
      { config: { mode: { default: 1 } } },
      {},
      randomIntInclusive,
      { preferGameDefault: true }
    );
    const bear = getBearDiceConfig(
      {},
      {},
      { config: { difficulty: { default: 0 }, rolls: { default: 1 } } },
      {},
      randomIntInclusive,
      { preferGameDefault: true }
    );

    assert.deepStrictEqual(monkey, { mode: 1 });
    assert.deepStrictEqual(bear, { difficulty: 0, rolls: 1 });
  });

  it('keeps strategy-driven randomness when game-default preference is disabled', () => {
    const apeStrong = getApestrongConfig(
      {},
      {},
      { config: { range: { default: 50 } } },
      { apestrong: { range: [40, 60] } },
      () => 47,
      { preferGameDefault: false }
    );
    const monkey = getMonkeyMatchConfig(
      {},
      {},
      { config: { mode: { default: 1 } } },
      {},
      () => 47,
      { preferGameDefault: false }
    );

    assert.deepStrictEqual(apeStrong, { range: 47 });
    assert.ok(monkey.mode === 1 || monkey.mode === 2);
  });
});
