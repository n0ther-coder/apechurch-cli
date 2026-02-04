/**
 * Base utilities for stateful games
 * Shared logic for game state management, transactions, and polling
 */
import readline from 'readline';
import { formatEther } from 'viem';
import { createClients } from '../wallet.js';
import { randomUint256, randomBytes32, sanitizeError } from '../utils.js';
import {
  addActiveGame,
  removeActiveGame,
  hasActiveGame,
  getOldestActiveGame,
  getActiveGameCount,
  saveGameToHistory,
} from '../profile.js';

/**
 * Generate a new game ID (random uint256)
 */
export function generateGameId() {
  return randomUint256();
}

/**
 * Generate random bytes32 for user entropy
 */
export function generateUserRandom() {
  return randomBytes32();
}

/**
 * Interactive prompt helper
 */
export function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Single key input (for REPL mode)
 * Returns immediately when a key is pressed
 */
export function waitForKey(validKeys = null) {
  return new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', (data) => {
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      const key = data.toString().toLowerCase();
      
      // Handle Ctrl+C
      if (key === '\u0003') {
        process.exit(0);
      }
      
      // Filter to valid keys if specified
      if (validKeys && !validKeys.includes(key)) {
        resolve(waitForKey(validKeys)); // Recurse
      } else {
        resolve(key);
      }
    });
  });
}

/**
 * Check for unfinished games before starting new one
 * Returns { shouldResume, gameId } or null if no active games
 */
export async function checkUnfinishedGames(gameType, opts = {}) {
  const count = getActiveGameCount(gameType);
  
  if (count === 0) {
    return { shouldResume: false, gameId: null };
  }
  
  const gameId = getOldestActiveGame(gameType);
  
  if (opts.json) {
    // In JSON mode, just return the info
    return { shouldResume: true, gameId, count };
  }
  
  // Interactive prompt
  console.log(`\n⚠️  You have ${count} unfinished ${gameType} game${count > 1 ? 's' : ''}.`);
  console.log(`   Game ID: ${gameId}`);
  
  const answer = await prompt('\nResume this game? (Y/n): ');
  const shouldResume = !answer || answer.toLowerCase() !== 'n';
  
  return { shouldResume, gameId, count };
}

/**
 * Poll for game state with timeout
 */
export async function pollGameState({
  publicClient,
  contractAddress,
  abi,
  functionName,
  gameId,
  pollIntervalMs = 2000,
  timeoutMs = 60000,
  checkComplete = null, // (state) => boolean
}) {
  const startTime = Date.now();
  
  while (true) {
    try {
      const state = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName,
        args: [gameId],
      });
      
      // If we have a completion checker, use it
      if (checkComplete && checkComplete(state)) {
        return { state, complete: true };
      }
      
      // Return current state for display
      return { state, complete: false };
      
    } catch (error) {
      // Game might not exist yet (tx pending)
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Timeout waiting for game state: ${sanitizeError(error)}`);
      }
    }
    
    // Wait before next poll
    await new Promise(r => setTimeout(r, pollIntervalMs));
    
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      throw new Error('Timeout waiting for game state');
    }
  }
}

/**
 * Execute a stateful game action (transaction)
 * Handles common patterns: send tx, wait for receipt, handle errors
 */
export async function executeAction({
  account,
  publicClient,
  walletClient,
  contractAddress,
  abi,
  functionName,
  args,
  value = 0n,
}) {
  let txHash;
  
  try {
    txHash = await walletClient.writeContract({
      address: contractAddress,
      abi,
      functionName,
      args,
      value,
    });
  } catch (error) {
    throw new Error(`Transaction failed: ${sanitizeError(error)}`);
  }
  
  // Wait for confirmation
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60000,
    });
    
    return {
      success: receipt.status === 'success',
      txHash,
      receipt,
    };
  } catch (error) {
    throw new Error(`Transaction confirmation failed: ${sanitizeError(error)}`);
  }
}

/**
 * Game lifecycle wrapper
 * Manages active game tracking through the game lifecycle
 */
export class GameSession {
  constructor(gameType, contractAddress) {
    this.gameType = gameType;
    this.contractAddress = contractAddress;
    this.gameId = null;
    this.started = false;
  }
  
  /**
   * Start a new game - generates ID and tracks it
   */
  startNew() {
    this.gameId = generateGameId();
    addActiveGame(this.gameType, this.gameId);
    this.started = true;
    return this.gameId;
  }
  
  /**
   * Resume an existing game
   */
  resume(gameId) {
    this.gameId = BigInt(gameId);
    this.started = true;
    return this.gameId;
  }
  
  /**
   * Mark game as failed (tx reverted) - removes from tracking
   */
  markFailed() {
    if (this.gameId) {
      removeActiveGame(this.gameType, this.gameId);
    }
    this.started = false;
  }
  
  /**
   * Mark game as complete - removes from tracking, saves to history
   */
  markComplete() {
    if (this.gameId) {
      removeActiveGame(this.gameType, this.gameId);
      saveGameToHistory({
        contract: this.contractAddress,
        gameId: this.gameId.toString(),
        timestamp: Date.now(),
      });
    }
    this.started = false;
  }
  
  /**
   * Get current game ID as string (for JSON output)
   */
  getGameIdString() {
    return this.gameId ? this.gameId.toString() : null;
  }
}

/**
 * Format game result for output
 */
export function formatGameResult({
  gameId,
  gameType,
  bet,
  payout,
  netResult,
  txHash,
  gameUrl,
}) {
  const netApe = Number(formatEther(netResult));
  const won = netApe > 0;
  
  return {
    status: 'complete',
    game: gameType,
    gameId: gameId.toString(),
    bet: formatEther(bet),
    payout: formatEther(payout),
    net: netApe.toFixed(6),
    won,
    txHash,
    gameUrl,
  };
}
