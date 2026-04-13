/**
 * Hi-Lo Nebula contract constants and ABI.
 */
import { HI_LO_NEBULA_CONTRACT } from '../../constants.js';

export { HI_LO_NEBULA_CONTRACT };

export const GuessDirection = Object.freeze({
  NONE: 0,
  LOWER: 1,
  HIGHER: 2,
  SAME: 3,
});

export const GuessDirectionNames = Object.freeze({
  0: 'NONE',
  1: 'LOWER',
  2: 'HIGHER',
  3: 'SAME',
});

export const GuessDirectionLabels = Object.freeze({
  [GuessDirection.LOWER]: 'Lower',
  [GuessDirection.HIGHER]: 'Higher',
  [GuessDirection.SAME]: 'Same',
});

export const GuessDirectionShortLabels = Object.freeze({
  [GuessDirection.LOWER]: 'LOW',
  [GuessDirection.HIGHER]: 'HIGH',
  [GuessDirection.SAME]: 'SAME',
});

export const DEFAULT_ROUNDS_FOR_JACKPOT = 15;
export const DEFAULT_PLATFORM_FEE_BPS = 250;
export const DEFAULT_JACKPOT_FEE_BPS = 50;
export const PUSH_PAYOUT_BPS = 125000;
export const BASIS_POINTS = 10000;

export const CARD_RANK_LABELS = Object.freeze({
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
});

export const PAYOUT_TABLE_BPS = Object.freeze({
  2: Object.freeze({
    [GuessDirection.HIGHER]: 10600,
  }),
  3: Object.freeze({
    [GuessDirection.HIGHER]: 11363,
    [GuessDirection.LOWER]: 125000,
  }),
  4: Object.freeze({
    [GuessDirection.HIGHER]: 12500,
    [GuessDirection.LOWER]: 62500,
  }),
  5: Object.freeze({
    [GuessDirection.HIGHER]: 13888,
    [GuessDirection.LOWER]: 41666,
  }),
  6: Object.freeze({
    [GuessDirection.HIGHER]: 15625,
    [GuessDirection.LOWER]: 31250,
  }),
  7: Object.freeze({
    [GuessDirection.HIGHER]: 17857,
    [GuessDirection.LOWER]: 25000,
  }),
  8: Object.freeze({
    [GuessDirection.HIGHER]: 20833,
    [GuessDirection.LOWER]: 20833,
  }),
  9: Object.freeze({
    [GuessDirection.HIGHER]: 25000,
    [GuessDirection.LOWER]: 17857,
  }),
  10: Object.freeze({
    [GuessDirection.HIGHER]: 31250,
    [GuessDirection.LOWER]: 15625,
  }),
  11: Object.freeze({
    [GuessDirection.HIGHER]: 41666,
    [GuessDirection.LOWER]: 13888,
  }),
  12: Object.freeze({
    [GuessDirection.HIGHER]: 62500,
    [GuessDirection.LOWER]: 12500,
  }),
  13: Object.freeze({
    [GuessDirection.HIGHER]: 125000,
    [GuessDirection.LOWER]: 11363,
  }),
  14: Object.freeze({
    [GuessDirection.LOWER]: 10600,
  }),
});

export function getCardLabel(rank) {
  return CARD_RANK_LABELS[Number(rank)] || '?';
}

export function getPayoutBps(rank, direction) {
  if (Number(direction) === GuessDirection.SAME) {
    return PUSH_PAYOUT_BPS;
  }

  const row = PAYOUT_TABLE_BPS[Number(rank)];
  return row?.[Number(direction)] ?? null;
}

export function getPayoutMultiplier(rank, direction) {
  const payoutBps = getPayoutBps(rank, direction);
  return payoutBps === null ? null : payoutBps / BASIS_POINTS;
}

export function getAvailableGuessDirections(rank) {
  const numericRank = Number(rank);
  if (!(numericRank >= 2 && numericRank <= 14)) {
    return [];
  }

  const directions = [];
  if (numericRank > 2) {
    directions.push(GuessDirection.LOWER);
  }
  if (numericRank < 14) {
    directions.push(GuessDirection.HIGHER);
  }
  directions.push(GuessDirection.SAME);
  return directions;
}

export function getSuccessfulNextRanks(rank, direction) {
  const numericRank = Number(rank);
  switch (Number(direction)) {
    case GuessDirection.LOWER:
      return Array.from({ length: Math.max(numericRank - 2, 0) }, (_, index) => index + 2);
    case GuessDirection.HIGHER:
      return Array.from({ length: Math.max(14 - numericRank, 0) }, (_, index) => numericRank + index + 1);
    case GuessDirection.SAME:
      return [numericRank];
    default:
      return [];
  }
}

export function getGuessSuccessProbability(rank, direction) {
  return getSuccessfulNextRanks(rank, direction).length / 13;
}

export const HI_LO_NEBULA_ABI = [
  {
    name: 'getVRFFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'platformFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'jackpotFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'roundsForJackpot',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'jackpotTotal',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getJackpotAmount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'betAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getGameInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'initialBetAmount', type: 'uint256' },
        { name: 'payout', type: 'uint256' },
        { name: 'user', type: 'address' },
        { name: 'hasEnded', type: 'bool' },
        { name: 'timestamp', type: 'uint256' },
        {
          name: 'rounds',
          type: 'tuple[]',
          components: [
            { name: 'startingCard', type: 'uint8' },
            { name: 'nextCard', type: 'uint8' },
            { name: 'DIRECTION', type: 'uint8' },
            { name: 'betAmount', type: 'uint256' },
            { name: 'payout', type: 'uint256' },
          ],
        },
      ],
    }],
  },
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
    name: 'makeGuess',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'gameId', type: 'uint256' },
      { name: 'direction', type: 'uint8' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'cashOut',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [],
  },
];
