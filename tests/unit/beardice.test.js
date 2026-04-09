/**
 * Unit Tests: lib/games/beardice.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatBearDiceSettledDetails, resolveBearDiceConfig } from '../../lib/games/beardice.js';

describe('Bear-A-Dice helpers', () => {
  it('keeps 5 rolls for Master difficulty when explicitly requested', () => {
    const config = resolveBearDiceConfig(
      {},
      { difficulty: '4', rolls: '5' },
      {},
      { bearDice: { rolls: [1, 2] } },
      () => 1
    );

    assert.deepStrictEqual(config, {
      difficulty: 4,
      rolls: 5,
    });
  });

  it('preserves preselected bear dice config values instead of overriding them', () => {
    const config = resolveBearDiceConfig(
      { difficulty: 4, rolls: 5 },
      {},
      {},
      { bearDice: { rolls: [1, 2] } },
      () => 1
    );

    assert.deepStrictEqual(config, {
      difficulty: 4,
      rolls: 5,
    });
  });

  it('treats trailing zero-filled dice slots as unplayed after an early loss', () => {
    const details = formatBearDiceSettledDetails({
      difficulty: 4,
      numRuns: 5,
      dice1Results: [6, 0, 0, 0, 0],
      dice2Results: [2, 0, 0, 0, 0],
    });

    assert.strictEqual(details.difficulty_name, 'Master');
    assert.strictEqual(details.rolls_executed, 1);
    assert.strictEqual(details.trailing_zero_slots, 4);
    assert.strictEqual(details.terminated_early, true);
    assert.strictEqual(details.completed_all_runs, false);
    assert.strictEqual(details.first_losing_roll_index, 1);
    assert.deepStrictEqual(details.rolls, [{
      index: 1,
      die_1: 6,
      die_2: 2,
      sum: 8,
      losing: true,
      safe: false,
    }]);
  });
});
