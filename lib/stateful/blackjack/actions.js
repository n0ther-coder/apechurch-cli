/**
 * Blackjack Action Execution
 * Handles all game transactions
 */
import { encodeAbiParameters, parseEther } from 'viem';
import {
  BLACKJACK_CONTRACT,
  BLACKJACK_ABI,
  GAME_DATA_TYPES,
  GameState,
  Action,
} from './constants.js';
import { getVrfFee, getGameState, getActiveHand } from './state.js';
import { createClients } from '../../wallet.js';
import { randomUint256, randomBytes32, sanitizeError, getValidRefAddress } from '../../utils.js';
import { loadProfile } from '../../profile.js';
import {
  formatRetryDelay,
  formatRetryReason,
  isTransientTransactionError,
  submitAndConfirmWithRetry,
} from '../../tx-resilience.js';
import {
  addActiveGame,
  estimateGpFromWagerApe,
  removeActiveGame,
  resolveGpPerApe,
  saveGameToHistory,
} from '../../profile.js';

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
 * Start a new blackjack game with legacy retry and optional resilient backoff.
 */
export async function startGame({
  account,
  publicClient,
  walletClient,
  betApe,
  sideBets = [0n, 0n],  // For later
  json = false,  // For error output format
  resilient = false,
}) {
  const profile = loadProfile();
  const refAddress = getValidRefAddress(profile.referral);
  
  // Generate game ID and random word
  const gameId = randomUint256();
  const gameIdString = gameId.toString();
  const userRandomWord = randomBytes32();
  
  // Get VRF fee
  const vrfFee = await getVrfFee(publicClient);
  
  // Encode game data
  const gameData = encodeAbiParameters(
    [
      { name: 'sideBets', type: 'uint256[]' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [sideBets, gameId, refAddress, userRandomWord]
  );
  
  // Calculate total value
  const betWei = parseEther(betApe.toString());
  const sideBetTotalWei = sideBets.reduce((sum, amount) => sum + amount, 0n);
  const totalValue = betWei + sideBetTotalWei + vrfFee;
  
  // Save to active games BEFORE sending tx
  addActiveGame('blackjack', gameIdString);
  
  try {
    const result = await submitAndConfirmWithRetry({
      resilient,
      retryReverted: true,
      legacyDelayMs: 3000,
      send: () => walletClient.writeContract({
        address: BLACKJACK_CONTRACT,
        abi: BLACKJACK_ABI,
        functionName: 'play',
        args: [account.address, gameData],
        value: totalValue,
      }),
      wait: (hash) => publicClient.waitForTransactionReceipt({
        hash,
        timeout: 90000,
      }),
      onRetry: (retry) => logRetry({ json, label: 'Transaction' }, retry),
    });

    saveGameToHistory({
      contract: BLACKJACK_CONTRACT,
      gameId: gameIdString,
      timestamp: Date.now(),
      tx: result.hash,
      walletAddress: account.address,
    });

    return {
      success: !result.pending,
      pending: Boolean(result.pending),
      gameId: gameIdString,
      txHash: result.hash,
      betApe,
      vrfFee,
    };
  } catch (error) {
    removeActiveGame('blackjack', gameIdString);
    throw new Error(`Failed to start game after retry: ${sanitizeError(error)}`);
  }
}

/**
 * Execute a player action
 */
export async function executeAction({
  account,
  publicClient,
  walletClient,
  gameId,
  action,
  state,  // Current game state
  vrfFee,
  resilient = false,
  json = false,
}) {
  const gameIdBigInt = BigInt(gameId);
  let functionName;
  let value = vrfFee;
  
  switch (action) {
    case Action.HIT:
      functionName = 'playerHit';
      value = vrfFee;
      break;
      
    case Action.STAND:
      functionName = 'playerStand';
      // Special case: no VRF if moving from split hand 1 to active hand 2
      if (state.gameState === GameState.SPLIT_ACTION_1 &&
          state.playerHands[1].isActive) {
        value = 0n;
      } else {
        value = vrfFee;
      }
      break;
      
    case Action.DOUBLE:
      functionName = 'playerDoubleDown';
      value = state.initialBet + vrfFee;
      break;
      
    case Action.SPLIT:
      functionName = 'playerSplit';
      value = state.initialBet + vrfFee;
      break;
      
    case Action.INSURANCE:
      functionName = 'playerInsurance';
      value = state.initialBet / 2n;  // Exact division, no rounding
      break;
      
    case Action.SURRENDER:
      functionName = 'playerSurrender';
      value = 0n;
      break;
      
    default:
      throw new Error(`Unknown action: ${action}`);
  }
  
  const result = await submitAndConfirmWithRetry({
    resilient,
    retryReverted: true,
    legacyDelayMs: 3000,
    send: () => walletClient.writeContract({
      address: BLACKJACK_CONTRACT,
      abi: BLACKJACK_ABI,
      functionName,
      args: [gameIdBigInt],
      value,
    }),
    wait: (hash) => publicClient.waitForTransactionReceipt({
      hash,
      timeout: 90000,
    }),
    onRetry: (retry) => logRetry({ json, label: action }, retry),
  }).catch((error) => {
    throw new Error(`${action} failed: ${sanitizeError(error)}`);
  });

  return {
    success: !result.pending,
    pending: Boolean(result.pending),
    action,
    txHash: result.hash,
    value,
  };
}

/**
 * Complete a game - remove from active, save to history
 */
export function completeGame(gameId, {
  wagerApe = null,
  payoutApe = null,
  feesPaidApe = null,
  gpPerApe = null,
  walletAddress = null,
  txHash = null,
} = {}) {
  removeActiveGame('blackjack', gameId);
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
    contract: BLACKJACK_CONTRACT,
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

/**
 * Poll for game state until not awaiting RNG
 */
export async function waitForState(publicClient, gameId, {
  pollIntervalMs = 2000,
  timeoutMs = 120000,
  onPoll = null,  // Callback on each poll
} = {}) {
  const startTime = Date.now();
  
  while (true) {
    let state;
    try {
      state = await getGameState(publicClient, gameId);
    } catch (error) {
      if (!isTransientTransactionError(error)) {
        throw error;
      }
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('Timeout waiting for VRF');
      }
      await new Promise(r => setTimeout(r, pollIntervalMs));
      continue;
    }
    
    if (onPoll) onPoll(state);
    
    // If not awaiting RNG, return
    if (!state.awaitingRandomNumber) {
      return state;
    }
    
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      throw new Error('Timeout waiting for VRF');
    }
    
    // Wait before next poll
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }
}
