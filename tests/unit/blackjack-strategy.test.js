import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getOptimalAction } from '../../lib/stateful/blackjack/strategy.js';

function cards(values) {
  return values.map((value) => ({ value }));
}

describe('Blackjack Basic Strategy', () => {
  it('uses dealer-hits-soft-17 soft double decisions', () => {
    assert.equal(getOptimalAction(cards([11, 6]), 2).action, 'double');
    assert.equal(getOptimalAction(cards([11, 8]), 6).action, 'double');
  });

  it('falls back from unavailable doubles without hitting made soft hands', () => {
    const action = getOptimalAction(cards([11, 8]), 6, { canDouble: false });

    assert.equal(action.action, 'stand');
  });

  it('uses dealer-hits-soft-17 surrender decisions', () => {
    assert.equal(getOptimalAction(cards([10, 5]), 11).action, 'surrender');
    assert.equal(getOptimalAction(cards([10, 7]), 11).action, 'surrender');
  });

  it('falls back from unavailable hard 17 surrender by standing', () => {
    const action = getOptimalAction(cards([10, 7]), 11, { canSurrender: false });

    assert.equal(action.action, 'stand');
  });
});
