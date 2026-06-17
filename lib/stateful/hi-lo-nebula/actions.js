/**
 * Hi-Lo Nebula transactions and polling helpers.
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
  formatRetryDelay,
  formatRetryReason,
  isTransientTransactionError,
  submitAndConfirmWithRetry,
} from '../../tx-resilience.js';
import { GuessDirection, HI_LO_NEBULA_ABI, HI_LO_NEBULA_CONTRACT } from './constants.js';
import { getGameState } from './state.js';

const HI_LO_NEBULA_DISPLAY_NAME = resolveGameDisplayName({
  gameKey: 'hi-lo-nebula',
  contract: HI_LO_NEBULA_CONTRACT,
  fallbackName: 'Hi-Lo Nebula',
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

function logRetry({ json = false, label = 'Transaction' } = {}, retry) {
  if (json) return;
  const reason = retry.reason === 'reverted' ? 'reverted' : 'failed';
  console.log(`   ⚠️  ${label} ${reason}, retrying in ${formatRetryDelay(retry.delayMs)}... (${formatRetryReason(retry.error)})`);
}

export async function startGame({
  account,
  publicClient,
  walletClient,
  betAmountApe,
  vrfFee,
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
      { type: 'address' },
      { type: 'bytes32' },
    ],
    [gameId, referral, randomBytes32()]
  );

  const gameIdString = gameId.toString();

  try {
    const result = await submitAndConfirmWithRetry({
      resilient,
      retryReverted: true,
      legacyDelayMs: 3000,
      send: () => walletClient.writeContract({
        address: HI_LO_NEBULA_CONTRACT,
        abi: HI_LO_NEBULA_ABI,
        functionName: 'play',
        args: [account.address, gameData],
        value: totalValue,
      }),
      wait: (hash) => publicClient.waitForTransactionReceipt({
        hash,
        timeout: 90000,
      }),
      onSubmitted: () => addActiveGame('hi-lo-nebula', gameIdString),
      onReverted: () => removeActiveGame('hi-lo-nebula', gameIdString),
      onRetry: (retry) => logRetry({ json, label: 'Transaction' }, retry),
    });

    saveGameToHistory({
      contract: HI_LO_NEBULA_CONTRACT,
      gameId: gameIdString,
      timestamp: Date.now(),
      tx: result.hash,
      game: HI_LO_NEBULA_DISPLAY_NAME,
      game_key: 'hi-lo-nebula',
      rtp_game: 'hi-lo-nebula',
      walletAddress: account.address,
    });

    return { hash: result.hash, receipt: result.receipt, pending: Boolean(result.pending), gameId: gameIdString };
  } catch (error) {
    removeActiveGame('hi-lo-nebula', gameIdString);
    throw new Error(`Failed to start ${HI_LO_NEBULA_DISPLAY_NAME} after retry: ${sanitizeError(error)}`);
  }
}

export async function executeGuess({
  account,
  publicClient,
  walletClient,
  gameId,
  direction,
  vrfFee,
  resilient = false,
  json = false,
}) {
  const result = await submitAndConfirmWithRetry({
    resilient,
    retryReverted: true,
    legacyDelayMs: 3000,
    send: () => walletClient.writeContract({
      address: HI_LO_NEBULA_CONTRACT,
      abi: HI_LO_NEBULA_ABI,
      functionName: 'makeGuess',
      args: [BigInt(gameId), Number(direction), randomBytes32()],
      value: vrfFee,
    }),
    wait: (hash) => publicClient.waitForTransactionReceipt({
      hash,
      timeout: 90000,
    }),
    onRetry: (retry) => logRetry({ json, label: 'Guess transaction' }, retry),
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
      address: HI_LO_NEBULA_CONTRACT,
      abi: HI_LO_NEBULA_ABI,
      functionName: 'cashOut',
      args: [BigInt(gameId)],
    }),
    wait: (hash) => publicClient.waitForTransactionReceipt({
      hash,
      timeout: 90000,
    }),
    onRetry: (retry) => logRetry({ json, label: 'Cashout transaction' }, retry),
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
    if (!state.awaitingInitialDeal && !state.awaitingGuessResult) {
      return state;
    }

    onPoll(attempt, state);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Timeout waiting for Hi-Lo Nebula state transition');
}

export function completeGame(gameId, {
  wagerApe = null,
  payoutApe = null,
  feesPaidApe = null,
  gpPerApe = null,
  walletAddress = null,
  txHash = null,
} = {}) {
  removeActiveGame('hi-lo-nebula', gameId);
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
    contract: HI_LO_NEBULA_CONTRACT,
    gameId: gameId.toString(),
    timestamp: Date.now(),
    tx: txHash,
    game: HI_LO_NEBULA_DISPLAY_NAME,
    game_key: 'hi-lo-nebula',
    rtp_game: 'hi-lo-nebula',
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

export function normalizeCliAction(actionName) {
  const normalized = String(actionName || '').trim().toLowerCase();
  switch (normalized) {
    case 'higher':
    case 'high':
    case 'h':
      return GuessDirection.HIGHER;
    case 'lower':
    case 'low':
    case 'l':
      return GuessDirection.LOWER;
    case 'same':
    case 'push':
    case 's':
      return GuessDirection.SAME;
    case 'cash':
    case 'cashout':
    case 'c':
      return 'cashout';
    default:
      return null;
  }
}
