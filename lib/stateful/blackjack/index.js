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
import { createClients, getBalanceWithRetry } from '../../wallet.js';
import { loadProfile, resolveGpPerApe, resolveGpPerApeInfo, formatGpPerApeNotice } from '../../profile.js';
import {
  createLoopTerminalState,
  formatLoopTerminalConditionMessage,
  getBalanceLoopTerminalCondition,
  getSingleGameLoopTerminalCondition,
  parseLoopTerminalOptions,
} from '../../loop-conditions.js';
import { createLoopStats, formatLoopProgress, formatSessionStats, recordLoopGame } from '../../loop-stats.js';
import {
  formatLoopRunoutEstimate,
} from '../../loop-estimate.js';
import { estimateBlackjackLoopRunoutMonteCarlo } from './monte-carlo.js';
import { getStrategy, calculateNextBet, getStrategyNames } from '../../strategies/index.js';
import {
  hasActiveGame,
  getActiveGames,
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
} from './strategy.js';
import { getBestActionByEV } from './solver.js';
import {
  advanceBlackjackProgress,
  formatBlackjackProgressLabel,
} from './progress.js';
import { formatBlackjackStake } from './format.js';
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
  isAutoModeEnabled,
  normalizeAutoMode,
} from '../auto.js';
import { queueWinChimeFromWei } from '../../chime.js';

const AUTO_BEST_MAX_PLAYER_STATES = 50000;

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
  console.log(`   Game ID: ${gameId}`);
  console.log(`   To clear queue: $ ${BINARY_NAME} blackjack clear\n`);

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
  let targetBalance;
  let stopLoss;
  let maxGames;
  let targetX;
  let targetPayoutApe;
  let recoverLoss;
  let givebackProfit;
  const maxBet = opts.maxBet ? parseFloat(opts.maxBet) : null;
  const playerSideApe = opts.side !== undefined ? parseFloat(opts.side) : 0;
  let gpPerApe;
  let gpPerApeInfo;
  const loopDelaySeconds = resolveLoopDelaySeconds({
    rawDelay: opts.delay,
    human: humanTiming,
    defaultDelaySeconds: DEFAULT_LOOP_DELAY_SECONDS,
  });

  try {
    gpPerApeInfo = resolveGpPerApeInfo({ cliGpPerApe: opts.gpApe, profile });
    gpPerApe = gpPerApeInfo.gpPerApe;
  } catch (error) {
    const err = { error: error.message };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }

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
  try {
    ({
      targetBalance,
      stopLoss,
      maxGames,
      targetX,
      targetProfit: targetPayoutApe,
      recoverLoss,
      givebackProfit,
    } = parseLoopTerminalOptions(opts));
  } catch (error) {
    const err = { error: error.message };
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
  if (opts.side !== undefined && (isNaN(playerSideApe) || playerSideApe < 0)) {
    const err = { error: `Invalid --side value: "${opts.side}". Must be a non-negative number.` };
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

  let pendingResumeGameId = null;
  // Check for unfinished games
  const existingGameId = await checkUnfinished({ json: isJson });
  if (existingGameId) {
    if (!loopMode) {
      return await resume(existingGameId, opts);
    }
    pendingResumeGameId = existingGameId;
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
  const loopTerminalState = createLoopTerminalState();
  let loopEstimateShown = false;
  let loopEstimateConfirmed = false;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3; // Stop loop after 3 consecutive failures

  // Initialize betting strategy
  const baseBet = betApe;
  let betStrategyState = betStrategy.init(baseBet, { maxBet });
  const playerSideWei = parseEther(playerSideApe.toString());
  let currentRtpConfig = {
    mainBetApe: betApe,
    playerSideApe,
  };

  if (loopMode && !isJson) {
    console.log(`${formatGpPerApeNotice({ info: gpPerApeInfo })}\n`);
  }

  async function finalizeIteration({ gameSummary, balanceBeforeGame, fallbackBetApe }) {
    gamesPlayed++;

    const balanceAfterBal = await getBalanceWithRetry(publicClient, account.address);
    const balanceAfterGame = parseFloat(formatEther(balanceAfterBal));
    const gamePnl = balanceAfterGame - balanceBeforeGame;
    lastGameResult = gameSummary || {
      won: gamePnl > 0,
      bet: fallbackBetApe,
      payout: fallbackBetApe + gamePnl, // Approximate payout
      exactPayout: false,
    };

    if (gameSummary) {
      recordLoopGame(loopStats, {
        won: gameSummary.won,
        wageredApe: gameSummary.bet,
        payoutApe: gameSummary.payout,
        feesPaidApe: gameSummary.feesPaidApe,
        rtpGame: 'blackjack',
        rtpConfig: currentRtpConfig,
      });
    }

    return balanceAfterGame;
  }

  // Main loop (runs once if not in loop mode)
  while (true) {
    // Check balance
    const balance = await getBalanceWithRetry(publicClient, account.address);
    const balanceApe = parseFloat(formatEther(balance));
    const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);

    // Track starting balance for profit calculation
    if (startingBalance === null) {
      startingBalance = balanceApe;
    }

    let gameSummary;
    let fallbackBetApe = betApe;

    if (pendingResumeGameId) {
      const resumeGameId = pendingResumeGameId;
      pendingResumeGameId = null;

      const resumed = await resume(resumeGameId, {
        ...opts,
        gameLabel: formatLoopGameLabel(gamesPlayed + 1, maxGames),
      });

      if (resumed?.status === 'missing') {
        continue;
      }

      if (!resumed || resumed.status !== 'completed') {
        if (!isJson) {
          console.log('\n🛑 Stopping: unfinished blackjack game still needs manual intervention.\n');
        }
        const endingBalance = parseFloat(formatEther(await getBalanceWithRetry(publicClient, account.address)));
        printSessionStats(gamesPlayed, startingBalance, endingBalance, loopStats, gpPerApe);
        break;
      }

      gameSummary = resumed.gameSummary;
      fallbackBetApe = resumed.betApe ?? fallbackBetApe;
    } else {
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
          console.log(`   📊 ${betStrategyName}: betting ${formatBlackjackStake(currentBet)} APE${betInfo}`);
        }
      }

      const vrfFee = await getVrfFee(publicClient);
      const vrfFeeApe = parseFloat(formatEther(vrfFee));
      const requiredApe = currentBet + playerSideApe + vrfFeeApe;

      const preGameTerminalCondition = getBalanceLoopTerminalCondition({
        currentBalanceApe: balanceApe,
        startingBalanceApe: startingBalance,
        targetBalance,
        stopLoss,
        maxGames,
        minBalanceFloor: MIN_BALANCE_FLOOR,
        recoverLoss,
        givebackProfit,
        gamesPlayed,
        state: loopTerminalState,
      });
      if (loopMode && preGameTerminalCondition) {
        console.log('');
        console.log(formatLoopTerminalConditionMessage(preGameTerminalCondition, {
          currentBalanceApe: balanceApe,
          startingBalanceApe: startingBalance,
          gamesPlayed,
        }));
        printSessionStats(gamesPlayed, startingBalance, balanceApe, loopStats, gpPerApe);
        break;
      }

      // Check if can afford bet
      if (availableApe < requiredApe) {
        if (loopMode) {
          console.log(`\n🛑 Stopping: Cannot afford ${formatBlackjackStake(currentBet)} APE bet (have ${availableApe.toFixed(2)} APE available)`);
          printSessionStats(gamesPlayed, startingBalance, balanceApe, loopStats, gpPerApe);
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

      if (loopMode && !isJson && !loopEstimateShown) {
        const estimateLine = formatLoopRunoutEstimate(
          estimateBlackjackLoopRunoutMonteCarlo({
            balanceApe,
            availableApe,
            stopLossApe: stopLoss,
            mainBetApe: currentBet,
            playerSideApe,
            vrfFeeApe,
          })
        );

        loopEstimateShown = true;
        const promptText = estimateLine ? `\n${estimateLine}. Proceed? (Y/n) ` : '\nProceed? (Y/n) ';
        const answer = await prompt(promptText);
        if (answer.trim().toLowerCase() === 'n') {
          console.log('\nLoop cancelled.\n');
          return;
        }
        loopEstimateConfirmed = true;
      }

      // Start the game
      currentRtpConfig = {
        mainBetApe: currentBet,
        playerSideApe,
      };
      if (verbose && !isJson) {
        const sideInfo = playerSideApe > 0 ? ` + ${formatBlackjackStake(playerSideApe)} APE player side` : '';
        console.log(`\n🎰 Starting Blackjack - ${formatBlackjackStake(currentBet)} APE bet${sideInfo}${formatLoopGameLabel(gamesPlayed + 1, maxGames) ? ` [${formatLoopGameLabel(gamesPlayed + 1, maxGames)}]` : ''}`);
        console.log('   Sending transaction...');
      }

      let result;
      try {
        result = await startGame({
          account,
          publicClient,
          walletClient,
          betApe: currentBet,
          sideBets: [playerSideWei, 0n],
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
            printSessionStats(gamesPlayed, startingBalance, balanceApe, loopStats, gpPerApe);
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

      // Enter game loop
      gameSummary = await gameLoop(account, publicClient, walletClient, state, {
        displayMode,
        autoMode,
        verbose,
        gameLabel: formatLoopGameLabel(gamesPlayed + 1, maxGames),
        human: humanTiming,
        initialFeeApe: vrfFeeApe,
        gpPerApe,
      });
      fallbackBetApe = currentBet;
    }

    const balanceAfterGame = await finalizeIteration({
      gameSummary,
      balanceBeforeGame: balanceApe,
      fallbackBetApe,
    });

    // If not looping, exit after one game
    if (!loopMode) break;

    // Small delay between games in loop mode - show balance
    const nextDelayMs = getLoopDelayMs({ delaySeconds: loopDelaySeconds, human: humanTiming });
    const singleGameTerminalCondition = getSingleGameLoopTerminalCondition({
      gameResult: gameSummary,
      targetX,
      targetProfit: targetPayoutApe,
    });
    const sessionTerminalCondition = getBalanceLoopTerminalCondition({
      currentBalanceApe: balanceAfterGame,
      startingBalanceApe: startingBalance,
      targetBalance,
      stopLoss,
      maxGames,
      minBalanceFloor: MIN_BALANCE_FLOOR,
      recoverLoss,
      givebackProfit,
      gamesPlayed,
      state: loopTerminalState,
    });
    const terminalConditionReached = singleGameTerminalCondition || sessionTerminalCondition;
    console.log('');
    console.log(formatLoopProgress({
      currentBalanceApe: balanceAfterGame,
      startingBalanceApe: startingBalance,
      stats: loopStats,
      rtpGame: 'blackjack',
      rtpConfig: currentRtpConfig,
      gpPerApe,
      nextDelayLabel: terminalConditionReached ? null : formatDelayMs(nextDelayMs),
    }));
    console.log('');
    if (singleGameTerminalCondition) {
      console.log(formatLoopTerminalConditionMessage(singleGameTerminalCondition, { gamesPlayed }));
      printSessionStats(gamesPlayed, startingBalance, balanceAfterGame, loopStats, gpPerApe);
      break;
    }
    if (sessionTerminalCondition) {
      console.log(formatLoopTerminalConditionMessage(sessionTerminalCondition, {
        currentBalanceApe: balanceAfterGame,
        startingBalanceApe: startingBalance,
        gamesPlayed,
      }));
      printSessionStats(gamesPlayed, startingBalance, balanceAfterGame, loopStats, gpPerApe);
      break;
    }
    if (terminalConditionReached) continue;
    await sleep(nextDelayMs);
  }
}

/**
 * Print session statistics
 */
function printSessionStats(gamesPlayed, startingBalance, endingBalance, stats, gpPerApe) {
  console.log('');
  console.log(formatSessionStats({
    gamesPlayed,
    startingBalanceApe: startingBalance,
    endingBalanceApe: endingBalance,
    stats,
    rtpGame: 'blackjack',
    gpPerApe,
  }));
  console.log('');
}

function printResumeQueue(gameIds) {
  console.log(`\n🧩 Unfinished Blackjack Games (${gameIds.length})\n`);
  for (const [index, gameId] of gameIds.entries()) {
    console.log(`   ${index + 1}. Game ${gameId}`);
  }
  console.log('');
}

async function resumeSingleGame(gameId, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.json ? 'json' : (opts.display || profile.cardDisplay || 'full');
  const isJson = displayMode === 'json';
  const verbose = Boolean(opts.verbose);
  let autoMode = normalizeAutoMode(opts.auto);
  let gpPerApe;

  try {
    gpPerApe = resolveGpPerApe({ cliGpPerApe: opts.gpApe, profile });
  } catch (error) {
    const err = { error: error.message };
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
    if (isJson) console.log(JSON.stringify(err));
    else console.error(`\n❌ Game not found: ${gameId}\n`);
    return { status: 'missing', gameId, betApe: null, gameSummary: null };
  }

  // Verify ownership
  if (state.user.toLowerCase() !== account.address.toLowerCase()) {
    const err = { error: 'This game belongs to a different wallet' };
    if (isJson) console.log(JSON.stringify(err));
    else console.error('\n❌ This game belongs to a different wallet\n');
    return { status: 'blocked', gameId, betApe: null, gameSummary: null };
  }

  // Enter game loop
  const gameSummary = await gameLoop(account, publicClient, walletClient, state, {
    displayMode,
    autoMode,
    verbose,
    human: opts.human,
    gameLabel: opts.gameLabel || null,
    gpPerApe,
  });

  return {
    status: gameSummary ? 'completed' : 'incomplete',
    gameId: state.gameId,
    betApe: parseFloat(formatEther(state.initialBet)),
    gameSummary,
  };
}

/**
 * Resume an existing game
 */
export async function resume(gameIdInput, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.json ? 'json' : (opts.display || profile.cardDisplay || 'full');
  const isJson = displayMode === 'json';
  const gameIds = gameIdInput ? [gameIdInput] : getActiveGames('blackjack');
  if (gameIds.length === 0) {
    const error = { error: 'No active blackjack games' };
    if (isJson) console.log(JSON.stringify(error));
    else console.error('\n❌ No active blackjack games to resume\n');
    return { status: 'missing', gameId: null, betApe: null, gameSummary: null };
  }

  if (!gameIdInput && !isJson) {
    printResumeQueue(gameIds);
  }

  let lastResult = { status: 'missing', gameId: null, betApe: null, gameSummary: null };
  const results = [];
  for (const [index, gameId] of gameIds.entries()) {
    if (!gameIdInput && !isJson) {
      console.log(`▶️  Resuming blackjack game ${index + 1}/${gameIds.length}: ${gameId}\n`);
    }

    const result = await resumeSingleGame(gameId, opts);
    lastResult = result || lastResult;
    results.push(result);

    if (result?.status === 'completed' || result?.status === 'missing') {
      continue;
    }

    if (!gameIdInput && !isJson && index < gameIds.length - 1) {
      console.log(`🛑 Stopping batch resume. Remaining unfinished blackjack games stay queued.\n`);
    }
    break;
  }

  if (results.length <= 1) {
    return lastResult;
  }

  return {
    ...lastResult,
    status: results.every(result => result?.status === 'completed' || result?.status === 'missing')
      ? 'completed'
      : lastResult.status,
    results,
  };
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
  const balance = await getBalanceWithRetry(publicClient, account.address);
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
  let gpPerApe;

  try {
    gpPerApe = resolveGpPerApe({ cliGpPerApe: opts.gpApe, profile });
  } catch (error) {
    const err = { error: error.message };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }

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
  const balance = await getBalanceWithRetry(publicClient, account.address);
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
    const completedSummary = getCompletedGameSummary(newState);
    completeGame(gameId, {
      wagerApe: completedSummary?.bet,
      gpPerApe,
      walletAddress: account.address,
    });
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
  const gpPerApe = opts.gpPerApe;
  let feesPaidApe = Number(opts.initialFeeApe) || 0;
  let progressStepLabel = null;
  let hitCounts = [0, 0];

  let state = initialState;
  const gameId = state.gameId;
  let completedSummary = null;

  while (true) {
    // Get balance for action availability
    const balance = await getBalanceWithRetry(publicClient, account.address);
    const availableBalance = balance - parseEther(GAS_RESERVE_APE.toString());
    const vrfFee = await getVrfFee(publicClient);

    // Get available actions
    const actions = getAvailableActions(state, availableBalance, vrfFee);

    // Render current state
    const output = renderGame(state, actions, {
      displayMode,
      autoPlay,
      gameLabel: formatBlackjackProgressLabel(gameLabel, progressStepLabel),
    });
    console.log(output);

    // Check if game is complete
    if (state.isComplete) {
      const result = calculateNetResult(state);
      completedSummary = getCompletedGameSummary(state, { feesPaidApe });
      if (result?.won) {
        queueWinChimeFromWei({
          payoutWei: result.payout,
          wagerWei: result.wagered,
          isJson,
        });
      }
      completeGame(gameId, {
        wagerApe: completedSummary?.bet,
        gpPerApe,
        walletAddress: account.address,
      });
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
      selectedAction = getAutoPlayAction(state, actions, { autoMode });

      if (!selectedAction) {
        console.log('  🤖 No valid action found. Stopping auto-play.');
        console.log(`  💡 To resume this game: ${BINARY_NAME} blackjack resume\n`);
        break;
      }

      if (selectedAction.fallbackError) {
        console.log(`  ⚠️  Best EV unavailable (${selectedAction.fallbackError}). Using simple.\n`);
      }

      // Display bot decision
      const autoLabel = selectedAction.source === 'best' ? 'Best EV' : 'Optimal';
      const evLabel = selectedAction.source === 'best'
        ? `, EV ${selectedAction.evUnits.toFixed(3)}x`
        : '';
      console.log(`  🤖 ${autoLabel}: ${selectedAction.label} (${selectedAction.reason}${evLabel})\n`);

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

    const progress = advanceBlackjackProgress(selectedAction, hitCounts, state.activeHandIndex);
    hitCounts = progress.hitCounts;
    progressStepLabel = progress.stepLabel;

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
        feesPaidApe += parseFloat(formatEther((selectedAction.cost || 0n) - (selectedAction.betCost || 0n)));
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

function getCompletedGameSummary(state, { feesPaidApe = 0 } = {}) {
  const result = calculateNetResult(state);
  if (!result) {
    return null;
  }

  return {
    won: result.won,
    bet: parseFloat(formatEther(result.wagered)),
    payout: parseFloat(formatEther(result.payout)),
    feesPaidApe,
    exactPayout: true,
  };
}

function formatLoopGameLabel(currentGame, totalGames) {
  if (!Number.isFinite(currentGame) || currentGame <= 0) {
    return null;
  }

  return totalGames ? `Game #${currentGame} /${totalGames}` : `Game #${currentGame}`;
}

/**
 * Get optimal action for auto-play using exact EV or basic strategy
 */
function getAutoPlayAction(state, actions, { autoMode } = {}) {
  const affordableActions = actions.filter(a => a.canAfford);
  if (affordableActions.length === 0) return null;

  if (autoMode === AUTO_MODE_BEST) {
    try {
      const best = getBestActionByEV(state, {
        allowedActions: affordableActions.map((action) => action.action),
        maxPlayerStates: AUTO_BEST_MAX_PLAYER_STATES,
      });
      const selected = affordableActions.find((action) => action.action === best.action);

      if (selected) {
        return {
          ...selected,
          reason: best.reason,
          evUnits: best.evUnits,
          source: 'best',
        };
      }
    } catch (error) {
      const fallback = getSimpleAutoPlayAction(state, affordableActions);
      if (fallback) {
        return {
          ...fallback,
          fallbackError: error.message,
        };
      }
      return null;
    }
  }

  return getSimpleAutoPlayAction(state, affordableActions);
}

function getSimpleAutoPlayAction(state, actions) {
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
      source: 'simple',
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
      source: 'simple',
    };
  }

  return null;
}

// Export action constants for CLI
export { Action } from './constants.js';
