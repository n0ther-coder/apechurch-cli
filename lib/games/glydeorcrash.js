/**
 * @fileoverview Glyde or Crash game handler
 *
 * Glyde or Crash is a fixed-target crash game. The player chooses a target
 * multiplier, then wins only if the revealed crash multiplier reaches or
 * exceeds that target.
 *
 * Verified on-chain encoding:
 * - targetMultiplier: uint256 (basis points, so 2x = 20000)
 * - gameId: uint256
 * - ref: address
 * - userRandomWord: bytes32
 *
 * @module lib/games/glydeorcrash
 */
import { encodeAbiParameters } from 'viem';
import {
  formatGlydeOrCrashTargetMultiplier,
  getGlydeOrCrashExactRtpPercent,
  getGlydeOrCrashWinProbability,
  parseGlydeOrCrashTargetMultiplierInput,
} from '../rtp.js';
import { getStaticVrfFee, executeGame, resolveGamePayloadInputs } from './base.js';

export const GLYDE_OR_CRASH_GAME_INFO_ABI = [
  {
    type: 'function',
    name: 'getGameInfo',
    stateMutability: 'view',
    inputs: [{ name: 'gameId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'player', type: 'address' },
        { name: 'betAmount', type: 'uint256' },
        { name: 'targetMultiplier', type: 'uint256' },
        { name: 'crashMultiplier', type: 'uint256' },
        { name: 'totalPayout', type: 'uint256' },
        { name: 'hasEnded', type: 'bool' },
        { name: 'timestamp', type: 'uint256' },
      ],
    }],
  },
];

function formatPercentDisplay(value, digits = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return `${numeric.toFixed(digits).replace(/\.?0+$/, '')}%`;
}

function parseBigIntLike(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value !== '') {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

export function buildGlydeOrCrashConfig(rawMultiplier, gameEntry = null) {
  const normalizedDisplay = formatGlydeOrCrashTargetMultiplier(
    rawMultiplier ?? gameEntry?.config?.multiplier?.default ?? '2x',
  );

  if (!normalizedDisplay) {
    throw new Error('multiplier must be between 1.01x and 10000x.');
  }

  const multiplierBasisPoints = parseGlydeOrCrashTargetMultiplierInput(normalizedDisplay.replace(/,/g, ''));
  const winProbability = getGlydeOrCrashWinProbability(multiplierBasisPoints);
  const exactRtp = getGlydeOrCrashExactRtpPercent(multiplierBasisPoints);

  return {
    multiplier: normalizedDisplay,
    multiplierBasisPoints,
    targetMultiplier: multiplierBasisPoints,
    winChance: formatPercentDisplay((winProbability ?? 0) * 100),
    payout: normalizedDisplay,
    exactRtp: formatPercentDisplay(exactRtp, 8),
  };
}

export function getGlydeOrCrashConfig(
  opts,
  positionalConfig,
  gameEntry,
  strategyConfig,
  randomIntInclusive,
  options = {},
) {
  if (opts.multiplier !== undefined) {
    return buildGlydeOrCrashConfig(opts.multiplier, gameEntry);
  }

  if (positionalConfig.multiplier !== undefined) {
    return buildGlydeOrCrashConfig(positionalConfig.multiplier, gameEntry);
  }

  if (options.preferGameDefault) {
    return buildGlydeOrCrashConfig(gameEntry?.config?.multiplier?.default ?? '2x', gameEntry);
  }

  const [rangeMin, rangeMax] = strategyConfig.glydeOrCrash?.multiplierBasisPoints || [15000, 50000];
  const multiplierBasisPoints = randomIntInclusive(
    Math.min(rangeMin, rangeMax),
    Math.max(rangeMin, rangeMax),
  );

  return buildGlydeOrCrashConfig(multiplierBasisPoints, gameEntry);
}

export async function playGlydeOrCrash({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  multiplier,
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
  const config = buildGlydeOrCrashConfig(multiplier, gameEntry);
  const vrfFee = await getStaticVrfFee(publicClient, gameEntry.contract);

  const encodedData = encodeAbiParameters(
    [
      { name: 'targetMultiplier', type: 'uint256' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [BigInt(config.multiplierBasisPoints), gameId, refAddress, userRandomWord],
  );

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
    fetchSettledResult: fetchGlydeOrCrashSettledResult,
    gpPerApe,
    timeoutMs,
  });
}

export function formatGlydeOrCrashSettledDetails(rawGameInfo = {}) {
  const targetMultiplierBasisPoints = Number(rawGameInfo.targetMultiplier);
  const crashMultiplierBasisPoints = Number(rawGameInfo.crashMultiplier);
  const targetMultiplier = formatGlydeOrCrashTargetMultiplier(targetMultiplierBasisPoints);
  const crashMultiplier = formatGlydeOrCrashTargetMultiplier(crashMultiplierBasisPoints);
  const totalPayout = parseBigIntLike(rawGameInfo.totalPayout);
  const reachedTarget = (
    Number.isFinite(targetMultiplierBasisPoints)
    && Number.isFinite(crashMultiplierBasisPoints)
  )
    ? crashMultiplierBasisPoints >= targetMultiplierBasisPoints
    : null;

  return {
    target_multiplier: targetMultiplier,
    target_multiplier_bps: Number.isFinite(targetMultiplierBasisPoints) ? targetMultiplierBasisPoints : null,
    crash_multiplier: crashMultiplier,
    crash_multiplier_bps: Number.isFinite(crashMultiplierBasisPoints) ? crashMultiplierBasisPoints : null,
    won: totalPayout > 0n,
    reached_target: reachedTarget,
    crashed_before_target: reachedTarget === null ? null : !reachedTarget,
  };
}

export async function fetchGlydeOrCrashSettledResult({ publicClient, contractAddress, gameId }) {
  const rawGameInfo = await publicClient.readContract({
    address: contractAddress,
    abi: GLYDE_OR_CRASH_GAME_INFO_ABI,
    functionName: 'getGameInfo',
    args: [gameId],
  });

  return {
    details: formatGlydeOrCrashSettledDetails(rawGameInfo),
  };
}
