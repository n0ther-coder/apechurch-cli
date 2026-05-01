/**
 * Cash Dash contract constants and ABI.
 */
import { CASH_DASH_CONTRACT } from '../../constants.js';

export { CASH_DASH_CONTRACT };

export const MIN_TILES = 2;
export const MAX_TILES = 7;
export const ROWS_MODULUS = MAX_TILES - MIN_TILES + 1;
export const BASIS_POINTS = 10000;

export const DEFAULT_ROW_PAYOUT_BPS = Object.freeze({
  2: 19200,
  3: 14400,
  4: 12800,
  5: 12000,
  6: 11500,
  7: 11000,
});

export const CASH_DASH_ABI = [
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
    name: 'rowPayouts',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint8' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getRowsForRound',
    type: 'function',
    stateMutability: 'pure',
    inputs: [
      { name: 'roundId', type: 'uint256' },
      { name: 'tilesetSeed', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'batchRowsForRounds',
    type: 'function',
    stateMutability: 'pure',
    inputs: [
      { name: 'roundIds', type: 'uint256[]' },
      { name: 'tilesetSeed', type: 'uint256' },
    ],
    outputs: [{ name: 'rows', type: 'uint8[]' }],
  },
  {
    name: 'getGameInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_gameId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'initialBetAmount', type: 'uint256' },
        { name: 'payout', type: 'uint256' },
        { name: 'user', type: 'address' },
        { name: 'currentPayout', type: 'uint256' },
        { name: 'rowGuesses', type: 'uint8[]' },
        { name: 'rowDeathHits', type: 'uint8[]' },
        { name: 'tilesetSeed', type: 'uint256' },
        { name: 'hasEnded', type: 'bool' },
        { name: 'timestamp', type: 'uint256' },
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
      { name: 'index', type: 'uint8' },
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
  {
    anonymous: false,
    name: 'GameStarted',
    type: 'event',
    inputs: [
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'gameId', type: 'uint256' },
    ],
  },
  {
    anonymous: false,
    name: 'GameEnded',
    type: 'event',
    inputs: [
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'gameId', type: 'uint256' },
      { indexed: false, name: 'buyIn', type: 'uint256' },
      { indexed: false, name: 'payout', type: 'uint256' },
    ],
  },
];
