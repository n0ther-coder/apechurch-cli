/**
 * Cash Dash state management helpers.
 */
import { encodePacked, formatEther, keccak256, parseEther } from 'viem';
import {
  BASIS_POINTS,
  CASH_DASH_ABI,
  CASH_DASH_CONTRACT,
  DEFAULT_ROW_PAYOUT_BPS,
  MAX_TILES,
  MIN_TILES,
  ROWS_MODULUS,
} from './constants.js';

const ZERO_WEI = 0n;

export async function getRuntimeConfig(publicClient) {
  const rowPayoutEntries = await Promise.all(
    Array.from({ length: MAX_TILES - MIN_TILES + 1 }, async (_, offset) => {
      const tileCount = MIN_TILES + offset;
      const payout = await publicClient.readContract({
        address: CASH_DASH_CONTRACT,
        abi: CASH_DASH_ABI,
        functionName: 'rowPayouts',
        args: [tileCount],
      }).catch(() => BigInt(DEFAULT_ROW_PAYOUT_BPS[tileCount]));
      return [tileCount, Number(payout)];
    })
  );

  const [vrfFee, platformFee] = await Promise.all([
    publicClient.readContract({
      address: CASH_DASH_CONTRACT,
      abi: CASH_DASH_ABI,
      functionName: 'getVRFFee',
    }),
    publicClient.readContract({
      address: CASH_DASH_CONTRACT,
      abi: CASH_DASH_ABI,
      functionName: 'platformFee',
    }).catch(() => 250n),
  ]);

  return {
    vrfFee,
    platformFeeBps: Number(platformFee),
    rowPayoutBps: Object.fromEntries(rowPayoutEntries),
  };
}

export async function getGameState(publicClient, gameId, runtimeConfig = null) {
  const raw = await publicClient.readContract({
    address: CASH_DASH_CONTRACT,
    abi: CASH_DASH_ABI,
    functionName: 'getGameInfo',
    args: [BigInt(gameId)],
  });

  return parseGameInfo(raw, gameId, runtimeConfig);
}

export function parseGameInfo(raw, gameId, runtimeConfig = null) {
  const rowPayoutBps = runtimeConfig?.rowPayoutBps || DEFAULT_ROW_PAYOUT_BPS;
  const initialBetAmount = BigInt(getTupleValue(raw, 'initialBetAmount', 0) || ZERO_WEI);
  const payout = BigInt(getTupleValue(raw, 'payout', 1) || ZERO_WEI);
  const currentPayout = BigInt(getTupleValue(raw, 'currentPayout', 3) || ZERO_WEI);
  const rowGuesses = normalizeUint8Array(getTupleValue(raw, 'rowGuesses', 4));
  const rowDeathHits = normalizeUint8Array(getTupleValue(raw, 'rowDeathHits', 5));
  const tilesetSeed = BigInt(getTupleValue(raw, 'tilesetSeed', 6) || ZERO_WEI);
  const hasEnded = Boolean(getTupleValue(raw, 'hasEnded', 7));
  const displayRoundCount = Math.max(rowGuesses.length + 5, rowDeathHits.length + 5, 10);
  const rowsForRounds = Array.from({ length: displayRoundCount }, (_, roundId) =>
    getRowsForRoundLocal(roundId, tilesetSeed)
  );
  const rounds = buildRounds({
    rowGuesses,
    rowDeathHits,
    rowsForRounds,
    initialBetAmount,
    rowPayoutBps,
  });
  const roundsWon = rounds.filter((round) => round.resolved && round.safe).length;
  const awaitingGuessResult = !hasEnded && rowGuesses.length > rowDeathHits.length;
  const awaitingInitialReveal = awaitingGuessResult && rowDeathHits.length === 0;
  const awaitingDecision = !hasEnded
    && !awaitingGuessResult
    && rowGuesses.length === rowDeathHits.length
    && rowDeathHits.length > 0
    && currentPayout > ZERO_WEI;
  const currentRoundIndex = awaitingGuessResult
    ? rowGuesses.length - 1
    : rowDeathHits.length;
  const currentTileCount = rowsForRounds[currentRoundIndex] ?? getRowsForRoundLocal(currentRoundIndex, tilesetSeed);
  const currentRowPayoutBps = getRowPayoutBps(currentTileCount, rowPayoutBps);
  const currentMultiplier = getWeiRatio(currentPayout, initialBetAmount);
  const nextPayout = awaitingDecision
    ? (currentPayout * BigInt(currentRowPayoutBps)) / BigInt(BASIS_POINTS)
    : ZERO_WEI;
  const nextMultiplier = getWeiRatio(nextPayout, initialBetAmount);
  const totalWagered = estimateTotalWageredWei({
    initialBetAmount,
    rowGuesses,
    rowDeathHits,
    rowsForRounds,
    rowPayoutBps,
    fallbackCurrentPayout: currentPayout,
  });

  let outcome = null;
  if (hasEnded) {
    outcome = payout > ZERO_WEI ? 'cashout' : 'loss';
  }

  return {
    gameId: String(gameId),
    player: getTupleValue(raw, 'user', 2),
    initialBetAmount,
    initialBetAmountApe: Number.parseFloat(formatEther(initialBetAmount)),
    payout,
    payoutApe: Number.parseFloat(formatEther(payout)),
    currentPayout,
    currentPayoutApe: Number.parseFloat(formatEther(currentPayout)),
    currentMultiplier,
    rowGuesses,
    rowDeathHits,
    tilesetSeed,
    tilesetSeedLabel: tilesetSeed.toString(),
    hasEnded,
    timestamp: Number(getTupleValue(raw, 'timestamp', 8) || 0n),
    rounds,
    rowsForRounds,
    roundsWon,
    currentRoundIndex,
    currentTileCount,
    currentRowPayoutBps,
    currentRowMultiplier: currentRowPayoutBps / BASIS_POINTS,
    currentSurvivalProbability: currentTileCount > 0 ? (currentTileCount - 1) / currentTileCount : 0,
    nextPayout,
    nextPayoutApe: Number.parseFloat(formatEther(nextPayout)),
    nextMultiplier,
    totalWagered,
    totalWageredApe: Number.parseFloat(formatEther(totalWagered)),
    awaitingInitialReveal,
    awaitingGuessResult,
    awaitingDecision,
    canCashOut: awaitingDecision,
    isComplete: hasEnded,
    outcome,
    availableTiles: Array.from({ length: currentTileCount }, (_, index) => index),
    pendingGuessIndex: awaitingGuessResult ? rowGuesses[rowGuesses.length - 1] : null,
  };
}

export function getRowsForRoundLocal(roundId, tilesetSeed = 0n) {
  const round = BigInt(roundId || 0);
  const seed = BigInt(tilesetSeed || 0n);

  if (seed === 0n) {
    if (round > 0n && round % 20n === 0n) {
      return MIN_TILES;
    }
    return MAX_TILES - Number(round % 5n);
  }

  const encoded = encodePacked(['uint256', 'uint256'], [round, seed]);
  const tSeed = BigInt(keccak256(encoded));
  return Number(tSeed % BigInt(ROWS_MODULUS)) + MIN_TILES;
}

export function validateBetAmount(amount) {
  const numericAmount = Number.parseFloat(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return {
      valid: false,
      error: 'Bet amount must be a positive number of APE.',
    };
  }

  return {
    valid: true,
    amountApe: numericAmount,
  };
}

export function parseTileSelection(input, tileCount, { zeroBased = false } = {}) {
  const raw = String(input ?? '').trim().toLowerCase();
  if (raw === '' || raw === 'random' || raw === 'r') {
    return { valid: true, random: true, index: null };
  }

  if (!/^\d+$/.test(raw)) {
    return { valid: false, error: `Invalid tile: "${input}". Use 1-${tileCount} or "random".` };
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) {
    return { valid: false, error: `Invalid tile: "${input}". Use 1-${tileCount} or "random".` };
  }

  const index = zeroBased ? parsed : parsed - 1;
  if (index < 0 || index >= tileCount) {
    const range = zeroBased ? `0-${tileCount - 1}` : `1-${tileCount}`;
    return { valid: false, error: `Tile must be in range ${range}.` };
  }

  return { valid: true, random: false, index };
}

export function formatTileLabel(index, { oneBased = true } = {}) {
  const value = oneBased ? Number(index) + 1 : Number(index);
  return `Tile ${value}`;
}

export function formatMultiplier(multiplier, decimals = 4) {
  if (!Number.isFinite(multiplier)) {
    return 'N/A';
  }
  return `${multiplier.toFixed(decimals)}x`;
}

export function getNetProfitApe(state) {
  return (Number(state?.payoutApe) || 0) - (Number(state?.initialBetAmountApe) || 0);
}

function getTupleValue(raw, key, index) {
  if (!raw) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(raw, key)) {
    return raw[key];
  }
  return raw[index];
}

function normalizeUint8Array(value) {
  return Array.isArray(value) ? value.map((entry) => Number(entry)) : [];
}

function getRowPayoutBps(tileCount, rowPayoutBps) {
  return Number(rowPayoutBps?.[tileCount] ?? DEFAULT_ROW_PAYOUT_BPS[tileCount] ?? BASIS_POINTS);
}

function buildRounds({
  rowGuesses,
  rowDeathHits,
  rowsForRounds,
  initialBetAmount,
  rowPayoutBps,
}) {
  let runningPayout = initialBetAmount;
  const len = Math.max(rowGuesses.length, rowDeathHits.length);
  const rounds = [];

  for (let index = 0; index < len; index += 1) {
    const tileCount = rowsForRounds[index] ?? MAX_TILES;
    const guessIndex = rowGuesses[index] ?? null;
    const deathIndex = rowDeathHits[index] ?? null;
    const resolved = deathIndex !== null && deathIndex !== undefined;
    const safe = resolved && guessIndex !== deathIndex;
    const payoutBefore = runningPayout;
    let payoutAfter = ZERO_WEI;

    if (safe) {
      payoutAfter = (runningPayout * BigInt(getRowPayoutBps(tileCount, rowPayoutBps))) / BigInt(BASIS_POINTS);
      runningPayout = payoutAfter;
    } else if (resolved) {
      runningPayout = ZERO_WEI;
    }

    rounds.push({
      index,
      tileCount,
      guessIndex,
      deathIndex,
      resolved,
      safe,
      pending: guessIndex !== null && !resolved,
      payoutBefore,
      payoutBeforeApe: Number.parseFloat(formatEther(payoutBefore)),
      payoutAfter,
      payoutAfterApe: Number.parseFloat(formatEther(payoutAfter)),
      multiplierAfter: getWeiRatio(payoutAfter, initialBetAmount),
    });
  }

  return rounds;
}

function estimateTotalWageredWei({
  initialBetAmount,
  rowGuesses,
  rowDeathHits,
  rowsForRounds,
  rowPayoutBps,
  fallbackCurrentPayout,
}) {
  if (initialBetAmount <= ZERO_WEI) {
    return ZERO_WEI;
  }

  let total = initialBetAmount;
  let runningPayout = initialBetAmount;

  for (let index = 0; index < rowGuesses.length - 1; index += 1) {
    if (rowDeathHits[index] === undefined || rowGuesses[index] === rowDeathHits[index]) {
      return total;
    }

    const tileCount = rowsForRounds[index] ?? MAX_TILES;
    runningPayout = (runningPayout * BigInt(getRowPayoutBps(tileCount, rowPayoutBps))) / BigInt(BASIS_POINTS);
    total += runningPayout;
  }

  if (rowGuesses.length > 1 && fallbackCurrentPayout > ZERO_WEI && fallbackCurrentPayout < runningPayout) {
    return total - runningPayout + fallbackCurrentPayout;
  }

  return total;
}

function getWeiRatio(numerator, denominator) {
  const denom = BigInt(denominator || ZERO_WEI);
  if (denom <= ZERO_WEI) {
    return 0;
  }
  return Number(BigInt(numerator || ZERO_WEI)) / Number(denom);
}

export function parseTilesetSeed(input) {
  if (input === undefined || input === null || input === '') {
    return 0n;
  }

  try {
    const value = BigInt(String(input));
    if (value < 0n) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function formatApeFromWei(value) {
  return Number.parseFloat(formatEther(BigInt(value || ZERO_WEI))).toFixed(4);
}

export function parseApeToWei(value) {
  return parseEther(String(value));
}
