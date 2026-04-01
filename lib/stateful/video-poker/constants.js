/**
 * Video Poker (Gimboz Poker) Constants
 */
import { VIDEO_POKER_CONTRACT } from '../../constants.js';

export { VIDEO_POKER_CONTRACT };

// Game states
export const GameState = {
  INITIAL_DEAL: 0,
  PLAYER_DECISION: 1,
  AWAITING_REDRAW: 2,
  HAND_COMPLETE: 3,
};

export const GameStateNames = {
  0: 'INITIAL_DEAL',
  1: 'PLAYER_DECISION',
  2: 'AWAITING_REDRAW',
  3: 'HAND_COMPLETE',
};

// Hand rankings
export const HandStatus = {
  NOTHING: 0,
  JACKS_OR_BETTER: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
  ROYAL_FLUSH: 9,
};

export const HandStatusNames = {
  0: 'Nothing',
  1: 'Jacks or Better',
  2: 'Two Pair',
  3: 'Three of a Kind',
  4: 'Straight',
  5: 'Flush',
  6: 'Full House',
  7: 'Four of a Kind',
  8: 'Straight Flush',
  9: 'Royal Flush',
};

// Payout multipliers
export const PAYOUTS = {
  [HandStatus.NOTHING]: 0,
  [HandStatus.JACKS_OR_BETTER]: 1,
  [HandStatus.TWO_PAIR]: 2,
  [HandStatus.THREE_OF_A_KIND]: 3,
  [HandStatus.STRAIGHT]: 4,
  [HandStatus.FLUSH]: 6,
  [HandStatus.FULL_HOUSE]: 9,
  [HandStatus.FOUR_OF_A_KIND]: 25,
  [HandStatus.STRAIGHT_FLUSH]: 50,
  [HandStatus.ROYAL_FLUSH]: 250,
};

// Fixed bet amounts (APE)
export const BET_AMOUNTS = [1, 5, 10, 25, 50, 100];
export const MAX_BET_INDEX = 5; // 100 APE - jackpot eligible

// Card constants
export const CARDS_PER_HAND = 5;

export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['♥', '♦', '♣', '♠'];
export const SUIT_NAMES = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];

// Contract ABI (minimal for our needs)
export const VIDEO_POKER_ABI = [
  // Read functions
  {
    name: 'vrfFeeInitial',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'vrfFeeRedraw',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'getBetAmounts',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256[]' }],
  },
  {
    name: 'getGameInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'player', type: 'address' },
          { name: 'betAmount', type: 'uint256' },
          { name: 'totalPayout', type: 'uint256' },
          {
            name: 'initialCards',
            type: 'tuple[5]',
            components: [
              { name: 'rank', type: 'uint8' },
              { name: 'suit', type: 'uint8' },
            ],
          },
          {
            name: 'finalCards',
            type: 'tuple[5]',
            components: [
              { name: 'rank', type: 'uint8' },
              { name: 'suit', type: 'uint8' },
            ],
          },
          { name: 'gameState', type: 'uint8' },
          { name: 'handStatus', type: 'uint8' },
          { name: 'awaitingRNG', type: 'bool' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'jackpot',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // Write functions
  {
    name: 'play',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'player', type: 'address' },
      { name: 'gameData', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'playerRedraw',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'gameId', type: 'uint256' },
      { name: 'cardsToRedraw', type: 'bool[]' },
    ],
    outputs: [],
  },
];
