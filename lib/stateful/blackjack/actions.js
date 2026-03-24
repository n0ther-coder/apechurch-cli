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
  addActiveGame,
  removeActiveGame,
  saveGameToHistory,
} from '../../profile.js';

/**
 * Start a new blackjack game (with retry logic)
 * 
 * Includes 1 automatic retry with 3s backoff on transaction failure.
 * This prevents transient RPC/nonce issues from breaking loop mode.
 */
export async function startGame({
  account,
  publicClient,
  walletClient,
  betApe,
  sideBets = [0n, 0n],  // For later
  json = false,  // For error output format
}) {
  const profile = loadProfile();
  const refAddress = getValidRefAddress(profile.referral);
  
  // Generate game ID and random word
  const gameId = randomUint256();
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
  const totalValue = betWei + vrfFee;
  
  // Save to active games BEFORE sending tx
  addActiveGame('blackjack', gameId);
  
  // Transaction submission with 1 retry
  const MAX_RETRIES = 1;
  let lastError;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const txHash = await walletClient.writeContract({
        address: BLACKJACK_CONTRACT,
        abi: BLACKJACK_ABI,
        functionName: 'play',
        args: [account.address, gameData],
        value: totalValue,
      });
      
      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 90000,
      });
      
      if (receipt.status !== 'success') {
        throw new Error('Transaction reverted on-chain');
      }
      
      return {
        success: true,
        gameId,
        txHash,
        betApe,
        vrfFee,
      };
    } catch (error) {
      lastError = error;
      
      if (attempt < MAX_RETRIES) {
        // Log retry attempt
        if (!json) {
          console.log(`   ⚠️  Transaction failed, retrying in 3s... (${sanitizeError(error)})`);
        }
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
  
  // All retries failed
  removeActiveGame('blackjack', gameId);
  throw new Error(`Failed to start game after retry: ${sanitizeError(lastError)}`);
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
  
  let txHash;
  try {
    txHash = await walletClient.writeContract({
      address: BLACKJACK_CONTRACT,
      abi: BLACKJACK_ABI,
      functionName,
      args: [gameIdBigInt],
      value,
    });
  } catch (error) {
    throw new Error(`${action} failed: ${sanitizeError(error)}`);
  }
  
  // Wait for confirmation
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 90000,
    });
    
    if (receipt.status !== 'success') {
      throw new Error(`${action} transaction failed`);
    }
    
    return {
      success: true,
      action,
      txHash,
      value,
    };
  } catch (error) {
    throw new Error(`${action} failed: ${sanitizeError(error)}`);
  }
}

/**
 * Complete a game - remove from active, save to history
 */
export function completeGame(gameId) {
  removeActiveGame('blackjack', gameId);
  saveGameToHistory({
    contract: BLACKJACK_CONTRACT,
    gameId: gameId.toString(),
    timestamp: Date.now(),
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
    const state = await getGameState(publicClient, gameId);
    
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
