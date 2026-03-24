/**
 * Exact EV solver for video poker hold decisions.
 */
import { evaluateHand, getPayoutApe } from './evaluator.js';

const HAND_SIZE = 5;
const EPSILON = 1e-9;

const FULL_DECK = [];
for (let suit = 0; suit < 4; suit++) {
  for (let rank = 1; rank <= 13; rank++) {
    FULL_DECK.push({ rank, suit });
  }
}

const HOLD_OPTIONS = Array.from({ length: 2 ** HAND_SIZE }, (_, mask) => {
  const hold = Array(HAND_SIZE).fill(false);
  const heldIndices = [];

  for (let index = 0; index < HAND_SIZE; index++) {
    if (mask & (1 << index)) {
      hold[index] = true;
      heldIndices.push(index);
    }
  }

  return {
    hold,
    heldIndices,
    drawCount: HAND_SIZE - heldIndices.length,
  };
});

function cardKey(card) {
  return `${card.rank}:${card.suit}`;
}

function getRemainingDeck(initialCards) {
  const seen = new Set(initialCards.map(cardKey));
  return FULL_DECK.filter((card) => !seen.has(cardKey(card)));
}

function calculateExpectedValueForHeldCards(remainingDeck, heldCards, payoutContext) {
  const heldCount = heldCards.length;
  const drawCount = HAND_SIZE - heldCount;
  const hand = heldCards.slice();
  const deckLength = remainingDeck.length;
  let totalPayoutApe = 0;
  let outcomes = 0;

  const scoreCurrentHand = () => {
    const evaluation = evaluateHand(hand);
    totalPayoutApe += getPayoutApe(evaluation.handStatus, payoutContext);
    outcomes++;
  };

  switch (drawCount) {
    case 0:
      scoreCurrentHand();
      break;

    case 1:
      for (let a = 0; a < deckLength; a++) {
        hand[heldCount] = remainingDeck[a];
        scoreCurrentHand();
      }
      break;

    case 2:
      for (let a = 0; a < deckLength - 1; a++) {
        hand[heldCount] = remainingDeck[a];
        for (let b = a + 1; b < deckLength; b++) {
          hand[heldCount + 1] = remainingDeck[b];
          scoreCurrentHand();
        }
      }
      break;

    case 3:
      for (let a = 0; a < deckLength - 2; a++) {
        hand[heldCount] = remainingDeck[a];
        for (let b = a + 1; b < deckLength - 1; b++) {
          hand[heldCount + 1] = remainingDeck[b];
          for (let c = b + 1; c < deckLength; c++) {
            hand[heldCount + 2] = remainingDeck[c];
            scoreCurrentHand();
          }
        }
      }
      break;

    case 4:
      for (let a = 0; a < deckLength - 3; a++) {
        hand[heldCount] = remainingDeck[a];
        for (let b = a + 1; b < deckLength - 2; b++) {
          hand[heldCount + 1] = remainingDeck[b];
          for (let c = b + 1; c < deckLength - 1; c++) {
            hand[heldCount + 2] = remainingDeck[c];
            for (let d = c + 1; d < deckLength; d++) {
              hand[heldCount + 3] = remainingDeck[d];
              scoreCurrentHand();
            }
          }
        }
      }
      break;

    case 5:
      for (let a = 0; a < deckLength - 4; a++) {
        hand[0] = remainingDeck[a];
        for (let b = a + 1; b < deckLength - 3; b++) {
          hand[1] = remainingDeck[b];
          for (let c = b + 1; c < deckLength - 2; c++) {
            hand[2] = remainingDeck[c];
            for (let d = c + 1; d < deckLength - 1; d++) {
              hand[3] = remainingDeck[d];
              for (let e = d + 1; e < deckLength; e++) {
                hand[4] = remainingDeck[e];
                scoreCurrentHand();
              }
            }
          }
        }
      }
      break;

    default:
      throw new Error(`Unsupported draw count: ${drawCount}`);
  }

  return { totalPayoutApe, outcomes };
}

function compareDecision(a, b) {
  if (a.evApe > b.evApe + EPSILON) return 1;
  if (b.evApe > a.evApe + EPSILON) return -1;

  // Deterministic tie-breaker: keep more cards when EV is effectively tied.
  if (a.holdCount !== b.holdCount) {
    return a.holdCount > b.holdCount ? 1 : -1;
  }

  const aKey = a.hold.map((value) => (value ? '1' : '0')).join('');
  const bKey = b.hold.map((value) => (value ? '1' : '0')).join('');
  return aKey > bKey ? 1 : aKey < bKey ? -1 : 0;
}

export function calculateHoldExpectedValue(initialCards, hold, { betAmountApe, jackpotApe = 0 } = {}) {
  const remainingDeck = getRemainingDeck(initialCards);
  return calculateHoldExpectedValueFromDeck(remainingDeck, initialCards, hold, { betAmountApe, jackpotApe });
}

function calculateHoldExpectedValueFromDeck(remainingDeck, initialCards, hold, { betAmountApe, jackpotApe = 0 } = {}) {
  const heldCards = initialCards.filter((_, index) => hold[index]);
  const { totalPayoutApe, outcomes } = calculateExpectedValueForHeldCards(
    remainingDeck,
    heldCards,
    { betAmountApe, jackpotApe },
  );

  const evApe = totalPayoutApe / outcomes;

  return {
    evApe,
    evMultiplier: evApe / betAmountApe,
    outcomes,
  };
}

export function getBestHoldByEV(initialCards, { betAmountApe, jackpotApe = 0 } = {}) {
  const remainingDeck = getRemainingDeck(initialCards);
  let bestDecision = null;

  for (const option of HOLD_OPTIONS) {
    const expected = calculateHoldExpectedValueFromDeck(remainingDeck, initialCards, option.hold, {
      betAmountApe,
      jackpotApe,
    });
    const decision = {
      ...expected,
      hold: option.hold,
      holdCount: option.heldIndices.length,
      heldPositions: option.heldIndices.map((index) => index + 1),
    };

    if (!bestDecision || compareDecision(decision, bestDecision) > 0) {
      bestDecision = decision;
    }
  }

  return bestDecision;
}
