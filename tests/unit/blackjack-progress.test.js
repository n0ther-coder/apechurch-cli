import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  advanceBlackjackProgress,
  formatBlackjackProgressLabel,
} from '../../lib/stateful/blackjack/progress.js';

describe('Blackjack Progress', () => {
  it('numbers hit suffixes starting from the first hit', () => {
    let hitCounts = [0, 0];

    let progress = advanceBlackjackProgress({ action: 'hit', label: 'Hit' }, hitCounts, 0);
    hitCounts = progress.hitCounts;
    assert.strictEqual(progress.stepLabel, 'Hit 1');
    assert.strictEqual(formatBlackjackProgressLabel('Game #1 /50', progress.stepLabel), 'Game #1 /50  Hit 1');

    progress = advanceBlackjackProgress({ action: 'hit', label: 'Hit' }, hitCounts, 0);
    hitCounts = progress.hitCounts;
    assert.strictEqual(progress.stepLabel, 'Hit 2');
    assert.strictEqual(formatBlackjackProgressLabel('Game #1 /50', progress.stepLabel), 'Game #1 /50  Hit 2');

    progress = advanceBlackjackProgress({ action: 'stand', label: 'Stand' }, hitCounts, 0);
    assert.strictEqual(progress.stepLabel, 'Stand');
    assert.strictEqual(formatBlackjackProgressLabel('Game #1 /50', progress.stepLabel), 'Game #1 /50  Stand');
  });

  it('tracks hit counters independently per split hand', () => {
    let hitCounts = [0, 0];

    let progress = advanceBlackjackProgress({ action: 'hit', label: 'Hit' }, hitCounts, 0);
    hitCounts = progress.hitCounts;
    progress = advanceBlackjackProgress({ action: 'hit', label: 'Hit' }, hitCounts, 0);
    hitCounts = progress.hitCounts;

    const splitHandProgress = advanceBlackjackProgress({ action: 'hit', label: 'Hit' }, hitCounts, 1);
    assert.deepStrictEqual(splitHandProgress.hitCounts, [2, 1]);
    assert.strictEqual(splitHandProgress.stepLabel, 'Hit 1');
  });

  it('suppresses step labels when there is no base game label', () => {
    assert.strictEqual(formatBlackjackProgressLabel(null, 'Stand'), null);
  });
});
