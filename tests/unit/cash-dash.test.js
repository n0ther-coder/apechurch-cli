import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseEther } from 'viem';

import {
  getRowsForRoundLocal,
  parseGameInfo,
  parseTileSelection,
} from '../../lib/stateful/cash-dash/state.js';
import {
  estimateOneStepContinuation,
  getBestDecision,
  getSimpleDecision,
} from '../../lib/stateful/cash-dash/strategy.js';
import {
  renderGame,
  renderOpeningGrid,
} from '../../lib/stateful/cash-dash/display.js';
import {
  formatDecisionSuggestion,
} from '../../lib/stateful/cash-dash/index.js';

function makeRawGame(overrides = {}) {
  return {
    initialBetAmount: parseEther('10'),
    payout: 0n,
    user: '0x1111111111111111111111111111111111111111',
    currentPayout: parseEther('10'),
    rowGuesses: [],
    rowDeathHits: [],
    tilesetSeed: 0n,
    hasEnded: false,
    timestamp: 1710000000n,
    ...overrides,
  };
}

describe('Cash Dash state helpers', () => {
  it('matches the verified seed-zero row schedule', () => {
    assert.deepStrictEqual(
      Array.from({ length: 10 }, (_, roundId) => getRowsForRoundLocal(roundId, 0n)),
      [7, 6, 5, 4, 3, 7, 6, 5, 4, 3]
    );
    assert.strictEqual(getRowsForRoundLocal(20, 0n), 2);
  });

  it('parses one-based tile selections strictly', () => {
    assert.deepStrictEqual(parseTileSelection('1', 7), { valid: true, random: false, index: 0 });
    assert.deepStrictEqual(parseTileSelection('7', 7), { valid: true, random: false, index: 6 });
    assert.deepStrictEqual(parseTileSelection('random', 7), { valid: true, random: true, index: null });
    assert.strictEqual(parseTileSelection('1abc', 7).valid, false);
    assert.strictEqual(parseTileSelection('8', 7).valid, false);
  });

  it('recognizes the decision point after a safe opening row', () => {
    const state = parseGameInfo(makeRawGame({
      currentPayout: parseEther('11'),
      rowGuesses: [0],
      rowDeathHits: [5],
    }), '123');

    assert.strictEqual(state.awaitingDecision, true);
    assert.strictEqual(state.canCashOut, true);
    assert.strictEqual(state.roundsWon, 1);
    assert.strictEqual(state.currentTileCount, 6);
    assert.strictEqual(state.currentMultiplier, 1.1);
    assert.strictEqual(state.nextMultiplier, 1.265);
    assert.strictEqual(state.totalWageredApe, 10);
  });

  it('counts compounded wager only once the next guess is placed', () => {
    const state = parseGameInfo(makeRawGame({
      currentPayout: parseEther('11'),
      rowGuesses: [0, 2],
      rowDeathHits: [5],
    }), '123');

    assert.strictEqual(state.awaitingGuessResult, true);
    assert.strictEqual(state.currentRoundIndex, 1);
    assert.strictEqual(state.currentTileCount, 6);
    assert.strictEqual(state.pendingGuessIndex, 2);
    assert.strictEqual(state.totalWageredApe, 21);
  });

  it('marks terminal cashout and loss states', () => {
    const cashout = parseGameInfo(makeRawGame({
      payout: parseEther('11'),
      currentPayout: parseEther('11'),
      rowGuesses: [0],
      rowDeathHits: [5],
      hasEnded: true,
    }), '123');
    const loss = parseGameInfo(makeRawGame({
      currentPayout: 0n,
      rowGuesses: [0],
      rowDeathHits: [0],
      hasEnded: true,
    }), '124');

    assert.strictEqual(cashout.outcome, 'cashout');
    assert.strictEqual(cashout.payoutApe, 11);
    assert.strictEqual(loss.outcome, 'loss');
    assert.strictEqual(loss.payoutApe, 0);
  });
});

describe('Cash Dash strategy helpers', () => {
  it('cashes out by default once a safe row resolves', () => {
    const state = parseGameInfo(makeRawGame({
      currentPayout: parseEther('11'),
      rowGuesses: [0],
      rowDeathHits: [5],
    }), '123');

    assert.strictEqual(getSimpleDecision(state).type, 'cashout');
    assert.strictEqual(getBestDecision(state).type, 'cashout');
  });

  it('continues when cashout-after targets deeper rows', () => {
    const state = parseGameInfo(makeRawGame({
      currentPayout: parseEther('11'),
      rowGuesses: [0],
      rowDeathHits: [5],
    }), '123');

    const decision = getBestDecision(state, { vrfFee: 0n }, { cashoutAfter: 3 });
    assert.strictEqual(decision.type, 'guess');
    assert.strictEqual(decision.index, 0);
    assert.ok(decision.evMultiplier < 1);
  });

  it('models one-step continuation EV from row payout and survival odds', () => {
    const state = parseGameInfo(makeRawGame({
      currentPayout: parseEther('11'),
      rowGuesses: [0],
      rowDeathHits: [5],
    }), '123');
    const ev = estimateOneStepContinuation(state, { vrfFee: 0n });

    assert.strictEqual(ev.tileCount, 6);
    assert.strictEqual(ev.payoutMultiplier, 1.15);
    assert.strictEqual(Number(ev.netEvMultiplier.toFixed(6)), 0.958333);
  });
});

describe('Cash Dash display helpers', () => {
  it('keeps solver suggestion text compact enough for the boxed view', () => {
    const cashoutLine = formatDecisionSuggestion({
      type: 'cashout',
      continuationEvMultiplier: 0.958333,
    });
    const guessLine = formatDecisionSuggestion({
      type: 'guess',
      index: 0,
      label: 'Tile 1',
      evMultiplier: 0.958333,
    });

    assert.strictEqual(cashoutLine, 'Cash Out (c) | Continue EV 0.958x');
    assert.strictEqual(guessLine, 'Tile 1 (1) | EV 0.958x');
    assert.ok(`Suggestion: ${cashoutLine}`.length <= 68);
    assert.ok(`Suggestion: ${guessLine}`.length <= 68);
  });

  it('renders latest rows first and uses cash/death icons', () => {
    const state = parseGameInfo(makeRawGame({
      currentPayout: parseEther('12.65'),
      rowGuesses: [0, 2],
      rowDeathHits: [5, 4],
    }), '123');

    const rendered = renderGame(state, { displayMode: 'full' });
    assert.ok(rendered.indexOf('Row 3') < rendered.indexOf('Row 2'));
    assert.ok(rendered.indexOf('Row 2') < rendered.indexOf('Row 1'));
    assert.match(rendered, /\[💵\]/);
    assert.match(rendered, /\[💀\]/);
    assert.doesNotMatch(rendered, /\[\$\]/);
    assert.doesNotMatch(rendered, /\[X\]/);
  });

  it('renders an opening grid before the first guess is selected', () => {
    const rendered = renderOpeningGrid({ displayMode: 'simple' });
    assert.match(rendered, /CASH DASH.*OPENING ROW/);
    assert.match(rendered, /Row 1\s+\[ \]\[ \]\[ \]\[ \]\[ \]\[ \]\[ \]\s+choose one/);
    assert.match(rendered, /Tiles: 1 2 3 4 5 6 7/);
  });
});
