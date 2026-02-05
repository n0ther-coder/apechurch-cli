/**
 * @fileoverview Base utilities for stateful games
 *
 * Provides shared infrastructure for multi-step games like Blackjack and Video Poker:
 * - Game ID generation and tracking
 * - Active game management (resume unfinished games)
 * - State polling from on-chain contracts
 * - Transaction execution with error handling
 * - Interactive prompts for REPL mode
 *
 * Stateful games differ from simple games:
 * - Multiple transactions per game session
 * - Player decisions between transactions
 * - Need to track "active games" that can be resumed
 * - Interactive mode for humans, JSON mode for agents
 *
 * @module lib/stateful/base
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

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generate a new unique game ID (random uint256)
 *
 * Used as the primary identifier for a game session on-chain.
 *
 * @returns {bigint} Random 256-bit unsigned integer
 */
export function generateGameId() {
  return randomUint256();
}

/**
 * Generate random bytes32 for user-provided entropy
 *
 * Combined with VRF for additional randomness in game outcomes.
 *
 * @returns {string} 0x-prefixed 64-character hex string
 */
export function generateUserRandom() {
  return randomBytes32();
}

// ============================================================================
// INTERACTIVE PROMPTS
// ============================================================================

/**
 * Interactive prompt helper for REPL mode
 *
 * Displays a question and waits for user input with Enter key.
 *
 * @param {string} question - Question to display (include trailing space)
 * @returns {Promise<string>} User's input
 *
 * @example
 * const name = await prompt('Enter your name: ');
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
 * Wait for a single keypress (for REPL action selection)
 *
 * Enables raw mode to capture keys immediately without Enter.
 * Handles Ctrl+C for graceful exit.
 *
 * @param {string[]|null} [validKeys=null] - If provided, only accept these keys
 * @returns {Promise<string>} The pressed key (lowercase)
 *
 * @example
 * // Accept any key
 * const key = await waitForKey();
 *
 * // Only accept h, s, d
 * const key = await waitForKey(['h', 's', 'd']);
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

      // Handle Ctrl+C gracefully
      if (key === '\u0003') {
        process.exit(0);
      }

      // If valid keys specified, recurse until we get one
      if (validKeys && !validKeys.includes(key)) {
        resolve(waitForKey(validKeys));
      } else {
        resolve(key);
      }
    });
  });
}

// ============================================================================
// ACTIVE GAME MANAGEMENT
// ============================================================================

/**
 * Check for unfinished games before starting a new one
 *
 * Stateful games can be interrupted (network issues, user exits).
 * This checks for and optionally resumes those games.
 *
 * @param {string} gameType - Game type key ('blackjack', 'video-poker')
 * @param {Object} [opts={}] - Options
 * @param {boolean} [opts.json] - If true, return data instead of prompting
 * @returns {Promise<Object>} { shouldResume: boolean, gameId: string|null, count?: number }
 *
 * @example
 * const { shouldResume, gameId } = await checkUnfinishedGames('blackjack');
 * if (shouldResume) {
 *   // Resume the game with gameId
 * } else {
 *   // Start a new game
 * }
 */
export async function checkUnfinishedGames(gameType, opts = {}) {
  const count = getActiveGameCount(gameType);

  if (count === 0) {
    return { shouldResume: false, gameId: null };
  }

  const gameId = getOldestActiveGame(gameType);

  // In JSON mode, just return the info without prompting
  if (opts.json) {
    return { shouldResume: true, gameId, count };
  }

  // Interactive prompt
  console.log(`\n⚠️  You have ${count} unfinished ${gameType} game${count > 1 ? 's' : ''}.`);
  console.log(`   Game ID: ${gameId}`);

  const answer = await prompt('\nResume this game? (Y/n): ');
  const shouldResume = !answer || answer.toLowerCase() !== 'n';

  return { shouldResume, gameId, count };
}

// ============================================================================
// STATE POLLING
// ============================================================================

/**
 * Poll for game state from on-chain contract
 *
 * Used after sending a transaction to wait for VRF resolution.
 * Polls periodically until the game state indicates completion
 * or timeout is reached.
 *
 * @param {Object} params - Polling parameters
 * @param {import('viem').PublicClient} params.publicClient - viem public client
 * @param {string} params.contractAddress - Game contract address
 * @param {Array} params.abi - Contract ABI for the read function
 * @param {string} params.functionName - Function to call (e.g., 'getGameInfo')
 * @param {bigint} params.gameId - Game ID to query
 * @param {number} [params.pollIntervalMs=2000] - Time between polls
 * @param {number} [params.timeoutMs=60000] - Maximum time to wait
 * @param {Function|null} [params.checkComplete] - (state) => boolean to check if done
 * @returns {Promise<Object>} { state, complete: boolean }
 * @throws {Error} If timeout is reached
 *
 * @example
 * const { state, complete } = await pollGameState({
 *   publicClient,
 *   contractAddress,
 *   abi: BLACKJACK_ABI,
 *   functionName: 'getGameInfo',
 *   gameId,
 *   checkComplete: (s) => !s.awaitingRandomNumber,
 * });
 */
export async function pollGameState({
  publicClient,
  contractAddress,
  abi,
  functionName,
  gameId,
  pollIntervalMs = 2000,
  timeoutMs = 60000,
  checkComplete = null,
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

      // Return current state for display/processing
      return { state, complete: false };

    } catch (error) {
      // Game might not exist yet (transaction still pending)
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

// ============================================================================
// TRANSACTION EXECUTION
// ============================================================================

/**
 * Execute a stateful game action (send transaction)
 *
 * Handles the common pattern for game actions:
 * 1. Send the transaction
 * 2. Wait for confirmation
 * 3. Return result with success/failure
 *
 * @param {Object} params - Execution parameters
 * @param {import('viem/accounts').PrivateKeyAccount} params.account - Player's account
 * @param {import('viem').PublicClient} params.publicClient - viem public client
 * @param {import('viem').WalletClient} params.walletClient - viem wallet client
 * @param {string} params.contractAddress - Game contract address
 * @param {Array} params.abi - Contract ABI
 * @param {string} params.functionName - Function to call
 * @param {Array} params.args - Function arguments
 * @param {bigint} [params.value=0n] - ETH/APE value to send
 * @returns {Promise<Object>} { success: boolean, txHash: string, receipt: Object }
 * @throws {Error} If transaction fails or times out
 *
 * @example
 * const result = await executeAction({
 *   account,
 *   publicClient,
 *   walletClient,
 *   contractAddress,
 *   abi: BLACKJACK_ABI,
 *   functionName: 'playerHit',
 *   args: [gameId],
 *   value: vrfFee,
 * });
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

  // Send transaction
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
      timeout: 60000, // 1 minute timeout
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

// ============================================================================
// GAME SESSION MANAGEMENT
// ============================================================================

/**
 * Game lifecycle wrapper class
 *
 * Manages active game tracking through the game lifecycle:
 * - Start: Generate ID, add to active games
 * - Resume: Load existing game ID
 * - Complete: Remove from active games, save to history
 * - Failed: Remove from active games (transaction reverted)
 *
 * @example
 * const session = new GameSession('blackjack', contractAddress);
 *
 * // Start new game
 * const gameId = session.startNew();
 *
 * // ... game plays out ...
 *
 * // Game finishes
 * session.markComplete();
 */
export class GameSession {
  /**
   * Create a new game session manager
   *
   * @param {string} gameType - Game type key ('blackjack', 'video-poker')
   * @param {string} contractAddress - Contract address for history
   */
  constructor(gameType, contractAddress) {
    this.gameType = gameType;
    this.contractAddress = contractAddress;
    this.gameId = null;
    this.started = false;
  }

  /**
   * Start a new game
   *
   * Generates a unique game ID and adds it to active game tracking.
   *
   * @returns {bigint} The new game ID
   */
  startNew() {
    this.gameId = generateGameId();
    addActiveGame(this.gameType, this.gameId);
    this.started = true;
    return this.gameId;
  }

  /**
   * Resume an existing game
   *
   * @param {string|bigint} gameId - Existing game ID
   * @returns {bigint} The game ID as BigInt
   */
  resume(gameId) {
    this.gameId = BigInt(gameId);
    this.started = true;
    return this.gameId;
  }

  /**
   * Mark game as failed (transaction reverted or error)
   *
   * Removes from active game tracking without saving to history.
   */
  markFailed() {
    if (this.gameId) {
      removeActiveGame(this.gameType, this.gameId);
    }
    this.started = false;
  }

  /**
   * Mark game as successfully completed
   *
   * Removes from active game tracking and saves to history.
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
   * Get game ID as string for JSON output
   *
   * @returns {string|null} Game ID string or null if no active game
   */
  getGameIdString() {
    return this.gameId ? this.gameId.toString() : null;
  }
}

// ============================================================================
// OUTPUT FORMATTING
// ============================================================================

/**
 * Format game result for JSON output
 *
 * Standardizes the output format across all stateful games.
 *
 * @param {Object} params - Result parameters
 * @param {bigint} params.gameId - Game ID
 * @param {string} params.gameType - Game type key
 * @param {bigint} params.bet - Total bet amount in wei
 * @param {bigint} params.payout - Total payout amount in wei
 * @param {bigint} params.netResult - Net result (payout - bet) in wei
 * @param {string} params.txHash - Final transaction hash
 * @param {string} params.gameUrl - URL to view game on ape.church
 * @returns {Object} Formatted result object
 *
 * @example
 * formatGameResult({
 *   gameId: 123n,
 *   gameType: 'blackjack',
 *   bet: parseEther('10'),
 *   payout: parseEther('20'),
 *   netResult: parseEther('10'),
 *   txHash: '0x...',
 *   gameUrl: 'https://ape.church/games/blackjack?id=123',
 * })
 * // Returns: { status: 'complete', game: 'blackjack', won: true, net: '10.000000', ... }
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
