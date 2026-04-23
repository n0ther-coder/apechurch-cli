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
 * Multi-bet support: "RED,BLACK" splits wager evenly across both bets.
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

// ============================================================================
// BET PARSING
// ============================================================================

/**
 * Parse roulette bet string into on-chain game numbers
 *
 * Converts user-friendly bet strings (e.g., "RED", "17", "FIRST_THIRD")
 * into the numeric values expected by the contract.
 *
 * Supports comma-separated multi-bets: "RED,BLACK" or "0,17,32"
 *
 * Bet type mapping (from registry):
 * - '0' → 1 (Zero)
 * - '00' → 38 (Double Zero)
 * - '1'-'36' → 2-37 (Numbers offset by +1)
 * - 'RED' → 50
 * - 'BLACK' → 49
 * - etc.
 *
 * @param {string} betString - Comma-separated bet types
 * @param {Object} gameEntry - Game registry entry (contains betTypes mapping)
 * @returns {number[]} Array of on-chain game numbers
 * @throws {Error} If bet string is empty or contains invalid bets
 *
 * @example
 * parseRouletteBets('RED', gameEntry)        // [50]
 * parseRouletteBets('RED,BLACK', gameEntry)  // [50, 49]
 * parseRouletteBets('17', gameEntry)         // [18] (17 + 1 offset)
 * parseRouletteBets('0,00', gameEntry)       // [1, 38]
 */
export function parseRouletteBets(betString, gameEntry) {
  if (!betString || typeof betString !== 'string') {
    throw new Error('No bet specified for roulette. Use: RED, BLACK, 0, 00, 1-36, etc.');
  }

  const betTypes = gameEntry.betTypes || {};

  // Split by comma, normalize, and filter empty strings
  const bets = betString
    .split(',')
    .map(b => b.trim().toUpperCase())
    .filter(b => b.length > 0);

  if (bets.length === 0) {
    throw new Error('No valid bets found. Use: RED, BLACK, 0, 00, 1-36, etc.');
  }

  const gameNumbers = [];

  for (const bet of bets) {
    // Check if it's a named bet type (RED, BLACK, FIRST_THIRD, etc.)
    if (betTypes[bet] !== undefined) {
      gameNumbers.push(betTypes[bet]);
      continue;
    }

    // Check if it's a number 1-36
    const num = parseInt(bet, 10);
    if (!isNaN(num) && num >= 1 && num <= 36) {
      // Numbers 1-36 map to on-chain values 2-37 (offset by +1)
      // This is because 1 is reserved for 0
      gameNumbers.push(num + 1);
      continue;
    }

    // Invalid bet - provide helpful error message
    throw new Error(
      `Invalid bet: "${bet}". Valid bets: 0, 00, 1-36, RED, BLACK, ODD, EVEN, ` +
      `FIRST_THIRD, SECOND_THIRD, THIRD_THIRD, FIRST_HALF, SECOND_HALF, ` +
      `FIRST_COL, SECOND_COL, THIRD_COL`
    );
  }

  return gameNumbers;
}

// ============================================================================
// WAGER CALCULATION
// ============================================================================

/**
 * Calculate bet amounts from total wager
 *
 * Splits the total wager evenly across all bets.
 *
 * Handles the roulette contract's strict less-than rule: every
 * encoded bet amount must remain strictly below the total bet amount.
 * For a single-leg wager, that means subtracting 1 wei locally.
 *
 * @param {bigint} totalWagerWei - Total wager in wei
 * @param {number[]} gameNumbers - Array of bet types
 * @returns {bigint[]} Array of wei amounts for each bet
 * @throws {Error} If wager is too small to split
 *
 * @example
 * // 10 APE on RED only (single bet - subtract 1 wei)
 * calculateRouletteBetAmounts(10000000000000000000n, [50])
 * // Returns: [9999999999999999999n]
 *
 * // 10 APE split across RED and BLACK
 * calculateRouletteBetAmounts(10000000000000000000n, [50, 49])
 * // Returns: [5000000000000000000n, 5000000000000000000n]
 */
export function calculateRouletteBetAmounts(totalWagerWei, gameNumbers) {
  const numBets = BigInt(gameNumbers.length);
  const amountPerBet = totalWagerWei / numBets;

  if (amountPerBet === BigInt(0)) {
    throw new Error('Wager too small to split across all bets.');
  }

  const amounts = [];
  for (let i = 0; i < gameNumbers.length; i++) {
    amounts.push(amountPerBet);
  }

  // The contract requires every leg to be strictly less than the
  // post-fee total bet amount, so a one-leg wager must be reduced by 1 wei.
  if (gameNumbers.length === 1) {
    amounts[0] = amounts[0] - BigInt(1);
    if (amounts[0] <= BigInt(0)) {
      throw new Error('Wager too small (need more than 1 wei for single bet).');
    }
  }

  return amounts;
}

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
 * 3. Calculate bet amounts (split evenly, honor the single-leg 1-wei adjustment)
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
  referral,
  xGameId,
  xRef,
  xUserRandomWord,
  gpPerApe,
  timeoutMs,
}) {
  const { gameId, refAddress, userRandomWord } = resolveGamePayloadInputs({
    referral,
    xGameId,
    xRef,
    xUserRandomWord,
  });

  // Parse user's bet string into on-chain values
  const gameNumbers = parseRouletteBets(bet, gameEntry);

  // Get VRF fee from contract (static fee for roulette)
  const vrfFee = await getStaticVrfFee(publicClient, gameEntry.contract);

  // Calculate how much goes to each bet
  const betAmounts = calculateRouletteBetAmounts(wager, gameNumbers);

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
  const config = {
    bet,
    gameNumbers,
    numBets: gameNumbers.length,
  };

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
  // Explicit flag takes priority
  if (opts.bet) {
    return { bet: opts.bet };
  }

  // Positional argument
  if (positionalConfig.bet) {
    return { bet: positionalConfig.bet };
  }

  // Fall back to strategy default
  const rouletteConfig = strategyConfig.roulette || { defaultBet: 'random' };
  const bet = rouletteConfig.defaultBet === 'random'
    ? (Math.random() < 0.5 ? 'RED' : 'BLACK')
    : rouletteConfig.defaultBet;

  return { bet };
}
