/**
 * Blackjack - Main Module
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

/**
 * Main entry point - start a new game
 */
export async function start(amount, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.display || profile.cardDisplay || 'full';
  const isJson = displayMode === 'json' || opts.json;
  
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
  
  // Get wallet and balance
  const { getWallet } = await import('../../wallet.js');
  const account = getWallet();
  const { publicClient, walletClient } = createClients(account);
  
  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  const balanceApe = parseFloat(formatEther(balance));
  const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);
  
  const vrfFee = await getVrfFee(publicClient);
  const vrfFeeApe = parseFloat(formatEther(vrfFee));
  const requiredApe = betApe + vrfFeeApe;
  
  if (availableApe < requiredApe) {
    const error = {
      error: 'Insufficient balance',
      required: requiredApe.toFixed(4),
      available: availableApe.toFixed(4),
    };
    if (isJson) return console.log(JSON.stringify(error));
    console.error(`\n❌ Insufficient balance. Need ${requiredApe.toFixed(4)} APE, have ${availableApe.toFixed(4)} APE\n`);
    return;
  }
  
  // Start the game
  if (!isJson) {
    console.log(`\n🎰 Starting Blackjack - ${betApe} APE bet`);
    console.log('   Sending transaction...');
  }
  
  let result;
  try {
    result = await startGame({
      account,
      publicClient,
      walletClient,
      betApe,
    });
  } catch (error) {
    const err = { error: error.message };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${error.message}\n`);
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
    return;
  }
  
  if (!isJson) console.log('');
  
  // Enter game loop
  await gameLoop(account, publicClient, walletClient, state, { displayMode });
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
  await gameLoop(account, publicClient, walletClient, state, { displayMode });
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
 * Main game loop - interactive mode
 */
async function gameLoop(account, publicClient, walletClient, initialState, opts = {}) {
  const displayMode = opts.displayMode || 'full';
  const isJson = displayMode === 'json';
  
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
    const output = renderGame(state, actions, { displayMode });
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
        console.log('  No affordable actions. Top up your wallet to continue.\n');
      }
      break;
    }
    
    // Prompt for action
    const promptText = renderPrompt(actions);
    const input = await prompt(promptText);
    
    // Parse input
    const selectedAction = parseActionInput(input, actions);
    
    if (!selectedAction) {
      console.log('  Invalid choice. Try again.\n');
      continue;
    }
    
    if (!selectedAction.canAfford) {
      console.log(`  Cannot afford ${selectedAction.label}. Need ${formatEther(selectedAction.shortfall)} more APE.\n`);
      continue;
    }
    
    // Execute action
    console.log(`\n  Executing ${selectedAction.label}...`);
    
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
    } catch (error) {
      console.error(`  ❌ ${error.message}\n`);
      continue;
    }
    
    console.log('  Waiting for result...\n');
    
    // Wait for new state
    state = await waitForState(publicClient, gameId);
  }
}

// Export action constants for CLI
export { Action } from './constants.js';
