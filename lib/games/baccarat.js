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
 * - Combined: "140 BANKER 10 TIE" (explicit APE amounts per bet)
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
import { encodeAbiParameters, formatEther, parseEther } from 'viem';
import { getStaticVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';

// ============================================================================
// BET PARSING
// ============================================================================

/**
 * Parse baccarat bet configuration
 *
 * Supports two formats:
 * 1. Simple: Just the bet type ("PLAYER", "BANKER", "TIE")
 * 2. Combined: Explicit amounts with types ("140 BANKER 10 TIE")
 *
 * For combined bets:
 * - Amounts are in APE (e.g., "140" = 140 APE)
 * - Total of all amounts must equal the wager
 * - Can bet on PLAYER/BANKER + TIE (but not both PLAYER and BANKER)
 *
 * @param {string} betConfig - Bet specification string
 * @param {bigint} totalWagerWei - Total wager in wei (for validation)
 * @returns {Object} { playerBankerBet, tieBet, isBanker }
 * @throws {Error} If bet format is invalid or amounts don't sum correctly
 *
 * @example
 * // Simple bets
 * parseBaccaratBet("PLAYER", 10n * 10n**18n)
 * // Returns: { playerBankerBet: 10e18n, tieBet: 0n, isBanker: false }
 *
 * parseBaccaratBet("BANKER", 10n * 10n**18n)
 * // Returns: { playerBankerBet: 10e18n, tieBet: 0n, isBanker: true }
 *
 * // Combined bet (9 APE on BANKER, 1 APE on TIE)
 * parseBaccaratBet("9 BANKER 1 TIE", 10n * 10n**18n)
 * // Returns: { playerBankerBet: 9e18n, tieBet: 1e18n, isBanker: true }
 */
export function parseBaccaratBet(betConfig, totalWagerWei) {
  if (!betConfig || typeof betConfig !== 'string') {
    throw new Error('No bet specified for baccarat. Use: PLAYER, BANKER, TIE, or "<amount> BANKER <amount> TIE"');
  }

  // Split by comma and/or space, normalize to uppercase
  const parts = betConfig
    .split(/[,\s]+/)
    .map(b => b.trim().toUpperCase())
    .filter(b => b.length > 0);

  if (parts.length === 0) {
    throw new Error('No valid bet found.');
  }

  let playerBankerBet = BigInt(0);
  let tieBet = BigInt(0);
  let isBanker = false;
  let playerBankerAmount = null;
  let tieAmount = null;

  // -------------------------------------------------------------------------
  // SIMPLE CASE: Single bet type
  // -------------------------------------------------------------------------
  if (parts.length === 1) {
    const bet = parts[0];
    if (bet === 'PLAYER') {
      return { playerBankerBet: totalWagerWei, tieBet: BigInt(0), isBanker: false };
    } else if (bet === 'BANKER') {
      return { playerBankerBet: totalWagerWei, tieBet: BigInt(0), isBanker: true };
    } else if (bet === 'TIE') {
      return { playerBankerBet: BigInt(0), tieBet: totalWagerWei, isBanker: false };
    } else {
      throw new Error(`Invalid bet: "${bet}". Use: PLAYER, BANKER, or TIE`);
    }
  }

  // -------------------------------------------------------------------------
  // COMPLEX CASE: Parse "amount BET amount BET" pattern
  // -------------------------------------------------------------------------
  let i = 0;
  while (i < parts.length) {
    const current = parts[i];

    // Check if current token is a number (amount)
    const amount = parseFloat(current);
    if (!isNaN(amount) && amount > 0) {
      // Next part should be the bet type
      const betType = parts[i + 1];
      if (!betType) {
        throw new Error(`Expected bet type after amount ${amount}`);
      }

      const amountWei = parseEther(String(amount));

      if (betType === 'PLAYER') {
        if (playerBankerAmount !== null) {
          throw new Error('Cannot specify PLAYER amount twice');
        }
        if (isBanker) {
          throw new Error('Cannot bet on both PLAYER and BANKER');
        }
        playerBankerAmount = amountWei;
        isBanker = false;
        i += 2;
      } else if (betType === 'BANKER') {
        if (playerBankerAmount !== null) {
          throw new Error('Cannot specify BANKER amount twice');
        }
        playerBankerAmount = amountWei;
        isBanker = true;
        i += 2;
      } else if (betType === 'TIE') {
        if (tieAmount !== null) {
          throw new Error('Cannot specify TIE amount twice');
        }
        tieAmount = amountWei;
        i += 2;
      } else {
        throw new Error(`Invalid bet type: "${betType}". Use: PLAYER, BANKER, or TIE`);
      }
    } else if (current === 'PLAYER' || current === 'BANKER' || current === 'TIE') {
      throw new Error(`Missing amount before ${current}. Use: "<amount> ${current}"`);
    } else {
      throw new Error(`Invalid token: "${current}". Expected amount or bet type.`);
    }
  }

  playerBankerBet = playerBankerAmount || BigInt(0);
  tieBet = tieAmount || BigInt(0);

  // Validate that specified amounts equal total wager
  const specifiedTotal = playerBankerBet + tieBet;
  if (specifiedTotal !== totalWagerWei) {
    const specifiedApe = formatEther(specifiedTotal);
    const expectedApe = formatEther(totalWagerWei);
    throw new Error(`Bet amounts (${specifiedApe} APE) don't match total wager (${expectedApe} APE)`);
  }

  return { playerBankerBet, tieBet, isBanker };
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
  gameEntry,
  wager,
  bet,
  referral,
  timeoutMs,
}) {
  // Validate referral address
  const refAddress = getValidRefAddress(referral);

  // Generate unique identifiers
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  // Parse bet configuration
  const { playerBankerBet, tieBet, isBanker } = parseBaccaratBet(bet, wager);

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
    contractAddress: gameEntry.contract,
    encodedData,
    wager,
    vrfFee,
    gameId,
    gameEntry,
    config,
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
export function getBaccaratConfig(opts, positionalConfig, strategyConfig) {
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
