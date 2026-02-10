/**
 * Video Poker Actions
 * playGame, playerRedraw, state polling
 */
import { parseEther, encodeAbiParameters } from 'viem';
import {
  VIDEO_POKER_CONTRACT,
  VIDEO_POKER_ABI,
  GameState,
  BET_AMOUNTS,
} from './constants.js';
import { getGameState } from './state.js';
import { loadProfile, addActiveGame, removeActiveGame } from '../../profile.js';
import { randomUint256, randomBytes32, getValidRefAddress } from '../../utils.js';

/**
 * Start a new video poker game (with retry logic)
 * 
 * Includes 1 automatic retry with 2s backoff on transaction failure.
 * This prevents transient RPC/nonce issues from breaking loop mode.
 */
export async function startGame({ account, publicClient, walletClient, betAmountIndex, vrfFeeInitial, json = false }) {
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
  
  // Transaction submission with 1 retry
  const MAX_RETRIES = 1;
  let lastError;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const hash = await walletClient.writeContract({
        address: VIDEO_POKER_CONTRACT,
        abi: VIDEO_POKER_ABI,
        functionName: 'play',
        args: [account.address, gameData],
        value: totalValue,
      });
      
      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status !== 'success') {
        throw new Error('Transaction reverted on-chain');
      }
      
      // Store the gameId we generated
      addActiveGame('video-poker', gameId);
      
      return { hash, receipt, gameId: gameId.toString() };
    } catch (error) {
      lastError = error;
      
      if (attempt < MAX_RETRIES) {
        if (!json) {
          console.log(`   ⚠️  Transaction failed, retrying in 2s... (${error.message})`);
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  
  // All retries failed
  throw new Error(`Failed to start game after retry: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Execute player redraw
 */
export async function executeRedraw({ account, publicClient, walletClient, gameId, cardsToRedraw, vrfFeeRedraw }) {
  // Check if any cards are being redrawn
  const needsVrf = cardsToRedraw.some(Boolean);
  const value = needsVrf ? vrfFeeRedraw : 0n;
  
  const hash = await walletClient.writeContract({
    address: VIDEO_POKER_CONTRACT,
    abi: VIDEO_POKER_ABI,
    functionName: 'playerRedraw',
    args: [BigInt(gameId), cardsToRedraw],
    value,
  });
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  return { hash, receipt };
}

/**
 * Wait for game state to change (VRF resolution)
 */
export async function waitForState(publicClient, gameId, opts = {}) {
  const maxAttempts = opts.maxAttempts || 60;
  const interval = opts.interval || 2000;
  const onPoll = opts.onPoll || (() => {});
  
  for (let i = 0; i < maxAttempts; i++) {
    const state = await getGameState(publicClient, gameId);
    
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
export function completeGame(gameId) {
  removeActiveGame('video-poker', gameId);
}
