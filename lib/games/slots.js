/**
 * @fileoverview Slots game handler (Dino Dough, Bubblegum Heist, Geez Diggerz, Sushi Showdown)
 *
 * Classic slot machine games with multiple spins per bet.
 *
 * Games using this handler:
 * - Dino Dough: Dinosaur-themed slots
 * - Bubblegum Heist: Candy-themed slots
 * - Geez Diggerz: 6-symbol lower-ceiling slots
 * - Sushi Showdown: 7-symbol higher-ceiling slots
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
 * Most slots use a static VRF fee (single random seed generates all spins).
 * Reel Pirates uses getVRFFee(customGasLimit) plus EXECUTOR_FEE() per paid
 * base spin, matching the live UI transaction builder.
 *
 * On-chain encoding:
 * - Most slot-family games: gameId, numSpins, ref, userRandomWord
 * - Reel Pirates: numSpins, gameId, ref, userRandomWord
 * - ref: address (referral)
 * - userRandomWord: bytes32 (client entropy)
 *
 * @module lib/games/slots
 */
import { encodeAbiParameters, formatEther, parseEther } from 'viem';
import { ensureIntRange } from '../utils.js';
import { getExecutorFee, getPlinkoVrfFee, getStaticVrfFee, executeGame, resolveGamePayloadInputs } from './base.js';

export function encodeSlotsGameData({ gameId, spins, refAddress, userRandomWord, order = 'game-id-first' }) {
  if (order === 'spins-first') {
    return encodeAbiParameters(
      [
        { name: 'numSpins', type: 'uint256' },
        { name: 'gameId', type: 'uint256' },
        { name: 'ref', type: 'address' },
        { name: 'userRandomWord', type: 'bytes32' },
      ],
      [BigInt(spins), gameId, refAddress, userRandomWord]
    );
  }

  return encodeAbiParameters(
    [
      { name: 'gameId', type: 'uint256' },
      { name: 'numSpins', type: 'uint8' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [gameId, spins, refAddress, userRandomWord]
  );
}

export function getSlotsVrfGasLimit(gameEntry, spins) {
  const baseGas = Number(gameEntry?.vrf?.baseGas ?? 0);
  const perUnitGas = Number(gameEntry?.vrf?.perUnitGas ?? 0);
  if (!Number.isFinite(baseGas) || !Number.isFinite(perUnitGas) || perUnitGas <= 0) {
    throw new Error(`Invalid dynamic VRF gas configuration for ${gameEntry?.name || 'slots game'}.`);
  }
  return Math.trunc(baseGas + (spins * perUnitGas));
}

export async function getSlotsVrfFee(publicClient, gameEntry, spins) {
  if (gameEntry?.vrf?.type === 'slots-dynamic') {
    return getPlinkoVrfFee(publicClient, gameEntry.contract, getSlotsVrfGasLimit(gameEntry, spins));
  }
  return getStaticVrfFee(publicClient, gameEntry.contract);
}

export async function getSlotsTransactionFee(publicClient, gameEntry, spins) {
  const vrfFee = await getSlotsVrfFee(publicClient, gameEntry, spins);
  if (gameEntry?.vrf?.executorFee === 'per-spin') {
    const executorFee = await getExecutorFee(publicClient, gameEntry.contract);
    return vrfFee + (executorFee * BigInt(spins));
  }
  return vrfFee;
}

export function getSlotsMinimumWager(gameEntry, spins) {
  const minBetPerSpinApe = Number(gameEntry?.config?.minBetPerSpinApe ?? 0);
  if (!Number.isFinite(minBetPerSpinApe) || minBetPerSpinApe <= 0) {
    return 0n;
  }
  return parseEther(String(minBetPerSpinApe)) * BigInt(spins);
}

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

  // Validate spins within game limits
  const spinsValue = ensureIntRange(
    spins ?? gameEntry.config.spins.default,
    'spins',
    gameEntry.config.spins.min,
    gameEntry.config.spins.max
  );

  const minimumWager = getSlotsMinimumWager(gameEntry, spinsValue);
  if (minimumWager > 0n && wager < minimumWager) {
    throw new Error(`${gameEntry.name} requires at least ${gameEntry.config.minBetPerSpinApe} APE per spin (${formatEther(minimumWager)} APE total for ${spinsValue} spins).`);
  }

  const transactionFee = await getSlotsTransactionFee(publicClient, gameEntry, spinsValue);

  const encodedData = encodeSlotsGameData({
    gameId,
    spins: spinsValue,
    refAddress,
    userRandomWord,
    order: gameEntry.config.gameDataOrder,
  });

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
    vrfFee: transactionFee,
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
 * 3. Optional fixed default from the game registry
 * 4. Random within strategy's configured range
 *
 * @param {Object} params - Resolution inputs
 * @param {Object} params.opts - CLI options
 * @param {Object} params.positionalConfig - Parsed positional arguments
 * @param {Object} params.strategyConfig - Strategy configuration
 * @param {Function} params.randomIntInclusive - Random number generator
 * @param {Object} [params.gameEntry] - Game registry entry for default fallback
 * @param {boolean} [params.preferGameDefault=false] - Whether to use the registry default before strategy randomness
 * @returns {Object} { spins: number }
 *
 * @example
 * // Strategy 'aggressive' has spins [3, 10]
 * resolveSlotsConfig({
 *   opts: {},
 *   positionalConfig: {},
 *   strategyConfig: aggressiveConfig,
 *   randomIntInclusive,
 * })
 * // Returns: { spins: 7 } (random between 3-10)
 */
export function resolveSlotsConfig({
  opts,
  positionalConfig,
  strategyConfig,
  randomIntInclusive,
  gameEntry,
  preferGameDefault = false,
}) {
  // Explicit --spins flag takes priority
  if (opts.spins !== undefined) {
    return { spins: parseInt(opts.spins) };
  }

  // Positional argument
  if (positionalConfig.spins !== undefined) {
    return { spins: positionalConfig.spins };
  }

  if (preferGameDefault && gameEntry?.config?.spins?.default !== undefined) {
    return { spins: gameEntry.config.spins.default };
  }

  // Fall back to strategy range
  const [spinMin, spinMax] = strategyConfig.slots?.spins || [1, 15];
  return { spins: randomIntInclusive(spinMin, spinMax) };
}

export function getSlotsConfig(opts, positionalConfig, gameEntry, strategyConfig, randomIntInclusive, options = {}) {
  return resolveSlotsConfig({
    opts,
    positionalConfig,
    gameEntry,
    strategyConfig,
    randomIntInclusive,
    preferGameDefault: Boolean(options.preferGameDefault),
  });
}
