/**
 * @fileoverview Baccarat game handler
 *
 * Classic casino baccarat with three betting options:
 * - PLAYER: 2.0x payout (even money)
 * - BANKER: 1.95x payout (5% commission on wins)
 * - TIE: 9.0x payout (rare but high reward)
 *
 * Bet formats:
 * - Simple: "PLAYER", "BANKER", or "TIE" (entire wager on one)
 * - Combined: "140 BANKER 10 TIE" (parts of the wager, or APE when no wager is supplied)
 *
 * Odds notes:
 * - BANKER has slightly better odds (~45.86% vs ~44.62% for PLAYER)
 * - TIE has ~9.5% probability but 9x payout (house edge ~14.4%)
 * - Conservative strategy defaults to BANKER for this reason
 *
 * On-chain encoding:
 * - gameId: uint256
 * - playerBankerBet: uint256 (wei amount on PLAYER or BANKER)
 * - tieBet: uint256 (wei amount on TIE)
 * - isBanker: bool (true = BANKER, false = PLAYER)
 * - ref: address (referral)
 * - userRandomWord: bytes32 (client entropy)
 *
 * @module lib/games/baccarat
 */
import { encodeAbiParameters, formatEther, parseAbi, parseEther } from 'viem';
import { BACCARAT_WAGER_LIMITS } from '../constants.js';
import { normalizeWagerAmount } from '../utils.js';
import { getStaticVrfFee, executeGame, resolveGamePayloadInputs } from './base.js';

// ============================================================================
// BET PARSING
// ============================================================================

function parseBaccaratParts(betConfig) {
  if (!betConfig || typeof betConfig !== 'string') {
    throw new Error('No bet specified for baccarat. Use PLAYER, BANKER, TIE, or "<parts> BANKER <parts> TIE".');
  }

  const tokens = betConfig.toUpperCase().split(/[,\s]+/).filter(Boolean);
  const sides = ['PLAYER', 'BANKER', 'TIE'];
  if (tokens.length === 1 && sides.includes(tokens[0])) {
    const side = tokens[0];
    return { mainParts: side === 'TIE' ? 0n : 1n, tieParts: side === 'TIE' ? 1n : 0n, isBanker: side === 'BANKER', weighted: false };
  }

  if (tokens.length === 0 || tokens.length % 2 !== 0) {
    throw new Error('Use PLAYER, BANKER, TIE, or positive parts followed by a bet label.');
  }

  let mainParts = 0n;
  let tieParts = 0n;
  let isBanker = false;
  for (let index = 0; index < tokens.length; index += 2) {
    const parts = tokens[index];
    const side = tokens[index + 1];
    if (!sides.includes(side)) {
      throw new Error(`Invalid bet type: "${side}". Use PLAYER, BANKER, or TIE.`);
    }
    const weight = parseEther(normalizeWagerAmount(parts));
    if (side === 'TIE') {
      if (tieParts > 0n) throw new Error('Cannot specify TIE amount twice');
      tieParts = weight;
    } else {
      if (mainParts > 0n) throw new Error('Cannot specify a main side twice or bet on both PLAYER and BANKER');
      mainParts = weight;
      isBanker = side === 'BANKER';
    }
  }
  return { mainParts, tieParts, isBanker, weighted: true };
}

/** Infer an APE wager from explicit parts. A bare side has no implicit amount. */
export function inferBaccaratWager(betConfig) {
  if (!betConfig) return undefined;
  const { mainParts, tieParts, weighted } = parseBaccaratParts(betConfig);
  return weighted ? formatEther(mainParts + tieParts) : undefined;
}

/** Allocate a wager in whole wei according to the supplied Baccarat parts. */
export function parseBaccaratBet(betConfig, totalWagerWei) {
  const { mainParts, tieParts, isBanker } = parseBaccaratParts(betConfig);
  const { contractMinWagerWei, minSelectedLegWei } = BACCARAT_WAGER_LIMITS;
  if (totalWagerWei < BigInt(contractMinWagerWei)) {
    throw new Error(`Baccarat wager must be at least ${contractMinWagerWei} wei.`);
  }
  const totalParts = mainParts + tieParts;
  const mainNumerator = totalWagerWei * mainParts;
  const mainRemainder = mainNumerator % totalParts;
  // With two lanes, the main lane gets the residual wei if its remainder is
  // at least half the denominator. A tied remainder favors the main lane.
  const playerBankerBet = mainNumerator / totalParts + (mainRemainder * 2n >= totalParts ? 1n : 0n);
  const tieBet = totalWagerWei - playerBankerBet;
  const mainSide = isBanker ? 'BANKER' : 'PLAYER';
  const minimum = BigInt(minSelectedLegWei);
  if (mainParts > 0n && playerBankerBet < minimum) {
    throw new Error(`Baccarat ${mainSide} allocation is ${playerBankerBet} wei. Each selected side requires at least ${minimum} wei.`);
  }
  if (tieParts > 0n && tieBet < minimum) {
    throw new Error(`Baccarat TIE allocation is ${tieBet} wei. Each selected side requires at least ${minimum} wei.`);
  }
  return { playerBankerBet, tieBet, isBanker };
}

const BACCARAT_LIMITS_ABI = parseAbi([
  'function GAME_ID() view returns (uint256)',
  'function manager() view returns (address)',
]);
const GOVERNANCE_TRACKER_ABI = parseAbi(['function userInfoTracker() view returns (address)']);
const TRACKER_MINIMUM_ABI = parseAbi(['function getMinBetAmountForGame(uint256) view returns (uint256)']);

/** Read the effective per-hand minimum from the current on-chain tracker. */
export async function getBaccaratWagerLimits(publicClient, address) {
  const [gameId, manager] = await Promise.all([
    publicClient.readContract({ address, abi: BACCARAT_LIMITS_ABI, functionName: 'GAME_ID' }),
    publicClient.readContract({ address, abi: BACCARAT_LIMITS_ABI, functionName: 'manager' }),
  ]);
  const tracker = await publicClient.readContract({
    address: manager, abi: GOVERNANCE_TRACKER_ABI, functionName: 'userInfoTracker',
  });
  const trackerMinimum = await publicClient.readContract({
    address: tracker, abi: TRACKER_MINIMUM_ABI, functionName: 'getMinBetAmountForGame', args: [gameId],
  });
  const contractMinimum = BigInt(BACCARAT_WAGER_LIMITS.contractMinWagerWei);
  const minimum = trackerMinimum > contractMinimum ? trackerMinimum : contractMinimum;
  return {
    ...BACCARAT_WAGER_LIMITS,
    minWagerWei: minimum.toString(),
    minWagerApe: formatEther(minimum),
  };
}

// ============================================================================
// STRATEGY HELPERS
// ============================================================================

/**
 * Get default baccarat bet based on strategy
 *
 * Conservative strategy defaults to BANKER (better odds).
 * Other strategies randomly pick PLAYER or BANKER.
 *
 * @param {string} strategy - Strategy name
 * @returns {string} Default bet type
 */
export function getBaccaratDefaultBet(strategy) {
  if (strategy === 'conservative') {
    return 'BANKER'; // Better odds than PLAYER
  }
  return Math.random() < 0.5 ? 'PLAYER' : 'BANKER';
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Play a Baccarat game
 *
 * @param {Object} params - Game parameters
 * @param {import('viem/accounts').PrivateKeyAccount} params.account - Player's account
 * @param {import('viem').PublicClient} params.publicClient - viem public client
 * @param {import('viem').WalletClient} params.walletClient - viem wallet client
 * @param {Object} params.gameEntry - Game registry entry
 * @param {bigint} params.wager - Total wager in wei
 * @param {string} params.bet - Bet configuration string
 * @param {string} [params.referral] - Referral address
 * @param {number} params.timeoutMs - How long to wait for result
 *
 * @returns {Promise<Object>} Game response with status and result
 * @throws {Error} If bet is invalid or transaction fails
 *
 * @example
 * // Simple BANKER bet
 * const result = await playBaccarat({
 *   account,
 *   publicClient,
 *   walletClient,
 *   gameEntry,
 *   wager: parseEther('10'),
 *   bet: 'BANKER',
 *   timeoutMs: 30000,
 * });
 *
 * // Combined bet: 90 APE on PLAYER, 10 APE on TIE
 * const result = await playBaccarat({
 *   ...params,
 *   wager: parseEther('100'),
 *   bet: '90 PLAYER 10 TIE',
 * });
 */
export async function playBaccarat({
  account,
  publicClient,
  walletClient,
  prepareOnly,
  gameEntry,
  wager,
  bet,
  referral,
  xGameId,
  xRef,
  xUserRandomWord,
  gpPerApe,
  resilient,
  strictPreflight,
  timeoutMs,
}) {
  const { gameId, refAddress, userRandomWord } = resolveGamePayloadInputs({
    referral,
    xGameId,
    xRef,
    xUserRandomWord,
  });

  // Parse bet configuration
  const { playerBankerBet, tieBet, isBanker } = parseBaccaratBet(bet, wager);

  const limits = await getBaccaratWagerLimits(publicClient, gameEntry.contract);
  if (wager < BigInt(limits.minWagerWei)) {
    throw new Error(`Baccarat wager of ${formatEther(wager)} APE is below the on-chain minimum of ${limits.minWagerApe} APE per hand.`);
  }

  // Get VRF fee (static for baccarat)
  const vrfFee = await getStaticVrfFee(publicClient, gameEntry.contract);

  // Encode game data for contract
  const encodedData = encodeAbiParameters(
    [
      { name: 'gameId', type: 'uint256' },
      { name: 'playerBankerBet', type: 'uint256' },
      { name: 'tieBet', type: 'uint256' },
      { name: 'isBanker', type: 'bool' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [gameId, playerBankerBet, tieBet, isBanker, refAddress, userRandomWord]
  );

  // Build human-readable config for output
  const betType = isBanker ? 'BANKER' : (playerBankerBet > 0n ? 'PLAYER' : '');
  const hasTie = tieBet > 0n;
  const config = {
    bet,
    betType: hasTie && betType ? `${betType},TIE` : (hasTie ? 'TIE' : betType),
    playerBankerBet: formatEther(playerBankerBet),
    tieBet: formatEther(tieBet),
    isBanker,
  };

  return executeGame({
    account,
    publicClient,
    walletClient,
    prepareOnly,
    contractAddress: gameEntry.contract,
    encodedData,
    wager,
    vrfFee,
    gameId,
    gameEntry,
    config,
    gpPerApe,
    resilient,
    strictPreflight,
    timeoutMs,
  });
}

// ============================================================================
// CONFIG GETTER
// ============================================================================

/**
 * Get baccarat config from CLI options or strategy
 *
 * Resolution order:
 * 1. Explicit --bet flag
 * 2. Positional argument from CLI
 * 3. Strategy default
 *
 * @param {Object} opts - CLI options
 * @param {Object} positionalConfig - Parsed positional arguments
 * @param {Object} strategyConfig - Strategy configuration
 * @returns {Object} { bet: string }
 */
export function getBaccaratConfig(opts, positionalConfig, gameEntry, strategyConfig) {
  // Explicit --bet flag takes priority
  if (opts.bet) {
    return { bet: opts.bet };
  }

  // Positional argument from CLI
  if (positionalConfig.bet) {
    return { bet: positionalConfig.bet };
  }

  // Fall back to strategy default
  const baccaratConfig = strategyConfig.baccarat || { defaultBet: 'random' };
  const bet = baccaratConfig.defaultBet === 'random'
    ? (Math.random() < 0.5 ? 'PLAYER' : 'BANKER')
    : baccaratConfig.defaultBet;

  return { bet };
}
