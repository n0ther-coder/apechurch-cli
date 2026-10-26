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
import { fetchDojoDropSettledResult, parseDojoDropSpins } from './dojo-drop.js';
import { fetchBlizzardBlitzSettledResult, parseBlizzardBlitzSpins, validateBlizzardBlitzWager } from './blizzard-blitz.js';
import { fetchGimbozGalaxySettledResult, parseGimbozGalaxySpins, validateGimbozGalaxyWager } from './gimboz-galaxy.js';
import { supportsSlotBonusBuy, validateSlotBonusOptions } from './cascade-slots.js';
import { getExecutorFee, getPlinkoVrfFee, getStaticVrfFee, executeGame, resolveGamePayloadInputs } from './base.js';

export function encodeSlotsGameData({ gameId, spins, refAddress, userRandomWord, order = 'game-id-first', bonus = false }) {
  if (order === 'spins-first-uint8-bonus') {
    return encodeAbiParameters(
      [{ type: 'uint8' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }, { type: 'bool' }],
      [spins, gameId, refAddress, userRandomWord, bonus],
    );
  }
  if (order === 'spins-first' || order === 'spins-first-uint8') {
    return encodeAbiParameters(
      [
        { name: 'numSpins', type: order === 'spins-first-uint8' ? 'uint8' : 'uint256' },
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
  return (await getSlotsTransactionCosts(publicClient, gameEntry, spins)).total;
}

export async function getSlotsTransactionCosts(publicClient, gameEntry, spins) {
  const vrfFee = await getSlotsVrfFee(publicClient, gameEntry, spins);
  if (gameEntry?.vrf?.executorFee === 'per-spin') {
    const executorFee = await getExecutorFee(publicClient, gameEntry.contract);
    const executor = executorFee * BigInt(spins);
    return { vrf: vrfFee, executor, total: vrfFee + executor };
  }
  return { vrf: vrfFee, executor: 0n, total: vrfFee };
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
 * @param {number} [params.split] - Number of independent paid spins 1-15 (default: 15)
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
 *   split: 10,
 *   timeoutMs: 30000,
 * });
 *
 * // Fewer spins for more variance
 * const result = await playSlots({
 *   ...params,
 *   split: 3,
 * });
 */
export async function playSlots({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  split,
  bonus = false,
  referral,
  xGameId,
  xRef,
  xUserRandomWord,
  gpPerApe,
  resilient,
  strictPreflight = false,
  timeoutMs,
}) {
  if (bonus && !supportsSlotBonusBuy(gameEntry)) throw new Error('--bonus is only for Blizzard Blitz and Gimboz of the Galaxy.');
  const { gameId, refAddress, userRandomWord } = resolveGamePayloadInputs({
    referral,
    xGameId,
    xRef,
    xUserRandomWord,
  });

  // Validate spins within game limits
  const spinsValue = gameEntry.key === 'gimboz-galaxy'
    ? validateGimbozGalaxyWager(wager, split ?? (bonus ? 1 : gameEntry.config.spins.default), bonus)
    : gameEntry.key === 'blizzard-blitz'
    ? validateBlizzardBlitzWager(wager, split ?? (bonus ? 1 : gameEntry.config.spins.default), bonus)
    : gameEntry.key === 'dojo-drop'
    ? parseDojoDropSpins(split ?? gameEntry.config.spins.default)
    : ensureIntRange(
        split ?? gameEntry.config.spins.default,
        'split',
        gameEntry.config.spins.min,
        gameEntry.config.spins.max
      );

  const minimumWager = getSlotsMinimumWager(gameEntry, spinsValue);
  if (minimumWager > 0n && wager < minimumWager) {
    throw new Error(`${gameEntry.name} requires at least ${gameEntry.config.minBetPerSpinApe} APE per spin (${formatEther(minimumWager)} APE total for ${spinsValue} spins).`);
  }

  const transactionCosts = await getSlotsTransactionCosts(publicClient, gameEntry, spinsValue);
  const transactionFee = transactionCosts.total;

  const encodedData = encodeSlotsGameData({
    gameId,
    spins: spinsValue,
    refAddress,
    userRandomWord,
    order: gameEntry.config.gameDataOrder,
    bonus,
  });

  const config = {
    split: spinsValue,
    ...(supportsSlotBonusBuy(gameEntry) ? { bonus } : {}),
  };

  return executeGame({
    account,
    publicClient,
    walletClient,
    contractAddress: gameEntry.contract,
    encodedData,
    wager,
    vrfFee: transactionFee,
    feeComponentsWei: { vrf: transactionCosts.vrf, executor: transactionCosts.executor },
    fetchSettledResult: gameEntry.key === 'dojo-drop' ? fetchDojoDropSettledResult
      : gameEntry.key === 'blizzard-blitz' ? fetchBlizzardBlitzSettledResult
      : gameEntry.key === 'gimboz-galaxy' ? fetchGimbozGalaxySettledResult : null,
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
 * Get Slots config from CLI options or strategy
 *
 * Resolution order:
 * 1. Explicit --split flag
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
 * @returns {Object} { split: number }
 *
 * @example
 * // Strategy 'aggressive' has spins [3, 10]
 * resolveSlotsConfig({
 *   opts: {},
 *   positionalConfig: {},
 *   strategyConfig: aggressiveConfig,
 *   randomIntInclusive,
 * })
 * // Returns: { split: 7 } (random between 3-10)
 */
export function resolveSlotsConfig({
  opts,
  positionalConfig,
  strategyConfig,
  randomIntInclusive,
  gameEntry,
  preferGameDefault = false,
}) {
  validateSlotBonusOptions(gameEntry, opts, positionalConfig);
  if (supportsSlotBonusBuy(gameEntry)) {
    const parseSpins = gameEntry.key === 'gimboz-galaxy' ? parseGimbozGalaxySpins : parseBlizzardBlitzSpins;
    if (opts.bonus) return { split: 1, bonus: true };
    for (const value of [opts.split, positionalConfig.spins]) {
      if (value !== undefined) parseSpins(value);
    }
    if (opts.split !== undefined && positionalConfig.spins !== undefined
      && Number(opts.split) !== Number(positionalConfig.spins)) {
      throw new Error(`Conflicting ${gameEntry.name} positional count and --split.`);
    }
    const value = opts.split ?? positionalConfig.spins;
    if (value !== undefined) return { split: parseSpins(value), bonus: false };
    if (preferGameDefault) return { split: gameEntry.config.spins.default, bonus: false };
    const [min, max] = strategyConfig?.slots?.spins || [1, 15];
    const lower = Math.min(gameEntry.config.spins.max, Math.max(1, min));
    const upper = Math.max(lower, Math.min(gameEntry.config.spins.max, max));
    return { split: randomIntInclusive(lower, upper), bonus: false };
  }
  if (gameEntry?.key === 'dojo-drop') {
    for (const value of [opts.split, positionalConfig.spins]) {
      if (value !== undefined) parseDojoDropSpins(value);
    }
    if (opts.split !== undefined && positionalConfig.spins !== undefined
      && Number(opts.split) !== Number(positionalConfig.spins)) {
      throw new Error('Conflicting Dojo Drop positional count and --split.');
    }
  }
  // Explicit count takes priority over defaults.
  if (opts.split !== undefined) {
    return { split: parseInt(opts.split) };
  }

  // Positional argument
  if (positionalConfig.spins !== undefined) {
    return { split: gameEntry?.key === 'dojo-drop'
      ? parseDojoDropSpins(positionalConfig.spins) : positionalConfig.spins };
  }

  if (preferGameDefault && gameEntry?.config?.spins?.default !== undefined) {
    return { split: gameEntry.config.spins.default };
  }

  // Fall back to strategy range
  const [spinMin, spinMax] = strategyConfig.slots?.spins || [1, 15];
  return { split: randomIntInclusive(spinMin, spinMax) };
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
