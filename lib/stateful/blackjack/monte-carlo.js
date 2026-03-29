import {
  calculateLoopRunoutEstimate,
  calculateMonteCarloLoopRunoutEstimate,
  getBlackjackEstimatedLossPerGameApe,
} from '../../loop-estimate.js';
import { getOptimalAction } from './strategy.js';

const FULL_DECK_VALUES = [];
for (let rank = 1; rank <= 13; rank++) {
  const value = rank === 1 ? 11 : rank >= 10 ? 10 : rank;
  for (let suit = 0; suit < 4; suit++) {
    FULL_DECK_VALUES.push(value);
  }
}

const PLAYER_SIDE_DIAMOND_SEVENS_PROBABILITY = 1 / 2704;
const PLAYER_SIDE_PERFECT_PAIR_PROBABILITY = 51 / 2704;
const PLAYER_SIDE_NATURAL_BLACKJACK_PROBABILITY = 128 / 2704;
const PLAYER_SIDE_DIAMOND_SEVENS_PAYOUT = 500;
const PLAYER_SIDE_PERFECT_PAIR_PAYOUT = 20;
const PLAYER_SIDE_NATURAL_BLACKJACK_PAYOUT = 5;
const INSURANCE_THRESHOLD = 1 / 3;
const DEFAULT_BLACKJACK_MONTE_CARLO_SESSION_COUNT = 250;
const MIN_BLACKJACK_MONTE_CARLO_SESSION_COUNT = 25;
const MAX_BLACKJACK_MONTE_CARLO_TOTAL_GAMES = 250000;
const DEFAULT_BLACKJACK_MONTE_CARLO_CAP_MULTIPLIER = 3;
const MIN_BLACKJACK_MONTE_CARLO_MAX_GAMES_CAP = 100;

function createDeck(deckValues = null) {
  return (deckValues || FULL_DECK_VALUES).slice();
}

function drawCard(deck, rng) {
  if (!deck.length) {
    throw new Error('Cannot draw from an empty blackjack deck');
  }

  const index = Math.floor(rng() * deck.length);
  return deck.splice(index, 1)[0];
}

function getHandState(cards) {
  let total = 0;
  let softAces = 0;

  for (const value of cards) {
    total += value;
    if (value === 11) {
      softAces++;
    }
  }

  while (total > 21 && softAces > 0) {
    total -= 10;
    softAces--;
  }

  return {
    total,
    isSoft: softAces > 0,
  };
}

function isPair(cards) {
  return cards.length === 2 && cards[0] === cards[1];
}

function isBlackjack(cards) {
  return cards.length === 2 && getHandState(cards).total === 21;
}

function shouldDealerStand(cards) {
  const { total } = getHandState(cards);
  return total >= 17;
}

function selectAction(hand, dealerUpcard, {
  canDouble,
  canSplit,
  canSurrender,
  canHit,
  canStand,
} = {}) {
  const affordableActions = [];
  if (canSurrender) affordableActions.push('surrender');
  if (canSplit) affordableActions.push('split');
  if (canDouble) affordableActions.push('double');
  if (canStand) affordableActions.push('stand');
  if (canHit) affordableActions.push('hit');

  if (affordableActions.length === 0) {
    return null;
  }

  const optimal = getOptimalAction(
    hand.map((value) => ({ value })),
    dealerUpcard,
    { canDouble, canSplit, canSurrender },
  );

  if (affordableActions.includes(optimal.action)) {
    return optimal.action;
  }

  if (canHit) return 'hit';
  if (canStand) return 'stand';
  return affordableActions[0];
}

function samplePlayerSidePayoutApe(playerSideApe, rng) {
  const safePlayerSideApe = Math.max(Number(playerSideApe) || 0, 0);
  if (safePlayerSideApe <= 0) {
    return 0;
  }

  const roll = rng();
  if (roll < PLAYER_SIDE_DIAMOND_SEVENS_PROBABILITY) {
    return safePlayerSideApe * PLAYER_SIDE_DIAMOND_SEVENS_PAYOUT;
  }

  if (roll < PLAYER_SIDE_DIAMOND_SEVENS_PROBABILITY + PLAYER_SIDE_PERFECT_PAIR_PROBABILITY) {
    return safePlayerSideApe * PLAYER_SIDE_PERFECT_PAIR_PAYOUT;
  }

  if (
    roll <
    PLAYER_SIDE_DIAMOND_SEVENS_PROBABILITY +
      PLAYER_SIDE_PERFECT_PAIR_PROBABILITY +
      PLAYER_SIDE_NATURAL_BLACKJACK_PROBABILITY
  ) {
    return safePlayerSideApe * PLAYER_SIDE_NATURAL_BLACKJACK_PAYOUT;
  }

  return 0;
}

function countTenValueCards(deck) {
  let count = 0;
  for (let index = 0; index < deck.length; index++) {
    if (deck[index] === 10) {
      count++;
    }
  }
  return count;
}

function resolveDealerHand(deck, dealerUpcard, rng) {
  const dealerCards = [dealerUpcard, drawCard(deck, rng)];

  while (!shouldDealerStand(dealerCards)) {
    dealerCards.push(drawCard(deck, rng));
  }

  const { total } = getHandState(dealerCards);
  return {
    cards: dealerCards,
    total,
    isBlackjack: isBlackjack(dealerCards),
    isBust: total > 21,
  };
}

function settleHandPayout(hand, dealerOutcome) {
  if (hand.surrendered) {
    return hand.bet / 2;
  }

  const { total } = getHandState(hand.cards);
  if (total > 21) {
    return 0;
  }

  if (dealerOutcome.isBust) {
    return hand.bet * 2;
  }

  if (dealerOutcome.total < total) {
    return hand.bet * 2;
  }

  if (dealerOutcome.total === total) {
    return hand.bet;
  }

  return 0;
}

export function simulateBlackjackGameNetDeltaApe({
  mainBetApe,
  playerSideApe = 0,
  vrfFeeApe = 0,
  availableApe,
  rng = Math.random,
  deckValues = null,
} = {}) {
  const safeMainBetApe = Math.max(Number(mainBetApe) || 0, 0);
  const safePlayerSideApe = Math.max(Number(playerSideApe) || 0, 0);
  const safeVrfFeeApe = Math.max(Number(vrfFeeApe) || 0, 0);
  let available = Math.max(Number(availableApe) || 0, 0);
  let netDeltaApe = 0;
  const sidePayoutApe = samplePlayerSidePayoutApe(safePlayerSideApe, rng);
  const deck = createDeck(deckValues);

  netDeltaApe -= safeMainBetApe + safePlayerSideApe + safeVrfFeeApe;
  available -= safeMainBetApe + safePlayerSideApe + safeVrfFeeApe;

  const playerCards = [drawCard(deck, rng), drawCard(deck, rng)];
  const dealerUpcard = drawCard(deck, rng);

  if (isBlackjack(playerCards)) {
    let payoutApe = safeMainBetApe * 2.5;
    if (dealerUpcard === 10 || dealerUpcard === 11) {
      const dealerCheckCard = drawCard(deck, rng);
      if (isBlackjack([dealerUpcard, dealerCheckCard])) {
        payoutApe = safeMainBetApe;
      }
    }

    return {
      netDeltaApe: netDeltaApe + payoutApe + sidePayoutApe,
      terminal: false,
    };
  }

  const hands = [{
    cards: playerCards.slice(),
    bet: safeMainBetApe,
    splitAces: false,
    surrendered: false,
  }];

  let insuranceTaken = false;

  for (let handIndex = 0; handIndex < hands.length; handIndex++) {
    while (true) {
      const hand = hands[handIndex];
      const { total } = getHandState(hand.cards);

      if (hand.surrendered || total > 21 || total === 21 || (hand.splitAces && hand.cards.length === 2)) {
        break;
      }

      const isFirstDecision = handIndex === 0 && hands.length === 1 && hand.cards.length === 2 && !insuranceTaken;

      if (isFirstDecision && dealerUpcard === 11 && available >= safeMainBetApe / 2) {
        const insuranceProbability = countTenValueCards(deck) / deck.length;
        if (insuranceProbability > INSURANCE_THRESHOLD) {
          netDeltaApe -= safeMainBetApe / 2;
          available -= safeMainBetApe / 2;
          insuranceTaken = true;
        }
      }

      const canHit = available >= safeVrfFeeApe;
      const standCostApe = hands.length === 2 && handIndex === 0 ? 0 : safeVrfFeeApe;
      const canStand = available >= standCostApe;
      const canDouble = hand.cards.length === 2 && available >= safeMainBetApe + safeVrfFeeApe;
      const canSplit = hands.length === 1 && isPair(hand.cards) && available >= safeMainBetApe + safeVrfFeeApe;
      const canSurrender = isFirstDecision;

      const action = selectAction(hand.cards, dealerUpcard, {
        canDouble,
        canSplit,
        canSurrender,
        canHit,
        canStand,
      });

      if (!action) {
        return {
          netDeltaApe: netDeltaApe + sidePayoutApe,
          terminal: true,
        };
      }

      if (action === 'surrender') {
        hand.surrendered = true;
        return {
          netDeltaApe: netDeltaApe + (safeMainBetApe / 2) + sidePayoutApe,
          terminal: false,
        };
      }

      if (action === 'split') {
        netDeltaApe -= safeMainBetApe + safeVrfFeeApe;
        available -= safeMainBetApe + safeVrfFeeApe;
        const pairValue = hand.cards[0];
        const splitAces = pairValue === 11;
        const firstHand = {
          cards: [pairValue, drawCard(deck, rng)],
          bet: safeMainBetApe,
          splitAces,
          surrendered: false,
        };
        const secondHand = {
          cards: [pairValue, drawCard(deck, rng)],
          bet: safeMainBetApe,
          splitAces,
          surrendered: false,
        };
        hands.splice(handIndex, 1, firstHand, secondHand);
        break;
      }

      if (action === 'double') {
        netDeltaApe -= safeMainBetApe + safeVrfFeeApe;
        available -= safeMainBetApe + safeVrfFeeApe;
        hand.bet += safeMainBetApe;
        hand.cards.push(drawCard(deck, rng));
        break;
      }

      if (action === 'stand') {
        netDeltaApe -= standCostApe;
        available -= standCostApe;
        break;
      }

      if (action === 'hit') {
        netDeltaApe -= safeVrfFeeApe;
        available -= safeVrfFeeApe;
        hand.cards.push(drawCard(deck, rng));
        continue;
      }
    }
  }

  const liveHands = hands.filter((hand) => {
    if (hand.surrendered) return true;
    return getHandState(hand.cards).total <= 21;
  });

  if (liveHands.length === 0) {
    return {
      netDeltaApe: netDeltaApe + sidePayoutApe,
      terminal: false,
    };
  }

  const dealerOutcome = resolveDealerHand(deck, dealerUpcard, rng);
  let mainPayoutApe = 0;

  if (insuranceTaken && dealerOutcome.isBlackjack) {
    mainPayoutApe += safeMainBetApe;
  }

  for (const hand of hands) {
    mainPayoutApe += settleHandPayout(hand, dealerOutcome);
  }

  return {
    netDeltaApe: netDeltaApe + mainPayoutApe + sidePayoutApe,
    terminal: false,
  };
}

export function estimateBlackjackLoopRunoutMonteCarlo({
  balanceApe,
  availableApe,
  stopLossApe = null,
  mainBetApe,
  playerSideApe = 0,
  vrfFeeApe = 0,
  sessionCount = DEFAULT_BLACKJACK_MONTE_CARLO_SESSION_COUNT,
  maxGamesCap = null,
  rng = Math.random,
  deckFactory = null,
} = {}) {
  const safeMainBetApe = Math.max(Number(mainBetApe) || 0, 0);
  const safePlayerSideApe = Math.max(Number(playerSideApe) || 0, 0);
  const safeVrfFeeApe = Math.max(Number(vrfFeeApe) || 0, 0);
  const safeRequestedSessionCount = Math.max(1, Math.floor(Number(sessionCount) || 0));
  const expectedLossPerGameApe = getBlackjackEstimatedLossPerGameApe({
    mainBetApe: safeMainBetApe,
    playerSideApe: safePlayerSideApe,
    vrfFeeApe: safeVrfFeeApe,
  });
  const evEstimate = calculateLoopRunoutEstimate({
    balanceApe,
    availableApe,
    stopLossApe,
    expectedLossPerGameApe,
  });

  if (evEstimate.positiveEv || evEstimate.estimatedGames === null) {
    return evEstimate;
  }

  const projectedGames = Math.max(evEstimate.estimatedGames, 1);
  const sessionBudget = Math.floor(MAX_BLACKJACK_MONTE_CARLO_TOTAL_GAMES / projectedGames);

  // Avoid blocking the CLI on huge bankroll / tiny bet scenarios where a
  // full blackjack Monte Carlo would simulate millions of hands up front.
  if (sessionBudget < MIN_BLACKJACK_MONTE_CARLO_SESSION_COUNT) {
    return evEstimate;
  }

  const boundedSessionCount = Math.min(safeRequestedSessionCount, sessionBudget);
  const boundedMaxGamesCap = maxGamesCap === null
    ? Math.max(
      MIN_BLACKJACK_MONTE_CARLO_MAX_GAMES_CAP,
      Math.ceil(projectedGames * DEFAULT_BLACKJACK_MONTE_CARLO_CAP_MULTIPLIER)
    )
    : maxGamesCap;

  return calculateMonteCarloLoopRunoutEstimate({
    balanceApe,
    availableApe,
    stopLossApe,
    requiredApeToStart: safeMainBetApe + safePlayerSideApe + safeVrfFeeApe,
    sampleGameNetDeltaApe: ({ availableApe: currentAvailableApe, rng: gameRng }) => (
      simulateBlackjackGameNetDeltaApe({
        mainBetApe: safeMainBetApe,
        playerSideApe: safePlayerSideApe,
        vrfFeeApe: safeVrfFeeApe,
        availableApe: currentAvailableApe,
        rng: gameRng,
        deckValues: deckFactory ? deckFactory() : null,
      })
    ),
    sessionCount: boundedSessionCount,
    maxGamesCap: boundedMaxGamesCap,
    rng,
  });
}

export function sampleBlackjackPlayerSidePayoutApe(playerSideApe, rng = Math.random) {
  return samplePlayerSidePayoutApe(playerSideApe, rng);
}
