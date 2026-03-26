/**
 * @fileoverview Blackjack - Main Module
 *
 * Interactive blackjack implementation with full casino rules.
 * Supports both human players (interactive REPL) and AI agents (JSON mode).
 *
 * Features:
 * - Full blackjack rules: hit, stand, double, split, insurance, surrender
 * - Optimal strategy suggestions (basic strategy)
 * - Auto-play mode with basic strategy (--auto flag)
 * - Loop mode for continuous play (--loop flag)
 * - Resume interrupted games
 * - Multiple display modes (ASCII cards, simple text, JSON)
 * - Betting strategies (flat, martingale, etc.)
 *
 * Game Flow:
 * 1. Player places bet → playGame() transaction
 * 2. VRF deals initial cards (2 to player, 1 to dealer)
 * 3. If player has blackjack → immediate resolution
 * 4. Otherwise → player decisions (hit/stand/double/split/insurance/surrender)
 * 5. Each action → transaction → wait for VRF if needed
 * 6. Dealer plays → game resolves → payout
 *
 * Contract State Machine:
 * - READY (0): Waiting for initial deal (transient)
 * - PLAYER_ACTION (1): Player's turn on main hand
 * - SPLIT_ACTION_1 (2): Player's turn on first split hand
 * - SPLIT_ACTION_2 (3): Player's turn on second split hand
 * - DEALER_TURN (4): Dealer drawing cards
 * - HAND_COMPLETE (5): Game finished, payouts done
 *
 * @module lib/stateful/blackjack/index
 */
import readline from 'readline';
import { formatEther, parseEther } from 'viem';
import { createClients } from '../../wallet.js';
import { loadProfile } from '../../profile.js';
import { createLoopStats, formatLoopProgress, recordLoopGame } from '../../loop-stats.js';
import { getStrategy, calculateNextBet, getStrategyNames } from '../../strategies/index.js';
import {
  hasActiveGame,
  getOldestActiveGame,
  getActiveGameCount,
  removeActiveGame,
} from '../../profile.js';
import { BINARY_NAME, GAS_RESERVE_APE } from '../../constants.js';
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
  calculateNetResult,
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
import {
  DEFAULT_LOOP_DELAY_SECONDS,
  formatDelayMs,
  getAutoThinkDelayMs,
  getLoopDelayMs,
  resolveLoopDelaySeconds,
  sleep,
} from '../timing.js';
import {
  AUTO_MODE_BEST,
  AUTO_MODE_SIMPLE,
  isAutoModeEnabled,
  normalizeAutoMode,
} from '../auto.js';
import { queueWinChimeFromWei } from '../../chime.js';

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
  const displayMode = opts.json ? 'json' : (opts.display || profile.cardDisplay || 'full');
  const isJson = displayMode === 'json';
  const verbose = Boolean(opts.verbose);
  const loopMode = opts.loop || false;
  const humanTiming = Boolean(opts.human);
  let autoMode = normalizeAutoMode(opts.auto);
  const targetProfit = opts.target ? parseFloat(opts.target) : null;
  const stopLoss = opts.stopLoss ? parseFloat(opts.stopLoss) : null;
  const maxGames = opts.maxGames ? parseInt(opts.maxGames, 10) : null;
  const maxBet = opts.maxBet ? parseFloat(opts.maxBet) : null;
  const loopDelaySeconds = resolveLoopDelaySeconds({
    rawDelay: opts.delay,
    human: humanTiming,
    defaultDelaySeconds: DEFAULT_LOOP_DELAY_SECONDS,
  });
  
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
  if (opts.target !== undefined && (isNaN(targetProfit) || targetProfit <= 0)) {
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
  if (opts.auto !== undefined && autoMode === null) {
    const err = { error: `Invalid --auto mode: "${opts.auto}". Valid values: simple, best.` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }
  if (opts.delay !== undefined && (!Number.isFinite(loopDelaySeconds) || loopDelaySeconds < 1)) {
    const err = { error: `Invalid --delay value: "${opts.delay}". Must be a number >= 1.` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }
  if (targetProfit !== null && stopLoss !== null && stopLoss >= targetProfit) {
    const err = { error: `Invalid range: --stop-loss (${stopLoss}) must be less than --target (${targetProfit})` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }
  if (autoMode === AUTO_MODE_BEST) {
    if (!isJson) {
      console.log('⚠️  Auto mode "best" not implemented for blackjack (fallback to simple).\n');
    }
    autoMode = AUTO_MODE_SIMPLE;
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
  const loopStats = createLoopStats();
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3; // Stop loop after 3 consecutive failures
  
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
    if (verbose && !isJson) {
      console.log(`\n🎰 Starting Blackjack - ${currentBet.toFixed(2)} APE bet${formatLoopGameLabel(gamesPlayed + 1, maxGames) ? ` [${formatLoopGameLabel(gamesPlayed + 1, maxGames)}]` : ''}`);
      console.log('   Sending transaction...');
    }
    
    let result;
    try {
      result = await startGame({
        account,
        publicClient,
        walletClient,
        betApe: currentBet,
        json: isJson,
      });
      // Reset consecutive error counter on success
      consecutiveErrors = 0;
    } catch (error) {
      consecutiveErrors++;
      const err = { error: error.message };
      
      if (loopMode) {
        // In loop mode, continue unless too many consecutive errors
        if (!isJson) {
          console.error(`\n❌ Game creation failed: ${error.message}`);
        }
        
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          if (isJson) return console.log(JSON.stringify({ ...err, reason: 'max_consecutive_errors' }));
          console.log(`\n🛑 Stopping: ${MAX_CONSECUTIVE_ERRORS} consecutive errors`);
          printSessionStats(gamesPlayed, startingBalance, balanceApe);
          return;
        }
        
        if (verbose && !isJson) {
          console.log(`   ⚠️  Retrying next game in 5s (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS} consecutive errors)...\n`);
        }
        await new Promise(r => setTimeout(r, 5000));
        continue; // Try next game
      }
      
      // Not in loop mode - exit on error
      if (isJson) return console.log(JSON.stringify(err));
      console.error(`\n❌ ${error.message}\n`);
      return;
    }
    
    if (verbose && !isJson) {
      console.log(`   Game ID: ${result.gameId}`);
      console.log('   Waiting for initial deal...\n');
    }
    
    // Wait for initial deal
    let state;
    try {
      state = await waitForState(publicClient, result.gameId, {
        onPoll: isJson || !verbose ? null : () => process.stdout.write('.'),
      });
    } catch (error) {
      const err = { error: error.message, gameId: result.gameId };
      if (isJson) return console.log(JSON.stringify(err));
      console.error(`\n❌ ${error.message}\n`);
      console.log(`   💡 To resume this game: ${BINARY_NAME} blackjack resume\n`);
      return;
    }
    
    if (verbose && !isJson) console.log('');
    
    // Track balance before game (for betting strategy)
    const balanceBeforeGame = balanceApe;
    
    // Enter game loop
    const gameSummary = await gameLoop(account, publicClient, walletClient, state, {
      displayMode,
      autoMode,
      verbose,
      gameLabel: formatLoopGameLabel(gamesPlayed + 1, maxGames),
      human: humanTiming,
    });
    
    gamesPlayed++;
    
    // Track game result for betting strategy
    const balanceAfterBal = await publicClient.getBalance({ address: account.address });
    const balanceAfterGame = parseFloat(formatEther(balanceAfterBal));
    const gamePnl = balanceAfterGame - balanceBeforeGame;
    lastGameResult = gameSummary || {
      won: gamePnl > 0,
      bet: currentBet,
      payout: currentBet + gamePnl, // Approximate payout
    };

    if (gameSummary) {
      recordLoopGame(loopStats, {
        won: gameSummary.won,
        wageredApe: gameSummary.bet,
        payoutApe: gameSummary.payout,
      });
    }
    
    // If not looping, exit after one game
    if (!loopMode) break;
    
    // Small delay between games in loop mode - show balance
    const nextDelayMs = getLoopDelayMs({ delaySeconds: loopDelaySeconds, human: humanTiming });
    console.log('');
    console.log(formatLoopProgress({
      currentBalanceApe: balanceAfterGame,
      startingBalanceApe: startingBalance,
      stats: loopStats,
      nextDelayLabel: formatDelayMs(nextDelayMs),
    }));
    console.log('');
    await sleep(nextDelayMs);
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
  const displayMode = opts.json ? 'json' : (opts.display || profile.cardDisplay || 'full');
  const isJson = displayMode === 'json';
  const verbose = Boolean(opts.verbose);
  let autoMode = normalizeAutoMode(opts.auto);

  if (opts.auto !== undefined && autoMode === null) {
    const err = { error: `Invalid --auto mode: "${opts.auto}". Valid values: simple, best.` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }

  if (autoMode === AUTO_MODE_BEST) {
    if (!isJson) {
      console.log('⚠️  Auto mode "best" not implemented for blackjack (fallback to simple).\n');
    }
    autoMode = AUTO_MODE_SIMPLE;
  }
  
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
  if (verbose && !isJson) {
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
  await gameLoop(account, publicClient, walletClient, state, {
    displayMode,
    autoMode,
    verbose,
    human: opts.human,
  });
}

/**
 * Show status of current game without acting
 */
export async function status(gameIdInput, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.json ? 'json' : (opts.display || profile.cardDisplay || 'full');
  const isJson = displayMode === 'json';
  
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
  const displayMode = opts.json ? 'json' : (opts.display || profile.cardDisplay || 'full');
  const isJson = displayMode === 'json';
  const verbose = Boolean(opts.verbose);
  
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
  if (verbose && !isJson) {
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
  if (verbose && !isJson) {
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

  if (newState.isComplete) {
    const result = calculateNetResult(newState);
    if (result?.won) {
      queueWinChimeFromWei({
        payoutWei: result.payout,
        wagerWei: result.wagered,
        isJson,
      });
    }
  }
}

/**
 * Main game loop - interactive or auto-play mode
 */
async function gameLoop(account, publicClient, walletClient, initialState, opts = {}) {
  const displayMode = opts.displayMode || 'full';
  const isJson = displayMode === 'json';
  const verbose = Boolean(opts.verbose);
  const autoMode = opts.autoMode || null;
  const autoPlay = isAutoModeEnabled(autoMode);
  const gameLabel = opts.gameLabel || null;
  
  let state = initialState;
  const gameId = state.gameId;
  let completedSummary = null;
  
  while (true) {
    // Get balance for action availability
    const balance = await publicClient.getBalance({ address: account.address });
    const availableBalance = balance - parseEther(GAS_RESERVE_APE.toString());
    const vrfFee = await getVrfFee(publicClient);
    
    // Get available actions
    const actions = getAvailableActions(state, availableBalance, vrfFee);
    
    // Render current state
    const output = renderGame(state, actions, { displayMode, autoPlay, gameLabel });
    console.log(output);
    
    // Check if game is complete
    if (state.isComplete) {
      const result = calculateNetResult(state);
      completedSummary = getCompletedGameSummary(state);
      if (result?.won) {
        queueWinChimeFromWei({
          payoutWei: result.payout,
          wagerWei: result.wagered,
          isJson,
        });
      }
      completeGame(gameId);
      if (!isJson) {
        console.log(`  Game ${gameId} complete!\n`);
      }
      break;
    }
    
    // Check if waiting for RNG
    if (state.awaitingRandomNumber) {
      if (verbose && !isJson) {
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
        console.log(`  💡 To resume this game: ${BINARY_NAME} blackjack resume\n`);
      }
      break;
    }
    
    let selectedAction;
    
    if (autoPlay) {
      // Auto-play: use optimal strategy
      selectedAction = getAutoPlayAction(state, actions);
      
      if (!selectedAction) {
        console.log('  🤖 No valid action found. Stopping auto-play.');
        console.log(`  💡 To resume this game: ${BINARY_NAME} blackjack resume\n`);
        break;
      }
      
      // Display bot decision
      console.log(`  🤖 Optimal: ${selectedAction.label} (${selectedAction.reason})\n`);
      
      // Add a short think pause so auto-play doesn't look instant.
      await sleep(getAutoThinkDelayMs());
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
    if (verbose || !autoPlay) {
      console.log(`  Executing ${selectedAction.label}...`);
    }
    
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
          if (verbose) {
            console.log('  Retrying in 2 seconds...\n');
          }
          await sleep(2000);
        } else {
          console.error(`  ❌ Transaction failed after retry: ${error.message}\n`);
        }
      }
    }
    
    if (!txSuccess) {
      console.log(`  💡 To resume this game: ${BINARY_NAME} blackjack resume\n`);
      break;
    }
    
    if (verbose) {
      console.log('  Waiting for result...\n');
    }
    
    // Wait for new state
    state = await waitForState(publicClient, gameId);
  }

  return completedSummary;
}

function getCompletedGameSummary(state) {
  const result = calculateNetResult(state);
  if (!result) {
    return null;
  }

  return {
    won: result.won,
    bet: parseFloat(formatEther(result.wagered)),
    payout: parseFloat(formatEther(result.payout)),
  };
}

function formatLoopGameLabel(currentGame, totalGames) {
  if (!Number.isFinite(currentGame) || currentGame <= 0) {
    return null;
  }

  return totalGames ? `Game #${currentGame} /${totalGames}` : `Game #${currentGame}`;
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
