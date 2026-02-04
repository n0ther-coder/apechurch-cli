/**
 * Constants and configuration for Ape Church CLI
 */
import os from 'os';
import path from 'path';
import { defineChain } from 'viem';

// --- Chain Configuration ---
export const apechain = defineChain({
  id: 33139,
  name: 'ApeChain',
  nativeCurrency: { name: 'ApeCoin', symbol: 'APE', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.apechain.com/http'] },
  },
  blockExplorers: {
    default: { name: 'ApeScan', url: 'https://apescan.io' },
  },
});

// --- File Paths ---
export const HOME = os.homedir();
export const APECHURCH_DIR = path.join(HOME, '.apechurch');
export const SKILL_TARGET_DIR = path.join(APECHURCH_DIR, 'skill');
export const WALLET_FILE = path.join(APECHURCH_DIR, 'wallet.json');
export const STATE_FILE = path.join(APECHURCH_DIR, 'state.json');
export const PROFILE_FILE = path.join(APECHURCH_DIR, 'profile.json');
export const HISTORY_FILE = path.join(APECHURCH_DIR, 'history.json');

// --- API Configuration ---
export const PROFILE_API_URL = process.env.APECHURCH_PROFILE_URL || 'https://www.ape.church/api/profile';
export const SIWE_DOMAIN = 'ape.church';
export const SIWE_URI = 'https://ape.church';
export const SIWE_CHAIN_ID = 33139;

// --- Game Configuration ---
export const GAS_RESERVE_APE = 1;
export const DEFAULT_COOLDOWN_MS = 30 * 1000; // 30 seconds
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// --- Token Configuration ---
export const GP_TOKEN_CONTRACT = '0x8046Ac65d2A077562989B2f0770D9bB40e3078CD';
export const GP_DECIMALS = 0; // GP has 0 decimals

// --- Contest Configuration ---
export const CONTEST_REGISTER_CONTRACT = '0xd4de892BA1DD88b2EB4DF588c80f1c8E1428fe4b';
export const USER_INFO_CONTRACT = '0x6EA76F01Aa615112AB7de1409EFBD80a13BfCC84';
export const CONTEST_ENTRY_FEE = 5; // APE
export const CONTEST_WAGER_LIMIT = 1000; // APE - max wagered to be eligible
export const CONTEST_END_DATE = new Date('2026-04-01T00:00:00Z'); // Contest ends April 1, 2026

// --- Contract ABIs ---
export const GAME_CONTRACT_ABI = [
  {
    type: 'function',
    name: 'play',
    stateMutability: 'payable',
    inputs: [
      { name: 'player', type: 'address' },
      { name: 'gameData', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'GameEnded',
    anonymous: false,
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'gameId', type: 'uint256', indexed: false },
      { name: 'buyIn', type: 'uint256', indexed: false },
      { name: 'payout', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'getEssentialGameInfo',
    stateMutability: 'view',
    inputs: [{ name: 'gameIds', type: 'uint256[]' }],
    outputs: [
      { name: 'players', type: 'address[]' },
      { name: 'buyInAmounts', type: 'uint256[]' },
      { name: 'totalPayouts', type: 'uint256[]' },
      { name: 'timestamps', type: 'uint256[]' },
      { name: 'hasEndeds', type: 'bool[]' },
    ],
  },
];

export const PLINKO_VRF_ABI = [
  {
    type: 'function',
    name: 'getVRFFee',
    stateMutability: 'view',
    inputs: [{ name: 'customGasLimit', type: 'uint32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

export const SLOTS_VRF_ABI = [
  {
    type: 'function',
    name: 'getVRFFee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

// --- Contest ABIs ---
export const REGISTER_AGENT_ABI = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isRegistered',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
];

export const USER_INFO_ABI = [
  {
    type: 'function',
    name: 'getTotalWagered',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

// --- GP Token ABI (Gimbo Points - 0 decimals, special ERC20) ---
export const GP_TOKEN_ABI = [
  {
    type: 'function',
    name: 'getCurrentEXP',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
];
