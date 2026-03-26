import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  formatOutcomeFooter,
  renderGame,
  renderGameFullDecisionEndAuto,
  renderGameFullDecisionEndInteractive,
  renderGameFullPromptLine,
  renderGameFullDecisionStart,
} from '../../lib/stateful/video-poker/display.js';

function makeCard(rank, suit, rankName, suitSymbol) {
  return { rank, suit, rankName, suitSymbol, isEmpty: false };
}

function makeDecisionState() {
  return {
    gameId: '123',
    betAmount: 25000000000000000000n,
    betAmountApe: 25,
    totalPayout: 0n,
    totalPayoutApe: 0,
        initialCards: [
          makeCard(10, 1, '10', '♥'),
          makeCard(12, 0, 'Q', '♦'),
          makeCard(13, 1, 'K', '♥'),
          makeCard(7, 2, '7', '♣'),
          makeCard(1, 2, 'A', '♣'),
        ],
    finalCards: [],
    gameState: 1,
    gameStateName: 'PLAYER_DECISION',
    handStatus: 0,
    handStatusName: 'NOTHING',
    awaitingRNG: false,
    timestamp: 1234567890,
    isComplete: false,
    awaitingDecision: true,
    payout: 0,
  };
}

describe('Video Poker Display', () => {
  it('renders the boxed full-mode opening half with an optional suggestion', () => {
    const output = renderGameFullDecisionStart(makeDecisionState(), {
      gameLabel: 'Game #45 /123',
      suggestionLine: 'Hold 2,4,5 (EV 1.537x)',
    });

    assert.match(output, /╔═+ VIDEO POKER ═+╗/);
    assert.match(output, /║ GAME #45\/123\s+║/);
    assert.match(output, /║ ┌────┬────┬────┬────┬────┐/);
    assert.match(output, /║ → High Card \(no payout\)\s+║/);
    assert.match(output, /\? Hold 2,4,5 \(EV 1\.537x\)/);
    assert.match(output, /╠═+/);
  });

  it('renders the boxed auto-play closing half with final cards and result', () => {
    const output = renderGameFullDecisionEndAuto({
      ...makeDecisionState(),
      gameState: 3,
      gameStateName: 'HAND_COMPLETE',
      handStatus: 4,
      handStatusName: 'STRAIGHT',
      isComplete: true,
      awaitingDecision: false,
      finalCards: [
        makeCard(10, 1, '10', '♥'),
        makeCard(11, 0, 'J', '♦'),
        makeCard(12, 1, 'Q', '♥'),
        makeCard(13, 2, 'K', '♣'),
        makeCard(1, 2, 'A', '♣'),
      ],
    });

    assert.match(output, /║ ┌────┬────┬────┬────┬────┐/);
    assert.match(output, /║ → Straight\s+║/);
    assert.match(output, /╚═+/);
  });

  it('renders the interactive closing half with hold markers over the final hand', () => {
    const output = renderGameFullDecisionEndInteractive({
      ...makeDecisionState(),
      gameState: 3,
      gameStateName: 'HAND_COMPLETE',
      handStatus: 2,
      handStatusName: 'TWO_PAIR',
      isComplete: true,
      awaitingDecision: false,
      finalCards: [
        makeCard(10, 1, '10', '♥'),
        makeCard(12, 0, 'Q', '♦'),
        makeCard(13, 1, 'K', '♥'),
        makeCard(11, 2, 'J', '♣'),
        makeCard(1, 2, 'A', '♣'),
      ],
    }, {
      hold: [false, true, false, true, true],
    });

    assert.match(output, /║ │\s*│\s*✔\s*│\s*│\s*✔\s*│\s*✔\s*│/);
    assert.match(output, /║ │\s*10 │\s*Q │\s*K │\s*J │\s*A │/);
    assert.match(output, /╚═+/);
  });

  it('renders the prompt line separately for full interactive mode', () => {
    const output = renderGameFullPromptLine('Hold which? (e.g. "2 4")');
    assert.match(output, /^║ Hold which\? \(e\.g\. "2 4"\)\s+║$/);
  });

  it('uses the skull icon for losing outcomes in simple mode', () => {
    const output = renderGame({
      ...makeDecisionState(),
      gameState: 3,
      gameStateName: 'HAND_COMPLETE',
      isComplete: true,
      awaitingDecision: false,
      finalCards: [
        makeCard(2, 3, '2', '♠'),
        makeCard(4, 0, '4', '♦'),
        makeCard(6, 2, '6', '♣'),
        makeCard(8, 1, '8', '♥'),
        makeCard(9, 3, '9', '♠'),
      ],
    }, { displayMode: 'simple' });

    assert.match(output, /💀 No winning hand/);
    assert.doesNotMatch(output, /❌ No winning hand/);
  });

  it('formats the outcome footer separately from the boxed view', () => {
    const winFooter = formatOutcomeFooter({
      ...makeDecisionState(),
      isComplete: true,
      handStatus: 4,
      totalPayoutApe: 10,
    });
    const lossFooter = formatOutcomeFooter({
      ...makeDecisionState(),
      isComplete: true,
      handStatus: 0,
      totalPayoutApe: 0,
    });

    assert.strictEqual(winFooter, '🎉 Straight! → 10 APE (4x)');
    assert.strictEqual(lossFooter, '💀 No winning hand');
  });

  it('serializes bigint fields in json mode', () => {
    const json = renderGame(
      {
        ...makeDecisionState(),
        betAmount: 5000000000000000000n,
        betAmountApe: 5,
        totalPayout: 25000000000000000000n,
        totalPayoutApe: 25,
        gameState: 3,
        gameStateName: 'HAND_COMPLETE',
        handStatus: 2,
        handStatusName: 'TWO_PAIR',
        awaitingRNG: false,
        isComplete: true,
        awaitingDecision: false,
      },
      { displayMode: 'json' }
    );

    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.betAmount, '5000000000000000000');
    assert.strictEqual(parsed.totalPayout, '25000000000000000000');
    assert.strictEqual(parsed.betAmountApe, 5);
    assert.strictEqual(parsed.handStatusName, 'TWO_PAIR');
  });
});
