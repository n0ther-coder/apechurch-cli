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
  deriveLoopLossControls,
  formatLoopTerminalConditionMessage,
  getBalanceLoopTerminalCondition,
  getRemainingBankrollApe,
  getSingleGameLoopTerminalCondition,
  parseLoopTerminalOptions,
} from '../../loop-conditions.js';
import {
  createLoopStats,
  formatBalanceSnapshot,
  formatLoopGameCompletion,
  formatLoopProgress,
  formatSessionStats,
  recordLoopGame,
} from '../../loop-stats.js';
import {
  formatLoopRunoutEstimate,
} from '../../loop-estimate.js';
import { estimateBlackjackLoopRunoutMonteCarlo } from './monte-carlo.js';
import {
  calculateNextBet,
  getBankrollFractionRuntimeError,
  getBetStrategyUsageError,
  getStrategyNames,
  resolveStrategy,
} from '../../strategies/index.js';
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
import {
  BLACKJACK_SOLVER_TIMEOUT_CODE,
  DEFAULT_AUTO_BEST_MAX_PLAYER_STATES,
  DEFAULT_AUTO_BEST_SOLVER_TIMEOUT_MS,
  DEFAULT_AUTO_MAX_MAX_PLAYER_STATES,
  DEFAULT_AUTO_MAX_SOLVER_TIMEOUT_MS,
  solveBestActionByEVWithWorker,
} from './solver-worker-runner.js';
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
  normalizeHumanTiming,
  resolveLoopDelaySeconds,
  sleep,
} from '../timing.js';
import {
  AUTO_MODE_BEST,
  AUTO_MODE_MAX,
  AUTO_MODE_SIMPLE,
  isAutoModeEnabled,
  normalizeAutoMode,
} from '../auto.js';
import { queueWinChimeFromWei } from '../../chime.js';

const BLACKJACK_AUTO_MODES = Object.freeze([
  AUTO_MODE_SIMPLE,
  AUTO_MODE_BEST,
  AUTO_MODE_MAX,
]);

function formatBlackjackAutoModes() {
  return BLACKJACK_AUTO_MODES.join(', ');
}

function normalizeBlackjackSolverMode(rawMode) {
  if (rawMode === undefined || rawMode === null || rawMode === false) {
    return null;
  }

  if (rawMode === true || String(rawMode).trim() === '') {
    return AUTO_MODE_BEST;
  }

  return normalizeAutoMode(rawMode, BLACKJACK_AUTO_MODES);
}

function getSolverBudgetMode({ autoMode = null, solverMode = null } = {}) {
  return autoMode || solverMode || null;
}

function getDefaultSolverMaxStates(autoMode) {
  return autoMode === AUTO_MODE_MAX
    ? DEFAULT_AUTO_MAX_MAX_PLAYER_STATES
    : DEFAULT_AUTO_BEST_MAX_PLAYER_STATES;
}

function getDefaultSolverTimeoutMs(autoMode) {
  return autoMode === AUTO_MODE_MAX
    ? DEFAULT_AUTO_MAX_SOLVER_TIMEOUT_MS
    : DEFAULT_AUTO_BEST_SOLVER_TIMEOUT_MS;
}

function parseSolverMaxStates(rawValue, { autoMode = null } = {}) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return getDefaultSolverMaxStates(autoMode);
  }

  const text = String(rawValue).trim();
  const parsed = Number(text);

  if (!/^\d+$/.test(text) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid --solver-max-states value: "${rawValue}". Must be a positive integer.`);
  }

  return parsed;
}

function parseSolverTimeoutMs(rawValue, { autoMode = null } = {}) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return getDefaultSolverTimeoutMs(autoMode);
  }

  const text = String(rawValue).trim();
  const parsed = Number(text);

  if (!/^\d+$/.test(text) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid --solver-timeout-ms value: "${rawValue}". Must be a positive integer.`);
  }

  return parsed;
}

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

  if (opts.autoResume) {
    console.log('   Auto-resuming because --auto is enabled.\n');
    return gameId;
  }

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
  const resilient = Boolean(opts.resilient);
  const loopMode = opts.loop || false;
  let humanTiming;
  let autoMode = normalizeAutoMode(opts.auto, BLACKJACK_AUTO_MODES);
  let solverMode = normalizeBlackjackSolverMode(opts.solver);
  let targetBalance;
  let minProfit;
  let stopLoss;
  let maxLoss;
  let maxGames;
  let targetX;
  let targetPayoutApe;
  let retrace;
  let recoverLoss;
  let givebackProfit;
  const maxBet = opts.maxBet ? parseFloat(opts.maxBet) : null;
  const minBet = opts.minBet ? parseFloat(opts.minBet) : null;
  const playerSideApe = opts.side !== undefined ? parseFloat(opts.side) : 0;
  let solverMaxStates;
  let solverTimeoutMs;
  let gpPerApe;
  let gpPerApeInfo;
  let loopDelaySeconds;

  try {
    humanTiming = normalizeHumanTiming(opts.human);
    loopDelaySeconds = resolveLoopDelaySeconds({
      rawDelay: opts.delay,
      human: humanTiming,
      defaultDelaySeconds: DEFAULT_LOOP_DELAY_SECONDS,
    });
  } catch (error) {
    const err = { error: error.message };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }

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
  let betStrategy;
  try {
    betStrategy = resolveStrategy(betStrategyName);
  } catch (error) {
    const err = { error: error.message };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }
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
      minProfit,
      stopLoss,
      maxLoss,
      maxGames,
      targetX,
      targetProfit: targetPayoutApe,
      retrace,
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
  if (opts.minBet !== undefined && (isNaN(minBet) || minBet <= 0)) {
    const err = { error: `Invalid --min-bet value: "${opts.minBet}". Must be a positive number.` };
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
    const err = { error: `Invalid --auto mode: "${opts.auto}". Valid values: ${formatBlackjackAutoModes()}.` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }
  if (opts.solver !== undefined && solverMode === null) {
    const err = { error: `Invalid --solver mode: "${opts.solver}". Valid values: ${formatBlackjackAutoModes()}.` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }
  try {
    const solverBudgetMode = getSolverBudgetMode({ autoMode, solverMode });
    solverMaxStates = parseSolverMaxStates(opts.solverMaxStates, { autoMode: solverBudgetMode });
    solverTimeoutMs = parseSolverTimeoutMs(opts.solverTimeoutMs, { autoMode: solverBudgetMode });
  } catch (error) {
    const err = { error: error.message };
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
  // Check for unfinished games. Stale local entries are cleaned up by resume()
  // and should not block a newly requested hand.
  while (true) {
    const existingGameId = await checkUnfinished({
      json: isJson,
      autoResume: isAutoModeEnabled(autoMode, BLACKJACK_AUTO_MODES),
    });
    if (!existingGameId) break;

    if (loopMode) {
      pendingResumeGameId = existingGameId;
      break;
    }

    const resumed = await resume(existingGameId, opts);
    if (resumed?.status === 'missing') {
      continue;
    }
    return resumed;
  }

  const betStrategyUsageError = getBetStrategyUsageError(betStrategy, {
    loopMode,
    hasBaseBet: amount !== undefined && amount !== null,
    stopLoss,
    maxLoss,
  });
  if (betStrategyUsageError) {
    const err = { error: betStrategyUsageError };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }

  // Validate amount
  const betApe = amount === undefined || amount === null ? 0 : parseFloat(amount);
  if ((!betStrategy.requiresNoBaseBet || amount !== undefined) && (isNaN(betApe) || betApe <= 0)) {
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
  let betStrategyState = betStrategy.init(baseBet, { maxBet, minBet, fraction: betStrategy.fraction });
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
      const derivedLossControls = deriveLoopLossControls({
        stopLoss,
        maxLoss,
        startingBalanceApe: startingBalance,
      });
      stopLoss = derivedLossControls.stopLoss;
      maxLoss = derivedLossControls.maxLoss;

      const bankrollFractionRuntimeError = getBankrollFractionRuntimeError(betStrategy, { maxLoss });
      if (bankrollFractionRuntimeError) {
        const err = { error: bankrollFractionRuntimeError };
        if (isJson) return console.log(JSON.stringify(err));
        console.error(`\n❌ ${err.error}\n`);
        return;
      }
      if (!loopMode && !isJson) {
        console.log('');
        console.log(formatBalanceSnapshot({
          label: 'Balance before game',
          currentBalanceApe: balanceApe,
        }));
        console.log('');
      }
    }

    let gameSummary;
    let fallbackBetApe = betApe;

    if (pendingResumeGameId) {
      const resumeGameId = pendingResumeGameId;
      pendingResumeGameId = null;

      const resumed = await resume(resumeGameId, {
        ...opts,
        completedGameNumber: gamesPlayed + 1,
        gameLabel: formatLoopGameLabel(gamesPlayed + 1, maxGames),
        maxGames,
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
        const bankrollRemainingApe = getRemainingBankrollApe({
          currentBalanceApe: balanceApe,
          startingBalanceApe: startingBalance,
          maxLoss,
        });
        const { bet: nextBet, state: newState, capped } = calculateNextBet(
          betStrategy, betStrategyState, lastGameResult,
          { maxBet, minBet, availableBalance: availableApe, bankrollRemainingApe }
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
        minProfit,
        stopLoss,
        maxLoss,
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
        const sessionStopLossApe = maxLoss !== null ? Math.max(balanceApe - maxLoss, 0) : null;
        const estimateStopLossApe = stopLoss !== null && sessionStopLossApe !== null
          ? Math.max(stopLoss, sessionStopLossApe)
          : (stopLoss ?? sessionStopLossApe);
        const estimateLine = formatLoopRunoutEstimate(
          estimateBlackjackLoopRunoutMonteCarlo({
            balanceApe,
            availableApe,
            stopLossApe: estimateStopLossApe,
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
          resilient,
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
        const err = { error: error.message, gameId: String(result.gameId) };
        if (isJson) return console.log(JSON.stringify(err));
        console.error(`\n❌ ${error.message}\n`);
        console.log(`   💡 To resume this game: ${BINARY_NAME} blackjack resume\n`);
        return;
      }

      if (verbose && !isJson) console.log('');

      // Enter game loop
      gameSummary = await gameLoop(account, publicClient, walletClient, state, {
        completedGameNumber: gamesPlayed + 1,
        displayMode,
        autoMode,
        solverMode,
        solverMaxStates,
        solverTimeoutMs,
        verbose,
        gameLabel: formatLoopGameLabel(gamesPlayed + 1, maxGames),
        human: humanTiming,
        initialFeeApe: vrfFeeApe,
        gpPerApe,
        maxGames,
        resilient,
      });
      fallbackBetApe = currentBet;
    }

    const balanceAfterGame = await finalizeIteration({
      gameSummary,
      balanceBeforeGame: balanceApe,
      fallbackBetApe,
    });

    // If not looping, show the final balance and exit after one game
    if (!loopMode) {
      if (!isJson) {
        console.log('');
        console.log(formatBalanceSnapshot({
          label: 'Balance after game',
          currentBalanceApe: balanceAfterGame,
          startingBalanceApe: startingBalance,
        }));
        console.log('');
      }
      break;
    }

    // Small delay between games in loop mode - show balance
    const nextDelayMs = getLoopDelayMs({ delaySeconds: loopDelaySeconds, human: humanTiming });
    const singleGameTerminalCondition = getSingleGameLoopTerminalCondition({
      gameResult: gameSummary,
      targetX,
      targetProfit: targetPayoutApe,
      retrace,
    });
    const sessionTerminalCondition = getBalanceLoopTerminalCondition({
      currentBalanceApe: balanceAfterGame,
      startingBalanceApe: startingBalance,
      targetBalance,
      minProfit,
      stopLoss,
      maxLoss,
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
  const resilient = Boolean(opts.resilient);
  let autoMode = normalizeAutoMode(opts.auto, BLACKJACK_AUTO_MODES);
  let solverMode = normalizeBlackjackSolverMode(opts.solver);
  let solverMaxStates;
  let solverTimeoutMs;
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
    const err = { error: `Invalid --auto mode: "${opts.auto}". Valid values: ${formatBlackjackAutoModes()}.` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }
  if (opts.solver !== undefined && solverMode === null) {
    const err = { error: `Invalid --solver mode: "${opts.solver}". Valid values: ${formatBlackjackAutoModes()}.` };
    if (isJson) return console.log(JSON.stringify(err));
    console.error(`\n❌ ${err.error}\n`);
    return;
  }
  try {
    const solverBudgetMode = getSolverBudgetMode({ autoMode, solverMode });
    solverMaxStates = parseSolverMaxStates(opts.solverMaxStates, { autoMode: solverBudgetMode });
    solverTimeoutMs = parseSolverTimeoutMs(opts.solverTimeoutMs, { autoMode: solverBudgetMode });
  } catch (error) {
    const err = { error: error.message };
    if (isJson) console.log(JSON.stringify(err));
    else console.error(`\n❌ ${err.error}\n`);
    return { status: 'blocked', gameId, betApe: null, gameSummary: null };
  }

  // Get wallet
  const { getWallet } = await import('../../wallet.js');
  const account = getWallet();
  const { publicClient, walletClient } = createClients(account);
  const showSingleGameBalance = !isJson && opts.completedGameNumber == null;

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

  let startingBalanceApe = null;
  if (showSingleGameBalance) {
    const startingBalanceBal = await getBalanceWithRetry(publicClient, account.address);
    startingBalanceApe = parseFloat(formatEther(startingBalanceBal));
    console.log('');
    console.log(formatBalanceSnapshot({
      label: 'Balance before game',
      currentBalanceApe: startingBalanceApe,
    }));
    console.log('');
  }

  // Enter game loop
  const gameSummary = await gameLoop(account, publicClient, walletClient, state, {
    completedGameNumber: opts.completedGameNumber ?? null,
    displayMode,
    autoMode,
    solverMode,
    solverMaxStates,
    solverTimeoutMs,
    verbose,
    human: opts.human,
    gameLabel: opts.gameLabel || null,
    gpPerApe,
    maxGames: opts.maxGames ?? null,
    resilient,
  });

  if (gameSummary && showSingleGameBalance) {
    const endingBalanceBal = await getBalanceWithRetry(publicClient, account.address);
    const endingBalanceApe = parseFloat(formatEther(endingBalanceBal));
    console.log('');
    console.log(formatBalanceSnapshot({
      label: 'Balance after game',
      currentBalanceApe: endingBalanceApe,
      startingBalanceApe,
    }));
    console.log('');
  }

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
  const resilient = Boolean(opts.resilient);
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

  let actionResult;
  try {
    actionResult = await executeAction({
      account,
      publicClient,
      walletClient,
      gameId,
      action: actionName,
      state,
      vrfFee,
      resilient,
      json: isJson,
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
      payoutApe: completedSummary?.payout,
      feesPaidApe: completedSummary?.feesPaidApe,
      gpPerApe,
      walletAddress: account.address,
      txHash: actionResult?.txHash ?? null,
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
  const solverMode = opts.solverMode || null;
  const autoPlay = isAutoModeEnabled(autoMode, BLACKJACK_AUTO_MODES);
  const solverBudgetMode = getSolverBudgetMode({ autoMode, solverMode });
  const solverMaxStates = opts.solverMaxStates ?? getDefaultSolverMaxStates(solverBudgetMode);
  const solverTimeoutMs = opts.solverTimeoutMs ?? getDefaultSolverTimeoutMs(solverBudgetMode);
  const completedGameNumber = opts.completedGameNumber ?? null;
  const gameLabel = opts.gameLabel || null;
  const gpPerApe = opts.gpPerApe;
  const maxGames = opts.maxGames ?? null;
  const resilient = Boolean(opts.resilient);
  let feesPaidApe = Number(opts.initialFeeApe) || 0;
  let progressStepLabel = null;
  let hitCounts = [0, 0];
  let lastActionTxHash = null;
  const autoDecisions = [];

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

    const canShowManualSuggestion = Boolean(
      solverMode &&
      !autoPlay &&
      !state.isComplete &&
      !state.awaitingRandomNumber &&
      actions.some((action) => action.canAfford)
    );
    const jsonSolverSuggestion = isJson && canShowManualSuggestion
      ? await getManualSolverSuggestion(state, actions, { solverMode, solverMaxStates, solverTimeoutMs })
      : null;

    // Render current state
    const output = renderGame(state, actions, {
      displayMode,
      autoPlay,
      autoMode,
      solverMode,
      solverSuggestion: jsonSolverSuggestion,
      solverMaxStates,
      solverTimeoutMs,
      autoDecisions,
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
        payoutApe: completedSummary?.payout,
        feesPaidApe: completedSummary?.feesPaidApe,
        gpPerApe,
        walletAddress: account.address,
        txHash: lastActionTxHash,
      });
      if (!isJson) {
        const completionOutput = formatLoopGameCompletion({
          currentGame: completedGameNumber,
          maxGames,
          gameId,
        });
        console.log(`${completionOutput || `Game ${gameId} complete!`}\n`);
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
      selectedAction = await getAutoPlayAction(state, actions, { autoMode, solverMaxStates, solverTimeoutMs });

      if (!selectedAction) {
        console.log('  🤖 No valid action found. Stopping auto-play.');
        console.log(`  💡 To resume this game: ${BINARY_NAME} blackjack resume\n`);
        break;
      }

      if (selectedAction.fallbackError) {
        console.log(`  ⚠️  Best EV unavailable (${selectedAction.fallbackError}). Using simple.\n`);
      }

      // Display bot decision
      const exactAuto = selectedAction.source === AUTO_MODE_BEST || selectedAction.source === AUTO_MODE_MAX;
      const autoLabel = exactAuto
        ? (selectedAction.source === AUTO_MODE_MAX ? 'Max EV' : 'Best EV')
        : 'Optimal';
      const evLabel = exactAuto
        ? `, EV ${selectedAction.evUnits.toFixed(3)}x`
        : '';
      console.log(`  🤖 ${autoLabel}: ${selectedAction.label} (${selectedAction.reason}${evLabel})\n`);

      // Add a short think pause so auto-play doesn't look instant.
      await sleep(getAutoThinkDelayMs());
    } else {
      if (canShowManualSuggestion && !isJson) {
        const solverSuggestion = await getManualSolverSuggestion(state, actions, {
          solverMode,
          solverMaxStates,
          solverTimeoutMs,
        });
        const suggestionOutput = formatManualSolverSuggestion(solverSuggestion);
        if (suggestionOutput) {
          console.log(`${suggestionOutput}\n`);
        }
      }

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

    if (autoPlay) {
      autoDecisions.push(serializeAutoDecision(selectedAction, state, {
        sequence: autoDecisions.length + 1,
        requestedSolver: autoMode,
        stepLabel: progressStepLabel,
      }));
    }

    // Execute action with retry logic
    if (verbose || !autoPlay) {
      console.log(`  Executing ${selectedAction.label}...`);
    }

    try {
      const actionResult = await executeAction({
        account,
        publicClient,
        walletClient,
        gameId,
        action: selectedAction.action,
        state,
        vrfFee,
        resilient,
        json: isJson,
      });
      lastActionTxHash = actionResult?.txHash ?? null;
      feesPaidApe += parseFloat(formatEther((selectedAction.cost || 0n) - (selectedAction.betCost || 0n)));
    } catch (error) {
      console.error(`  ❌ Transaction failed: ${error.message}\n`);
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

function serializeAutoDecision(selectedAction, state, {
  sequence,
  requestedSolver,
  stepLabel = null,
} = {}) {
  const activeHand = getActiveHand(state);
  const decision = {
    sequence,
    requestedSolver: requestedSolver || null,
    effectiveSolver: selectedAction.source || null,
    action: selectedAction.action,
    key: selectedAction.key,
    label: selectedAction.label,
    reason: selectedAction.reason || null,
    handIndex: state.activeHandIndex,
    stepLabel,
    dealerUpcard: state.dealerHand.cards[0]?.display || null,
    playerCards: activeHand?.cards?.map((card) => card.display) || [],
    playerValue: activeHand?.handValue ?? null,
    playerIsSoft: activeHand?.isSoft ?? null,
  };

  if (selectedAction.evUnits !== undefined) {
    decision.evUnits = selectedAction.evUnits;
  }
  if (selectedAction.fallbackError) {
    decision.fallbackError = selectedAction.fallbackError;
  }
  if (selectedAction.solverElapsedMs !== undefined) {
    decision.solverElapsedMs = selectedAction.solverElapsedMs;
  }
  if (selectedAction.solverTimedOut !== undefined) {
    decision.solverTimedOut = selectedAction.solverTimedOut;
  }
  if (selectedAction.solverWorker !== undefined) {
    decision.solverWorker = selectedAction.solverWorker;
  }
  if (selectedAction.solverMaxStates !== undefined) {
    decision.solverMaxStates = selectedAction.solverMaxStates;
  }
  if (selectedAction.solverTimeoutMs !== undefined) {
    decision.solverTimeoutMs = selectedAction.solverTimeoutMs;
  }

  return decision;
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
async function getAutoPlayAction(state, actions, { autoMode, solverMaxStates, solverTimeoutMs } = {}) {
  const affordableActions = actions.filter(a => a.canAfford);
  if (affordableActions.length === 0) return null;

  if (autoMode === AUTO_MODE_BEST || autoMode === AUTO_MODE_MAX) {
    try {
      return await getExactWorkerAction(state, affordableActions, {
        solverMode: autoMode,
        solverMaxStates,
        solverTimeoutMs,
      });
    } catch (error) {
      const fallback = getSimpleAutoPlayAction(state, affordableActions);
      if (fallback) {
        return {
          ...fallback,
          fallbackError: error.message,
          solverElapsedMs: error.solverElapsedMs,
          solverTimedOut: error.code === BLACKJACK_SOLVER_TIMEOUT_CODE,
          solverWorker: true,
          solverMaxStates,
          solverTimeoutMs,
        };
      }
      return null;
    }
  }

  return getSimpleAutoPlayAction(state, affordableActions);
}

async function getManualSolverSuggestion(state, actions, {
  solverMode,
  solverMaxStates,
  solverTimeoutMs,
} = {}) {
  const affordableActions = actions.filter((action) => action.canAfford);
  if (affordableActions.length === 0 || !solverMode) return null;

  const simple = getSimpleAutoPlayAction(state, affordableActions);
  const suggestion = {
    requestedSolver: solverMode,
    solverMaxStates,
    solverTimeoutMs,
    simple: simple ? serializeSolverSuggestionAction(simple) : null,
  };

  if (solverMode === AUTO_MODE_SIMPLE) {
    suggestion.selectedSolver = AUTO_MODE_SIMPLE;
    return suggestion;
  }

  try {
    const worker = await getExactWorkerAction(state, affordableActions, {
      solverMode,
      solverMaxStates,
      solverTimeoutMs,
    });
    suggestion.selectedSolver = worker.source;
    suggestion.worker = serializeSolverSuggestionAction(worker);
  } catch (error) {
    suggestion.selectedSolver = AUTO_MODE_SIMPLE;
    suggestion.workerError = error.message;
    suggestion.workerTimedOut = error.code === BLACKJACK_SOLVER_TIMEOUT_CODE;
    suggestion.workerElapsedMs = error.solverElapsedMs ?? null;
  }

  return suggestion;
}

async function getExactWorkerAction(state, affordableActions, {
  solverMode,
  solverMaxStates,
  solverTimeoutMs,
} = {}) {
  const best = await solveBestActionByEVWithWorker(state, {
    allowedActions: affordableActions.map((action) => action.action),
    maxPlayerStates: solverMaxStates,
    timeoutMs: solverTimeoutMs,
  });
  const selected = affordableActions.find((action) => action.action === best.action);

  if (!selected) {
    throw new Error(`Blackjack EV worker returned unavailable action: ${best.action}`);
  }

  return {
    ...selected,
    reason: best.reason,
    evUnits: best.evUnits,
    source: solverMode === AUTO_MODE_MAX ? AUTO_MODE_MAX : AUTO_MODE_BEST,
    solverElapsedMs: best.solverElapsedMs,
    solverWorker: best.solverWorker,
    solverMaxStates,
    solverTimeoutMs,
  };
}

function serializeSolverSuggestionAction(action) {
  if (!action) return null;

  const suggestion = {
    action: action.action,
    key: action.key,
    label: action.label,
    reason: action.reason || null,
    source: action.source || null,
  };

  if (action.evUnits !== undefined) {
    suggestion.evUnits = action.evUnits;
  }
  if (action.solverElapsedMs !== undefined) {
    suggestion.solverElapsedMs = action.solverElapsedMs;
  }
  if (action.solverWorker !== undefined) {
    suggestion.solverWorker = action.solverWorker;
  }
  if (action.solverMaxStates !== undefined) {
    suggestion.solverMaxStates = action.solverMaxStates;
  }
  if (action.solverTimeoutMs !== undefined) {
    suggestion.solverTimeoutMs = action.solverTimeoutMs;
  }

  return suggestion;
}

function formatManualSolverSuggestion(suggestion) {
  if (!suggestion) return '';

  if (suggestion.requestedSolver === AUTO_MODE_SIMPLE) {
    return suggestion.simple
      ? `  💡 Simple: ${formatSolverSuggestionAction(suggestion.simple)}`
      : '';
  }

  const lines = [];
  const solverLabel = suggestion.requestedSolver === AUTO_MODE_MAX ? 'Worker max' : 'Worker best';

  if (suggestion.worker) {
    lines.push(`  💡 ${solverLabel}: ${formatSolverSuggestionAction(suggestion.worker)}`);
  } else if (suggestion.workerError) {
    const elapsed = suggestion.workerElapsedMs !== null && suggestion.workerElapsedMs !== undefined
      ? ` after ${suggestion.workerElapsedMs} ms`
      : '';
    lines.push(`  ⚠️  ${solverLabel} unavailable${elapsed}: ${suggestion.workerError}`);
  }

  if (suggestion.simple) {
    lines.push(`  💡 Simple: ${formatSolverSuggestionAction(suggestion.simple)}`);
  }

  return lines.join('\n');
}

function formatSolverSuggestionAction(action) {
  const parts = [action.label];

  if (action.reason) {
    parts.push(action.reason);
  }
  if (action.evUnits !== undefined) {
    parts.push(`EV ${action.evUnits.toFixed(3)}x`);
  }
  if (action.solverElapsedMs !== undefined) {
    parts.push(`${action.solverElapsedMs} ms`);
  }

  const details = parts.slice(1);
  return details.length > 0 ? `${parts[0]} (${details.join(', ')})` : parts[0];
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
