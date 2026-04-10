/**
 * @fileoverview ApeStrong game handler (pick-your-odds dice)
 *
 * ApeStrong is a "limbo" style game where the player chooses their win probability.
 *
 * Mechanics:
 * - Player picks a range value (5-95)
 * - This represents their exact win probability as a percentage
 * - The contract resolves `winningNumber = uint8(randomWords[0] % 100)`
 * - Player wins if `winningNumber < edgeFlipRange`
 *
 * Payout calculation:
 * - Lower range = higher payout (inverse relationship)
 * - The verified contract uses a live `edgeFlipRangeToPayout(range)` table
 * - The current live table closely tracks `floor(975000 / range)` with a few range-specific overrides
 *
 * Examples:
 * - Range 50 → 50% chance → ~1.95x payout
 * - Range 25 → 25% chance → ~3.9x payout
 * - Range 5 → 5% chance → ~19.5x payout
 * - Range 95 → 95% chance → ~1.025x payout
 *
 * On-chain encoding:
 * - edgeFlipRange: uint8 (5-95)
 * - gameId: uint256
 * - ref: address (referral)
 * - userRandomWord: bytes32 (client entropy)
 *
 * @module lib/games/apestrong
 */
import { encodeAbiParameters } from 'viem';
import { ensureIntRange } from '../utils.js';
import { getStaticVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';
import { getApestrongPayoutMultiplier } from '../rtp.js';

function formatApestrongPayoutMultiplier(multiplier) {
  return `${Number(multiplier).toFixed(4).replace(/\.?0+$/, '')}x`;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Play an ApeStrong game
 *
 * @param {Object} params - Game parameters
 * @param {import('viem/accounts').PrivateKeyAccount} params.account - Player's account
 * @param {import('viem').PublicClient} params.publicClient - viem public client
 * @param {import('viem').WalletClient} params.walletClient - viem wallet client
 * @param {Object} params.gameEntry - Game registry entry
 * @param {bigint} params.wager - Wager in wei
 * @param {number} [params.range] - Win probability 5-95 (default: 50)
 * @param {string} [params.referral] - Referral address
 * @param {number} params.timeoutMs - How long to wait for result
 *
 * @returns {Promise<Object>} Game response with status and result
 * @throws {Error} If range is invalid or transaction fails
 *
 * @example
 * // 50% win chance (balanced risk)
 * const result = await playApestrong({
 *   account,
 *   publicClient,
 *   walletClient,
 *   gameEntry,
 *   wager: parseEther('10'),
 *   range: 50,
 *   timeoutMs: 30000,
 * });
 *
 * // 10% win chance (high risk, high reward)
 * const result = await playApestrong({
 *   ...params,
 *   range: 10, // ~9.75x payout if you win
 * });
 */
export async function playApestrong({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  range,
  referral,
  gpPerApe,
  timeoutMs,
}) {
  // Validate referral address
  const refAddress = getValidRefAddress(referral);

  // Generate unique identifiers
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  // Validate and normalize range value
  // Uses game config for min/max (5-95) and default (50)
  const rangeValue = ensureIntRange(
    range ?? gameEntry.config.range.default,
    'range',
    gameEntry.config.range.min,
    gameEntry.config.range.max
  );

  // Get VRF fee (static for ApeStrong - one random number needed)
  const vrfFee = await getStaticVrfFee(publicClient, gameEntry.contract);

  // Encode game data for contract
  // Contract decodes: (uint8 edgeFlipRange, uint256 gameId, address ref, bytes32 userRandomWord)
  const encodedData = encodeAbiParameters(
    [
      { name: 'edgeFlipRange', type: 'uint8' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [rangeValue, gameId, refAddress, userRandomWord]
  );

  // Display the verified on-chain payout multiplier, while keeping the
  // legacy response field name for compatibility.
  const exactPayoutMultiplier = getApestrongPayoutMultiplier(rangeValue);
  const approxPayout = formatApestrongPayoutMultiplier(
    exactPayoutMultiplier ?? (97.5 / rangeValue)
  );

  const config = {
    range: rangeValue,
    winChance: `${rangeValue}%`,
    approxPayout,
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
 * Get ApeStrong config from CLI options or strategy
 *
 * Resolution order:
 * 1. Explicit --range flag
 * 2. Positional argument from CLI
 * 3. Random within strategy's range bounds
 *
 * @param {Object} opts - CLI options
 * @param {Object} positionalConfig - Parsed positional arguments
 * @param {Object} strategyConfig - Strategy configuration
 * @param {Function} randomIntInclusive - Random number generator function
 * @returns {Object} { range: number }
 *
 * @example
 * // Strategy 'conservative' has range [60, 80]
 * getApestrongConfig({}, {}, conservativeConfig, randomIntInclusive)
 * // Returns: { range: 72 } (random between 60-80)
 *
 * // Explicit flag overrides strategy
 * getApestrongConfig({ range: '25' }, {}, strategyConfig, randomIntInclusive)
 * // Returns: { range: 25 }
 */
export function getApestrongConfig(opts, positionalConfig, gameEntry, strategyConfig, randomIntInclusive, options = {}) {
  // Explicit --range flag takes priority
  if (opts.range !== undefined) {
    return { range: parseInt(opts.range) };
  }

  // Positional argument from CLI parsing
  if (positionalConfig.range !== undefined) {
    return { range: positionalConfig.range };
  }

  if (options.preferGameDefault) {
    return { range: gameEntry.config.range.default };
  }

  // Fall back to strategy's configured range
  const [rangeMin, rangeMax] = strategyConfig.apestrong?.range || [40, 60];
  return { range: randomIntInclusive(rangeMin, rangeMax) };
}
