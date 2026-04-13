import { describe, it } from 'node:test';
import assert from 'node:assert';

import { formatOutcomeFooter, renderGame, renderPayoutTable } from '../../lib/stateful/hi-lo-nebula/display.js';

const ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function makeDecisionState() {
  return {
    gameId: '123',
    player: '0x1111111111111111111111111111111111111111',
    initialBetAmount: 25000000000000000000n,
    initialBetAmountApe: 25,
    payout: 0n,
    payoutApe: 0,
    hasEnded: false,
    timestamp: 1234567890,
    rounds: [],
    roundsForJackpot: 15,
    platformFeeBps: 250,
    jackpotFeeBps: 50,
    currentCard: 9,
    currentCardLabel: '9',
    currentRoundIndex: 1,
    currentRound: { direction: 0 },
    lastResolvedRound: null,
    currentCashout: 44642500000000000000n,
    currentCashoutApe: 44.6425,
    currentJackpotAmount: 1197415802173500670n,
    currentJackpotAmountApe: 1.1974158021735007,
    roundsWon: 1,
    cardsDrawn: 2,
    currentGuessNumber: 2,
    awaitingInitialDeal: false,
    awaitingGuessResult: false,
    awaitingDecision: true,
    canCashOut: true,
    isComplete: false,
    outcome: null,
    unresolvedPlaceholderExists: true,
    availableDirections: [1, 2, 3],
    currentOptions: [
      { direction: 2, label: 'Higher', shortLabel: 'HIGH', multiplier: 2.5, multiplierBps: 25000 },
      { direction: 1, label: 'Lower', shortLabel: 'LOW', multiplier: 1.7857, multiplierBps: 17857 },
      { direction: 3, label: 'Same', shortLabel: 'SAME', multiplier: 12.5, multiplierBps: 125000 },
    ],
    recentTransition: '9 LOW -> 6',
    pendingGuessLabel: null,
    totalFeeBps: 300,
  };
}

describe('Hi-Lo Nebula Display', () => {
  it('renders the boxed full-mode decision view with aligned frame widths', () => {
    const output = renderGame(makeDecisionState(), { displayMode: 'full' });

    const lines = output.split('\n');
    const visibleLengths = lines.map((line) => line.replace(ANSI_REGEX, '').length);
    const bodyLengths = visibleLengths.slice(1);

    assert.match(output, /HI-LO NEBULA ✔︎/);
    assert.match(output, /Actions/);
    assert.match(output, /\[H\] Higher 2\.5000x/);
    assert.match(output, /│\s+9[♥♦♣♠]\s+│/u);
    assert.match(output, /Bet: 25 APE/);
    assert.match(output, /Cashout: 44\.6425 APE/);
    assert.match(output, /Jackpot: 1\.1974 APE/);
    assert.doesNotMatch(output, /Choose HIGH \/ LOWER \/ SAME/);
    assert.doesNotMatch(output, /Suggestion:/);
    assert.ok(bodyLengths.every((length) => length === bodyLengths[0]), 'Expected the outer frame lines to stay aligned');
  });

  it('renders the initial reveal wait as a plain message in full mode', () => {
    const output = renderGame({ awaitingInitialDeal: true }, { displayMode: 'full' });
    assert.strictEqual(output, 'Waiting for the initial rank reveal...');
  });

  it('formats losing and jackpot outcomes in the footer', () => {
    const lossFooter = formatOutcomeFooter({
      ...makeDecisionState(),
      isComplete: true,
      outcome: 'loss',
      payoutApe: 0,
    });
    const jackpotFooter = formatOutcomeFooter({
      ...makeDecisionState(),
      isComplete: true,
      outcome: 'jackpot',
      payoutApe: 1234.5,
    });

    assert.match(lossFooter, /Full loss/);
    assert.match(jackpotFooter, /Jackpot! → 1234\.50 APE/);
  });

  it('renders the verified payout table including SAME and ace edge cases', () => {
    const table = renderPayoutTable();
    assert.match(table, /Same\s+│/);
    assert.match(table, /│ 2\s+│ 1\.0600x\s+│ N\/A\s+│ 12\.5000x\s+│/);
    assert.match(table, /│ A\s+│ N\/A\s+│ 1\.0600x\s+│ 12\.5000x\s+│/);
  });
});
