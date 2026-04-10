import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveSlotsConfig } from '../../lib/games/slots.js';

describe('Slots config resolution', () => {
  const gameEntry = {
    config: {
      spins: {
        min: 1,
        max: 15,
        default: 10,
      },
    },
  };

  it('prefers explicit --spins over every fallback', () => {
    const config = resolveSlotsConfig({
      opts: { spins: '12' },
      positionalConfig: { spins: 9 },
      strategyConfig: { slots: { spins: [7, 12] } },
      randomIntInclusive: () => 8,
      gameEntry,
      preferGameDefault: true,
    });

    assert.deepStrictEqual(config, { spins: 12 });
  });

  it('prefers positional spins over the registry default', () => {
    const config = resolveSlotsConfig({
      opts: {},
      positionalConfig: { spins: 6 },
      strategyConfig: { slots: { spins: [7, 12] } },
      randomIntInclusive: () => 8,
      gameEntry,
      preferGameDefault: true,
    });

    assert.deepStrictEqual(config, { spins: 6 });
  });

  it('uses the game default for manual fixed-game play when requested', () => {
    const config = resolveSlotsConfig({
      opts: {},
      positionalConfig: {},
      strategyConfig: { slots: { spins: [7, 12] } },
      randomIntInclusive: () => 8,
      gameEntry,
      preferGameDefault: true,
    });

    assert.deepStrictEqual(config, { spins: 10 });
  });

  it('keeps strategy-driven randomness when the game default is not preferred', () => {
    const config = resolveSlotsConfig({
      opts: {},
      positionalConfig: {},
      strategyConfig: { slots: { spins: [7, 12] } },
      randomIntInclusive: () => 8,
      gameEntry,
      preferGameDefault: false,
    });

    assert.deepStrictEqual(config, { spins: 8 });
  });
});
