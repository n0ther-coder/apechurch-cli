/**
 * @fileoverview Blackjack Contract Constants and ABI
 *
 * Contains all constants needed to interact with the Blackjack smart contract:
 * - Contract address
 * - Game state enums (READY, PLAYER_ACTION, SPLIT_ACTION, DEALER_TURN, HAND_COMPLETE)
 * - Hand status enums (ACTIVE, STOOD, BUSTED, BLACKJACK)
 * - Action enums (HIT, STAND, DOUBLE, SPLIT, INSURANCE, SURRENDER)
 * - Contract ABI for all read and write functions
 *
 * @module lib/stateful/blackjack/constants
 */

// Contract address on ApeChain
export const BLACKJACK_CONTRACT = '0x03AC9d823cCc27df9F0981FD3975Ca6F13067Ed7';

// Game states (from contract enum)
export const GameState = {
  READY: 0,           // Game created, waiting for initial deal
  PLAYER_ACTION: 1,   // Player's main hand is active
  SPLIT_ACTION_1: 2,  // Player acting on first split hand
  SPLIT_ACTION_2: 3,  // Player acting on second split hand
  DEALER_TURN: 4,     // Dealer is drawing
  HAND_COMPLETE: 5,   // Game finished, payouts calculated
};

export const GameStateNames = {
  0: 'READY',
  1: 'PLAYER_ACTION',
  2: 'SPLIT_ACTION_1',
  3: 'SPLIT_ACTION_2',
  4: 'DEALER_TURN',
  5: 'HAND_COMPLETE',
};

// Hand status (from contract enum)
export const HandStatus = {
  ACTIVE: 0,
  STOOD: 1,
  BUSTED: 2,
  BLACKJACK: 3,
};

export const HandStatusNames = {
  0: 'ACTIVE',
  1: 'STOOD',
  2: 'BUSTED',
  3: 'BLACKJACK',
};

// RNG Status (from contract enum)
export const RNGStatus = {
  INITIAL_DEAL: 0,
  DOUBLE_DOWN: 1,
  SPLIT: 2,
  HIT: 3,
  DEALER: 4,
  NONE: 5,
};

// Action types for our internal use
export const Action = {
  HIT: 'hit',
  STAND: 'stand',
  DOUBLE: 'double',
  SPLIT: 'split',
  INSURANCE: 'insurance',
  SURRENDER: 'surrender',
};

// ABI for blackjack contract functions
export const BLACKJACK_ABI = [
  // VRF Fee
  {
    name: 'vrfFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  
  // Get game info
  {
    name: 'getGameInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_gameId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'user', type: 'address' },
          { name: 'gameState', type: 'uint8' },
          { name: 'activeHandIndex', type: 'uint8' },
          {
            name: 'playerHands',
            type: 'tuple[2]',
            components: [
              {
                name: 'cards',
                type: 'tuple[]',
                components: [
                  { name: 'value', type: 'uint8' },
                  { name: 'rawCard', type: 'uint8' },
                ],
              },
              { name: 'handValue', type: 'uint8' },
              { name: 'isSoft', type: 'bool' },
              { name: 'status', type: 'uint8' },
              { name: 'bet', type: 'uint256' },
            ],
          },
          {
            name: 'dealerHand',
            type: 'tuple',
            components: [
              {
                name: 'cards',
                type: 'tuple[]',
                components: [
                  { name: 'value', type: 'uint8' },
                  { name: 'rawCard', type: 'uint8' },
                ],
              },
              { name: 'handValue', type: 'uint8' },
              { name: 'isSoft', type: 'bool' },
              { name: 'status', type: 'uint8' },
              { name: 'bet', type: 'uint256' },
            ],
          },
          {
            name: 'sideBets',
            type: 'tuple[2]',
            components: [
              { name: 'bet', type: 'uint256' },
              { name: 'amountForHouse', type: 'uint256' },
              { name: 'payout', type: 'uint256' },
            ],
          },
          {
            name: 'insuranceBet',
            type: 'tuple',
            components: [
              { name: 'bet', type: 'uint256' },
              { name: 'amountForHouse', type: 'uint256' },
              { name: 'payout', type: 'uint256' },
            ],
          },
          { name: 'awaitingRandomNumber', type: 'bool' },
          { name: 'initialBet', type: 'uint256' },
          { name: 'totalBet', type: 'uint256' },
          { name: 'totalPayout', type: 'uint256' },
          { name: 'surrendered', type: 'bool' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
  },
  
  // Play game (start)
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
  
  // Player actions
  {
    name: 'playerHit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'playerStand',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'playerDoubleDown',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'playerSplit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'playerInsurance',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'playerSurrender',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [],
  },
];

// Game data encoder types for abi.encode
export const GAME_DATA_TYPES = [
  { name: 'sideBets', type: 'uint256[]' },
  { name: 'gameId', type: 'uint256' },
  { name: 'ref', type: 'address' },
  { name: 'userRandomWord', type: 'bytes32' },
];
