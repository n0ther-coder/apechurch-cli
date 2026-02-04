/**
 * Video Poker - Main Module
 * Interactive game loop, CLI commands, resume functionality
 */
import readline from 'readline';
import { formatEther, parseEther } from 'viem';
import { createClients } from '../../wallet.js';
import { loadProfile } from '../../profile.js';
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
    
    const vrfFees = await getVrfFees(publicClient);
    const vrfFeeApe = parseFloat(formatEther(vrfFees.initial));
    const requiredApe = betApe + vrfFeeApe;
    
    // Check minimum balance floor (loop mode)
    if (loopMode && balanceApe <= MIN_BALANCE_FLOOR) {
      console.log(`\n🛑 Stopping: Balance (${balanceApe.toFixed(2)} APE) at or below minimum floor (${MIN_BALANCE_FLOOR} APE)`);
      printSessionStats(gamesPlayed, startingBalance, balanceApe);
      break;
    }
    
    // Check if can afford bet
    if (availableApe < requiredApe) {
      if (loopMode) {
        console.log(`\n🛑 Stopping: Cannot afford ${betApe} APE bet (have ${availableApe.toFixed(2)} APE available)`);
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
    
    // Show jackpot for max bet
    if (!isJson && betAmountIndex === MAX_BET_INDEX) {
      const jackpot = await getJackpot(publicClient);
      const jackpotApe = parseFloat(formatEther(jackpot));
      console.log(`\n💎 Jackpot: ${jackpotApe.toFixed(2)} APE (Royal Flush at max bet)`);
    }
    
    // Start the game
    if (!isJson) {
      const gameNum = loopMode ? ` [Game #${gamesPlayed + 1}]` : '';
      console.log(`\n🃏 Starting Video Poker - ${betApe} APE bet${gameNum}`);
      console.log('   Sending transaction...');
    }
    
    let result;
    try {
      result = await startGame({
        account,
        publicClient,
        walletClient,
        betAmountIndex,
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
    
    // Enter game loop
    await gameLoop(account, publicClient, walletClient, state, { 
      displayMode, 
      auto: opts.auto,
      vrfFeeRedraw: vrfFees.redraw,
    });
    
    gamesPlayed++;
    
    // If not looping, exit after one game
    if (!loopMode) break;
    
    // Small delay between games
    console.log('   Starting next game in 2 seconds...\n');
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
      // Auto-play: use optimal strategy (TODO: implement)
      // For now, just keep all cards
      cardsToRedraw = [false, false, false, false, false];
      console.log('  🤖 Auto-play: Holding all cards (strategy TBD)\n');
    } else {
      // Interactive: prompt for cards to HOLD (rest get discarded)
      const input = await prompt(renderHoldPrompt());
      cardsToRedraw = parseHoldInput(input);
      
      // Safeguard: if keeping all AND have a winning hand, confirm
      const keepingAll = cardsToRedraw.every(r => !r);
      if (keepingAll && isWinningHand(state.handStatus)) {
        // They already have a winner, good choice! No need to ask.
      } else if (keepingAll && state.handStatus === 0) {
        // Keeping all with nothing - ask if sure
        const confirm = await prompt('  ⚠️  You have nothing. Keep all anyway? (y/n): ');
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
