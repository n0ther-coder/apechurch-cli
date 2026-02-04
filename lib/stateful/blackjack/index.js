/**
 * Blackjack - Stateful Game Module
 * 
 * Features:
 * - Hit, Stand, Double Down, Split, Insurance, Surrender
 * - Side bets (resolve after initial deal)
 * - Peek rule adaptation (dealer draws second card after player actions)
 * - Interactive REPL mode for humans
 * - JSON/flag mode for agents
 * 
 * Contract integration pending - structure ready for wiring
 */
import { formatEther, parseEther } from 'viem';
import { createClients, getWallet } from '../../wallet.js';
import {
  generateGameId,
  generateUserRandom,
  prompt,
  waitForKey,
  checkUnfinishedGames,
  pollGameState,
  executeAction,
  GameSession,
  formatGameResult,
} from '../base.js';
import {
  renderHand,
  renderCards,
  boxContent,
  renderActions,
  calculateHandValue,
  cardToString,
  formatApe,
  clearScreen,
  colorize,
} from '../display.js';
import { loadProfile } from '../../profile.js';
import { randomBytes32 } from '../../utils.js';

// --- Contract Configuration (TODO: Fill in when contract details provided) ---
const BLACKJACK_CONTRACT = '0x0000000000000000000000000000000000000000'; // Placeholder
const BLACKJACK_ABI = []; // Placeholder - will be populated

// --- Game States (TODO: Map to contract enums) ---
export const GameState = {
  NONE: 0,
  BETTING: 1,
  PLAYER_TURN: 2,
  DEALER_TURN: 3,
  RESOLVED: 4,
  // ... more states as needed
};

// --- Hand States (TODO: Map to contract enums) ---
export const HandState = {
  ACTIVE: 0,
  STOOD: 1,
  BUST: 2,
  BLACKJACK: 3,
  SURRENDERED: 4,
  // ... more states as needed
};

// --- Actions (TODO: Map to contract enums) ---
export const Action = {
  HIT: 'hit',
  STAND: 'stand',
  DOUBLE: 'double',
  SPLIT: 'split',
  INSURANCE: 'insurance',
  SURRENDER: 'surrender',
};

// --- Side Bet Types (TODO: Map to contract) ---
export const SideBetType = {
  NONE: 0,
  LUCKY_LADIES: 1,
  PERFECT_PAIRS: 2,
  TWENTY_ONE_PLUS_THREE: 3,
  // ... more as available
};

/**
 * Parse game state from contract response
 * TODO: Implement based on actual contract struct
 */
function parseGameState(rawState) {
  // Placeholder - will parse actual contract response
  return {
    gameId: null,
    state: GameState.NONE,
    playerHands: [], // Array of { cards, bet, state, canDouble, canSplit }
    dealerCards: [],
    dealerHidden: true,
    insurance: { available: false, taken: false, bet: 0n },
    sideBets: [],
    currentHandIndex: 0,
    availableActions: [],
    payout: 0n,
    resolved: false,
  };
}

/**
 * Get available actions for current game state
 */
function getAvailableActions(gameState) {
  const actions = [];
  
  if (gameState.state !== GameState.PLAYER_TURN) {
    return actions;
  }
  
  const currentHand = gameState.playerHands[gameState.currentHandIndex];
  if (!currentHand || currentHand.state !== HandState.ACTIVE) {
    return actions;
  }
  
  // Always can hit or stand on active hand
  actions.push({ key: 'h', label: 'Hit', action: Action.HIT });
  actions.push({ key: 's', label: 'Stand', action: Action.STAND });
  
  // Double - only on first two cards
  if (currentHand.canDouble) {
    actions.push({ key: 'd', label: 'Double', action: Action.DOUBLE });
  }
  
  // Split - matching value cards
  if (currentHand.canSplit) {
    actions.push({ key: 'x', label: 'Split', action: Action.SPLIT });
  }
  
  // Insurance - dealer showing Ace
  if (gameState.insurance.available && !gameState.insurance.taken) {
    actions.push({ key: 'i', label: 'Insurance', action: Action.INSURANCE });
  }
  
  // Surrender - early surrender on initial deal
  if (currentHand.cards.length === 2 && gameState.playerHands.length === 1) {
    actions.push({ key: 'r', label: 'Surrender', action: Action.SURRENDER });
  }
  
  // Quit always available
  actions.push({ key: 'q', label: 'Quit', action: 'quit' });
  
  return actions;
}

/**
 * Render the current game state to console
 */
function renderGameDisplay(gameState, opts = {}) {
  const lines = [];
  
  // Dealer hand
  const dealerFaceDown = gameState.dealerHidden ? [1] : [];
  const dealerLines = renderHand(
    gameState.dealerCards,
    'DEALER',
    dealerFaceDown,
    !gameState.dealerHidden
  );
  lines.push(...dealerLines);
  lines.push('');
  
  // Player hands
  for (let i = 0; i < gameState.playerHands.length; i++) {
    const hand = gameState.playerHands[i];
    const label = gameState.playerHands.length > 1 
      ? `YOU (Hand ${i + 1})${i === gameState.currentHandIndex ? ' ←' : ''}`
      : 'YOU';
    const handLines = renderHand(hand.cards, label);
    lines.push(...handLines);
    
    // Show bet for this hand
    lines.push(`  Bet: ${formatApe(hand.bet)} APE`);
    lines.push('');
  }
  
  // Side bets status
  if (gameState.sideBets.length > 0) {
    lines.push('  Side Bets:');
    for (const sb of gameState.sideBets) {
      const status = sb.resolved 
        ? (sb.won ? colorize(`+${formatApe(sb.payout)} APE`, 'green') : colorize('Lost', 'red'))
        : 'Pending';
      lines.push(`    ${sb.name}: ${formatApe(sb.bet)} APE - ${status}`);
    }
    lines.push('');
  }
  
  // Insurance status
  if (gameState.insurance.taken) {
    lines.push(`  Insurance: ${formatApe(gameState.insurance.bet)} APE`);
    lines.push('');
  }
  
  return boxContent(lines, 'BLACKJACK', 60);
}

/**
 * Start a new blackjack game
 */
export async function startGame(opts = {}) {
  // Check for unfinished games first
  const unfinished = await checkUnfinishedGames('blackjack', opts);
  
  if (unfinished.shouldResume) {
    return resumeGame(unfinished.gameId, opts);
  }
  
  // Validate bet amount
  const betApe = parseFloat(opts.amount);
  if (isNaN(betApe) || betApe <= 0) {
    const error = { error: 'Invalid bet amount' };
    if (opts.json) return console.log(JSON.stringify(error));
    console.error('\n❌ Invalid bet amount\n');
    return;
  }
  
  // TODO: Implement actual game start
  // 1. Create GameSession
  // 2. Generate gameId
  // 3. Send placeBet transaction
  // 4. Poll for initial deal
  // 5. Enter game loop
  
  console.log('\n🚧 Blackjack module ready - awaiting contract integration\n');
  console.log(`   Would start game with ${betApe} APE bet`);
  if (opts.sidebet) console.log(`   Side bet: ${opts.sidebet}`);
  console.log('');
}

/**
 * Resume an existing game
 */
export async function resumeGame(gameId, opts = {}) {
  // TODO: Implement
  // 1. Fetch game state from contract
  // 2. Display current state
  // 3. Enter game loop
  
  console.log('\n🚧 Resume functionality ready - awaiting contract integration\n');
  console.log(`   Would resume game ID: ${gameId}`);
  console.log('');
}

/**
 * Execute a game action (hit, stand, etc.)
 */
export async function executeGameAction(action, opts = {}) {
  // TODO: Implement
  // 1. Get active game ID
  // 2. Validate action is available
  // 3. Send action transaction
  // 4. Poll for new state
  // 5. Display result or continue
  
  console.log('\n🚧 Action execution ready - awaiting contract integration\n');
  console.log(`   Would execute: ${action}`);
  console.log('');
}

/**
 * Main game loop (interactive REPL)
 */
async function gameLoop(session, initialState, opts = {}) {
  let gameState = initialState;
  
  while (!gameState.resolved) {
    // Clear and render
    if (!opts.json) {
      clearScreen();
      const display = renderGameDisplay(gameState);
      console.log(display.join('\n'));
    }
    
    // Get available actions
    const actions = getAvailableActions(gameState);
    
    if (actions.length === 0) {
      // No actions available - waiting for dealer or resolution
      // Poll for state update
      // TODO: Implement polling
      break;
    }
    
    // Render action bar
    if (!opts.json) {
      console.log(renderActions(actions).join('\n'));
    }
    
    // Get user input
    let selectedAction;
    if (opts.action) {
      // Agent mode - action passed as flag
      selectedAction = actions.find(a => a.action === opts.action);
    } else {
      // Interactive mode - wait for key
      const validKeys = actions.map(a => a.key);
      const key = await waitForKey(validKeys);
      selectedAction = actions.find(a => a.key === key);
    }
    
    if (!selectedAction) break;
    if (selectedAction.action === 'quit') break;
    
    // Execute the action
    // TODO: executeGameAction and update gameState
    break; // Placeholder
  }
  
  // Game resolved - show final result
  if (gameState.resolved) {
    session.markComplete();
    // TODO: Display final result
  }
}

/**
 * Show game status (for checking active games)
 */
export async function showStatus(opts = {}) {
  const { hasActiveGame, getOldestActiveGame, getActiveGameCount } = await import('../../profile.js');
  
  const count = getActiveGameCount('blackjack');
  
  if (count === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ active_games: 0 }));
    } else {
      console.log('\nNo active blackjack games.\n');
    }
    return;
  }
  
  const gameId = getOldestActiveGame('blackjack');
  
  if (opts.json) {
    console.log(JSON.stringify({ active_games: count, oldest_game_id: gameId }));
  } else {
    console.log(`\n🎰 Active blackjack games: ${count}`);
    console.log(`   Oldest game ID: ${gameId}`);
    console.log('\n   Run: apechurch blackjack resume\n');
  }
}
