/**
 * @fileoverview Slots game handler (Dino Dough, Bubblegum Heist)
 *
 * Classic slot machine games with multiple spins per bet.
 *
 * Games using this handler:
 * - Dino Dough: Dinosaur-themed slots
 * - Bubblegum Heist: Candy-themed slots
 *
 * Mechanics:
 * - Each spin generates a random symbol combination
 * - Matching symbols pay multipliers
 * - Wager is split evenly across all spins
 * - Results aggregate across all spins in one transaction
 *
 * Parameters:
 * - spins (1-15): Number of slot pulls
 *   - More spins = smoother variance (averaging effect)
 *   - Wager divided by spin count (10 APE / 10 spins = 1 APE per spin)
 *   - Single transaction regardless of spin count
 *
 * VRF Cost:
 * Slots use static VRF fee (single random seed generates all spins).
 *
 * On-chain encoding:
 * - gameId: uint256
 * - numSpins: uint8 (1-15)
 * - ref: address (referral)
 * - userRandomWord: bytes32 (client entropy)
 *
 * @module lib/games/slots
 */
import { encodeAbiParameters } from 'viem';
import { ensureIntRange } from '../utils.js';
import { getStaticVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Play a Slots game
 *
 * @param {Object} params - Game parameters
 * @param {import('viem/accounts').PrivateKeyAccount} params.account - Player's account
 * @param {import('viem').PublicClient} params.publicClient - viem public client
 * @param {import('viem').WalletClient} params.walletClient - viem wallet client
 * @param {Object} params.gameEntry - Game registry entry
 * @param {bigint} params.wager - Total wager in wei (split across all spins)
 * @param {number} [params.spins] - Number of spins 1-15 (default: 10)
 * @param {string} [params.referral] - Referral address
 * @param {number} params.timeoutMs - How long to wait for result
 *
 * @returns {Promise<Object>} Game response with status and result
 * @throws {Error} If parameters are invalid or transaction fails
 *
 * @example
 * // 10 spins on Dino Dough
 * const result = await playSlots({
 *   account,
 *   publicClient,
 *   walletClient,
 *   gameEntry: dinoDoughEntry,
 *   wager: parseEther('10'),
 *   spins: 10,
 *   timeoutMs: 30000,
 * });
 *
 * // Fewer spins for more variance
 * const result = await playSlots({
 *   ...params,
 *   spins: 3,
 * });
 */
export async function playSlots({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  spins,
  referral,
  gpPerApe,
  timeoutMs,
}) {
  // Validate referral address
  const refAddress = getValidRefAddress(referral);

  // Generate unique identifiers
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  // Validate spins within game limits
  const spinsValue = ensureIntRange(
    spins ?? gameEntry.config.spins.default,
    'spins',
    gameEntry.config.spins.min,
    gameEntry.config.spins.max
  );

  // Get VRF fee (static for slots - one seed for all spins)
  const vrfFee = await getStaticVrfFee(publicClient, gameEntry.contract);

  // Encode game data for contract
  const encodedData = encodeAbiParameters(
    [
      { name: 'gameId', type: 'uint256' },
      { name: 'numSpins', type: 'uint8' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [gameId, spinsValue, refAddress, userRandomWord]
  );

  const config = {
    spins: spinsValue,
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
    gpPerApe,
    timeoutMs,
  });
}

// ============================================================================
// CONFIG GETTER
// ============================================================================

/**
 * Get Slots config from CLI options or strategy
 *
 * Resolution order:
 * 1. Explicit --spins flag
 * 2. Positional argument from CLI
 * 3. Random within strategy's configured range
 *
 * @param {Object} opts - CLI options
 * @param {Object} positionalConfig - Parsed positional arguments
 * @param {Object} strategyConfig - Strategy configuration
 * @param {Function} randomIntInclusive - Random number generator
 * @returns {Object} { spins: number }
 *
 * @example
 * // Strategy 'aggressive' has spins [3, 10]
 * getSlotsConfig({}, {}, aggressiveConfig, randomIntInclusive)
 * // Returns: { spins: 7 } (random between 3-10)
 */
export function getSlotsConfig(opts, positionalConfig, strategyConfig, randomIntInclusive) {
  // Explicit --spins flag takes priority
  if (opts.spins !== undefined) {
    return { spins: parseInt(opts.spins) };
  }

  // Positional argument
  if (positionalConfig.spins !== undefined) {
    return { spins: positionalConfig.spins };
  }

  // Fall back to strategy range
  const [spinMin, spinMax] = strategyConfig.slots?.spins || [1, 15];
  return { spins: randomIntInclusive(spinMin, spinMax) };
}
