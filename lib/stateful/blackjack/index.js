/**
 * Blackjack - Main Module
 * Interactive game loop, CLI commands, resume functionality
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
  BLACKJACK_CONTRACT,
  GameState,
  Action,
} from './constants.js';
import {
  getVrfFee,
  getGameState,
  getAvailableActions,
  getActiveHand,
} from './state.js';
import {
  startGame,
  executeAction,
  completeGame,
  waitForState,
} from './actions.js';
import {
  renderGame,
  renderPrompt,
  parseActionInput,
} from './display.js';
import {
  getOptimalAction,
  strategyToKey,
  formatStrategyAction,
} from './strategy.js';

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
  const count = getActiveGameCount('blackjack');
  if (count === 0) return null;
  
  const gameId = getOldestActiveGame('blackjack');
  
  if (opts.json) {
    console.log(JSON.stringify({
      hasUnfinished: true,
      gameId,
      count,
    }));
    return gameId;
  }
  
  console.log(`\n⚠️  You have ${count} unfinished blackjack game${count > 1 ? 's' : ''}.`);
  console.log(`   Game ID: ${gameId}\n`);
  
  const answer = await prompt('Resume this game? (Y/n): ');
  if (answer.toLowerCase() === 'n') {
    return null;
  }
  
  return gameId;
}

// Minimum balance floor (APE) - stop looping if balance falls below this
const MIN_BALANCE_FLOOR = 1;

/**
 * Main entry point - start a new game (with optional looping)
 */
export async function start(amount, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.display || profile.cardDisplay || 'full';
  const isJson = displayMode === 'json' || opts.json;
  const loopMode = opts.loop || false;
  const targetProfit = opts.target ? parseFloat(opts.target) : null;
  const stopLoss = opts.stopLoss ? parseFloat(opts.stopLoss) : null;
  const maxGames = opts.maxGames ? parseInt(opts.maxGames, 10) : null;
  const maxBet = opts.maxBet ? parseFloat(opts.maxBet) : null;
  
  // Betting strategy setup
  const betStrategyName = opts.betStrategy || 'flat';
  const betStrategy = getStrategy(betStrategyName);
  if (!betStrategy) {
    const err = { error: `Unknown betting strategy: ${betStrategyName}. Available: ${getStrategyNames()}` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }
  
  // Check for unfinished games
  const existingGameId = await checkUnfinished({ json: isJson });
  if (existingGameId) {
    return await resume(existingGameId, opts);
  }
  
  // Validate amount
  const betApe = parseFloat(amount);
  if (isNaN(betApe) || betApe <= 0) {
    const error = { error: 'Invalid bet amount' };
    if (isJson) return console.log(JSON.stringify(error));
    console.error('\n❌ Invalid bet amount\n');
    return;
  }
  
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
    
    // Track starting balance for profit calculation
    if (startingBalance === null) {
      startingBalance = balanceApe;
    }
    
    // Calculate bet using betting strategy (in loop mode)
    let currentBet = betApe;
    if (loopMode) {
      const { bet: nextBet, state: newState, capped } = calculateNextBet(
        betStrategy, betStrategyState, lastGameResult,
        { maxBet, availableBalance: availableApe }
      );
      betStrategyState = newState;
      currentBet = nextBet;
      
      // Show bet info for progressive strategies
      if (!isJson && betStrategyName !== 'flat') {
        const betInfo = capped ? ' (capped)' : '';
        console.log(`   📊 ${betStrategyName}: betting ${currentBet.toFixed(2)} APE${betInfo}`);
      }
    }
    
    const vrfFee = await getVrfFee(publicClient);
    const vrfFeeApe = parseFloat(formatEther(vrfFee));
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
        console.log(`\n🛑 Stopping: Cannot afford ${currentBet.toFixed(2)} APE bet (have ${availableApe.toFixed(2)} APE available)`);
        printSessionStats(gamesPlayed, startingBalance, balanceApe);
        break;
      }
      const error = {
        error: 'Insufficient balance',
        required: requiredApe.toFixed(4),
        available: availableApe.toFixed(4),
      };
      if (isJson) return console.log(JSON.stringify(error));
      console.error(`\n❌ Insufficient balance. Need ${requiredApe.toFixed(4)} APE, have ${availableApe.toFixed(4)} APE\n`);
      return;
    }
    
    // Check target balance (loop mode)
    if (loopMode && targetProfit !== null) {
      if (balanceApe >= targetProfit) {
        const profit = balanceApe - startingBalance;
        console.log(`\n🎯 Target reached! Balance: ${balanceApe.toFixed(2)} APE (target: ${targetProfit} APE)`);
        console.log(`   Profit: +${profit.toFixed(2)} APE`);
        printSessionStats(gamesPlayed, startingBalance, balanceApe);
        break;
      }
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
    
    // Start the game
    if (!isJson) {
      const gameNum = loopMode ? ` [Game #${gamesPlayed + 1}]` : '';
      console.log(`\n🎰 Starting Blackjack - ${currentBet.toFixed(2)} APE bet${gameNum}`);
      console.log('   Sending transaction...');
    }
    
    let result;
    try {
      result = await startGame({
        account,
        publicClient,
        walletClient,
        betApe: currentBet,
      });
    } catch (error) {
      const err = { error: error.message };
      if (isJson) return console.log(JSON.stringify(err));
      console.error(`\n❌ ${error.message}\n`);
      if (loopMode) {
        console.log('   Stopping loop due to error.\n');
        printSessionStats(gamesPlayed, startingBalance, balanceApe);
      }
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
      const err = { error: error.message, gameId: result.gameId };
      if (isJson) return console.log(JSON.stringify(err));
      console.error(`\n❌ ${error.message}\n`);
      console.log(`   💡 To resume this game: apechurch blackjack resume\n`);
      return;
    }
    
    if (!isJson) console.log('');
    
    // Track balance before game (for betting strategy)
    const balanceBeforeGame = balanceApe;
    
    // Enter game loop
    await gameLoop(account, publicClient, walletClient, state, { displayMode, auto: opts.auto });
    
    gamesPlayed++;
    
    // Track game result for betting strategy
    const balanceAfterBal = await publicClient.getBalance({ address: account.address });
    const balanceAfterGame = parseFloat(formatEther(balanceAfterBal));
    const gamePnl = balanceAfterGame - balanceBeforeGame;
    lastGameResult = {
      won: gamePnl > 0,
      bet: currentBet,
      payout: currentBet + gamePnl, // Approximate payout
    };
    
    // If not looping, exit after one game
    if (!loopMode) break;
    
    // Small delay between games in loop mode - show balance
    const currentApe = balanceAfterGame;
    const change = startingBalance !== null ? currentApe - startingBalance : 0;
    const changeStr = change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
    console.log(`\n⏳ Next game in 2s | 💰 Balance: ${currentApe.toFixed(2)} APE (${changeStr})\n`);
    await new Promise(resolve => setTimeout(resolve, 2000));
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

/**
 * Resume an existing game
 */
export async function resume(gameIdInput, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.display || profile.cardDisplay || 'full';
  const isJson = displayMode === 'json' || opts.json;
  
  // Use provided game ID or get from active games
  let gameId = gameIdInput;
  if (!gameId) {
    gameId = getOldestActiveGame('blackjack');
    if (!gameId) {
      const error = { error: 'No active blackjack games' };
      if (isJson) return console.log(JSON.stringify(error));
      console.error('\n❌ No active blackjack games to resume\n');
      return;
    }
  }
  
  // Get wallet
  const { getWallet } = await import('../../wallet.js');
  const account = getWallet();
  const { publicClient, walletClient } = createClients(account);
  
  // Fetch game state
  if (!isJson) {
    console.log(`\n🎰 Resuming Blackjack - Game ${gameId}`);
    console.log('   Fetching game state...\n');
  }
  
  let state;
  try {
    state = await getGameState(publicClient, gameId);
  } catch (error) {
    // Game might not exist or be invalid
    removeActiveGame('blackjack', gameId);
    const err = { error: `Game not found: ${gameId}` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ Game not found: ${gameId}\n`);
    return;
  }
  
  // Verify ownership
  if (state.user.toLowerCase() !== account.address.toLowerCase()) {
    const err = { error: 'This game belongs to a different wallet' };
    if (isJson) return console.log(JSON.stringify(err));
    console.error('\n❌ This game belongs to a different wallet\n');
    return;
  }
  
  // Enter game loop
  await gameLoop(account, publicClient, walletClient, state, { displayMode, auto: opts.auto });
}

/**
 * Show status of current game without acting
 */
export async function status(gameIdInput, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.display || profile.cardDisplay || 'full';
  const isJson = displayMode === 'json' || opts.json;
  
  // Use provided game ID or get from active games
  let gameId = gameIdInput;
  if (!gameId) {
    gameId = getOldestActiveGame('blackjack');
    if (!gameId) {
      const result = { active_games: 0 };
      if (isJson) return console.log(JSON.stringify(result));
      console.log('\nNo active blackjack games.\n');
      return;
    }
  }
  
  // Get wallet
  const { getWallet } = await import('../../wallet.js');
  const account = getWallet();
  const { publicClient } = createClients(account);
  
  // Fetch state
  let state;
  try {
    state = await getGameState(publicClient, gameId);
  } catch (error) {
    const err = { error: `Game not found: ${gameId}` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ Game not found: ${gameId}\n`);
    return;
  }
  
  // Get balance and VRF for action availability
  const balance = await publicClient.getBalance({ address: account.address });
  const availableBalance = balance - parseEther(GAS_RESERVE_APE.toString());
  const vrfFee = await getVrfFee(publicClient);
  
  const actions = getAvailableActions(state, availableBalance, vrfFee);
  
  // Render
  const output = renderGame(state, actions, { displayMode });
  console.log(output);
}

/**
 * Execute a single action (for CLI one-shot or agent use)
 */
export async function action(actionName, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.display || profile.cardDisplay || 'full';
  const isJson = displayMode === 'json' || opts.json;
  
  // Get game ID
  let gameId = opts.game || getOldestActiveGame('blackjack');
  if (!gameId) {
    const error = { error: 'No active blackjack game' };
    if (isJson) return console.log(JSON.stringify(error));
    console.error('\n❌ No active blackjack game\n');
    return;
  }
  
  // Validate action name
  const validActions = Object.values(Action);
  if (!validActions.includes(actionName)) {
    const error = { error: `Invalid action: ${actionName}`, valid: validActions };
    if (isJson) return console.log(JSON.stringify(error));
    console.error(`\n❌ Invalid action: ${actionName}`);
    console.error(`   Valid actions: ${validActions.join(', ')}\n`);
    return;
  }
  
  // Get wallet
  const { getWallet } = await import('../../wallet.js');
  const account = getWallet();
  const { publicClient, walletClient } = createClients(account);
  
  // Fetch state
  let state;
  try {
    state = await getGameState(publicClient, gameId);
  } catch (error) {
    const err = { error: `Game not found: ${gameId}` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ Game not found: ${gameId}\n`);
    return;
  }
  
  // Check if action is available
  const balance = await publicClient.getBalance({ address: account.address });
  const availableBalance = balance - parseEther(GAS_RESERVE_APE.toString());
  const vrfFee = await getVrfFee(publicClient);
  
  const actions = getAvailableActions(state, availableBalance, vrfFee);
  const selectedAction = actions.find(a => a.action === actionName);
  
  if (!selectedAction) {
    const error = { error: `Action not available: ${actionName}` };
    if (isJson) return console.log(JSON.stringify(error));
    console.error(`\n❌ Action not available: ${actionName}\n`);
    return;
  }
  
  if (!selectedAction.canAfford) {
    const error = {
      error: 'Insufficient balance for action',
      action: actionName,
      cost: formatEther(selectedAction.cost),
      shortfall: formatEther(selectedAction.shortfall),
    };
    if (isJson) return console.log(JSON.stringify(error));
    console.error(`\n❌ Insufficient balance for ${actionName}`);
    console.error(`   Need ${formatEther(selectedAction.shortfall)} more APE\n`);
    return;
  }
  
  // Execute action
  if (!isJson) {
    console.log(`\n   Executing ${actionName}...`);
  }
  
  try {
    await executeAction({
      account,
      publicClient,
      walletClient,
      gameId,
      action: actionName,
      state,
      vrfFee,
    });
  } catch (error) {
    const err = { error: error.message };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${error.message}\n`);
    return;
  }
  
  // Wait for new state
  if (!isJson) {
    console.log('   Waiting for result...');
  }
  
  const newState = await waitForState(publicClient, gameId);
  
  // Check if game complete
  if (newState.isComplete) {
    completeGame(gameId);
  }
  
  // Show updated state
  const newActions = getAvailableActions(newState, availableBalance, vrfFee);
  const output = renderGame(newState, newActions, { displayMode });
  console.log(output);
}

/**
 * Main game loop - interactive or auto-play mode
 */
async function gameLoop(account, publicClient, walletClient, initialState, opts = {}) {
  const displayMode = opts.displayMode || 'full';
  const isJson = displayMode === 'json';
  const autoPlay = opts.auto || false;
  
  let state = initialState;
  const gameId = state.gameId;
  
  while (true) {
    // Get balance for action availability
    const balance = await publicClient.getBalance({ address: account.address });
    const availableBalance = balance - parseEther(GAS_RESERVE_APE.toString());
    const vrfFee = await getVrfFee(publicClient);
    
    // Get available actions
    const actions = getAvailableActions(state, availableBalance, vrfFee);
    
    // Render current state
    const output = renderGame(state, actions, { displayMode, autoPlay });
    console.log(output);
    
    // Check if game is complete
    if (state.isComplete) {
      completeGame(gameId);
      if (!isJson) {
        console.log('  Game complete!\n');
      }
      break;
    }
    
    // Check if waiting for RNG
    if (state.awaitingRandomNumber) {
      if (!isJson) {
        console.log('  Waiting for cards...');
      }
      state = await waitForState(publicClient, gameId);
      continue;
    }
    
    // Check if no actions available
    const affordableActions = actions.filter(a => a.canAfford);
    if (affordableActions.length === 0) {
      if (!isJson) {
        console.log('  No affordable actions. Top up your wallet to continue.');
        console.log(`  💡 To resume this game: apechurch blackjack resume\n`);
      }
      break;
    }
    
    let selectedAction;
    
    if (autoPlay) {
      // Auto-play: use optimal strategy
      selectedAction = getAutoPlayAction(state, actions);
      
      if (!selectedAction) {
        console.log('  🤖 No valid action found. Stopping auto-play.');
        console.log(`  💡 To resume this game: apechurch blackjack resume\n`);
        break;
      }
      
      // Display bot decision
      console.log(`  🤖 Optimal: ${selectedAction.label} (${selectedAction.reason})\n`);
      
      // Small delay for readability
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      // Interactive: prompt for action
      const promptText = renderPrompt(actions);
      const input = await prompt(promptText);
      
      // Parse input
      selectedAction = parseActionInput(input, actions);
      
      if (!selectedAction) {
        console.log('  Invalid choice. Try again.\n');
        continue;
      }
      
      if (!selectedAction.canAfford) {
        console.log(`  Cannot afford ${selectedAction.label}. Need ${formatEther(selectedAction.shortfall)} more APE.\n`);
        continue;
      }
    }
    
    // Execute action with retry logic
    console.log(`  Executing ${selectedAction.label}...`);
    
    let txSuccess = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await executeAction({
          account,
          publicClient,
          walletClient,
          gameId,
          action: selectedAction.action,
          state,
          vrfFee,
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
      console.log(`  💡 To resume this game: apechurch blackjack resume\n`);
      break;
    }
    
    console.log('  Waiting for result...\n');
    
    // Wait for new state
    state = await waitForState(publicClient, gameId);
  }
}

/**
 * Get optimal action for auto-play using basic strategy
 */
function getAutoPlayAction(state, actions) {
  // Get active hand
  const activeHand = getActiveHand(state);
  if (!activeHand) return null;
  
  // Get dealer upcard
  const dealerUpcard = state.dealerHand.cards[0]?.value;
  if (!dealerUpcard) return null;
  
  // Determine available options
  const canDouble = actions.some(a => a.action === Action.DOUBLE && a.canAfford);
  const canSplit = actions.some(a => a.action === Action.SPLIT && a.canAfford);
  const canSurrender = actions.some(a => a.action === Action.SURRENDER && a.canAfford);
  
  // Get optimal action from strategy
  const optimal = getOptimalAction(
    activeHand.cards,
    dealerUpcard,
    { canDouble, canSplit, canSurrender }
  );
  
  // Map strategy action to available action
  const actionKey = strategyToKey(optimal.action);
  const selectedAction = actions.find(a => a.key === actionKey && a.canAfford);
  
  if (selectedAction) {
    return {
      ...selectedAction,
      reason: optimal.reason,
    };
  }
  
  // Fallback: if optimal not available, choose hit or stand
  const fallback = actions.find(a => 
    (a.action === Action.HIT || a.action === Action.STAND) && a.canAfford
  );
  
  if (fallback) {
    return {
      ...fallback,
      reason: `${optimal.reason} (${optimal.action} unavailable, using ${fallback.label.toLowerCase()})`,
    };
  }
  
  return null;
}

// Export action constants for CLI
export { Action } from './constants.js';
