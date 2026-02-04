/**
 * Video Poker Actions
 * playGame, playerRedraw, state polling
 */
import { parseEther, encodeAbiParameters, keccak256, toHex } from 'viem';
import {
  VIDEO_POKER_CONTRACT,
  VIDEO_POKER_ABI,
  GameState,
  BET_AMOUNTS,
} from './constants.js';
import { getGameState } from './state.js';
import { loadProfile, addActiveGame, removeActiveGame } from '../../profile.js';

/**
 * Generate random bytes32
 */
function generateRandomWord() {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return keccak256(toHex(randomBytes));
}

/**
 * Start a new video poker game
 */
export async function startGame({ account, publicClient, walletClient, betAmountIndex, vrfFeeInitial }) {
  const profile = loadProfile();
  const referral = profile.referral || '0x0000000000000000000000000000000000000000';
  
  const betAmount = BET_AMOUNTS[betAmountIndex];
  const betWei = parseEther(betAmount.toString());
  const totalValue = betWei + vrfFeeInitial;
  
  // Encode game data: (betAmountIndex, gameId, ref, userRandomWord)
  // gameId = 0 for new game
  const gameData = encodeAbiParameters(
    [
      { type: 'uint8' },
      { type: 'uint256' },
      { type: 'address' },
      { type: 'bytes32' },
    ],
    [betAmountIndex, 0n, referral, generateRandomWord()]
  );
  
  // Send transaction
  const hash = await walletClient.writeContract({
    address: VIDEO_POKER_CONTRACT,
    abi: VIDEO_POKER_ABI,
    functionName: 'playGame',
    args: [gameData],
    value: totalValue,
  });
  
  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  // Extract game ID from logs
  const gameId = extractGameId(receipt);
  
  if (gameId) {
    addActiveGame('video-poker', gameId);
  }
  
  return { hash, receipt, gameId };
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
 * Extract game ID from transaction receipt logs
 */
function extractGameId(receipt) {
  // Look for GameStarted event or similar
  // The game ID is typically in the first topic or data of the event
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === VIDEO_POKER_CONTRACT.toLowerCase()) {
      // Try to extract from topics (usually gameId is indexed)
      if (log.topics.length > 1) {
        try {
          const gameId = BigInt(log.topics[1]).toString();
          return gameId;
        } catch (e) {
          // Continue to next log
        }
      }
    }
  }
  return null;
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
