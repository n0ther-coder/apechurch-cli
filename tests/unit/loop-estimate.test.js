import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLoopRunoutEstimate,
  calculateMonteCarloLoopRunoutEstimate,
  estimateConfiguredGameLoopRunout,
  estimateVideoPokerLoopRunoutMonteCarlo,
  formatLoopRunoutEstimate,
  getBlackjackEstimatedFeesApe,
  getBlackjackEstimatedLossPerGameApe,
  getBlackjackEstimatedRtp,
  getVideoPokerEstimatedFeesApe,
  getVideoPokerEstimatedLossPerGameApe,
  getVideoPokerEstimatedRtp,
  sampleVideoPokerGameNetDeltaApe,
} from '../../lib/loop-estimate.js';
import { resolveGame } from '../../registry.js';

describe('Loop Estimate Helpers', () => {
  it('estimates games before wallet squandering from expected loss per game', () => {
    const estimate = calculateLoopRunoutEstimate({
      balanceApe: 100,
      availableApe: 99,
      expectedLossPerGameApe: 2.25,
    });

    assert.equal(estimate.scopeLabel, 'wallet squandering');
    assert.equal(estimate.estimatedGames, 44);
    assert.equal(formatLoopRunoutEstimate(estimate), 'Estimate games before wallet squandering ~44 games');
  });

  it('estimates games before stop-loss from balance delta and expected loss per game', () => {
    const estimate = calculateLoopRunoutEstimate({
      balanceApe: 100,
      availableApe: 99,
      stopLossApe: 60,
      expectedLossPerGameApe: 2.25,
    });

    assert.equal(estimate.scopeLabel, 'stop-loss');
    assert.equal(estimate.estimatedGames, 17);
    assert.equal(formatLoopRunoutEstimate(estimate), 'Estimate games before stop-loss ~17 games');
  });

  it('formats positive-EV estimates as unbounded', () => {
    const estimate = calculateLoopRunoutEstimate({
      balanceApe: 100,
      availableApe: 99,
      expectedLossPerGameApe: 0,
    });

    assert.equal(estimate.estimatedGames, null);
    assert.equal(formatLoopRunoutEstimate(estimate), 'Estimate games before wallet squandering not bounded at current EV');
  });

  it('formats Monte Carlo estimates as typical, lucky, and bad-run bounds', () => {
    const deltas = [
      -20, -20,
      -15, -15, -15,
      -10, -10, -10, -10, -10,
      -5, -5, -5, -5, -5, -5, -5, -5,
    ];
    let index = 0;
    const estimate = calculateMonteCarloLoopRunoutEstimate({
      balanceApe: 50,
      availableApe: 49,
      requiredApeToStart: 10,
      sessionCount: 4,
      sampleGameNetDeltaApe: () => {
        const value = deltas[index % deltas.length];
        index++;
        return value;
      },
      maxGamesCap: 20,
    });

    assert.equal(estimate.method, 'monte-carlo');
    assert.equal(estimate.estimatedGames, 4);
    assert.equal(estimate.p10Games, 2);
    assert.equal(estimate.p50Games, 3);
    assert.equal(estimate.p90Games, 4);
    assert.equal(
      formatLoopRunoutEstimate(estimate),
      'Estimate games before wallet squandering: ~3 ⚠️. On a lucky day, it could be 4 🍀; on a bad run, just 2 💀'
    );
  });

  it('samples exact video poker royal-flush jackpot outcomes', () => {
    const rolls = [0.999999, 0.5];
    let index = 0;
    const delta = sampleVideoPokerGameNetDeltaApe({
      betAmountApe: 100,
      jackpotApe: 1000,
      initialFeeApe: 0.4,
      redrawFeeApe: 0.6,
      rng: () => rolls[index++],
    });

    assert.equal(delta, 25899);
  });

  it('can run deterministic video poker Monte Carlo estimates', () => {
    const rolls = [
      0.1, 0.0,
      0.1, 0.0,
      0.1, 0.0,
      0.1, 0.0,
      0.1, 0.0,
      0.1, 0.0,
      0.1, 0.0,
      0.1, 0.0,
      0.1, 0.0,
    ];
    let index = 0;
    const estimate = estimateVideoPokerLoopRunoutMonteCarlo({
      balanceApe: 100,
      availableApe: 99,
      betAmountApe: 25,
      initialFeeApe: 0.4,
      redrawFeeApe: 0,
      sessionCount: 3,
      rng: () => rolls[index++],
      maxGamesCap: 10,
    });

    assert.equal(estimate.estimatedGames, 3);
    assert.equal(estimate.p10Games, 3);
    assert.equal(estimate.p50Games, 3);
    assert.equal(estimate.p90Games, 3);
  });

  it('uses exact configured samplers for simple games with closed-form distributions', () => {
    const gameEntry = resolveGame('roulette');
    const rolls = [0.2, 0.9, 0.2, 0.9, 0.2, 0.2, 0.9, 0.9];
    let index = 0;
    const estimate = estimateConfiguredGameLoopRunout({
      balanceApe: 40,
      availableApe: 39,
      gameEntry,
      wagerApe: 10,
      config: { bet: 'RED' },
      vrfFeeApe: 0,
      sessionCount: 4,
      rng: () => rolls[index++ % rolls.length],
    });

    assert.equal(estimate.method, 'monte-carlo');
    assert.match(
      formatLoopRunoutEstimate(estimate),
      /^Estimate games before wallet squandering: ~\d+ ⚠️\. On a lucky day, it could be \d+ 🍀; on a bad run, just \d+ 💀$/u
    );
  });

  it('uses the configured Gimboz Smash target surface for pre-loop Monte Carlo estimates', () => {
    const gameEntry = resolveGame('gimboz-smash');
    const rolls = [0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6];
    let index = 0;
    const estimate = estimateConfiguredGameLoopRunout({
      balanceApe: 40,
      availableApe: 39,
      gameEntry,
      wagerApe: 10,
      config: { targets: '1-50' },
      vrfFeeApe: 0.093211589,
      sessionCount: 4,
      rng: () => rolls[index++ % rolls.length],
    });

    assert.equal(estimate.method, 'monte-carlo');
    assert.match(
      formatLoopRunoutEstimate(estimate),
      /^Estimate games before wallet squandering: ~\d+ ⚠️\. On a lucky day, it could be \d+ 🍀; on a bad run, just \d+ 💀$/u
    );
  });

  it('uses the configured Gimboz Smash outside-range surface for pre-loop Monte Carlo estimates', () => {
    const gameEntry = resolveGame('gimboz-smash');
    const rolls = [0.01, 0.99, 0.02, 0.98, 0.03, 0.97, 0.04, 0.96];
    let index = 0;
    const estimate = estimateConfiguredGameLoopRunout({
      balanceApe: 40,
      availableApe: 39,
      gameEntry,
      wagerApe: 10,
      config: { outRange: '45-50' },
      vrfFeeApe: 0.093211589,
      sessionCount: 4,
      rng: () => rolls[index++ % rolls.length],
    });

    assert.equal(estimate.method, 'monte-carlo');
    assert.match(
      formatLoopRunoutEstimate(estimate),
      /^Estimate games before wallet squandering: ~\d+ ⚠️\. On a lucky day, it could be \d+ 🍀; on a bad run, just \d+ 💀$/u
    );
  });

  it('falls back to EV estimates when the full live payout matrix is not persisted locally', () => {
    const gameEntry = resolveGame('dino-dough');
    const estimate = estimateConfiguredGameLoopRunout({
      balanceApe: 100,
      availableApe: 99,
      gameEntry,
      wagerApe: 10,
      config: { spins: 5 },
      vrfFeeApe: 0.1,
    });

    assert.equal(estimate.method, 'ev');
    assert.equal(estimate.scopeLabel, 'wallet squandering');
    assert.match(formatLoopRunoutEstimate(estimate), /^Estimate games before wallet squandering ~\d+ games$/u);
  });

  it('uses the base video poker RTP for non-max bets', () => {
    assert.equal(getVideoPokerEstimatedRtp({ betAmountApe: 25 }), 0.981649);
  });

  it('adds jackpot uplift to max-bet video poker RTP', () => {
    assert.equal(getVideoPokerEstimatedRtp({ betAmountApe: 100, jackpotApe: 1000 }), 0.981899);
  });

  it('estimates video poker fees from initial and redraw VRF costs', () => {
    assert.ok(
      Math.abs(getVideoPokerEstimatedFeesApe({ initialFeeApe: 0.4, redrawFeeApe: 0.6 }) - 0.9954483331794256) < 1e-12
    );
  });

  it('estimates video poker loss per game from RTP and expected fees', () => {
    assert.ok(
      Math.abs(getVideoPokerEstimatedLossPerGameApe({
        betAmountApe: 25,
        initialFeeApe: 0.4,
        redrawFeeApe: 0.6,
      }) - 1.4542233331794254) < 1e-12
    );
  });

  it('uses the base blackjack RTP with no side bet', () => {
    assert.equal(getBlackjackEstimatedRtp({ mainBetApe: 25 }), 0.995);
  });

  it('blends blackjack main and player-side RTP', () => {
    assert.ok(
      Math.abs(getBlackjackEstimatedRtp({ mainBetApe: 25, playerSideApe: 1 }) - 0.9874544833864361) < 1e-12
    );
  });

  it('estimates blackjack fees from the live VRF fee', () => {
    assert.equal(getBlackjackEstimatedFeesApe({ vrfFeeApe: 0.4 }), 0.9);
  });

  it('estimates blackjack loss per game from blended RTP and expected fees', () => {
    assert.ok(
      Math.abs(getBlackjackEstimatedLossPerGameApe({
        mainBetApe: 25,
        playerSideApe: 3,
        vrfFeeApe: 0.4,
      }) - 1.6285502958579903) < 1e-12
    );
  });
});
