import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateBlackjackLoopRunoutMonteCarlo,
  sampleBlackjackPlayerSidePayoutApe,
  simulateBlackjackGameNetDeltaApe,
} from '../../lib/stateful/blackjack/monte-carlo.js';

describe('Blackjack Monte Carlo Estimate', () => {
  it('samples exclusive player-side payouts', () => {
    assert.equal(sampleBlackjackPlayerSidePayoutApe(1, () => 0), 500);
    assert.equal(sampleBlackjackPlayerSidePayoutApe(1, () => 0.01), 20);
    assert.equal(sampleBlackjackPlayerSidePayoutApe(1, () => 0.03), 5);
    assert.equal(sampleBlackjackPlayerSidePayoutApe(1, () => 0.5), 0);
  });

  it('simulates a deterministic player blackjack correctly', () => {
    const result = simulateBlackjackGameNetDeltaApe({
      mainBetApe: 25,
      vrfFeeApe: 0.4,
      availableApe: 100,
      rng: () => 0,
      deckValues: [11, 10, 9, 2, 3, 4, 5],
    });

    assert.equal(result.terminal, false);
    assert.equal(result.netDeltaApe, 37.1);
  });

  it('does not terminate the session when the hand ends in surrender', () => {
    const result = simulateBlackjackGameNetDeltaApe({
      mainBetApe: 10,
      vrfFeeApe: 0.4,
      availableApe: 100,
      rng: () => 0,
      deckValues: [10, 6, 10, 2, 3, 4, 5],
    });

    assert.equal(result.terminal, false);
    assert.equal(result.netDeltaApe, -5.4);
  });

  it('stops the session if a started hand cannot afford any further action', () => {
    const result = simulateBlackjackGameNetDeltaApe({
      mainBetApe: 25,
      vrfFeeApe: 1,
      availableApe: 27,
      rng: () => 0,
      deckValues: [5, 3, 10, 4, 2, 2, 2],
    });

    assert.equal(result.terminal, true);
    assert.equal(result.netDeltaApe, -27);
  });

  it('wraps blackjack hand simulation in a deterministic Monte Carlo estimate', () => {
    const estimate = estimateBlackjackLoopRunoutMonteCarlo({
      balanceApe: 27,
      availableApe: 27,
      mainBetApe: 25,
      vrfFeeApe: 1,
      sessionCount: 3,
      rng: () => 0,
      deckFactory: () => [5, 3, 10, 4, 2, 2, 2],
    });

    assert.equal(estimate.method, 'monte-carlo');
    assert.equal(estimate.estimatedGames, 1);
    assert.equal(estimate.p10Games, 1);
    assert.equal(estimate.p50Games, 1);
    assert.equal(estimate.p90Games, 1);
  });

  it('falls back to the EV estimate when a full Monte Carlo would be too expensive', () => {
    const estimate = estimateBlackjackLoopRunoutMonteCarlo({
      balanceApe: 1000,
      availableApe: 999,
      mainBetApe: 0.1,
      vrfFeeApe: 0.01,
    });

    assert.equal(estimate.method, 'ev');
    assert.equal(estimate.estimatedGames, 43434);
  });
});
