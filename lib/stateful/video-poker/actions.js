/**
 * Video Poker Actions
 * playGame, playerRedraw, state polling
 */
import { parseEther, encodeAbiParameters } from 'viem';
import {
  VIDEO_POKER_CONTRACT,
  VIDEO_POKER_ABI,
  BET_AMOUNTS,
} from './constants.js';
import { getGameState } from './state.js';
import {
  loadProfile,
  addActiveGame,
  estimateGpFromWagerApe,
  removeActiveGame,
  resolveGpPerApe,
  saveGameToHistory,
} from '../../profile.js';
import { randomUint256, randomBytes32, getValidRefAddress } from '../../utils.js';
import {
  formatRetryDelay,
  formatRetryReason,
  isTransientTransactionError,
  submitAndConfirmWithRetry,
} from '../../tx-resilience.js';

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

/**
 * Start a new video poker game with legacy retry and optional resilient backoff.
 */
export async function startGame({ account, publicClient, walletClient, betAmountIndex, vrfFeeInitial, json = false, resilient = false }) {
  const profile = loadProfile();
  const referral = getValidRefAddress(profile.referral);
  
  const betAmount = BET_AMOUNTS[betAmountIndex];
  const betWei = parseEther(betAmount.toString());
  const totalValue = betWei + vrfFeeInitial;
  
  // Generate random gameId (same pattern as blackjack)
  const gameId = randomUint256();
  
  // Encode game data: (betAmountIndex, gameId, ref, userRandomWord)
  const gameData = encodeAbiParameters(
    [
      { type: 'uint8' },
      { type: 'uint256' },
      { type: 'address' },
      { type: 'bytes32' },
    ],
    [betAmountIndex, gameId, referral, randomBytes32()]
  );
  
  const gameIdString = gameId.toString();

  try {
    const result = await submitAndConfirmWithRetry({
      resilient,
      retryReverted: true,
      legacyDelayMs: 3000,
      send: () => walletClient.writeContract({
        address: VIDEO_POKER_CONTRACT,
        abi: VIDEO_POKER_ABI,
        functionName: 'play',
        args: [account.address, gameData],
        value: totalValue,
      }),
      wait: (hash) => publicClient.waitForTransactionReceipt({
        hash,
        timeout: 90000,
      }),
      onSubmitted: () => addActiveGame('video-poker', gameIdString),
      onReverted: () => removeActiveGame('video-poker', gameIdString),
      onRetry: (retry) => logRetry({ json, label: 'Transaction' }, retry),
    });

      saveGameToHistory({
        contract: VIDEO_POKER_CONTRACT,
        gameId: gameIdString,
        timestamp: Date.now(),
        tx: result.hash,
        walletAddress: account.address,
      });

    return { hash: result.hash, receipt: result.receipt, pending: Boolean(result.pending), gameId: gameIdString };
  } catch (error) {
    removeActiveGame('video-poker', gameIdString);
    throw new Error(`Failed to start game after retry: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Execute player redraw
 */
export async function executeRedraw({ account, publicClient, walletClient, gameId, cardsToRedraw, vrfFeeRedraw, resilient = false, json = false }) {
  // Check if any cards are being redrawn
  const needsVrf = cardsToRedraw.some(Boolean);
  const value = needsVrf ? vrfFeeRedraw : 0n;
  
  const result = await submitAndConfirmWithRetry({
    resilient,
    retryReverted: true,
    legacyDelayMs: 3000,
    send: () => walletClient.writeContract({
      address: VIDEO_POKER_CONTRACT,
      abi: VIDEO_POKER_ABI,
      functionName: 'playerRedraw',
      args: [BigInt(gameId), cardsToRedraw],
      value,
    }),
    wait: (hash) => publicClient.waitForTransactionReceipt({
      hash,
      timeout: 90000,
    }),
    onRetry: (retry) => logRetry({ json, label: 'Redraw transaction' }, retry),
  });
  
  return { hash: result.hash, receipt: result.receipt, pending: Boolean(result.pending) };
}

/**
 * Wait for game state to change (VRF resolution)
 */
export async function waitForState(publicClient, gameId, opts = {}) {
  const maxAttempts = opts.maxAttempts || 60;
  const interval = opts.interval || 2000;
  const onPoll = opts.onPoll || (() => {});
  
  for (let i = 0; i < maxAttempts; i++) {
    let state;
    try {
      state = await getGameState(publicClient, gameId);
    } catch (error) {
      if (!isTransientTransactionError(error)) {
        throw error;
      }
      onPoll(i, null);
      await new Promise(resolve => setTimeout(resolve, interval));
      continue;
    }
    
    // If not awaiting RNG and either ready for decision or complete, return
    if (!state.awaitingRNG) {
      if (state.awaitingDecision || state.isComplete) {
        return state;
      }
    }
    
    onPoll(i, state);
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error('Timeout waiting for VRF resolution');
}

/**
 * Mark game as complete (remove from active games)
 */
export function completeGame(gameId, {
  wagerApe = null,
  payoutApe = null,
  feesPaidApe = null,
  gpPerApe = null,
  walletAddress = null,
  txHash = null,
} = {}) {
  removeActiveGame('video-poker', gameId);
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
    contract: VIDEO_POKER_CONTRACT,
    gameId: gameId.toString(),
    timestamp: Date.now(),
    tx: txHash,
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
