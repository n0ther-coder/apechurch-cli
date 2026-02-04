/**
 * Video Poker State Management
 */
import { formatEther } from 'viem';
import {
  VIDEO_POKER_CONTRACT,
  VIDEO_POKER_ABI,
  GameState,
  GameStateNames,
  HandStatus,
  HandStatusNames,
  PAYOUTS,
  BET_AMOUNTS,
  RANKS,
  SUITS,
} from './constants.js';

/**
 * Fetch VRF fees from contract
 */
export async function getVrfFees(publicClient) {
  const [initial, redraw] = await Promise.all([
    publicClient.readContract({
      address: VIDEO_POKER_CONTRACT,
      abi: VIDEO_POKER_ABI,
      functionName: 'vrfFeeInitial',
    }),
    publicClient.readContract({
      address: VIDEO_POKER_CONTRACT,
      abi: VIDEO_POKER_ABI,
      functionName: 'vrfFeeRedraw',
    }),
  ]);
  return { initial, redraw };
}

/**
 * Fetch current jackpot
 */
export async function getJackpot(publicClient) {
  return await publicClient.readContract({
    address: VIDEO_POKER_CONTRACT,
    abi: VIDEO_POKER_ABI,
    functionName: 'jackpot',
  });
}

/**
 * Fetch and parse game info from contract
 */
export async function getGameState(publicClient, gameId) {
  const raw = await publicClient.readContract({
    address: VIDEO_POKER_CONTRACT,
    abi: VIDEO_POKER_ABI,
    functionName: 'getGameInfo',
    args: [BigInt(gameId)],
  });
  
  return parseGameInfo(raw, gameId);
}

/**
 * Parse raw contract game info into friendly format
 */
export function parseGameInfo(raw, gameId) {
  const gameState = Number(raw.gameState);
  const handStatus = Number(raw.handStatus);
  const isComplete = gameState === GameState.HAND_COMPLETE;
  const awaitingDecision = gameState === GameState.PLAYER_DECISION && !raw.awaitingRNG;
  
  return {
    gameId: gameId.toString(),
    player: raw.player,
    betAmount: raw.betAmount,
    betAmountApe: parseFloat(formatEther(raw.betAmount)),
    totalPayout: raw.totalPayout,
    totalPayoutApe: parseFloat(formatEther(raw.totalPayout)),
    initialCards: parseCards(raw.initialCards),
    finalCards: parseCards(raw.finalCards),
    gameState,
    gameStateName: GameStateNames[gameState],
    handStatus,
    handStatusName: HandStatusNames[handStatus],
    awaitingRNG: raw.awaitingRNG,
    timestamp: Number(raw.timestamp),
    isComplete,
    awaitingDecision,
    payout: PAYOUTS[handStatus] || 0,
  };
}

/**
 * Parse card array from contract
 */
function parseCards(cards) {
  return cards.map((card, index) => ({
    index,
    rank: Number(card.rank),
    suit: Number(card.suit),
    rankName: RANKS[Number(card.rank)] || '?',
    suitSymbol: SUITS[Number(card.suit)] || '?',
    isEmpty: Number(card.rank) === 0,
  }));
}

/**
 * Format a card for display
 */
export function formatCard(card) {
  if (card.isEmpty) return '🂠';
  return `${card.rankName}${card.suitSymbol}`;
}

/**
 * Format hand for display
 */
export function formatHand(cards) {
  return cards.map(formatCard).join(' ');
}

/**
 * Get the cards to display (initial or final depending on state)
 */
export function getDisplayCards(state) {
  if (state.gameState === GameState.HAND_COMPLETE) {
    // Show final cards if any were redrawn, otherwise initial
    const hasRedraws = state.finalCards.some(c => !c.isEmpty);
    return hasRedraws ? state.finalCards : state.initialCards;
  }
  return state.initialCards;
}

/**
 * Validate bet amount index
 */
export function validateBetAmount(amount) {
  const ape = parseFloat(amount);
  const index = BET_AMOUNTS.indexOf(ape);
  if (index === -1) {
    return {
      valid: false,
      error: `Invalid bet amount. Choose from: ${BET_AMOUNTS.join(', ')} APE`,
    };
  }
  return { valid: true, index, amount: ape };
}
