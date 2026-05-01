/**
 * Cash Dash interactive implementation.
 */
import readline from 'readline';
import { formatEther } from 'viem';
import { resolveGameDisplayName } from '../../../registry.js';
import { createClients, getBalanceWithRetry } from '../../wallet.js';
import { loadProfile, resolveGpPerApeInfo, formatGpPerApeNotice } from '../../profile.js';
import { getStrategy, calculateNextBet, getStrategyNames } from '../../strategies/index.js';
import {
  createLoopTerminalState,
  formatLoopTerminalConditionMessage,
  getBalanceLoopTerminalCondition,
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
  getActiveGameCount,
  getActiveGames,
  getOldestActiveGame,
  removeActiveGame,
} from '../../profile.js';
import { BINARY_NAME, GAS_RESERVE_APE } from '../../constants.js';
import { queueWinChimeFromWei } from '../../chime.js';
import { randomIntInclusive } from '../../utils.js';
import {
  completeGame,
  executeCashOut,
  executeGuess,
  startGame,
  waitForState,
} from './actions.js';
import { CASH_DASH_CONTRACT, MAX_TILES } from './constants.js';
import {
  formatMultiplier,
  formatTileLabel,
  getGameState,
  getNetProfitApe,
  getRuntimeConfig,
  parseTileSelection,
  validateBetAmount,
} from './state.js';
import {
  renderActionPrompt,
  renderGame,
  renderOpeningActionPrompt,
  renderOpeningGrid,
  renderPayoutTable,
} from './display.js';
import { getBestDecision, getSimpleDecision } from './strategy.js';
import {
  AUTO_MODE_BEST,
  isAutoModeEnabled,
  isBestAutoMode,
  normalizeAutoMode,
} from '../auto.js';
import {
  DEFAULT_LOOP_DELAY_SECONDS,
  formatDelayMs,
  getAutoThinkDelayMs,
  getLoopDelayMs,
  resolveLoopDelaySeconds,
  sleep,
} from '../timing.js';

const CASH_DASH_DISPLAY_NAME = resolveGameDisplayName({
  gameKey: 'cash-dash',
  contract: CASH_DASH_CONTRACT,
  fallbackName: 'Cash Dash',
});
const MIN_BALANCE_FLOOR = 1;

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

async function checkUnfinished(opts = {}) {
  const count = getActiveGameCount('cash-dash');
  if (count === 0) {
    return null;
  }

  const gameId = getOldestActiveGame('cash-dash');
  if (opts.json) {
    console.log(JSON.stringify({ hasUnfinished: true, gameId, count }));
    return gameId;
  }

  console.log(`\n⚠️  You have ${count} unfinished ${CASH_DASH_DISPLAY_NAME} game${count > 1 ? 's' : ''}.`);
  console.log(`   Game ID: ${gameId}`);
  console.log(`   To clear queue: $ ${BINARY_NAME} cash-dash clear\n`);

  const answer = await prompt('Resume this game? (Y/n): ');
  if (answer.toLowerCase() === 'n') {
    return null;
  }

  return gameId;
}

export async function start(amount, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.json ? 'json' : (opts.display || profile.cardDisplay || 'full');
  const isJson = displayMode === 'json';
  const verbose = Boolean(opts.verbose);
  const loopMode = opts.loop || false;
  const humanTiming = Boolean(opts.human);
  const autoMode = normalizeAutoMode(opts.auto);
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
  let gpPerApe;
  let gpPerApeInfo;
  const loopDelaySeconds = resolveLoopDelaySeconds({
    rawDelay: opts.delay,
    human: humanTiming,
    defaultDelaySeconds: DEFAULT_LOOP_DELAY_SECONDS,
  });
  const cashoutAfterValidation = parseCashoutAfterOption(opts.cashoutAfter);

  if (opts.auto !== undefined && autoMode === null) {
    const err = { error: `Invalid --auto mode: "${opts.auto}". Valid values: simple, best.` };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return;
  }

  if (!cashoutAfterValidation.valid) {
    const err = { error: cashoutAfterValidation.error };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return;
  }
  const cashoutAfter = cashoutAfterValidation.value;

  try {
    gpPerApeInfo = resolveGpPerApeInfo({ cliGpPerApe: opts.gpApe, profile });
    gpPerApe = gpPerApeInfo.gpPerApe;
  } catch (error) {
    const err = { error: error.message };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return;
  }

  const betStrategyName = opts.betStrategy || 'flat';
  const betStrategy = getStrategy(betStrategyName);
  if (!betStrategy) {
    const err = { error: `Unknown betting strategy: "${betStrategyName}". Available: ${getStrategyNames()}` };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return;
  }

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
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return;
  }

  if (opts.maxBet !== undefined && (Number.isNaN(maxBet) || maxBet <= 0)) {
    const err = { error: `Invalid --max-bet value: "${opts.maxBet}". Must be a positive number.` };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return;
  }

  if (opts.delay !== undefined && (!Number.isFinite(loopDelaySeconds) || loopDelaySeconds < 1)) {
    const err = { error: `Invalid --delay value: "${opts.delay}". Must be a number >= 1.` };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return;
  }

  let pendingResumeGameId = null;
  const existingGameId = await checkUnfinished({ json: isJson });
  if (existingGameId) {
    if (!loopMode) {
      return resume(existingGameId, opts);
    }
    pendingResumeGameId = existingGameId;
  }

  const validation = validateBetAmount(amount);
  if (!validation.valid) {
    const err = { error: validation.error };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return;
  }

  const { getWallet } = await import('../../wallet.js');
  const account = getWallet();
  const { publicClient, walletClient } = createClients(account);
  const baseBet = validation.amountApe;

  if (!loopMode) {
    const runtimeConfig = await getRuntimeConfig(publicClient);
    const initialFeeApe = Number(runtimeConfig.vrfFee ? Number(runtimeConfig.vrfFee) / 1e18 : 0);
    const startingBalanceBal = await getBalanceWithRetry(publicClient, account.address);
    const startingBalanceApe = parseFloat(formatEther(startingBalanceBal));

    if (!isJson) {
      console.log('');
      console.log(formatBalanceSnapshot({
        label: 'Balance before game',
        currentBalanceApe: startingBalanceApe,
      }));
      console.log('');
    }

    const openingTile = await resolveOpeningTile(opts.tile, {
      promptForMissing: !isAutoModeEnabled(autoMode) && !isJson,
      displayMode,
    });

    if (openingTile.cancelled) {
      if (!isJson) {
        console.log('\nOpening tile selection cancelled before starting.\n');
      }
      return { status: 'cancelled', gameId: null, betApe: validation.amountApe, gameSummary: null };
    }

    if (!openingTile.valid) {
      return printError(openingTile.error, isJson);
    }

    if (verbose && !isJson) {
      console.log(`\n💸 Starting ${CASH_DASH_DISPLAY_NAME} (${validation.amountApe} APE)`);
      console.log(`   Opening tile: ${formatTileLabel(openingTile.index)}`);
      console.log(`   VRF fee: ${initialFeeApe.toFixed(4)} APE\n`);
    }

    let started;
    try {
      started = await startGame({
        account,
        publicClient,
        walletClient,
        betAmountApe: validation.amountApe,
        vrfFee: runtimeConfig.vrfFee,
        firstGuessIndex: openingTile.index,
        json: isJson,
      });
    } catch (error) {
      const err = { error: error.message };
      if (isJson) {
        console.log(JSON.stringify(err));
      } else {
        console.error(`\n❌ ${err.error}\n`);
      }
      return;
    }

    if (!isJson) {
      console.log(`   Game ID: ${started.gameId}`);
      console.log(`   TX: ${started.hash}\n`);
    }

    const state = await getGameState(publicClient, started.gameId, runtimeConfig);
    const summary = await gameLoop(account, publicClient, walletClient, state, {
      displayMode,
      autoMode,
      solver: Boolean(opts.solver),
      verbose,
      runtimeConfig,
      initialFeeApe,
      gpPerApe,
      cashoutAfter,
    });

    if (summary && !isJson) {
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
      status: summary ? 'completed' : 'incomplete',
      gameId: started.gameId,
      betApe: validation.amountApe,
      gameSummary: summary,
    };
  }

  let gamesPlayed = 0;
  let startingBalance = null;
  let lastGameResult = null;
  const loopStats = createLoopStats();
  const loopTerminalState = createLoopTerminalState();
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;
  let betStrategyState = betStrategy.init(baseBet, { maxBet });
  let currentRtpConfig = { betAmountApe: baseBet, cashoutAfter };

  if (!isJson) {
    console.log(`${formatGpPerApeNotice({ info: gpPerApeInfo })}\n`);
  }

  async function finalizeIteration({ gameSummary, balanceBeforeGame, fallbackBetApe }) {
    gamesPlayed += 1;

    const balanceAfterBal = await getBalanceWithRetry(publicClient, account.address);
    const balanceAfterGame = parseFloat(formatEther(balanceAfterBal));
    const gamePnl = balanceAfterGame - balanceBeforeGame;
    lastGameResult = gameSummary || {
      won: gamePnl > 0,
      bet: fallbackBetApe,
      payout: fallbackBetApe + gamePnl,
      exactPayout: false,
    };

    if (gameSummary) {
      recordLoopGame(loopStats, {
        won: gameSummary.won,
        wageredApe: gameSummary.totalWageredApe ?? gameSummary.bet,
        payoutApe: gameSummary.payout,
        feesPaidApe: gameSummary.feesPaidApe,
        rtpGame: 'cash-dash',
        rtpConfig: currentRtpConfig,
      });
    }

    return balanceAfterGame;
  }

  while (true) {
    const balance = await getBalanceWithRetry(publicClient, account.address);
    const balanceApe = parseFloat(formatEther(balance));
    const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);

    if (startingBalance === null) {
      startingBalance = balanceApe;
    }

    let gameSummary;
    let fallbackBetApe = baseBet;

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
          console.log(`\n🛑 Stopping: unfinished ${CASH_DASH_DISPLAY_NAME} game still needs manual intervention.\n`);
        }
        const endingBalance = parseFloat(formatEther(await getBalanceWithRetry(publicClient, account.address)));
        printSessionStats(gamesPlayed, startingBalance, endingBalance, loopStats, gpPerApe);
        break;
      }

      gameSummary = resumed.gameSummary;
      fallbackBetApe = resumed.betApe ?? fallbackBetApe;
    } else {
      let currentBet = baseBet;
      if (loopMode) {
        const { bet: nextBet, state: newState, capped } = calculateNextBet(
          betStrategy,
          betStrategyState,
          lastGameResult,
          { maxBet, availableBalance: availableApe }
        );
        betStrategyState = newState;
        currentBet = nextBet;

        if (!isJson && betStrategyName !== 'flat') {
          const betInfo = capped ? ' (capped)' : '';
          console.log(`   📊 ${betStrategyName}: betting ${currentBet.toFixed(2)} APE${betInfo}`);
        }
      }

      const runtimeConfig = await getRuntimeConfig(publicClient);
      const initialFeeApe = Number(runtimeConfig.vrfFee ? Number(runtimeConfig.vrfFee) / 1e18 : 0);
      const requiredApe = currentBet + initialFeeApe;

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
      if (preGameTerminalCondition) {
        console.log('');
        console.log(formatLoopTerminalConditionMessage(preGameTerminalCondition, {
          currentBalanceApe: balanceApe,
          startingBalanceApe: startingBalance,
          gamesPlayed,
        }));
        printSessionStats(gamesPlayed, startingBalance, balanceApe, loopStats, gpPerApe);
        break;
      }

      if (availableApe < requiredApe) {
        console.log(`\n🛑 Stopping: Cannot afford ${currentBet.toFixed(2)} APE bet (have ${availableApe.toFixed(2)} APE available)`);
        printSessionStats(gamesPlayed, startingBalance, balanceApe, loopStats, gpPerApe);
        break;
      }

      const openingTile = await resolveOpeningTile(opts.tile, {
        promptForMissing: !isAutoModeEnabled(autoMode) && !isJson,
        displayMode,
      });
      if (openingTile.cancelled) {
        console.log(`\n🛑 Stopping: opening tile selection cancelled.\n`);
        printSessionStats(gamesPlayed, startingBalance, balanceApe, loopStats, gpPerApe);
        break;
      }
      if (!openingTile.valid) {
        printError(openingTile.error, isJson);
        break;
      }

      if (verbose && !isJson) {
        const loopLabel = formatLoopGameLabel(gamesPlayed + 1, maxGames);
        console.log(`\n💸 Starting ${CASH_DASH_DISPLAY_NAME} (${currentBet.toFixed(2)} APE)${loopLabel ? ` [${loopLabel}]` : ''}`);
        console.log(`   Opening tile: ${formatTileLabel(openingTile.index)}`);
        console.log(`   VRF fee: ${initialFeeApe.toFixed(4)} APE\n`);
      }

      let started;
      try {
        started = await startGame({
          account,
          publicClient,
          walletClient,
          betAmountApe: currentBet,
          vrfFee: runtimeConfig.vrfFee,
          firstGuessIndex: openingTile.index,
          json: isJson,
        });
        consecutiveErrors = 0;
      } catch (error) {
        consecutiveErrors += 1;
        if (!isJson) {
          console.error(`\n❌ Game creation failed: ${error.message}`);
        }
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          const err = { error: error.message, reason: 'max_consecutive_errors' };
          if (isJson) {
            console.log(JSON.stringify(err));
          } else {
            console.log(`\n🛑 Stopping: ${MAX_CONSECUTIVE_ERRORS} consecutive errors`);
            printSessionStats(gamesPlayed, startingBalance, balanceApe, loopStats, gpPerApe);
          }
          return;
        }

        if (verbose && !isJson) {
          console.log(`   ⚠️  Retrying next game in 5s (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS} consecutive errors)...\n`);
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }

      currentRtpConfig = { betAmountApe: currentBet, cashoutAfter };

      const state = await getGameState(publicClient, started.gameId, runtimeConfig);
      gameSummary = await gameLoop(account, publicClient, walletClient, state, {
        completedGameNumber: gamesPlayed + 1,
        displayMode,
        autoMode,
        solver: Boolean(opts.solver),
        verbose,
        runtimeConfig,
        initialFeeApe,
        gpPerApe,
        cashoutAfter,
        gameLabel: formatLoopGameLabel(gamesPlayed + 1, maxGames),
        maxGames,
      });
      fallbackBetApe = currentBet;

      if (!gameSummary) {
        if (!isJson) {
          console.log(`\n🛑 Stopping: unfinished ${CASH_DASH_DISPLAY_NAME} game still needs manual intervention.\n`);
        }
        const endingBalance = parseFloat(formatEther(await getBalanceWithRetry(publicClient, account.address)));
        printSessionStats(gamesPlayed, startingBalance, endingBalance, loopStats, gpPerApe);
        break;
      }
    }

    const balanceAfterGame = await finalizeIteration({
      gameSummary,
      balanceBeforeGame: balanceApe,
      fallbackBetApe,
    });

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
      rtpGame: 'cash-dash',
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

    if (!terminalConditionReached) {
      await sleep(nextDelayMs);
    }
  }
}

export async function resume(gameIdInput, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.json ? 'json' : (opts.display || profile.cardDisplay || 'full');
  const isJson = displayMode === 'json';
  const autoMode = normalizeAutoMode(opts.auto);
  const cashoutAfterValidation = parseCashoutAfterOption(opts.cashoutAfter);
  const gameIds = gameIdInput ? [gameIdInput] : getActiveGames('cash-dash');

  if (!cashoutAfterValidation.valid) {
    printError(cashoutAfterValidation.error, isJson);
    return { status: 'blocked', gameId: null, betApe: null, gameSummary: null };
  }

  if (gameIds.length === 0) {
    const error = { error: `No active ${CASH_DASH_DISPLAY_NAME} games` };
    if (isJson) {
      console.log(JSON.stringify(error));
    } else {
      console.error(`\n❌ No active ${CASH_DASH_DISPLAY_NAME} games to resume\n`);
    }
    return { status: 'missing', gameId: null, betApe: null, gameSummary: null };
  }

  const { getWallet } = await import('../../wallet.js');
  const account = getWallet();
  const { publicClient, walletClient } = createClients(account);
  const runtimeConfig = await getRuntimeConfig(publicClient);
  const showSingleGameBalance = !isJson && opts.completedGameNumber == null;
  let gpPerApe;
  try {
    gpPerApe = resolveGpPerApeInfo({ cliGpPerApe: opts.gpApe, profile }).gpPerApe;
  } catch (error) {
    if (isJson) {
      console.log(JSON.stringify({ error: error.message }));
    } else {
      console.error(`\n❌ ${error.message}\n`);
    }
    return { status: 'blocked', gameId: null, betApe: null, gameSummary: null };
  }

  let lastResult = { status: 'missing', gameId: null, betApe: null, gameSummary: null };
  const results = [];

  for (const [index, gameId] of gameIds.entries()) {
    if (!gameIdInput && !isJson) {
      console.log(`▶️  Resuming ${CASH_DASH_DISPLAY_NAME} game ${index + 1}/${gameIds.length}: ${gameId}\n`);
    }

    try {
      const state = await getGameState(publicClient, gameId, runtimeConfig);
      if (String(state.player || '').toLowerCase() !== account.address.toLowerCase()) {
        const error = { error: 'Game belongs to different wallet' };
        if (isJson) {
          console.log(JSON.stringify(error));
        } else {
          console.error('\n❌ This game belongs to a different wallet\n');
        }
        lastResult = { status: 'blocked', gameId, betApe: null, gameSummary: null };
        results.push(lastResult);
        break;
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

      const summary = await gameLoop(account, publicClient, walletClient, state, {
        completedGameNumber: opts.completedGameNumber ?? null,
        displayMode,
        autoMode,
        solver: Boolean(opts.solver),
        verbose: Boolean(opts.verbose),
        runtimeConfig,
        gpPerApe,
        cashoutAfter: cashoutAfterValidation.value,
        maxGames: opts.maxGames ?? null,
      });
      if (summary && showSingleGameBalance) {
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
      lastResult = {
        status: summary ? 'completed' : 'incomplete',
        gameId,
        betApe: state.initialBetAmountApe,
        gameSummary: summary,
      };
      results.push(lastResult);
      if (!summary) {
        break;
      }
    } catch (error) {
      removeActiveGame('cash-dash', gameId);
      const nextResult = { status: 'missing', gameId, betApe: null, gameSummary: null };
      if (isJson) {
        console.log(JSON.stringify({ error: `Game not found: ${gameId}` }));
      } else {
        console.error(`\n❌ Game not found: ${gameId}\n`);
      }
      lastResult = nextResult;
      results.push(nextResult);
    }
  }

  if (results.length <= 1) {
    return lastResult;
  }

  return {
    ...lastResult,
    results,
  };
}

export async function status(gameIdInput, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.json ? 'json' : (opts.display || profile.cardDisplay || 'full');
  const isJson = displayMode === 'json';
  let gameId = gameIdInput;

  if (!gameId) {
    gameId = getOldestActiveGame('cash-dash');
    if (!gameId) {
      if (isJson) {
        console.log(JSON.stringify({ active_games: 0 }));
      } else {
        console.log(`\nNo active ${CASH_DASH_DISPLAY_NAME} games.\n`);
      }
      return;
    }
  }

  const { getWallet } = await import('../../wallet.js');
  const account = getWallet();
  const { publicClient } = createClients(account);
  const runtimeConfig = await getRuntimeConfig(publicClient);
  const state = await getGameState(publicClient, gameId, runtimeConfig);
  console.log(renderGame(state, { displayMode }));
}

export function payouts() {
  console.log(renderPayoutTable());
}

export async function action(actionName, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.json ? 'json' : (opts.display || profile.cardDisplay || 'full');
  const isJson = displayMode === 'json';
  const cashoutRequested = isCashoutAction(actionName);

  let gameId = opts.game || getOldestActiveGame('cash-dash');
  if (!gameId) {
    const err = { error: `No active ${CASH_DASH_DISPLAY_NAME} game` };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return;
  }

  const { getWallet } = await import('../../wallet.js');
  const account = getWallet();
  const { publicClient, walletClient } = createClients(account);
  const runtimeConfig = await getRuntimeConfig(publicClient);
  let state = await getGameState(publicClient, gameId, runtimeConfig);

  if (String(state.player || '').toLowerCase() !== account.address.toLowerCase()) {
    const err = { error: 'Game belongs to different wallet' };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error('\n❌ This game belongs to a different wallet\n');
    }
    return;
  }

  if (!state.awaitingDecision) {
    const err = { error: state.awaitingGuessResult ? 'Game is waiting for VRF result' : 'Game is not awaiting a player decision' };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return;
  }

  if (cashoutRequested) {
    if (!state.canCashOut) {
      const err = { error: 'Cashout is not available yet' };
      if (isJson) {
        console.log(JSON.stringify(err));
      } else {
        console.error(`\n❌ ${err.error}\n`);
      }
      return;
    }
    const result = await executeCashOut({ publicClient, walletClient, gameId });
    state = await getGameState(publicClient, gameId, runtimeConfig);
    state.lastActionTxHash = result?.hash ?? null;
  } else {
    const tile = parseTileSelection(actionName, state.currentTileCount);
    if (!tile.valid) {
      return printError(tile.error, isJson);
    }
    const index = tile.random ? randomIntInclusive(0, state.currentTileCount - 1) : tile.index;
    const result = await executeGuess({
      publicClient,
      walletClient,
      gameId,
      index,
      vrfFee: runtimeConfig.vrfFee,
    });
    state = await waitForState(publicClient, gameId, runtimeConfig);
    state.lastActionTxHash = result?.hash ?? null;
  }

  console.log(renderGame(state, { displayMode }));

  if (state.isComplete) {
    maybePlayWinChime(state, isJson);
    completeGame(gameId, {
      wagerApe: state.totalWageredApe ?? state.initialBetAmountApe,
      payoutApe: state.payoutApe,
      walletAddress: account.address,
      txHash: state.lastActionTxHash ?? null,
    });
  }
}

async function gameLoop(account, publicClient, walletClient, initialState, opts = {}) {
  const displayMode = opts.displayMode || 'full';
  const isJson = displayMode === 'json';
  const verbose = Boolean(opts.verbose);
  const autoMode = opts.autoMode || null;
  const autoPlay = isAutoModeEnabled(autoMode);
  const completedGameNumber = opts.completedGameNumber ?? null;
  const solver = Boolean(opts.solver);
  let runtimeConfig = opts.runtimeConfig || await getRuntimeConfig(publicClient);
  const gpPerApe = opts.gpPerApe;
  const cashoutAfter = opts.cashoutAfter ?? 1;
  const maxGames = opts.maxGames ?? null;
  let feesPaidApe = Number(opts.initialFeeApe) || 0;
  let lastActionTxHash = null;
  let state = initialState;
  const gameId = state.gameId;
  let summary = null;

  while (true) {
    const decisionMode = resolveDecisionMode({ autoMode, autoPlay, solver });
    const decision = state.awaitingDecision && decisionMode
      ? resolveDecision(state, decisionMode, runtimeConfig, { cashoutAfter })
      : null;
    const suggestionLine = decision && solver && !autoPlay
      ? formatDecisionSuggestion(decision)
      : null;

    console.log(renderGame(state, {
      displayMode,
      suggestionLine,
      gameLabel: opts.gameLabel,
    }));

    if (state.isComplete) {
      maybePlayWinChime(state, isJson);
      summary = getCompletedGameSummary(state, { feesPaidApe });
      completeGame(gameId, {
        wagerApe: summary?.totalWageredApe ?? state.totalWageredApe ?? state.initialBetAmountApe,
        payoutApe: summary?.payout ?? state.payoutApe,
        feesPaidApe: summary?.feesPaidApe,
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

    if (state.awaitingInitialReveal || state.awaitingGuessResult) {
      if (verbose && !isJson) {
        console.log(`  Waiting for ${state.awaitingInitialReveal ? 'opening row' : 'guess result'}...`);
      }
      state = await waitForState(publicClient, gameId, runtimeConfig);
      continue;
    }

    if (!state.awaitingDecision) {
      break;
    }

    let nextAction = decision;
    if (autoPlay) {
      if (!isJson) {
        console.log(`  🤖 ${formatDecisionAutoNarration(decision)}`);
      }
      await sleep(getAutoThinkDelayMs());
    } else {
      nextAction = await promptForDecision(state);
      if (nextAction === 'quit') {
        if (!isJson) {
          console.log(`  💡 To resume: ${BINARY_NAME} cash-dash resume\n`);
        }
        return null;
      }
    }

    if (nextAction.type === 'cashout') {
      const result = await executeCashOut({
        publicClient,
        walletClient,
        gameId,
      });
      lastActionTxHash = result?.hash ?? null;
      state = await getGameState(publicClient, gameId, runtimeConfig);
      continue;
    }

    runtimeConfig = await getRuntimeConfig(publicClient);
    const result = await executeGuess({
      publicClient,
      walletClient,
      gameId,
      index: nextAction.index,
      vrfFee: runtimeConfig.vrfFee,
    });
    lastActionTxHash = result?.hash ?? null;
    feesPaidApe += Number(runtimeConfig.vrfFee) / 1e18;
    state = await waitForState(publicClient, gameId, runtimeConfig);
  }

  return summary;
}

export function resolveDecisionMode({ autoMode = null, autoPlay = false, solver = false } = {}) {
  if (autoPlay) {
    return autoMode;
  }
  return solver ? AUTO_MODE_BEST : null;
}

function resolveDecision(state, autoMode, runtimeConfig, opts = {}) {
  if (isBestAutoMode(autoMode)) {
    return getBestDecision(state, runtimeConfig, opts);
  }
  return getSimpleDecision(state, opts);
}

async function promptForDecision(state) {
  while (true) {
    const input = (await prompt(renderActionPrompt(state))).trim().toLowerCase();
    if (input === 'q' || input === 'quit' || input === 'exit') {
      return 'quit';
    }

    if (isCashoutAction(input)) {
      if (state.canCashOut) {
        return { type: 'cashout', label: 'Cash Out', reason: 'manual cashout' };
      }
      console.log('\n❌ Cashout is not available yet.\n');
      continue;
    }

    const tile = parseTileSelection(stripTileActionPrefix(input), state.currentTileCount);
    if (!tile.valid) {
      console.log(`\n❌ Valid choices: 1-${state.currentTileCount}, random, cashout, quit.\n`);
      continue;
    }

    const index = tile.random ? randomIntInclusive(0, state.currentTileCount - 1) : tile.index;
    return {
      type: 'guess',
      index,
      label: formatTileLabel(index),
      reason: 'manual choice',
    };
  }
}

export function formatDecisionSuggestion(decision) {
  if (!decision) {
    return null;
  }
  const key = getDecisionKey(decision);
  if (decision.type === 'cashout') {
    const continuationEv = Number.isFinite(decision.continuationEvMultiplier)
      ? ` | Continue EV ${formatMultiplier(decision.continuationEvMultiplier, 3)}`
      : '';
    return `Cash Out (${key})${continuationEv}`;
  }
  const ev = Number.isFinite(decision.evMultiplier)
    ? ` | EV ${formatMultiplier(decision.evMultiplier, 3)}`
    : '';
  return `${decision.label} (${key})${ev}`;
}

function formatDecisionAutoNarration(decision) {
  if (!decision) {
    return 'No decision available.';
  }
  if (decision.type === 'cashout') {
    return 'Choosing Cash Out (c)';
  }
  return `Choosing ${decision.label} (${getDecisionKey(decision)})`;
}

function getDecisionKey(decision) {
  if (decision?.type === 'cashout') {
    return 'c';
  }
  return Number.isInteger(decision?.index) ? String(decision.index + 1) : '?';
}

function maybePlayWinChime(state, isJson) {
  if (!state?.isComplete || !(state.payout > state.initialBetAmount)) {
    return;
  }

  queueWinChimeFromWei({
    payoutWei: state.payout,
    wagerWei: state.initialBetAmount,
    isJson,
  });
}

function getCompletedGameSummary(state, { feesPaidApe = 0 } = {}) {
  if (!state?.isComplete) {
    return null;
  }

  return {
    won: state.payout > state.initialBetAmount,
    bet: state.initialBetAmountApe,
    payout: state.payoutApe,
    totalWageredApe: state.totalWageredApe ?? state.initialBetAmountApe,
    feesPaidApe,
    netProfitApe: getNetProfitApe(state),
    exactPayout: true,
  };
}

async function resolveOpeningTile(input, opts = {}) {
  if (!hasOpeningTileInput(input)) {
    if (opts.promptForMissing) {
      return promptForOpeningTile(opts.displayMode || 'full');
    }
    return {
      valid: true,
      index: 0,
      defaulted: true,
    };
  }

  const parsed = parseTileSelection(input, MAX_TILES);
  if (!parsed.valid) {
    return parsed;
  }

  return {
    valid: true,
    index: parsed.random ? randomIntInclusive(0, MAX_TILES - 1) : parsed.index,
  };
}

async function promptForOpeningTile(displayMode) {
  console.log(renderOpeningGrid({ displayMode }));

  while (true) {
    const input = (await prompt(renderOpeningActionPrompt())).trim().toLowerCase();
    if (input === 'q' || input === 'quit' || input === 'exit') {
      return { valid: false, cancelled: true };
    }

    if (input === '') {
      console.log(`\n❌ Valid choices: 1-${MAX_TILES}, random, quit.\n`);
      continue;
    }

    const parsed = parseTileSelection(input, MAX_TILES);
    if (!parsed.valid) {
      console.log(`\n❌ Valid choices: 1-${MAX_TILES}, random, quit.\n`);
      continue;
    }

    return {
      valid: true,
      index: parsed.random ? randomIntInclusive(0, MAX_TILES - 1) : parsed.index,
      prompted: true,
    };
  }
}

function hasOpeningTileInput(input) {
  return input !== undefined && input !== null && String(input).trim() !== '';
}

function parseCashoutAfterOption(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return { valid: true, value: 1 };
  }

  if (!/^\d+$/.test(String(rawValue).trim())) {
    return { valid: false, error: `Invalid --cashout-after value: "${rawValue}". Must be a positive integer.` };
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value <= 0) {
    return { valid: false, error: `Invalid --cashout-after value: "${rawValue}". Must be a positive integer.` };
  }

  return { valid: true, value };
}

function isCashoutAction(actionName) {
  const action = String(actionName || '').trim().toLowerCase();
  return ['c', 'cash', 'cashout', 'cash-out', 'collect', 'bank'].includes(action);
}

function stripTileActionPrefix(input) {
  return String(input || '').trim().toLowerCase().replace(/^(tile|guess|pick)\s+/, '');
}

function printError(message, isJson) {
  const err = { error: message };
  if (isJson) {
    console.log(JSON.stringify(err));
  } else {
    console.error(`\n❌ ${err.error}\n`);
  }
}

function formatLoopGameLabel(currentGame, totalGames) {
  if (!Number.isFinite(currentGame) || currentGame <= 0) {
    return null;
  }

  return totalGames ? `Game #${currentGame} /${totalGames}` : `Game #${currentGame}`;
}

function printSessionStats(gamesPlayed, startingBalance, endingBalance, stats, gpPerApe) {
  console.log('');
  console.log(formatSessionStats({
    gamesPlayed,
    startingBalanceApe: startingBalance,
    endingBalanceApe: endingBalance,
    stats,
    rtpGame: 'cash-dash',
    gpPerApe,
  }));
  console.log('');
}
