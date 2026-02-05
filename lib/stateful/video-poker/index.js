/**
 * @fileoverview Video Poker (Gimboz Poker) - Main Module
 *
 * Jacks or Better video poker implementation.
 * Supports both human players (interactive REPL) and AI agents (JSON mode).
 *
 * Features:
 * - Standard Jacks or Better rules
 * - Fixed denomination bets (1, 5, 10, 25, 50, 100 APE)
 * - Optimal hold strategy suggestions
 * - Auto-play mode with optimal strategy (--auto flag)
 * - Loop mode for continuous play (--loop flag)
 * - Resume interrupted games
 * - Progressive jackpot for Royal Flush at max bet
 * - Multiple display modes (ASCII cards, simple text, JSON)
 * - Betting strategies (flat, martingale, etc.)
 *
 * Game Flow:
 * 1. Player places bet → playGame() transaction
 * 2. VRF deals 5 cards
 * 3. Player selects cards to hold (1-5 or none)
 * 4. Redraw transaction replaces non-held cards
 * 5. Final hand evaluated → payout
 *
 * Hand Rankings (Jacks or Better):
 * - Royal Flush: 250x (or jackpot at max bet)
 * - Straight Flush: 50x
 * - Four of a Kind: 25x
 * - Full House: 9x
 * - Flush: 6x
 * - Straight: 4x
 * - Three of a Kind: 3x
 * - Two Pair: 2x
 * - Jacks or Better: 1x
 *
 * @module lib/stateful/video-poker/index
 */
import readline from 'readline';
import { formatEther, parseEther } from 'viem';
import { createClients } from '../../wallet.js';
import { loadProfile } from '../../profile.js';
import { getStrategy, calculateNextBet, getStrategyNames } from '../../strategies/index.js';
import {
  hasActiveGame,
  getOldestActiveGame,
  getActiveGameCount,
  removeActiveGame,
} from '../../profile.js';
import { GAS_RESERVE_APE } from '../../constants.js';
import {
  VIDEO_POKER_CONTRACT,
  GameState,
  BET_AMOUNTS,
  MAX_BET_INDEX,
} from './constants.js';
import {
  getVrfFees,
  getGameState,
  validateBetAmount,
  getJackpot,
} from './state.js';
import {
  startGame,
  executeRedraw,
  completeGame,
  waitForState,
} from './actions.js';
import {
  renderGame,
  renderHoldPrompt,
  parseHoldInput,
  renderPayoutTable,
  formatHoldConfirmation,
  isWinningHand,
} from './display.js';
import { getOptimalHold, holdToRedraw } from './strategy.js';

// Minimum balance floor for loop mode
const MIN_BALANCE_FLOOR = 1;

/**
 * Interactive prompt helper
 */
function prompt(question) {
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
 * Check for unfinished games and prompt to resume
 */
async function checkUnfinished(opts = {}) {
  const count = getActiveGameCount('video-poker');
  if (count === 0) return null;
  
  const gameId = getOldestActiveGame('video-poker');
  
  if (opts.json) {
    console.log(JSON.stringify({
      hasUnfinished: true,
      gameId,
      count,
    }));
    return gameId;
  }
  
  console.log(`\n⚠️  You have ${count} unfinished video poker game${count > 1 ? 's' : ''}.`);
  console.log(`   Game ID: ${gameId}\n`);
  
  const answer = await prompt('Resume this game? (Y/n): ');
  if (answer.toLowerCase() === 'n') {
    return null;
  }
  
  return gameId;
}

/**
 * Main entry point - start a new game (with optional looping)
 */
export async function start(amount, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.display || profile.cardDisplay || 'full';
  const isJson = displayMode === 'json' || opts.json;
  const loopMode = opts.loop || false;
  const targetBalance = opts.target ? parseFloat(opts.target) : null;
  const stopLoss = opts.stopLoss ? parseFloat(opts.stopLoss) : null;
  const maxGames = opts.maxGames ? parseInt(opts.maxGames, 10) : null;
  const maxBet = opts.maxBet ? parseFloat(opts.maxBet) : null;
  
  // Betting strategy setup
  const betStrategyName = opts.betStrategy || 'flat';
  const betStrategy = getStrategy(betStrategyName);
  if (!betStrategy) {
    const err = { error: `Unknown betting strategy: "${betStrategyName}". Available: ${getStrategyNames()}` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }
  
  // Validate loop parameters
  if (opts.target !== undefined && (isNaN(targetBalance) || targetBalance <= 0)) {
    const err = { error: `Invalid --target value: "${opts.target}". Must be a positive number.` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }
  if (opts.stopLoss !== undefined && (isNaN(stopLoss) || stopLoss < 0)) {
    const err = { error: `Invalid --stop-loss value: "${opts.stopLoss}". Must be a non-negative number.` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }
  if (opts.maxGames !== undefined && (isNaN(maxGames) || maxGames <= 0)) {
    const err = { error: `Invalid --max-games value: "${opts.maxGames}". Must be a positive integer.` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }
  if (opts.maxBet !== undefined && (isNaN(maxBet) || maxBet <= 0)) {
    const err = { error: `Invalid --max-bet value: "${opts.maxBet}". Must be a positive number.` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }
  if (targetBalance !== null && stopLoss !== null && stopLoss >= targetBalance) {
    const err = { error: `Invalid range: --stop-loss (${stopLoss}) must be less than --target (${targetBalance})` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }
  
  // Helper: find closest valid bet amount
  function findClosestBet(targetBet, availableBalance) {
    // Filter bets we can afford
    const affordableBets = BET_AMOUNTS.filter(b => b <= availableBalance);
    if (affordableBets.length === 0) return null;
    
    // Find closest to target
    let closest = affordableBets[0];
    for (const bet of affordableBets) {
      if (Math.abs(bet - targetBet) < Math.abs(closest - targetBet)) {
        closest = bet;
      }
      // Prefer rounding down for safety
      if (bet <= targetBet && bet > closest) closest = bet;
    }
    return closest;
  }
  
  // Check for unfinished games
  const existingGameId = await checkUnfinished({ json: isJson });
  if (existingGameId) {
    return await resume(existingGameId, opts);
  }
  
  // Validate bet amount
  const betValidation = validateBetAmount(amount);
  if (!betValidation.valid) {
    if (isJson) return console.log(JSON.stringify({ error: betValidation.error }));
    console.error(`\n❌ ${betValidation.error}\n`);
    return;
  }
  
  const betAmountIndex = betValidation.index;
  const betApe = betValidation.amount;
  
  // Get wallet
  const { getWallet } = await import('../../wallet.js');
  const account = getWallet();
  const { publicClient, walletClient } = createClients(account);
  
  // Track session stats for loop mode
  let gamesPlayed = 0;
  let startingBalance = null;
  let lastGameResult = null;
  
  // Initialize betting strategy
  const baseBet = betApe;
  let betStrategyState = betStrategy.init(baseBet, { maxBet });
  
  // Main loop (runs once if not in loop mode)
  while (true) {
    // Check balance
    const balance = await publicClient.getBalance({ address: account.address });
    const balanceApe = parseFloat(formatEther(balance));
    const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);
    
    // Track starting balance
    if (startingBalance === null) {
      startingBalance = balanceApe;
    }
    
    // Calculate bet using betting strategy (in loop mode)
    let currentBet = betApe;
    let currentBetIndex = betAmountIndex;
    if (loopMode) {
      const { bet: idealBet, state: newState, capped } = calculateNextBet(
        betStrategy, betStrategyState, lastGameResult,
        { maxBet, availableBalance: availableApe }
      );
      betStrategyState = newState;
      
      // Find closest valid bet amount for video poker
      const validBet = findClosestBet(idealBet, availableApe);
      if (validBet === null) {
        console.log(`\n🛑 Stopping: Cannot afford minimum bet (need ${BET_AMOUNTS[0]} APE)`);
        printSessionStats(gamesPlayed, startingBalance, balanceApe);
        break;
      }
      currentBet = validBet;
      currentBetIndex = BET_AMOUNTS.indexOf(validBet);
      
      // Show bet info for progressive strategies
      if (!isJson && betStrategyName !== 'flat') {
        const adjusted = validBet !== idealBet ? ` (adjusted from ${idealBet.toFixed(2)})` : '';
        console.log(`   📊 ${betStrategyName}: betting ${currentBet} APE${adjusted}`);
      }
    }
    
    const vrfFees = await getVrfFees(publicClient);
    const vrfFeeApe = parseFloat(formatEther(vrfFees.initial));
    const requiredApe = currentBet + vrfFeeApe;
    
    // Check minimum balance floor (loop mode)
    if (loopMode && balanceApe <= MIN_BALANCE_FLOOR) {
      console.log(`\n🛑 Stopping: Balance (${balanceApe.toFixed(2)} APE) at or below minimum floor (${MIN_BALANCE_FLOOR} APE)`);
      printSessionStats(gamesPlayed, startingBalance, balanceApe);
      break;
    }
    
    // Check if can afford bet
    if (availableApe < requiredApe) {
      if (loopMode) {
        console.log(`\n🛑 Stopping: Cannot afford ${currentBet} APE bet (have ${availableApe.toFixed(2)} APE available)`);
        printSessionStats(gamesPlayed, startingBalance, balanceApe);
        break;
      }
      if (isJson) return console.log(JSON.stringify({ error: 'Insufficient balance', required: requiredApe, available: availableApe }));
      console.error(`\n❌ Insufficient balance. Need ${requiredApe.toFixed(4)} APE, have ${availableApe.toFixed(4)} APE\n`);
      return;
    }
    
    // Check target balance (loop mode)
    if (loopMode && targetBalance !== null && balanceApe >= targetBalance) {
      const profit = balanceApe - startingBalance;
      console.log(`\n🎯 Target reached! Balance: ${balanceApe.toFixed(2)} APE (target: ${targetBalance} APE)`);
      console.log(`   Profit: +${profit.toFixed(2)} APE`);
      printSessionStats(gamesPlayed, startingBalance, balanceApe);
      break;
    }
    
    // Check stop-loss (loop mode)
    if (loopMode && stopLoss !== null && balanceApe <= stopLoss) {
      const loss = startingBalance - balanceApe;
      console.log(`\n🛑 Stop-loss hit! Balance: ${balanceApe.toFixed(2)} APE (limit: ${stopLoss} APE)`);
      console.log(`   Loss: -${loss.toFixed(2)} APE`);
      printSessionStats(gamesPlayed, startingBalance, balanceApe);
      break;
    }
    
    // Check max games (loop mode)
    if (loopMode && maxGames !== null && gamesPlayed >= maxGames) {
      const netResult = balanceApe - startingBalance;
      const sign = netResult >= 0 ? '+' : '';
      console.log(`\n🏁 Max games reached! Played ${gamesPlayed}/${maxGames} games`);
      console.log(`   Balance: ${balanceApe.toFixed(2)} APE (${sign}${netResult.toFixed(2)} APE)`);
      printSessionStats(gamesPlayed, startingBalance, balanceApe);
      break;
    }
    
    // Show jackpot for max bet
    if (!isJson && currentBetIndex === MAX_BET_INDEX) {
      const jackpot = await getJackpot(publicClient);
      const jackpotApe = parseFloat(formatEther(jackpot));
      console.log(`\n💎 Jackpot: ${jackpotApe.toFixed(2)} APE (Royal Flush at max bet)`);
    }
    
    // Start the game
    if (!isJson) {
      const gameNum = loopMode ? ` [Game #${gamesPlayed + 1}]` : '';
      console.log(`\n🃏 Starting Video Poker - ${currentBet} APE bet${gameNum}`);
      console.log('   Sending transaction...');
    }
    
    let result;
    try {
      result = await startGame({
        account,
        publicClient,
        walletClient,
        betAmountIndex: currentBetIndex,
        vrfFeeInitial: vrfFees.initial,
      });
    } catch (error) {
      if (isJson) return console.log(JSON.stringify({ error: error.message }));
      console.error(`\n❌ ${error.message}\n`);
      if (loopMode) printSessionStats(gamesPlayed, startingBalance, balanceApe);
      return;
    }
    
    if (!isJson) {
      console.log(`   Game ID: ${result.gameId}`);
      console.log('   Waiting for initial deal...\n');
    }
    
    // Wait for initial deal
    let state;
    try {
      state = await waitForState(publicClient, result.gameId, {
        onPoll: isJson ? null : () => process.stdout.write('.'),
      });
    } catch (error) {
      if (isJson) return console.log(JSON.stringify({ error: error.message, gameId: result.gameId }));
      console.error(`\n❌ ${error.message}`);
      console.log(`   💡 To resume: apechurch video-poker resume\n`);
      return;
    }
    
    if (!isJson) console.log('');
    
    // Track balance before game (for betting strategy)
    const balanceBeforeGame = balanceApe;
    
    // Enter game loop
    await gameLoop(account, publicClient, walletClient, state, { 
      displayMode, 
      auto: opts.auto,
      vrfFeeRedraw: vrfFees.redraw,
    });
    
    gamesPlayed++;
    
    // Track game result for betting strategy
    const balanceAfterBal = await publicClient.getBalance({ address: account.address });
    const balanceAfterGame = parseFloat(formatEther(balanceAfterBal));
    const gamePnl = balanceAfterGame - balanceBeforeGame;
    lastGameResult = {
      won: gamePnl > 0,
      bet: currentBet,
      payout: currentBet + gamePnl,
    };
    
    // If not looping, exit after one game
    if (!loopMode) break;
    
    // Small delay between games - show balance
    const currentApe = balanceAfterGame;
    const change = startingBalance !== null ? currentApe - startingBalance : 0;
    const changeStr = change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
    console.log(`\n⏳ Next game in 2s | 💰 Balance: ${currentApe.toFixed(2)} APE (${changeStr})\n`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

/**
 * Resume an existing game
 */
export async function resume(gameIdInput, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.display || profile.cardDisplay || 'full';
  const isJson = displayMode === 'json' || opts.json;
  
  let gameId = gameIdInput;
  if (!gameId) {
    gameId = getOldestActiveGame('video-poker');
    if (!gameId) {
      if (isJson) return console.log(JSON.stringify({ error: 'No active video poker games' }));
      console.error('\n❌ No active video poker games to resume\n');
      return;
    }
  }
  
  // Get wallet
  const { getWallet } = await import('../../wallet.js');
  const account = getWallet();
  const { publicClient, walletClient } = createClients(account);
  
  if (!isJson) {
    console.log(`\n🃏 Resuming Video Poker - Game ${gameId}`);
    console.log('   Fetching game state...\n');
  }
  
  let state;
  try {
    state = await getGameState(publicClient, gameId);
  } catch (error) {
    removeActiveGame('video-poker', gameId);
    if (isJson) return console.log(JSON.stringify({ error: `Game not found: ${gameId}` }));
    console.error(`\n❌ Game not found: ${gameId}\n`);
    return;
  }
  
  // Verify ownership
  if (state.player.toLowerCase() !== account.address.toLowerCase()) {
    if (isJson) return console.log(JSON.stringify({ error: 'Game belongs to different wallet' }));
    console.error('\n❌ This game belongs to a different wallet\n');
    return;
  }
  
  const vrfFees = await getVrfFees(publicClient);
  
  await gameLoop(account, publicClient, walletClient, state, { 
    displayMode, 
    auto: opts.auto,
    vrfFeeRedraw: vrfFees.redraw,
  });
}

/**
 * Show status of current game
 */
export async function status(gameIdInput, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.display || profile.cardDisplay || 'full';
  const isJson = displayMode === 'json' || opts.json;
  
  let gameId = gameIdInput;
  if (!gameId) {
    gameId = getOldestActiveGame('video-poker');
    if (!gameId) {
      if (isJson) return console.log(JSON.stringify({ active_games: 0 }));
      console.log('\nNo active video poker games.\n');
      return;
    }
  }
  
  const { getWallet } = await import('../../wallet.js');
  const account = getWallet();
  const { publicClient } = createClients(account);
  
  const state = await getGameState(publicClient, gameId);
  const output = renderGame(state, { displayMode });
  console.log(output);
}

/**
 * Show payout table
 */
export function payouts() {
  console.log(renderPayoutTable());
}

/**
 * Main game loop
 */
async function gameLoop(account, publicClient, walletClient, initialState, opts = {}) {
  const displayMode = opts.displayMode || 'full';
  const isJson = displayMode === 'json';
  const autoPlay = opts.auto || false;
  const vrfFeeRedraw = opts.vrfFeeRedraw;
  
  let state = initialState;
  const gameId = state.gameId;
  
  // Render current state
  const output = renderGame(state, { displayMode });
  console.log(output);
  
  // Check if already complete
  if (state.isComplete) {
    completeGame(gameId);
    if (!isJson) console.log('  Game complete!\n');
    return;
  }
  
  // Check if waiting for RNG
  if (state.awaitingRNG) {
    if (!isJson) console.log('  Waiting for cards...');
    state = await waitForState(publicClient, gameId);
    const output2 = renderGame(state, { displayMode });
    console.log(output2);
  }
  
  // If awaiting decision, prompt for which cards to HOLD
  if (state.awaitingDecision) {
    let cardsToRedraw;
    
    if (autoPlay) {
      // Auto-play: use optimal Jacks or Better strategy
      const optimal = getOptimalHold(state.initialCards);
      cardsToRedraw = holdToRedraw(optimal.hold);
      
      const holdCount = optimal.hold.filter(Boolean).length;
      if (holdCount === 5) {
        console.log(`  🤖 Optimal: Hold all (${optimal.reason})\n`);
      } else if (holdCount === 0) {
        console.log(`  🤖 Optimal: Discard all (${optimal.reason})\n`);
      } else {
        const heldPositions = optimal.hold.map((h, i) => h ? (i + 1) : null).filter(Boolean).join(', ');
        console.log(`  🤖 Optimal: Hold ${heldPositions} (${optimal.reason})\n`);
      }
    } else {
      // Interactive: prompt for cards to HOLD (rest get discarded)
      const input = await prompt(renderHoldPrompt());
      cardsToRedraw = parseHoldInput(input);
      
      // Safeguard: if discarding all AND have a winning hand, confirm
      const discardingAll = cardsToRedraw.every(r => r);
      if (discardingAll && isWinningHand(state.handStatus)) {
        // They're about to throw away a winning hand!
        const confirm = await prompt(`  ⚠️  You have a winner! Discard all anyway? (y/n): `);
        if (confirm.toLowerCase() !== 'y') {
          // Let them try again
          const input2 = await prompt(renderHoldPrompt());
          cardsToRedraw = parseHoldInput(input2);
        }
      }
    }
    
    const discardCount = cardsToRedraw.filter(Boolean).length;
    
    if (!isJson) {
      // Show confirmation of what's being held/discarded
      console.log('');
      console.log(formatHoldConfirmation(state.initialCards, cardsToRedraw));
      console.log('');
      console.log('  Sending transaction...');
    }
    
    // Execute redraw with retry
    let txSuccess = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await executeRedraw({
          account,
          publicClient,
          walletClient,
          gameId,
          cardsToRedraw,
          vrfFeeRedraw,
        });
        txSuccess = true;
        break;
      } catch (error) {
        if (attempt === 1) {
          console.error(`  ⚠️  Transaction failed: ${error.message}`);
          console.log('  Retrying in 1 second...\n');
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.error(`  ❌ Transaction failed after retry: ${error.message}\n`);
        }
      }
    }
    
    if (!txSuccess) {
      console.log(`  💡 To resume: apechurch video-poker resume\n`);
      return;
    }
    
    // Wait for final result
    if (discardCount > 0) {
      if (!isJson) console.log('  Waiting for new cards...\n');
      state = await waitForState(publicClient, gameId);
    } else {
      // No discards = immediate resolution
      state = await getGameState(publicClient, gameId);
    }
    
    // Show final result
    const finalOutput = renderGame(state, { displayMode });
    console.log(finalOutput);
  }
  
  // Mark complete
  if (state.isComplete) {
    completeGame(gameId);
    if (!isJson) console.log('  Game complete!\n');
  }
}

/**
 * Print session statistics
 */
function printSessionStats(gamesPlayed, startingBalance, endingBalance) {
  const netResult = endingBalance - startingBalance;
  const sign = netResult >= 0 ? '+' : '';
  console.log(`\n📊 Session Stats:`);
  console.log(`   Games played: ${gamesPlayed}`);
  console.log(`   Starting balance: ${startingBalance.toFixed(2)} APE`);
  console.log(`   Ending balance: ${endingBalance.toFixed(2)} APE`);
  console.log(`   Net result: ${sign}${netResult.toFixed(2)} APE\n`);
}
