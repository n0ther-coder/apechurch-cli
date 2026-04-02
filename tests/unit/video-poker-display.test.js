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

const ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

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

    assert.match(output, /╔═+ VIDEO POKER ✔︎ ═+╗/);
    assert.match(output, /║ GAME #45\/123\s+║/);
    assert.match(output, /║ ┌────┬────┬────┬────┬────┐/);
    assert.match(output, /║ → High Card \(no payout\)\s+║/);
    assert.match(output, /\? Hold 2,4,5 \(EV 1\.537x\)/);
    assert.match(output, /╠═+/);
  });

  it('keeps boxed suggestion lines stable when ANSI-colored text is truncated', () => {
    const output = renderGameFullDecisionStart(makeDecisionState(), {
      suggestionLine: '\x1b[32mHold 1,2,3,4,5 because this recommendation text is intentionally very long\x1b[0m',
    });
    const suggestionLine = output.split('\n').find((line) => line.includes('? '));

    assert.ok(suggestionLine);
    assert.strictEqual(suggestionLine.replace(ANSI_REGEX, '').length, 30);
    assert.ok(suggestionLine.includes('\x1b[0m'));
  });

  it('renders the boxed auto-play closing half with hold markers over the final hand', () => {
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
    }, {
      hold: [true, false, true, true, false],
    });

    assert.match(output, /║ │\s*✔\s*│\s*│\s*✔\s*│\s*✔\s*│\s*│/);
    assert.match(output, /║ │\s*10 │\s*J │\s*Q │\s*K │\s*A │/);
    assert.match(output, /╚═+/);
    assert.doesNotMatch(output, /║ → Straight\s+║/);
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
    assert.match(output, /\(net profit -25\.0000 APE\)/);
    assert.doesNotMatch(output, /❌ No winning hand/);
  });

  it('formats the outcome footer separately from the boxed view', () => {
    const winFooter = formatOutcomeFooter({
      ...makeDecisionState(),
      isComplete: true,
      handStatus: 4,
      totalPayoutApe: 100,
    });
    const pushFooter = formatOutcomeFooter({
      ...makeDecisionState(),
      isComplete: true,
      handStatus: 1,
      totalPayoutApe: 25,
    });
    const lossFooter = formatOutcomeFooter({
      ...makeDecisionState(),
      isComplete: true,
      handStatus: 0,
      totalPayoutApe: 0,
    });

    assert.match(winFooter, /🎉 Straight! → 100 APE \(4x\) \(net profit \+75\.0000 APE\)/);
    assert.match(pushFooter, /🤝 Jacks or Better! → 25 APE \(1x\) \(net profit 0\.0000 APE\)/);
    assert.match(lossFooter, /💀 No winning hand \(net profit -25\.0000 APE\)/);
  });

  it('keeps the full-mode result line only in the footer for completed hands', () => {
    const output = renderGame({
      ...makeDecisionState(),
      gameState: 3,
      gameStateName: 'HAND_COMPLETE',
      handStatus: 5,
      handStatusName: 'FLUSH',
      isComplete: true,
      awaitingDecision: false,
      totalPayoutApe: 150,
      finalCards: [
        makeCard(2, 2, '2', '♣'),
        makeCard(5, 2, '5', '♣'),
        makeCard(9, 2, '9', '♣'),
        makeCard(11, 2, 'J', '♣'),
        makeCard(13, 2, 'K', '♣'),
      ],
    }, { displayMode: 'full' });

    assert.doesNotMatch(output, /║ → Flush\s+║/);
    assert.match(output, /🎉 Flush! → 150 APE \(6x\) \(net profit \+125\.0000 APE\)/);
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
