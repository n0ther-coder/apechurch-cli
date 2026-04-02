/**
 * @fileoverview Constants and configuration for Ape Church CLI
 *
 * This module centralizes all static configuration:
 * - Chain definitions (ApeChain mainnet)
 * - File paths for local data storage
 * - API endpoints for profile/username registration
 * - Contract addresses and ABIs for on-chain interactions
 * - Game configuration defaults
 *
 * @module lib/constants
 */
import os from 'os';
import path from 'path';
import { defineChain } from 'viem';


// ============================================================================
// PACKAGE / BINARY IDENTIFIERS
// ============================================================================

export const PACKAGE_NAME = '@n0ther/apechurch-cli';
export const BINARY_NAME = 'apechurch-cli';
export const DATA_DIR_BASENAME = '.apechurch-cli';
export const PASS_ENV_VAR = 'APECHURCH_CLI_PASS';
export const PROFILE_URL_ENV_VAR = 'APECHURCH_CLI_PROFILE_URL';
export const PRIVATE_KEY_ENV_VAR = 'APECHURCH_CLI_PK';

// ============================================================================
// CHAIN CONFIGURATION
// ============================================================================

/**
 * ApeChain mainnet configuration for viem
 *
 * ApeChain is an L3 built on Arbitrum, using APE as native gas token.
 * Chain ID 33139 is the mainnet identifier.
 *
 * @type {import('viem').Chain}
 */
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

// ============================================================================
// FILE PATHS
// ============================================================================

/**
 * User's home directory (platform-independent)
 * @type {string}
 */
export const HOME = os.homedir();

/**
 * Root directory for all CLI data
 * Default: ~/.<data-dir>/
 * @type {string}
 */
export const APECHURCH_DIR = path.join(HOME, DATA_DIR_BASENAME);

/**
 * Directory for skill files (SKILL.md, etc.) when installed for agent frameworks
 * @type {string}
 */
export const SKILL_TARGET_DIR = path.join(APECHURCH_DIR, 'skill');

/**
 * Wallet storage file - contains encrypted wallet material and public metadata only.
 * CRITICAL: This file must never contain a plaintext private key.
 * @type {string}
 */
export const WALLET_FILE = path.join(APECHURCH_DIR, 'wallet.json');

/**
 * Session state file - tracks wins, losses, streaks, betting state
 * Used for betting strategy calculations and session statistics
 * @type {string}
 */
export const STATE_FILE = path.join(APECHURCH_DIR, 'state.json');

/**
 * Profile file - user preferences, persona, username, referral address
 * @type {string}
 */
export const PROFILE_FILE = path.join(APECHURCH_DIR, 'profile.json');

/**
 * Per-wallet history directory
 * Contains files like ~/.apechurch-cli/history/church_<wallet>.json
 * @type {string}
 */
export const HISTORY_DIR = path.join(APECHURCH_DIR, 'history');

/**
 * Version for persisted per-wallet history files
 * @type {number}
 */
export const HISTORY_SCHEMA_VERSION = 1;

/**
 * Active games file - tracks in-progress multi-step games (Blackjack, Video Poker)
 * Used for resuming interrupted games
 * @type {string}
 */
export const ACTIVE_GAMES_FILE = path.join(APECHURCH_DIR, 'active_games.json');

// ============================================================================
// API CONFIGURATION
// ============================================================================

/**
 * Profile API endpoint for username registration and lookup
 * Can be overridden via the configured profile API environment variable
 * @type {string}
 */
export const PROFILE_API_URL = process.env[PROFILE_URL_ENV_VAR] || 'https://www.ape.church/api/profile';

/**
 * SIWE (Sign-In With Ethereum) domain for authentication
 * Must match the domain in the SIWE message
 * @type {string}
 */
export const SIWE_DOMAIN = 'ape.church';

/**
 * SIWE URI for authentication messages
 * @type {string}
 */
export const SIWE_URI = 'https://ape.church';

/**
 * Chain ID used in SIWE messages (ApeChain mainnet)
 * @type {number}
 */
export const SIWE_CHAIN_ID = 33139;

// ============================================================================
// GAME CONFIGURATION
// ============================================================================

/**
 * Minimum APE to keep in wallet for gas fees
 * Play commands will refuse to bet if balance would drop below this
 * @type {number}
 */
export const GAS_RESERVE_APE = 1;

/**
 * Default delay between games in loop mode (milliseconds)
 * Prevents rate limiting and gives VRF time to settle
 * @type {number}
 */
export const DEFAULT_COOLDOWN_MS = 30 * 1000; // 30 seconds

/**
 * Base Gimbo Points earned per APE wagered on standard weeks.
 * External promotions may halve or double this ratio.
 * Used for loop-session points summaries and break-even conversion display.
 * @type {number}
 */
export const GB_POINTS_PER_APE = 10;

/**
 * Gimbo Points required for one progression level.
 * Every 10,000 GP equals 1 Level.
 * @type {number}
 */
export const GP_PER_LEVEL = 10000;

/**
 * Ethereum zero address - used for "no referral" in game calls
 * @type {string}
 */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ============================================================================
// TOKEN CONFIGURATION
// ============================================================================

/**
 * GP (Gimbo Points) token contract address
 * GP is the reward/cashback token earned from playing games
 * @type {string}
 */
export const GP_TOKEN_CONTRACT = '0x8046Ac65d2A077562989B2f0770D9bB40e3078CD';

/**
 * GP token decimals - GP uses 0 decimals (whole numbers only)
 * This is unusual for ERC20 tokens (most use 18)
 * @type {number}
 */
export const GP_DECIMALS = 0;

// ============================================================================
// THE HOUSE CONFIGURATION
// ============================================================================

/**
 * The House contract address - decentralized bankroll pool
 * Depositors become "the house" and earn/lose based on player outcomes
 * @type {string}
 */
export const HOUSE_CONTRACT = '0x2054709F89F18a4CCAC6132acE7b812E32608469';

/**
 * Lock time after depositing to The House (seconds)
 * Prevents flash-loan style attacks on the bankroll
 * @type {number}
 */
export const HOUSE_LOCK_TIME = 15 * 60; // 15 minutes

/**
 * Withdrawal fee from The House (as decimal)
 * Discourages frequent withdrawals and funds the protocol
 * @type {number}
 */
export const HOUSE_WITHDRAW_FEE = 0.02; // 2%

// ============================================================================
// CONTEST CONFIGURATION
// ============================================================================

/**
 * Contest registration contract address
 * Players pay entry fee here to join competitions
 * @type {string}
 */
export const CONTEST_REGISTER_CONTRACT = '0xd4de892BA1DD88b2EB4DF588c80f1c8E1428fe4b';

/**
 * User info contract - tracks total wagered per address
 * Used for contest eligibility verification
 * @type {string}
 */
export const USER_INFO_CONTRACT = '0x6EA76F01Aa615112AB7de1409EFBD80a13BfCC84';

/**
 * wAPE token contract address
 * This is also the user-info contract that tracks total wagered counters.
 * @type {string}
 */
export const WAPE_TOKEN_CONTRACT = USER_INFO_CONTRACT;

/**
 * Contest entry fee in APE
 * @type {number}
 */
export const CONTEST_ENTRY_FEE = 5;

/**
 * Maximum total wager to remain eligible for contest
 * Prevents whales from dominating by volume
 * @type {number}
 */
export const CONTEST_WAGER_LIMIT = 1000;

/**
 * Contest end date - after this, registration closes
 * @type {Date}
 */
export const CONTEST_END_DATE = new Date('2026-04-01T00:00:00Z');

// ============================================================================
// GAME CONTRACT ADDRESSES
// ============================================================================

/**
 * Active on-chain game contract addresses.
 * Stateful games live here too even though their ABIs remain in dedicated modules.
 * @type {string}
 */
export const KENO_CONTRACT = '0xc936D6691737afe5240975622f0597fA2d122FAd';
export const APESTRONG_CONTRACT = '0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600';
export const BACCARAT_CONTRACT = '0xB08C669dc0419151bA4e4920E80128802dB5497b';
export const ROULETTE_CONTRACT = '0x1f48A104C1808eb4107f3999999D36aeafEC56d5';
export const JUNGLE_PLINKO_CONTRACT = '0x88683B2F9E765E5b1eC2745178354C70A03531Ce';
export const COSMIC_PLINKO_CONTRACT = '0x674Bd91adb41897fA780386E610168afBB05e694';
export const DINO_DOUGH_CONTRACT = '0x9ebb4Df257B971582BAf096b62CA41DE7723F3CB';
export const BUBBLEGUM_HEIST_CONTRACT = '0xB5Da735118e848130B92994Ee16377dB2AE31a4c';
export const SPEED_KENO_CONTRACT = '0x40EE3295035901e5Fd80703774E5A9FE7CE2B90C';
export const MONKEY_MATCH_CONTRACT = '0x59EBd3406b76DCc74102AFa2cA5284E9AAB6bA28';
export const BEAR_DICE_CONTRACT = '0x6a48A513A46955D8622C809Fce876d2f11142003';
export const PRIMES_CONTRACT = '0xC1aCd12aA34dC33979871EF95c540D46A6566B4b';
export const BLACKJACK_CONTRACT = '0x03AC9d823cCc27df9F0981FD3975Ca6F13067Ed7';
export const VIDEO_POKER_CONTRACT = '0x4f7D016704bC9A1d373E512e10CF86A0E7015D1D';

/**
 * Canonical address registry for supported games.
 * Keep this as the single source of truth for contract-address updates.
 */
export const GAME_CONTRACT_ADDRESSES = Object.freeze({
  keno: KENO_CONTRACT,
  'ape-strong': APESTRONG_CONTRACT,
  baccarat: BACCARAT_CONTRACT,
  roulette: ROULETTE_CONTRACT,
  'jungle-plinko': JUNGLE_PLINKO_CONTRACT,
  'cosmic-plinko': COSMIC_PLINKO_CONTRACT,
  'dino-dough': DINO_DOUGH_CONTRACT,
  'bubblegum-heist': BUBBLEGUM_HEIST_CONTRACT,
  'speed-keno': SPEED_KENO_CONTRACT,
  'monkey-match': MONKEY_MATCH_CONTRACT,
  'bear-dice': BEAR_DICE_CONTRACT,
  primes: PRIMES_CONTRACT,
  blackjack: BLACKJACK_CONTRACT,
  'video-poker': VIDEO_POKER_CONTRACT,
});

// ============================================================================
// CONTRACT ABIs
// ============================================================================

/**
 * Standard game contract ABI
 *
 * All Ape Church games implement this interface:
 * - play(address, bytes): Start a game with encoded parameters
 * - GameEnded event: Emitted when VRF resolves and game completes
 * - getEssentialGameInfo: Batch query for game history
 *
 * @type {Array<import('viem').AbiItem>}
 */
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

/**
 * Plinko-style VRF fee ABI
 *
 * Plinko games have variable gas costs based on number of balls dropped.
 * Each ball requires additional VRF randomness, so gas scales linearly.
 *
 * Formula: baseGas + (balls * perUnitGas)
 *
 * @type {Array<import('viem').AbiItem>}
 */
export const PLINKO_VRF_ABI = [
  {
    type: 'function',
    name: 'getVRFFee',
    stateMutability: 'view',
    inputs: [{ name: 'customGasLimit', type: 'uint32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

/**
 * Slots-style VRF fee ABI
 *
 * Simple games with fixed VRF cost - one random number per game.
 * Used by: Roulette, Baccarat, ApeStrong, Keno, etc.
 *
 * @type {Array<import('viem').AbiItem>}
 */
export const SLOTS_VRF_ABI = [
  {
    type: 'function',
    name: 'getVRFFee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

/**
 * Contest registration contract ABI
 *
 * @type {Array<import('viem').AbiItem>}
 */
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

/**
 * User info contract ABI - for querying total wagered
 *
 * @type {Array<import('viem').AbiItem>}
 */
export const USER_INFO_ABI = [
  {
    type: 'function',
    name: 'getTotalWagered',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

/**
 * Minimal ERC-20 ABI used for balance reads and Transfer log decoding.
 *
 * @type {Array<import('viem').AbiItem>}
 */
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    anonymous: false,
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
];

/**
 * The House contract ABI
 *
 * The House is a shared liquidity pool that backs all games.
 * Depositors receive HOUSE tokens representing their share.
 *
 * Key mechanics:
 * - deposit(): Add APE, receive HOUSE tokens at current price
 * - withdraw(): Burn HOUSE tokens, receive APE minus 2% fee
 * - 15-minute lock after deposit prevents flash-loan attacks
 * - Price fluctuates based on player wins/losses
 *
 * @type {Array<import('viem').AbiItem>}
 */
export const HOUSE_ABI = [
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'maxPayout',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'timeUntilUnlock',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'calculatePrice',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getTotalProfits',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'int256' }],
  },
];

/**
 * GP Token ABI (Gimbo Points)
 *
 * GP is a non-standard ERC20 with 0 decimals (whole numbers only).
 * Earned as cashback/rewards for playing games.
 * Can be transferred or used to purchase NFTs.
 *
 * Note: Uses getCurrentEXP instead of standard balanceOf for some queries.
 *
 * @type {Array<import('viem').AbiItem>}
 */
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
