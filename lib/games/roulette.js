/**
 * @fileoverview Roulette game handler
 *
 * Implements American roulette with 0, 00, and 1-36.
 * Supports multiple bet types:
 * - Single numbers (0, 00, 1-36)
 * - Colors (RED, BLACK)
 * - Parity (ODD, EVEN)
 * - Halves (FIRST_HALF, SECOND_HALF)
 * - Thirds (FIRST_THIRD, SECOND_THIRD, THIRD_THIRD)
 * - Columns (FIRST_COL, SECOND_COL, THIRD_COL)
 *
 * Multi-bet support: "RED,BLACK" splits evenly; BET:CHIPS weights allocate chips bought with the total wager.
 *
 * On-chain encoding:
 * - gameNumbers: uint8[] - bet type values (see betTypes in registry)
 * - amounts: uint256[] - wei amount for each bet
 * - Numbers 1-36 map to on-chain values 2-37 (offset by +1)
 * - 0 maps to 1, 00 maps to 38
 *
 * @module lib/games/roulette
 */
import { encodeAbiParameters } from 'viem';
import { getStaticVrfFee, executeGame, resolveGamePayloadInputs } from './base.js';

// Preserve the public helper exports while sharing allocation logic with analytics.
export { parseRouletteBets, calculateRouletteBetAmounts } from '../roulette-bets.js';
import { resolveRouletteWager, serializeRouletteWager } from '../roulette-bets.js';

// ============================================================================
// STRATEGY HELPERS
// ============================================================================

/**
 * Get default roulette bet based on strategy
 *
 * Conservative strategy hedges with RED,BLACK (nearly break-even).
 * Other strategies randomly pick RED or BLACK.
 *
 * @param {string} strategy - Strategy name
 * @returns {string} Default bet string
 */
export function getRouletteDefaultBet(strategy) {
  if (strategy === 'conservative') {
    return 'RED,BLACK'; // Hedge both colors
  }
  // Random color for other strategies
  return Math.random() < 0.5 ? 'RED' : 'BLACK';
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Play a Roulette game
 *
 * Flow:
 * 1. Parse bet string into on-chain game numbers
 * 2. Get VRF fee from contract
 * 3. Allocate chips exactly, or use the legacy equal split
 * 4. Encode game data for contract call
 * 5. Execute transaction and wait for result
 *
 * @param {Object} params - Game parameters
 * @param {import('viem/accounts').PrivateKeyAccount} params.account - Player's account
 * @param {import('viem').PublicClient} params.publicClient - viem public client
 * @param {import('viem').WalletClient} params.walletClient - viem wallet client
 * @param {Object} params.gameEntry - Game registry entry
 * @param {bigint} params.wager - Total wager in wei
 * @param {string} params.bet - Bet string (e.g., "RED", "17,32")
 * @param {string} [params.chips] - Purchased chip count (defaults to the sum in bet)
 * @param {string} [params.referral] - Referral address
 * @param {number} params.timeoutMs - How long to wait for result
 *
 * @returns {Promise<Object>} Game response with status and result
 * @throws {Error} If bet is invalid or transaction fails
 *
 * @example
 * const result = await playRoulette({
 *   account,
 *   publicClient,
 *   walletClient,
 *   gameEntry: rouletteEntry,
 *   wager: parseEther('10'),
 *   bet: 'RED',
 *   timeoutMs: 30000,
 * });
 */
export async function playRoulette({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  bet,
  chips,
  referral,
  xGameId,
  xRef,
  xUserRandomWord,
  gpPerApe,
  resilient,
  timeoutMs,
}) {
  const { gameId, refAddress, userRandomWord } = resolveGamePayloadInputs({
    referral,
    xGameId,
    xRef,
    xUserRandomWord,
  });

  // Validate allocations before any RPC or transaction submission.
  const allocation = resolveRouletteWager({ wagerWei: wager, bet, chips, gameEntry });
  const { gameNumbers, amounts: betAmounts } = allocation;

  // Get VRF fee from contract (static fee for roulette)
  const vrfFee = await getStaticVrfFee(publicClient, gameEntry.contract);

  // Encode game parameters for contract call
  // Contract signature: play(address player, bytes gameData)
  // gameData = abi.encode(uint8[] gameNumbers, uint256[] amounts, uint256 gameId, address ref, bytes32 userRandomWord)
  const encodedData = encodeAbiParameters(
    [
      { name: 'gameNumbers', type: 'uint8[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [gameNumbers, betAmounts, gameId, refAddress, userRandomWord]
  );

  // Config for response (helps debugging/logging)
  const config = chips !== undefined || String(bet).includes(':')
    ? serializeRouletteWager(allocation)
    : { bet, gameNumbers, numBets: gameNumbers.length };

  // Execute the game
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
    gpPerApe,
    resilient,
    timeoutMs,
  });
}

// ============================================================================
// CONFIG GETTER
// ============================================================================

/**
 * Get roulette config from CLI options or strategy
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
export function getRouletteConfig(opts, positionalConfig, gameEntry, strategyConfig) {
  const rouletteConfig = strategyConfig.roulette || { defaultBet: 'random' };
  const bet = opts.bet ?? positionalConfig.bet ?? (
    rouletteConfig.defaultBet === 'random'
      ? (Math.random() < 0.5 ? 'RED' : 'BLACK')
      : rouletteConfig.defaultBet
  );
  return { bet, ...(opts.chips !== undefined ? { chips: opts.chips } : {}) };
}
