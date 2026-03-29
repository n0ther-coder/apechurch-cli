/**
 * Exact blackjack EV solver for the contract's live game state.
 *
 * This models the actual game flow exposed by the contract:
 * - Single 52-card deck without replacement
 * - Dealer starts with one visible upcard in state
 * - No re-splitting
 * - Double on any first two cards, including split hands
 * - Early surrender on the first decision only
 * - Insurance on dealer Ace upcard
 *
 * EV is expressed in units of the initial bet and is optimized for game RTP.
 * Chain fees are used to gate action availability elsewhere, but are not part
 * of the game-theoretic payout model here.
 */
import { Action } from './constants.js';

const CARD_VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const FULL_DECK_COUNTS = [4, 4, 4, 4, 4, 4, 4, 4, 16, 4];
const VALUE_TO_INDEX = new Map(CARD_VALUES.map((value, index) => [value, index]));
const DEALER_STANDS_ON_SOFT_17 = true;
const DOUBLE_COST_UNITS = 1;
const SPLIT_COST_UNITS = 1;
const INSURANCE_COST_UNITS = 0.5;
const INSURANCE_PAYOUT_UNITS = 1.5;
const EPSILON = 1e-12;
const SOLVER_BUDGET_EXCEEDED_ERROR = 'Blackjack EV search budget exceeded';
const ACTION_PRIORITY = [
  Action.STAND,
  Action.HIT,
  Action.DOUBLE,
  Action.SPLIT,
  Action.SURRENDER,
  Action.INSURANCE,
];
const DEALER_NATURAL = 0;
const DEALER_17 = 1;
const DEALER_18 = 2;
const DEALER_19 = 3;
const DEALER_20 = 4;
const DEALER_21 = 5;
const DEALER_BUST = 6;
const DEALER_OUTCOME_LENGTH = 7;
const TOTAL_TO_DEALER_OUTCOME = {
  17: DEALER_17,
  18: DEALER_18,
  19: DEALER_19,
  20: DEALER_20,
  21: DEALER_21,
};

function totalCards(deckCounts) {
  let total = 0;
  for (let i = 0; i < deckCounts.length; i++) {
    total += deckCounts[i];
  }
  return total;
}

function applyCardValue(total, softAces, value) {
  let nextTotal = total + value;
  let nextSoftAces = softAces + (value === 11 ? 1 : 0);

  while (nextTotal > 21 && nextSoftAces > 0) {
    nextTotal -= 10;
    nextSoftAces--;
  }

  return { total: nextTotal, softAces: nextSoftAces };
}

function createHandFromValues(values, {
  betUnits = 1,
  canAct = null,
  isNaturalBlackjack = false,
} = {}) {
  let total = 0;
  let softAces = 0;

  for (const value of values) {
    ({ total, softAces } = applyCardValue(total, softAces, value));
  }

  const pairValue = values.length === 2 && values[0] === values[1] ? values[0] : null;

  return {
    total,
    softAces,
    cardCount: values.length,
    betUnits,
    canAct: canAct ?? total < 21,
    pairValue,
    isNaturalBlackjack,
  };
}

function drawCardToHand(hand, value, {
  betUnits = hand.betUnits,
  forceStand = false,
} = {}) {
  const { total, softAces } = applyCardValue(hand.total, hand.softAces, value);
  const cardCount = hand.cardCount + 1;
  const shouldContinue = !forceStand && total < 21;

  return {
    total,
    softAces,
    cardCount,
    betUnits,
    canAct: shouldContinue,
    pairValue: null,
    isNaturalBlackjack: false,
  };
}

function standHand(hand) {
  return {
    ...hand,
    canAct: false,
    pairValue: null,
  };
}

function replaceHand(state, index, hand) {
  const hands = state.hands.slice();
  hands[index] = hand;
  return {
    ...state,
    hands,
  };
}

function advanceOrResolve(state) {
  for (let index = state.activeIndex + 1; index < state.hands.length; index++) {
    if (state.hands[index].canAct) {
      return {
        ...state,
        activeIndex: index,
        canInsurance: false,
        canSurrender: false,
      };
    }
  }

  return null;
}

function handKey(hand) {
  return [
    hand.total,
    hand.softAces,
    hand.cardCount,
    hand.betUnits,
    hand.canAct ? 1 : 0,
    hand.pairValue ?? 0,
    hand.isNaturalBlackjack ? 1 : 0,
  ].join(':');
}

function stateKey(state, allowedActions = null) {
  const allowedKey = allowedActions ? [...allowedActions].sort().join(',') : '*';
  return [
    state.dealerUpcard,
    state.activeIndex,
    state.insuranceTaken ? 1 : 0,
    state.canInsurance ? 1 : 0,
    state.canSurrender ? 1 : 0,
    allowedKey,
    state.hands.map(handKey).join('/'),
  ].join('|');
}

function dealerKey({ dealerTotal, dealerSoftAces, dealerCardCount, deckCounts }) {
  return [
    dealerTotal,
    dealerSoftAces,
    dealerCardCount,
    deckCounts.join(','),
  ].join('|');
}

function actionSet(allowedActions) {
  if (!allowedActions) return null;
  if (allowedActions instanceof Set) return allowedActions;
  return new Set(allowedActions);
}

function getAvailableSolverActions(state, allowedActions = null) {
  const allowed = actionSet(allowedActions);
  const hand = state.hands[state.activeIndex];

  if (!hand?.canAct) {
    return [];
  }

  const canUse = (action) => !allowed || allowed.has(action);
  const actions = [];

  if (state.canInsurance && canUse(Action.INSURANCE)) {
    actions.push(Action.INSURANCE);
  }

  if (state.canSurrender && canUse(Action.SURRENDER)) {
    actions.push(Action.SURRENDER);
  }

  if (
    state.hands.length === 1 &&
    hand.cardCount === 2 &&
    hand.pairValue !== null &&
    canUse(Action.SPLIT)
  ) {
    actions.push(Action.SPLIT);
  }

  if (hand.cardCount === 2 && canUse(Action.DOUBLE)) {
    actions.push(Action.DOUBLE);
  }

  if (canUse(Action.STAND)) {
    actions.push(Action.STAND);
  }

  if (canUse(Action.HIT)) {
    actions.push(Action.HIT);
  }

  return actions;
}

function compareDecisions(a, b) {
  if (a.evUnits > b.evUnits + EPSILON) return 1;
  if (b.evUnits > a.evUnits + EPSILON) return -1;

  const aPriority = ACTION_PRIORITY.indexOf(a.action);
  const bPriority = ACTION_PRIORITY.indexOf(b.action);

  if (aPriority !== bPriority) {
    return aPriority < bPriority ? 1 : -1;
  }

  return 0;
}

function emptyDealerDistribution() {
  return new Float64Array(DEALER_OUTCOME_LENGTH);
}

function settleHands(hands, distribution) {
  let payoutUnits = 0;
  const bustProbability = distribution[DEALER_BUST];
  const naturalProbability = distribution[DEALER_NATURAL];

  for (const hand of hands) {
    if (hand.total > 21) {
      continue;
    }

    if (hand.isNaturalBlackjack) {
      payoutUnits += naturalProbability * hand.betUnits;
      payoutUnits += (1 - naturalProbability) * (2.5 * hand.betUnits);
      continue;
    }

    payoutUnits += bustProbability * (2 * hand.betUnits);

    for (let dealerTotal = 17; dealerTotal <= 21; dealerTotal++) {
      const probability = distribution[TOTAL_TO_DEALER_OUTCOME[dealerTotal]];
      if (probability <= 0) continue;

      if (hand.total > dealerTotal) {
        payoutUnits += probability * (2 * hand.betUnits);
      } else if (hand.total === dealerTotal) {
        payoutUnits += probability * hand.betUnits;
      }
    }
  }

  return payoutUnits;
}

function shouldDealerStand(total, softAces) {
  if (total > 21) return true;
  if (total > 17) return true;
  if (total < 17) return false;
  if (DEALER_STANDS_ON_SOFT_17) return true;
  return softAces === 0;
}

function resolveDealerDistribution(deckCounts, caches, dealerTotal, dealerSoftAces, dealerCardCount) {
  const memoKey = dealerKey({ dealerTotal, dealerSoftAces, dealerCardCount, deckCounts });
  const cached = caches.dealer.get(memoKey);
  if (cached !== undefined) {
    return cached;
  }

  const distribution = emptyDealerDistribution();
  const dealerNatural = dealerCardCount === 2 && dealerTotal === 21;
  if (dealerNatural) {
    distribution[DEALER_NATURAL] = 1;
    caches.dealer.set(memoKey, distribution);
    return distribution;
  }

  if (dealerTotal > 21 || shouldDealerStand(dealerTotal, dealerSoftAces)) {
    if (dealerTotal > 21) {
      distribution[DEALER_BUST] = 1;
    } else {
      distribution[TOTAL_TO_DEALER_OUTCOME[dealerTotal]] = 1;
    }
    caches.dealer.set(memoKey, distribution);
    return distribution;
  }

  const remainingCards = totalCards(deckCounts);

  for (let index = 0; index < CARD_VALUES.length; index++) {
    const count = deckCounts[index];
    if (count <= 0) continue;

    const value = CARD_VALUES[index];
    const probability = count / remainingCards;
    const nextDeck = deckCounts.slice();
    nextDeck[index]--;
    const nextDealer = applyCardValue(dealerTotal, dealerSoftAces, value);
    const nextDistribution = resolveDealerDistribution(
      nextDeck,
      caches,
      nextDealer.total,
      nextDealer.softAces,
      dealerCardCount + 1,
    );

    for (let outcome = 0; outcome < DEALER_OUTCOME_LENGTH; outcome++) {
      distribution[outcome] += probability * nextDistribution[outcome];
    }
  }

  caches.dealer.set(memoKey, distribution);
  return distribution;
}

function resolveDealerState(state, deckCounts, caches) {
  const anyLiveHands = state.hands.some((hand) => hand.total <= 21);

  if (!anyLiveHands) {
    if (state.insuranceTaken && state.dealerUpcard === 11) {
      const remainingCards = totalCards(deckCounts);
      const tenCount = deckCounts[VALUE_TO_INDEX.get(10)];
      return remainingCards > 0 ? (tenCount / remainingCards) * INSURANCE_PAYOUT_UNITS : 0;
    }
    return 0;
  }

  const distribution = resolveDealerDistribution(
    deckCounts,
    caches,
    state.dealerUpcard,
    state.dealerUpcard === 11 ? 1 : 0,
    1,
  );

  const insurancePayout = state.insuranceTaken && state.dealerUpcard === 11
    ? distribution[DEALER_NATURAL] * INSURANCE_PAYOUT_UNITS
    : 0;

  return insurancePayout + settleHands(state.hands, distribution);
}

function resolveAfterHandEnds(state, deckCounts, caches) {
  const nextState = advanceOrResolve(state);
  if (nextState) {
    return solvePlayerState(nextState, deckCounts, caches).evUnits;
  }

  return resolveDealerState(state, deckCounts, caches);
}

function evaluateAction(state, deckCounts, action, caches) {
  const hand = state.hands[state.activeIndex];

  switch (action) {
    case Action.STAND: {
      const nextState = replaceHand({
        ...state,
        canInsurance: false,
        canSurrender: false,
      }, state.activeIndex, standHand(hand));
      return resolveAfterHandEnds(nextState, deckCounts, caches);
    }

    case Action.HIT: {
      const remainingCards = totalCards(deckCounts);
      let expectedUnits = 0;

      for (let index = 0; index < CARD_VALUES.length; index++) {
        const count = deckCounts[index];
        if (count <= 0) continue;

        const value = CARD_VALUES[index];
        const probability = count / remainingCards;
        const nextDeck = deckCounts.slice();
        nextDeck[index]--;
        const drawnHand = drawCardToHand(hand, value);
        const nextState = replaceHand({
          ...state,
          canInsurance: false,
          canSurrender: false,
        }, state.activeIndex, drawnHand);

        expectedUnits += probability * (
          drawnHand.canAct
            ? solvePlayerState(nextState, nextDeck, caches).evUnits
            : resolveAfterHandEnds(nextState, nextDeck, caches)
        );
      }

      return expectedUnits;
    }

    case Action.DOUBLE: {
      const remainingCards = totalCards(deckCounts);
      let expectedUnits = 0;

      for (let index = 0; index < CARD_VALUES.length; index++) {
        const count = deckCounts[index];
        if (count <= 0) continue;

        const value = CARD_VALUES[index];
        const probability = count / remainingCards;
        const nextDeck = deckCounts.slice();
        nextDeck[index]--;
        const doubledHand = drawCardToHand(hand, value, {
          betUnits: hand.betUnits + DOUBLE_COST_UNITS,
          forceStand: true,
        });
        const nextState = replaceHand({
          ...state,
          canInsurance: false,
          canSurrender: false,
        }, state.activeIndex, doubledHand);

        expectedUnits += probability * resolveAfterHandEnds(nextState, nextDeck, caches);
      }

      return expectedUnits - DOUBLE_COST_UNITS;
    }

    case Action.SPLIT: {
      const pairValue = hand.pairValue;
      if (pairValue === null) {
        throw new Error('Split requested on a non-pair hand');
      }

      const splitAces = pairValue === 11;
      const firstDrawTotal = totalCards(deckCounts);
      let expectedUnits = 0;

      for (let firstIndex = 0; firstIndex < CARD_VALUES.length; firstIndex++) {
        const firstCount = deckCounts[firstIndex];
        if (firstCount <= 0) continue;

        const firstValue = CARD_VALUES[firstIndex];
        const probabilityFirst = firstCount / firstDrawTotal;
        const deckAfterFirst = deckCounts.slice();
        deckAfterFirst[firstIndex]--;
        const secondDrawTotal = totalCards(deckAfterFirst);
        const handOne = drawCardToHand(createHandFromValues([pairValue], {
          betUnits: 1,
          canAct: false,
        }), firstValue, { forceStand: splitAces });

        for (let secondIndex = 0; secondIndex < CARD_VALUES.length; secondIndex++) {
          const secondCount = deckAfterFirst[secondIndex];
          if (secondCount <= 0) continue;

          const secondValue = CARD_VALUES[secondIndex];
          const probabilitySecond = secondCount / secondDrawTotal;
          const deckAfterSecond = deckAfterFirst.slice();
          deckAfterSecond[secondIndex]--;
          const handTwo = drawCardToHand(createHandFromValues([pairValue], {
            betUnits: 1,
            canAct: false,
          }), secondValue, { forceStand: splitAces });

          const splitState = {
            ...state,
            hands: [handOne, handTwo],
            activeIndex: handOne.canAct ? 0 : handTwo.canAct ? 1 : 1,
            canInsurance: false,
            canSurrender: false,
          };

          const branchUnits = handOne.canAct || handTwo.canAct
            ? solvePlayerState(splitState, deckAfterSecond, caches).evUnits
            : resolveDealerState(splitState, deckAfterSecond, caches);

          expectedUnits += probabilityFirst * probabilitySecond * branchUnits;
        }
      }

      return expectedUnits - SPLIT_COST_UNITS;
    }

    case Action.SURRENDER:
      return 0.5;

    case Action.INSURANCE: {
      const nextState = {
        ...state,
        insuranceTaken: true,
        canInsurance: false,
        canSurrender: false,
      };
      return solvePlayerState(nextState, deckCounts, caches).evUnits - INSURANCE_COST_UNITS;
    }

    default:
      throw new Error(`Unsupported blackjack action: ${action}`);
  }
}

function solvePlayerState(state, deckCounts, caches, allowedActions = null) {
  const memoKey = `${deckCounts.join(',')}|${stateKey(state, allowedActions)}`;
  const cached = caches.player.get(memoKey);
  if (cached) {
    return cached;
  }

  if (
    Number.isFinite(caches?.maxPlayerStates) &&
    caches.maxPlayerStates > 0 &&
    caches.player.size >= caches.maxPlayerStates
  ) {
    throw new Error(SOLVER_BUDGET_EXCEEDED_ERROR);
  }

  const actions = getAvailableSolverActions(state, allowedActions);
  if (actions.length === 0) {
    const terminal = {
      action: null,
      evUnits: resolveDealerState(state, deckCounts, caches),
      actionValues: {},
    };
    caches.player.set(memoKey, terminal);
    return terminal;
  }

  let bestDecision = null;
  const actionValues = {};

  for (const action of actions) {
    const evUnits = evaluateAction(state, deckCounts, action, caches);
    actionValues[action] = evUnits;
    const candidate = { action, evUnits };

    if (!bestDecision || compareDecisions(candidate, bestDecision) > 0) {
      bestDecision = candidate;
    }
  }

  const result = {
    ...bestDecision,
    actionValues,
  };
  caches.player.set(memoKey, result);
  return result;
}

function getBetUnits(handBet, initialBet) {
  if (!initialBet || initialBet <= 0n) {
    return handBet > 0n ? 1 : 0;
  }

  return Number(handBet / initialBet);
}

function buildDeckCounts(gameState) {
  const deckCounts = FULL_DECK_COUNTS.slice();
  const removeCard = (card) => {
    const index = VALUE_TO_INDEX.get(card.value);
    if (index === undefined || deckCounts[index] <= 0) {
      throw new Error(`Invalid or duplicate visible card value: ${card.value}`);
    }
    deckCounts[index]--;
  };

  for (const hand of gameState.playerHands || []) {
    for (const card of hand.cards || []) {
      removeCard(card);
    }
  }

  for (const card of gameState.dealerHand?.cards || []) {
    removeCard(card);
  }

  return deckCounts;
}

function buildSolverState(gameState) {
  const hands = (gameState.playerHands || [])
    .filter((hand) => (hand.cards || []).length > 0)
    .map((hand, index) => {
      const values = hand.cards.map((card) => card.value);
      return createHandFromValues(values, {
        betUnits: getBetUnits(hand.bet, gameState.initialBet),
        canAct: Boolean(hand.isActive && hand.handValue < 21),
        isNaturalBlackjack: Boolean(index === 0 && gameState.playerHands[1]?.cards?.length === 0 && hand.isBlackjack),
      });
    });

  if (hands.length === 0) {
    throw new Error('Blackjack EV solver requires at least one player hand');
  }

  const dealerUpcard = gameState.dealerHand?.cards?.[0]?.value;
  if (!dealerUpcard) {
    throw new Error('Blackjack EV solver requires a visible dealer upcard');
  }

  return {
    dealerUpcard,
    hands,
    activeIndex: Math.min(gameState.activeHandIndex || 0, hands.length - 1),
    insuranceTaken: Boolean(gameState.insuranceBet?.hasBet),
    canInsurance: false,
    canSurrender: false,
  };
}

function inferOptionalActions(gameState) {
  const playerHands = gameState.playerHands || [];
  const mainHand = playerHands[0];
  const splitHand = playerHands[1];
  const dealerCards = gameState.dealerHand?.cards || [];

  const firstDecision = Boolean(
    mainHand &&
    mainHand.isActive &&
    (mainHand.cards || []).length === 2 &&
    (splitHand?.cards || []).length === 0 &&
    dealerCards.length === 1 &&
    !gameState.insuranceBet?.hasBet &&
    !gameState.surrendered &&
    (gameState.activeHandIndex || 0) === 0
  );

  return {
    canInsurance: firstDecision && dealerCards[0]?.value === 11,
    canSurrender: firstDecision,
  };
}

function valueLabel(value) {
  return value === 11 ? 'A' : String(value);
}

function describeSpot(gameState) {
  const hands = (gameState.playerHands || []).filter((hand) => (hand.cards || []).length > 0);
  const activeHand = hands[Math.min(gameState.activeHandIndex || 0, hands.length - 1)];
  const dealerUpcard = gameState.dealerHand?.cards?.[0]?.value;
  const dealerLabel = valueLabel(dealerUpcard);

  if (!activeHand || !dealerUpcard) {
    return 'current hand';
  }

  const prefix = hands.length > 1 ? `hand ${Math.min((gameState.activeHandIndex || 0) + 1, hands.length)} ` : '';
  const values = activeHand.cards.map((card) => card.value);
  const isPair = values.length === 2 && values[0] === values[1];

  if (isPair) {
    return `${prefix}pair of ${valueLabel(values[0])}s vs ${dealerLabel}`;
  }

  if (activeHand.isSoft) {
    return `${prefix}soft ${activeHand.handValue} vs ${dealerLabel}`;
  }

  return `${prefix}hard ${activeHand.handValue} vs ${dealerLabel}`;
}

export function getBlackjackActionEVs(gameState, { allowedActions = null, maxPlayerStates = null } = {}) {
  const solverState = buildSolverState(gameState);
  const deckCounts = buildDeckCounts(gameState);
  const allowed = actionSet(allowedActions);
  const optionalActions = inferOptionalActions(gameState);

  const rootState = {
    ...solverState,
    canInsurance: optionalActions.canInsurance && (!allowed || allowed.has(Action.INSURANCE)),
    canSurrender: optionalActions.canSurrender && (!allowed || allowed.has(Action.SURRENDER)),
  };

  const caches = {
    player: new Map(),
    dealer: new Map(),
    maxPlayerStates,
  };

  return solvePlayerState(rootState, deckCounts, caches, allowed).actionValues;
}

export function getBestActionByEV(gameState, { allowedActions = null, maxPlayerStates = null } = {}) {
  const solverState = buildSolverState(gameState);
  const deckCounts = buildDeckCounts(gameState);
  const allowed = actionSet(allowedActions);
  const optionalActions = inferOptionalActions(gameState);
  const rootState = {
    ...solverState,
    canInsurance: optionalActions.canInsurance && (!allowed || allowed.has(Action.INSURANCE)),
    canSurrender: optionalActions.canSurrender && (!allowed || allowed.has(Action.SURRENDER)),
  };

  const caches = {
    player: new Map(),
    dealer: new Map(),
    maxPlayerStates,
  };

  const result = solvePlayerState(rootState, deckCounts, caches, allowed);
  return {
    ...result,
    reason: describeSpot(gameState),
  };
}
