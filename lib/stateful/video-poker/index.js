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
import { createLoopStats, formatLoopProgress, formatSessionStats, recordLoopGame } from '../../loop-stats.js';
import {
  estimateVideoPokerLoopRunoutMonteCarlo,
  formatLoopRunoutEstimate,
} from '../../loop-estimate.js';
import {
  hasActiveGame,
  getActiveGames,
  getOldestActiveGame,
  getActiveGameCount,
  removeActiveGame,
} from '../../profile.js';
import { BINARY_NAME, GAS_RESERVE_APE } from '../../constants.js';
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
  formatOutcomeFooter,
  isWinningHand,
  renderGameFullDecisionEndAuto,
  renderGameFullDecisionEndInteractive,
  renderGameFullPromptLine,
  renderGameFullDecisionStart,
} from './display.js';
import { getOptimalHold, holdToRedraw } from './strategy.js';
import {
  DEFAULT_LOOP_DELAY_SECONDS,
  formatDelayMs,
  getAutoThinkDelayMs,
  getLoopDelayMs,
  resolveLoopDelaySeconds,
  sleep,
} from '../timing.js';
import {
  isAutoModeEnabled,
  isBestAutoMode,
  normalizeAutoMode,
} from '../auto.js';
import { isMaxBetAmount } from './evaluator.js';
import { getBestHoldByEV } from './solver.js';
import { queueWinChimeFromWei } from '../../chime.js';

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

function promptInline(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${question} `, (answer) => {
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
  console.log(`   Game ID: ${gameId}`);
  console.log(`   To clear queue: $ ${BINARY_NAME} video-poker clear\n`);

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
  const displayMode = opts.json ? 'json' : (opts.display || profile.cardDisplay || 'full');
  const isJson = displayMode === 'json';
  const verbose = Boolean(opts.verbose);
  const showSolver = Boolean(opts.solver);
  const loopMode = opts.loop || false;
  const humanTiming = Boolean(opts.human);
  const autoMode = normalizeAutoMode(opts.auto);
  const targetBalance = opts.target ? parseFloat(opts.target) : null;
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

  let pendingResumeGameId = null;
  // Check for unfinished games
  const existingGameId = await checkUnfinished({ json: isJson });
  if (existingGameId) {
    if (!loopMode) {
      return await resume(existingGameId, opts);
    }
    pendingResumeGameId = existingGameId;
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
  const loopStats = createLoopStats();
  let loopEstimateShown = false;
  let loopEstimateConfirmed = false;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3; // Stop loop after 3 consecutive failures

  // Initialize betting strategy
  const baseBet = betApe;
  let betStrategyState = betStrategy.init(baseBet, { maxBet });
  let currentRtpConfig = {
    betAmountApe: betApe,
  };

  async function finalizeIteration({ gameSummary, balanceBeforeGame, fallbackBetApe }) {
    gamesPlayed++;

    const balanceAfterBal = await publicClient.getBalance({ address: account.address });
    const balanceAfterGame = parseFloat(formatEther(balanceAfterBal));
    const gamePnl = balanceAfterGame - balanceBeforeGame;
    lastGameResult = gameSummary || {
      won: gamePnl > 0,
      bet: fallbackBetApe,
      payout: fallbackBetApe + gamePnl,
    };

    if (gameSummary) {
      recordLoopGame(loopStats, {
        won: gameSummary.won,
        wageredApe: gameSummary.bet,
        payoutApe: gameSummary.payout,
        feesPaidApe: gameSummary.feesPaidApe,
        rtpGame: 'video-poker',
        rtpConfig: currentRtpConfig,
      });
    }

    return balanceAfterGame;
  }

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
          console.log('\n🛑 Stopping: unfinished video poker game still needs manual intervention.\n');
        }
        const endingBalance = parseFloat(formatEther(await publicClient.getBalance({ address: account.address })));
        printSessionStats(gamesPlayed, startingBalance, endingBalance, loopStats);
        break;
      }

      gameSummary = resumed.gameSummary;
      fallbackBetApe = resumed.betApe ?? fallbackBetApe;
    } else {
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
          printSessionStats(gamesPlayed, startingBalance, balanceApe, loopStats);
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
        printSessionStats(gamesPlayed, startingBalance, balanceApe, loopStats);
        break;
      }

      // Check if can afford bet
      if (availableApe < requiredApe) {
        if (loopMode) {
          console.log(`\n🛑 Stopping: Cannot afford ${currentBet} APE bet (have ${availableApe.toFixed(2)} APE available)`);
          printSessionStats(gamesPlayed, startingBalance, balanceApe, loopStats);
          break;
        }
        if (isJson) return console.log(JSON.stringify({ error: 'Insufficient balance', required: requiredApe, available: availableApe }));
        console.error(`\n❌ Insufficient balance. Need ${requiredApe.toFixed(4)} APE, have ${availableApe.toFixed(4)} APE\n`);
        return;
      }

      // Check target balance (loop mode)
      if (loopMode && targetBalance !== null && balanceApe >= targetBalance) {
        console.log('\n🎯 Target reached!\n');
        printSessionStats(gamesPlayed, startingBalance, balanceApe, loopStats);
        break;
      }

      // Check stop-loss (loop mode)
      if (loopMode && stopLoss !== null && balanceApe <= stopLoss) {
        const loss = startingBalance - balanceApe;
        console.log(`\n🛑 Stop-loss hit! Balance: ${balanceApe.toFixed(2)} APE (limit: ${stopLoss} APE)`);
        console.log(`   Loss: -${loss.toFixed(2)} APE`);
        printSessionStats(gamesPlayed, startingBalance, balanceApe, loopStats);
        break;
      }

      // Check max games (loop mode)
      if (loopMode && maxGames !== null && gamesPlayed >= maxGames) {
        printSessionStats(gamesPlayed, startingBalance, balanceApe, loopStats);
        break;
      }

      let jackpotApe = null;
      if (loopMode && !isJson && !loopEstimateShown) {
        if (currentBetIndex === MAX_BET_INDEX) {
          try {
            jackpotApe = parseFloat(formatEther(await getJackpot(publicClient)));
          } catch {
            jackpotApe = null;
          }
        }

        const estimateLine = formatLoopRunoutEstimate(
          estimateVideoPokerLoopRunoutMonteCarlo({
            balanceApe,
            availableApe,
            stopLossApe: stopLoss,
            betAmountApe: currentBet,
            jackpotApe,
            initialFeeApe: parseFloat(formatEther(vrfFees.initial)),
            redrawFeeApe: parseFloat(formatEther(vrfFees.redraw)),
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

      // Show jackpot for max bet
      if (verbose && !isJson && currentBetIndex === MAX_BET_INDEX) {
        if (jackpotApe === null) {
          const jackpot = await getJackpot(publicClient);
          jackpotApe = parseFloat(formatEther(jackpot));
        }
        console.log(`\n💎 Jackpot: ${jackpotApe.toFixed(2)} APE (Royal Flush at max bet)`);
      }

      // Start the game
      currentRtpConfig = {
        betAmountApe: currentBet,
        ...(jackpotApe !== null && jackpotApe > 0 ? { jackpotApe } : {}),
      };
      if (verbose && !isJson) {
        console.log(`\n🃏 Starting Video Poker - ${currentBet} APE bet${formatLoopGameLabel(gamesPlayed + 1, maxGames) ? ` [${formatLoopGameLabel(gamesPlayed + 1, maxGames)}]` : ''}`);
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
            printSessionStats(gamesPlayed, startingBalance, balanceApe, loopStats);
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
        if (isJson) return console.log(JSON.stringify({ error: error.message, gameId: result.gameId }));
        console.error(`\n❌ ${error.message}`);
        console.log(`   💡 To resume: ${BINARY_NAME} video-poker resume\n`);
        return;
      }

      if (verbose && !isJson) console.log('');

      // Enter game loop
      gameSummary = await gameLoop(account, publicClient, walletClient, state, {
        displayMode,
        autoMode,
        verbose,
        showSolver,
        gameLabel: formatLoopGameLabel(gamesPlayed + 1, maxGames),
        human: humanTiming,
        vrfFeeRedraw: vrfFees.redraw,
        initialFeeApe: vrfFeeApe,
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

    // Small delay between games - show balance
    const nextDelayMs = getLoopDelayMs({ delaySeconds: loopDelaySeconds, human: humanTiming });
    const terminalConditionReached = (
      balanceAfterGame <= MIN_BALANCE_FLOOR ||
      (targetBalance !== null && balanceAfterGame >= targetBalance) ||
      (stopLoss !== null && balanceAfterGame <= stopLoss) ||
      (maxGames !== null && gamesPlayed >= maxGames)
    );
    console.log('');
    console.log(formatLoopProgress({
      currentBalanceApe: balanceAfterGame,
      startingBalanceApe: startingBalance,
      stats: loopStats,
      rtpGame: 'video-poker',
      rtpConfig: currentRtpConfig,
      nextDelayLabel: terminalConditionReached ? null : formatDelayMs(nextDelayMs),
    }));
    console.log('');
    if (terminalConditionReached) continue;
    await sleep(nextDelayMs);
  }
}

function printResumeQueue(gameIds) {
  console.log(`\n🧩 Unfinished Video Poker Games (${gameIds.length})\n`);
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
  const showSolver = Boolean(opts.solver);
  const autoMode = normalizeAutoMode(opts.auto);

  if (opts.auto !== undefined && autoMode === null) {
    const err = { error: `Invalid --auto mode: "${opts.auto}". Valid values: simple, best.` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }

  const { getWallet } = await import('../../wallet.js');
  const account = getWallet();
  const { publicClient, walletClient } = createClients(account);

  if (verbose && !isJson) {
    console.log(`\n🃏 Resuming Video Poker - Game ${gameId}`);
    console.log('   Fetching game state...\n');
  }

  let state;
  try {
    state = await getGameState(publicClient, gameId);
  } catch (error) {
    removeActiveGame('video-poker', gameId);
    if (isJson) console.log(JSON.stringify({ error: `Game not found: ${gameId}` }));
    else console.error(`\n❌ Game not found: ${gameId}\n`);
    return { status: 'missing', gameId, betApe: null, gameSummary: null };
  }

  // Verify ownership
  if (state.player.toLowerCase() !== account.address.toLowerCase()) {
    if (isJson) console.log(JSON.stringify({ error: 'Game belongs to different wallet' }));
    else console.error('\n❌ This game belongs to a different wallet\n');
    return { status: 'blocked', gameId, betApe: null, gameSummary: null };
  }

  const vrfFees = await getVrfFees(publicClient);

  const gameSummary = await gameLoop(account, publicClient, walletClient, state, {
    displayMode,
    autoMode,
    verbose,
    showSolver,
    human: opts.human,
    vrfFeeRedraw: vrfFees.redraw,
    gameLabel: opts.gameLabel || null,
  });

  return {
    status: gameSummary ? 'completed' : 'incomplete',
    gameId: state.gameId,
    betApe: state.betAmountApe,
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
  const gameIds = gameIdInput ? [gameIdInput] : getActiveGames('video-poker');
  if (gameIds.length === 0) {
    if (isJson) console.log(JSON.stringify({ error: 'No active video poker games' }));
    else console.error('\n❌ No active video poker games to resume\n');
    return { status: 'missing', gameId: null, betApe: null, gameSummary: null };
  }

  if (!gameIdInput && !isJson) {
    printResumeQueue(gameIds);
  }

  let lastResult = { status: 'missing', gameId: null, betApe: null, gameSummary: null };
  const results = [];
  for (const [index, gameId] of gameIds.entries()) {
    if (!gameIdInput && !isJson) {
      console.log(`▶️  Resuming video poker game ${index + 1}/${gameIds.length}: ${gameId}\n`);
    }

    const result = await resumeSingleGame(gameId, opts);
    lastResult = result || lastResult;
    results.push(result);

    if (result?.status === 'completed' || result?.status === 'missing') {
      continue;
    }

    if (!gameIdInput && !isJson && index < gameIds.length - 1) {
      console.log('🛑 Stopping batch resume. Remaining unfinished video poker games stay queued.\n');
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
 * Show status of current game
 */
export async function status(gameIdInput, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.json ? 'json' : (opts.display || profile.cardDisplay || 'full');
  const isJson = displayMode === 'json';

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
  const fullDisplay = displayMode === 'full';
  const verbose = Boolean(opts.verbose);
  const showSolver = Boolean(opts.showSolver);
  const autoMode = opts.autoMode || null;
  const autoPlay = isAutoModeEnabled(autoMode);
  const vrfFeeRedraw = opts.vrfFeeRedraw;
  const gameLabel = opts.gameLabel || null;
  let feesPaidApe = Number(opts.initialFeeApe) || 0;

  let state = initialState;
  const gameId = state.gameId;
  let completedSummary = null;
  let decisionContext = await getDecisionContext(state, {
    autoMode,
    showSolver,
    publicClient,
    isJson,
  });

  // Render current state
  printVideoPokerState(state, {
    displayMode,
    isJson,
    fullDisplay,
    gameLabel,
    suggestionLine: decisionContext.suggestionLine,
    fullView: state.awaitingDecision ? 'decision-top' : null,
  });

  // Check if already complete
  if (state.isComplete) {
    completedSummary = getCompletedGameSummary(state, { feesPaidApe });
    maybePlayWinChime(state, isJson);
    completeGame(gameId);
    if (!isJson) console.log(`Game ${gameId} complete!\n`);
    return completedSummary;
  }

  // Check if waiting for RNG
  if (state.awaitingRNG) {
    if (verbose && !isJson) console.log('  Waiting for cards...');
    state = await waitForState(publicClient, gameId);
    decisionContext = await getDecisionContext(state, {
      autoMode,
      showSolver,
      publicClient,
      isJson,
    });
    printVideoPokerState(state, {
      displayMode,
      isJson,
      fullDisplay,
      gameLabel,
      suggestionLine: decisionContext.suggestionLine,
      fullView: state.awaitingDecision ? 'decision-top' : null,
    });
    maybePlayWinChime(state, isJson);
  }

  // If awaiting decision, prompt for which cards to HOLD
  if (state.awaitingDecision) {
    let cardsToRedraw;
    let holdMask;

    if (autoPlay) {
      cardsToRedraw = decisionContext.cardsToRedraw;

      if (!isJson && !fullDisplay && decisionContext.autoLog) {
        printAutoHoldDecision(decisionContext.autoLog);
      }

      await sleep(getAutoThinkDelayMs());
    } else {
      if (showSolver && !isJson && !fullDisplay && decisionContext.suggestionLine) {
        console.log('');
        console.log(`  ? ${decisionContext.suggestionLine}`);
        console.log('');
      }

      // Interactive: prompt for cards to HOLD (rest get discarded)
      const input = fullDisplay
        ? await promptInline(renderGameFullPromptLine('Hold which? (e.g. "2 4")'))
        : await prompt(renderHoldPrompt());
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
    holdMask = cardsToRedraw.map((value) => !value);

    const discardCount = cardsToRedraw.filter(Boolean).length;

    if (!isJson) {
      if (fullDisplay) {
      } else {
        console.log(formatHoldConfirmation(state.initialCards, cardsToRedraw));
        console.log('');
      }

      if (verbose) {
        console.log('  Sending transaction...');
      }
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
        if (discardCount > 0) {
          feesPaidApe += parseFloat(formatEther(vrfFeeRedraw));
        }
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
      console.log(`  💡 To resume: ${BINARY_NAME} video-poker resume\n`);
      return;
    }

    // Wait for final result
    if (discardCount > 0) {
      if (verbose && !isJson) console.log('  Waiting for new cards...\n');
      state = await waitForState(publicClient, gameId);
    } else {
      // No discards = immediate resolution
      state = await getGameState(publicClient, gameId);
    }

    // Show final result
    if (!isJson && fullDisplay) {
      if (autoPlay) {
        console.log(renderGameFullDecisionEndAuto(state, {
          hold: holdMask,
        }));
      } else {
        console.log(renderGameFullDecisionEndInteractive(state, {
          hold: holdMask,
        }));
      }
      console.log(formatOutcomeFooter(state));
    } else {
      printVideoPokerState(state, {
        displayMode,
        isJson,
        fullDisplay,
        gameLabel,
      });
    }
    maybePlayWinChime(state, isJson);
  }

  // Mark complete
  if (state.isComplete) {
    completeGame(gameId);
    if (!isJson) console.log(`Game ${gameId} complete!\n`);
  }

  if (state.isComplete) {
    completedSummary = getCompletedGameSummary(state, { feesPaidApe });
  }

  return completedSummary;
}

function printVideoPokerState(state, {
  displayMode,
  isJson,
  fullDisplay,
  gameLabel,
  suggestionLine = null,
  fullView = null,
} = {}) {
  let output;

  if (!isJson && fullDisplay && fullView === 'decision-top' && state.awaitingDecision) {
    output = renderGameFullDecisionStart(state, { gameLabel, suggestionLine });
  } else {
    output = renderGame(state, { displayMode, gameLabel, suggestionLine });
  }

  console.log(output);
}

async function getDecisionContext(state, {
  autoMode,
  showSolver,
  publicClient,
  isJson,
} = {}) {
  if (!state?.awaitingDecision) {
    return { cardsToRedraw: null, suggestionLine: null, autoLog: null };
  }

  const autoPlay = isAutoModeEnabled(autoMode);
  const bestAuto = isBestAutoMode(autoMode);
  let bestDecision = null;

  if (bestAuto || showSolver) {
    try {
      let jackpotApe = 0;

      if (isMaxBetAmount(state.betAmountApe)) {
        const jackpot = await getJackpot(publicClient);
        jackpotApe = parseFloat(formatEther(jackpot));
      }

      bestDecision = getBestHoldByEV(state.initialCards, {
        betAmountApe: state.betAmountApe,
        jackpotApe,
      });
    } catch (error) {
      if (bestAuto && !isJson) {
        console.log(`  ⚠️  Best EV unavailable (${error.message}). Falling back to simple.\n`);
      }
    }
  }

  if (autoPlay) {
    if (bestAuto && bestDecision) {
      return {
        cardsToRedraw: holdToRedraw(bestDecision.hold),
        suggestionLine: formatSuggestedHold(bestDecision.hold, `EV ${bestDecision.evMultiplier.toFixed(3)}x`),
        autoLog: {
          label: 'Best EV',
          hold: bestDecision.hold,
          detail: `EV ${bestDecision.evMultiplier.toFixed(3)}x`,
        },
      };
    }

    const optimal = getOptimalHold(state.initialCards);
    return {
      cardsToRedraw: holdToRedraw(optimal.hold),
      suggestionLine: formatSuggestedHold(optimal.hold, optimal.reason),
      autoLog: {
        label: 'Optimal',
        hold: optimal.hold,
        detail: optimal.reason,
      },
    };
  }

  if (showSolver && bestDecision) {
    return {
      cardsToRedraw: null,
      suggestionLine: formatSuggestedHold(bestDecision.hold, `EV ${bestDecision.evMultiplier.toFixed(3)}x`),
      autoLog: null,
    };
  }

  return { cardsToRedraw: null, suggestionLine: null, autoLog: null };
}

function maybePlayWinChime(state, isJson) {
  if (!state?.isComplete || !isWinningHand(state.handStatus)) {
    return;
  }

  queueWinChimeFromWei({
    payoutWei: state.totalPayout,
    wagerWei: state.betAmount,
    isJson,
  });
}

function getCompletedGameSummary(state, { feesPaidApe = 0 } = {}) {
  if (!state?.isComplete) {
    return null;
  }

  return {
    won: state.totalPayout > state.betAmount,
    bet: state.betAmountApe,
    payout: state.totalPayoutApe,
    feesPaidApe,
  };
}

function formatLoopGameLabel(currentGame, totalGames) {
  if (!Number.isFinite(currentGame) || currentGame <= 0) {
    return null;
  }

  return totalGames ? `Game #${currentGame} /${totalGames}` : `Game #${currentGame}`;
}

/**
 * Print session statistics
 */
function printSessionStats(gamesPlayed, startingBalance, endingBalance, stats) {
  console.log('');
  console.log(formatSessionStats({
    gamesPlayed,
    startingBalanceApe: startingBalance,
    endingBalanceApe: endingBalance,
    stats,
    rtpGame: 'video-poker',
  }));
  console.log('');
}

function printAutoHoldDecision({ label, hold, detail }) {
  const holdCount = hold.filter(Boolean).length;

  if (holdCount === 5) {
    console.log(`  🤖 ${label}: Hold all (${detail})`);
    return;
  }

  if (holdCount === 0) {
    console.log(`  🤖 ${label}: Discard all (${detail})`);
    return;
  }

  const heldPositions = hold
    .map((value, index) => (value ? index + 1 : null))
    .filter(Boolean)
    .join(', ');

  console.log(`  🤖 ${label}: Hold ${heldPositions} (${detail})`);
}

function formatSuggestedHold(hold, detail) {
  const holdCount = hold.filter(Boolean).length;

  if (holdCount === 5) {
    return `Hold all (${detail})`;
  }

  if (holdCount === 0) {
    return `Discard all (${detail})`;
  }

  const heldPositions = hold
    .map((value, index) => (value ? index + 1 : null))
    .filter(Boolean)
    .join(',');

  return `Hold ${heldPositions} (${detail})`;
}
