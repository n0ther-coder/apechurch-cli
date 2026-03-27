/**
 * Blackjack State Management
 * Handles game state parsing, action availability, and balance checks
 */
import { formatEther } from 'viem';
import {
  GameState,
  GameStateNames,
  HandStatus,
  HandStatusNames,
  Action,
  BLACKJACK_CONTRACT,
  BLACKJACK_ABI,
} from './constants.js';
import { createClients } from '../../wallet.js';
import { parseCardStruct, cardToString, RANKS, SUITS } from '../display.js';
import { formatBlackjackStake } from './format.js';

/**
 * Fetch VRF fee from contract
 */
export async function getVrfFee(publicClient) {
  return await publicClient.readContract({
    address: BLACKJACK_CONTRACT,
    abi: BLACKJACK_ABI,
    functionName: 'vrfFee',
  });
}

/**
 * Fetch and parse game info from contract
 */
export async function getGameState(publicClient, gameId) {
  const raw = await publicClient.readContract({
    address: BLACKJACK_CONTRACT,
    abi: BLACKJACK_ABI,
    functionName: 'getGameInfo',
    args: [BigInt(gameId)],
  });
  
  return parseGameInfo(raw, gameId);
}

/**
 * Parse raw contract game info into friendly format
 */
export function parseGameInfo(raw, gameId) {
  return {
    gameId: gameId.toString(),
    user: raw.user,
    gameState: Number(raw.gameState),
    gameStateName: GameStateNames[Number(raw.gameState)],
    activeHandIndex: Number(raw.activeHandIndex),
    playerHands: [
      parseHand(raw.playerHands[0]),
      parseHand(raw.playerHands[1]),
    ],
    dealerHand: parseHand(raw.dealerHand),
    sideBets: [
      parseSideBet(raw.sideBets[0]),
      parseSideBet(raw.sideBets[1]),
    ],
    insuranceBet: parseSideBet(raw.insuranceBet),
    awaitingRandomNumber: raw.awaitingRandomNumber,
    initialBet: raw.initialBet,
    totalBet: raw.totalBet,
    totalPayout: raw.totalPayout,
    surrendered: raw.surrendered,
    timestamp: Number(raw.timestamp),
    
    // Computed helpers
    isComplete: Number(raw.gameState) === GameState.HAND_COMPLETE,
    isPlayerTurn: !raw.awaitingRandomNumber && 
      [GameState.PLAYER_ACTION, GameState.SPLIT_ACTION_1, GameState.SPLIT_ACTION_2]
        .includes(Number(raw.gameState)),
  };
}

/**
 * Parse a hand struct
 */
function parseHand(hand) {
  const cards = hand.cards.map(c => {
    const rawCard = Number(c.rawCard);
    const parsed = parseCardStruct({ value: Number(c.value), rawCard });
    return {
      value: parsed.value,
      rawCard,
      rank: parsed.rank,
      suit: parsed.suit,
      display: cardToString(parsed),
    };
  });
  
  return {
    cards,
    handValue: Number(hand.handValue),
    isSoft: hand.isSoft,
    status: Number(hand.status),
    statusName: HandStatusNames[Number(hand.status)],
    bet: hand.bet,
    isActive: Number(hand.status) === HandStatus.ACTIVE,
    isBusted: Number(hand.status) === HandStatus.BUSTED,
    isBlackjack: Number(hand.status) === HandStatus.BLACKJACK,
  };
}

/**
 * Parse a side bet struct
 */
function parseSideBet(sb) {
  return {
    bet: sb.bet,
    amountForHouse: sb.amountForHouse,
    payout: sb.payout,
    hasBet: sb.bet > 0n,
  };
}

/**
 * Get the active hand based on game state
 */
export function getActiveHand(state) {
  return state.playerHands[state.activeHandIndex];
}

/**
 * Determine available actions based on game state and balance
 */
export function getAvailableActions(state, balance, vrfFee) {
  const actions = [];
  
  // Game must not be complete or awaiting RNG
  if (state.isComplete || state.awaitingRandomNumber) {
    return actions;
  }
  
  const activeHand = getActiveHand(state);
  const gameState = state.gameState;
  const initialBet = state.initialBet;
  
  // Check if this is the first action (for insurance/surrender)
  const isFirstAction = 
    gameState === GameState.PLAYER_ACTION &&
    state.playerHands[0].cards.length === 2 &&
    state.dealerHand.cards.length === 1 &&
    state.insuranceBet.bet === 0n &&
    !state.surrendered;
  
  // Insurance - dealer shows Ace, first action only
  if (isFirstAction && state.dealerHand.cards[0]?.value === 11) {
    const insuranceBet = initialBet / 2n;
    const canAfford = balance >= insuranceBet;
    actions.push({
      action: Action.INSURANCE,
      key: 'i',
      label: 'Insurance',
      cost: insuranceBet,
      betCost: insuranceBet,  // Extra bet to display
      canAfford,
      shortfall: canAfford ? 0n : insuranceBet - balance,
    });
  }
  
  // Surrender - first action only, no insurance
  if (isFirstAction && state.insuranceBet.bet === 0n) {
    actions.push({
      action: Action.SURRENDER,
      key: 'r',
      label: 'Surrender',
      cost: 0n,
      betCost: 0n,
      canAfford: true,
      shortfall: 0n,
    });
  }
  
  // Standard actions require active hand
  if (!activeHand.isActive) {
    return actions;
  }
  
  // Hit - always available on active hand
  const hitCost = vrfFee;
  actions.push({
    action: Action.HIT,
    key: 'h',
    label: 'Hit',
    cost: hitCost,
    betCost: 0n,  // Gas only, no extra bet
    canAfford: balance >= hitCost,
    shortfall: balance >= hitCost ? 0n : hitCost - balance,
  });
  
  // Stand - always available on active hand
  // VRF cost is 0 if SPLIT_ACTION_1 and hand 2 is ACTIVE
  let standCost = vrfFee;
  if (gameState === GameState.SPLIT_ACTION_1 && 
      state.playerHands[1].status === HandStatus.ACTIVE) {
    standCost = 0n;
  }
  actions.push({
    action: Action.STAND,
    key: 's',
    label: 'Stand',
    cost: standCost,
    betCost: 0n,  // Gas only, no extra bet
    canAfford: balance >= standCost,
    shortfall: balance >= standCost ? 0n : standCost - balance,
  });
  
  // Double - only on first 2 cards
  if (activeHand.cards.length === 2) {
    const doubleCost = initialBet + vrfFee;
    const canAfford = balance >= doubleCost;
    actions.push({
      action: Action.DOUBLE,
      key: 'd',
      label: 'Double',
      cost: doubleCost,
      betCost: initialBet,  // Extra bet amount to display
      canAfford,
      shortfall: canAfford ? 0n : doubleCost - balance,
    });
  }
  
  // Split - main hand only, pair by VALUE, not already split
  if (gameState === GameState.PLAYER_ACTION &&
      state.playerHands[0].cards.length === 2 &&
      state.playerHands[1].bet === 0n &&
      state.playerHands[0].cards[0].value === state.playerHands[0].cards[1].value) {
    const splitCost = initialBet + vrfFee;
    const canAfford = balance >= splitCost;
    actions.push({
      action: Action.SPLIT,
      key: 'x',
      label: 'Split',
      cost: splitCost,
      betCost: initialBet,  // Extra bet amount to display
      canAfford,
      shortfall: canAfford ? 0n : splitCost - balance,
    });
  }
  
  return actions;
}

/**
 * Format action for display with extra bet cost (not gas)
 * Only shows amount for actions requiring additional wager (Double, Split, Insurance)
 */
export function formatActionLabel(action, showCost = true) {
  // Only show cost if there's an extra bet (not just gas)
  const betCost = action.betCost ?? 0n;
  if (!showCost || betCost === 0n) {
    return action.label;
  }
  const betApe = formatBlackjackStake(betCost);
  return `${action.label} (+${betApe} APE)`;
}

/**
 * Format action unavailable message
 */
export function formatActionUnavailable(action) {
  if (action.canAfford) return null;
  const shortfallApe = parseFloat(formatEther(action.shortfall)).toFixed(2);
  return `need ${shortfallApe} more APE`;
}

/**
 * Calculate net result for completed game
 */
export function calculateNetResult(state) {
  if (!state.isComplete) return null;
  
  const totalWagered = state.totalBet;
  const totalPayout = state.totalPayout;
  const net = totalPayout - totalWagered;
  
  return {
    wagered: totalWagered,
    payout: totalPayout,
    net,
    won: net > 0n,
    push: net === 0n && totalPayout > 0n,
  };
}
