/**
 * Cash Dash transactions and polling helpers.
 */
import { encodeAbiParameters, parseEther } from 'viem';
import { resolveGameDisplayName } from '../../../registry.js';
import {
  addActiveGame,
  estimateGpFromWagerApe,
  loadProfile,
  removeActiveGame,
  resolveGpPerApe,
  saveGameToHistory,
} from '../../profile.js';
import { getValidRefAddress, randomBytes32, randomUint256, sanitizeError } from '../../utils.js';
import {
  isTransientTransactionError,
  logTransactionRetry,
  submitAndConfirmWithRetry,
} from '../../tx-resilience.js';
import { CASH_DASH_ABI, CASH_DASH_CONTRACT } from './constants.js';
import { getGameState } from './state.js';

const CASH_DASH_DISPLAY_NAME = resolveGameDisplayName({
  gameKey: 'cash-dash',
  contract: CASH_DASH_CONTRACT,
  fallbackName: 'Cash Dash',
});

function apeAmountToWeiString(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    return undefined;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return undefined;
  }

  const normalized = typeof value === 'string' && value.trim()
    ? value.trim()
    : numeric.toFixed(18).replace(/\.?0+$/, '');
  return parseEther(normalized || '0').toString();
}

export async function startGame({
  account,
  publicClient,
  walletClient,
  betAmountApe,
  vrfFee,
  firstGuessIndex = 0,
  tilesetSeed = 0n,
  json = false,
  resilient = false,
}) {
  const profile = loadProfile();
  const referral = getValidRefAddress(profile.referral);
  const betWei = parseEther(String(betAmountApe));
  const gameId = randomUint256();
  const totalValue = betWei + vrfFee;
  const gameData = encodeAbiParameters(
    [
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint8' },
      { type: 'address' },
      { type: 'bytes32' },
    ],
    [gameId, BigInt(tilesetSeed || 0n), Number(firstGuessIndex), referral, randomBytes32()]
  );

  const gameIdString = gameId.toString();

  try {
    const result = await submitAndConfirmWithRetry({
      resilient,
      retryReverted: true,
      legacyDelayMs: 3000,
      send: () => walletClient.writeContract({
        address: CASH_DASH_CONTRACT,
        abi: CASH_DASH_ABI,
        functionName: 'play',
        args: [account.address, gameData],
        value: totalValue,
      }),
      wait: (hash) => publicClient.waitForTransactionReceipt({
        hash,
        timeout: 90000,
      }),
      onSubmitted: () => addActiveGame('cash-dash', gameIdString),
      onReverted: () => removeActiveGame('cash-dash', gameIdString),
      onRetry: logTransactionRetry,
    });

    saveGameToHistory({
      contract: CASH_DASH_CONTRACT,
      gameId: gameIdString,
      timestamp: Date.now(),
      tx: result.hash,
      game: CASH_DASH_DISPLAY_NAME,
      game_key: 'cash-dash',
      rtp_game: 'cash-dash',
      walletAddress: account.address,
    });

    return { hash: result.hash, receipt: result.receipt, pending: Boolean(result.pending), gameId: gameIdString };
  } catch (error) {
    removeActiveGame('cash-dash', gameIdString);
    throw new Error(`Failed to start ${CASH_DASH_DISPLAY_NAME}: ${sanitizeError(error)}`);
  }
}

export async function executeGuess({
  publicClient,
  walletClient,
  gameId,
  index,
  vrfFee,
  resilient = false,
  json = false,
}) {
  const result = await submitAndConfirmWithRetry({
    resilient,
    retryReverted: true,
    legacyDelayMs: 3000,
    send: () => walletClient.writeContract({
      address: CASH_DASH_CONTRACT,
      abi: CASH_DASH_ABI,
      functionName: 'makeGuess',
      args: [BigInt(gameId), Number(index), randomBytes32()],
      value: vrfFee,
    }),
    wait: (hash) => publicClient.waitForTransactionReceipt({
      hash,
      timeout: 90000,
    }),
    onRetry: logTransactionRetry,
  });

  return { hash: result.hash, receipt: result.receipt, pending: Boolean(result.pending) };
}

export async function executeCashOut({
  publicClient,
  walletClient,
  gameId,
  resilient = false,
  json = false,
}) {
  const result = await submitAndConfirmWithRetry({
    resilient,
    retryReverted: true,
    legacyDelayMs: 3000,
    send: () => walletClient.writeContract({
      address: CASH_DASH_CONTRACT,
      abi: CASH_DASH_ABI,
      functionName: 'cashOut',
      args: [BigInt(gameId)],
    }),
    wait: (hash) => publicClient.waitForTransactionReceipt({
      hash,
      timeout: 90000,
    }),
    onRetry: logTransactionRetry,
  });

  return { hash: result.hash, receipt: result.receipt, pending: Boolean(result.pending) };
}

export async function waitForState(publicClient, gameId, runtimeConfig, opts = {}) {
  const maxAttempts = opts.maxAttempts || 60;
  const interval = opts.interval || 2000;
  const onPoll = typeof opts.onPoll === 'function' ? opts.onPoll : () => {};

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let state;
    try {
      state = await getGameState(publicClient, gameId, runtimeConfig);
    } catch (error) {
      if (!isTransientTransactionError(error)) {
        throw error;
      }
      onPoll(attempt, null);
      await new Promise((resolve) => setTimeout(resolve, interval));
      continue;
    }
    if (!state.awaitingGuessResult) {
      return state;
    }

    onPoll(attempt, state);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Timeout waiting for Cash Dash state transition');
}

export function completeGame(gameId, {
  wagerApe = null,
  payoutApe = null,
  feesPaidApe = null,
  gpPerApe = null,
  walletAddress = null,
  txHash = null,
} = {}) {
  removeActiveGame('cash-dash', gameId);
  const estimatedGp = wagerApe !== null && wagerApe !== undefined
    ? estimateGpFromWagerApe({
        wagerApe,
        gpPerApe: gpPerApe ?? resolveGpPerApe({ walletAddress }),
      })
    : null;
  const wagerWei = apeAmountToWeiString(wagerApe);
  const payoutWei = apeAmountToWeiString(payoutApe);
  const contractFeeWei = apeAmountToWeiString(feesPaidApe) ?? '0';
  const hasEconomics = wagerWei !== undefined && payoutWei !== undefined;

  saveGameToHistory({
    contract: CASH_DASH_CONTRACT,
    gameId: gameId.toString(),
    timestamp: Date.now(),
    tx: txHash,
    game: CASH_DASH_DISPLAY_NAME,
    game_key: 'cash-dash',
    rtp_game: 'cash-dash',
    settled: hasEconomics ? true : undefined,
    wager_wei: wagerWei,
    payout_wei: payoutWei,
    contract_fee_wei: hasEconomics ? contractFeeWei : undefined,
    gas_fee_wei: hasEconomics ? '0' : undefined,
    gp_received_raw: estimatedGp,
    gp_source: estimatedGp !== null ? 'local-estimate' : undefined,
    last_sync_on: hasEconomics ? new Date().toISOString() : undefined,
    last_sync_msg: hasEconomics ? 'ok' : undefined,
    walletAddress,
  });
}
