/**
 * Hi-Lo Nebula interactive implementation.
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
import { createLoopStats, formatLoopProgress, formatSessionStats, recordLoopGame } from '../../loop-stats.js';
import {
  getActiveGameCount,
  getActiveGames,
  getOldestActiveGame,
  removeActiveGame,
} from '../../profile.js';
import { BINARY_NAME, GAS_RESERVE_APE } from '../../constants.js';
import { queueWinChimeFromWei } from '../../chime.js';
import {
  completeGame,
  executeCashOut,
  executeGuess,
  normalizeCliAction,
  startGame,
  waitForState,
} from './actions.js';
import { GuessDirection, HI_LO_NEBULA_CONTRACT } from './constants.js';
import {
  formatGuessLabel,
  getGameState,
  getNetProfitApe,
  getRuntimeConfig,
  getTotalWageredApe,
  validateBetAmount,
} from './state.js';
import { renderActionPrompt, renderGame, renderPayoutTable } from './display.js';
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

const HI_LO_NEBULA_DISPLAY_NAME = resolveGameDisplayName({
  gameKey: 'hi-lo-nebula',
  contract: HI_LO_NEBULA_CONTRACT,
  fallbackName: 'Hi-Lo Nebula',
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
  const count = getActiveGameCount('hi-lo-nebula');
  if (count === 0) {
    return null;
  }

  const gameId = getOldestActiveGame('hi-lo-nebula');
  if (opts.json) {
    console.log(JSON.stringify({ hasUnfinished: true, gameId, count }));
    return gameId;
  }

  console.log(`\n⚠️  You have ${count} unfinished ${HI_LO_NEBULA_DISPLAY_NAME} game${count > 1 ? 's' : ''}.`);
  console.log(`   Game ID: ${gameId}`);
  console.log(`   To clear queue: $ ${BINARY_NAME} hi-lo-nebula clear\n`);

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
  let stopLoss;
  let maxGames;
  let targetX;
  let targetPayoutApe;
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

  if (opts.auto !== undefined && autoMode === null) {
    const err = { error: `Invalid --auto mode: "${opts.auto}". Valid values: simple, best.` };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return;
  }

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
      stopLoss,
      maxGames,
      targetX,
      targetProfit: targetPayoutApe,
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

    if (verbose && !isJson) {
      console.log(`\n🌌 Starting ${HI_LO_NEBULA_DISPLAY_NAME} (${validation.amountApe} APE)`);
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
    });

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
  let currentRtpConfig = { betAmountApe: baseBet };

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
        rtpGame: 'hi-lo-nebula',
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
        gameLabel: formatLoopGameLabel(gamesPlayed + 1, maxGames),
      });

      if (resumed?.status === 'missing') {
        continue;
      }

      if (!resumed || resumed.status !== 'completed') {
        if (!isJson) {
          console.log(`\n🛑 Stopping: unfinished ${HI_LO_NEBULA_DISPLAY_NAME} game still needs manual intervention.\n`);
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
        stopLoss,
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

      if (verbose && !isJson) {
        const loopLabel = formatLoopGameLabel(gamesPlayed + 1, maxGames);
        console.log(`\n🌌 Starting ${HI_LO_NEBULA_DISPLAY_NAME} (${currentBet.toFixed(2)} APE)${loopLabel ? ` [${loopLabel}]` : ''}`);
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

      currentRtpConfig = { betAmountApe: currentBet };

      const state = await getGameState(publicClient, started.gameId, runtimeConfig);
      gameSummary = await gameLoop(account, publicClient, walletClient, state, {
        displayMode,
        autoMode,
        solver: Boolean(opts.solver),
        verbose,
        runtimeConfig,
        initialFeeApe,
        gpPerApe,
        gameLabel: formatLoopGameLabel(gamesPlayed + 1, maxGames),
      });
      fallbackBetApe = currentBet;

      if (!gameSummary) {
        if (!isJson) {
          console.log(`\n🛑 Stopping: unfinished ${HI_LO_NEBULA_DISPLAY_NAME} game still needs manual intervention.\n`);
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
      rtpGame: 'hi-lo-nebula',
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
  const gameIds = gameIdInput ? [gameIdInput] : getActiveGames('hi-lo-nebula');

  if (gameIds.length === 0) {
    const error = { error: `No active ${HI_LO_NEBULA_DISPLAY_NAME} games` };
    if (isJson) {
      console.log(JSON.stringify(error));
    } else {
      console.error(`\n❌ No active ${HI_LO_NEBULA_DISPLAY_NAME} games to resume\n`);
    }
    return { status: 'missing', gameId: null, betApe: null, gameSummary: null };
  }

  const { getWallet } = await import('../../wallet.js');
  const account = getWallet();
  const { publicClient, walletClient } = createClients(account);
  const runtimeConfig = await getRuntimeConfig(publicClient);
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
      console.log(`▶️  Resuming ${HI_LO_NEBULA_DISPLAY_NAME} game ${index + 1}/${gameIds.length}: ${gameId}\n`);
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

      const summary = await gameLoop(account, publicClient, walletClient, state, {
        displayMode,
        autoMode,
        solver: Boolean(opts.solver),
        verbose: Boolean(opts.verbose),
        runtimeConfig,
        gpPerApe,
      });
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
      removeActiveGame('hi-lo-nebula', gameId);
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
    gameId = getOldestActiveGame('hi-lo-nebula');
    if (!gameId) {
      if (isJson) {
        console.log(JSON.stringify({ active_games: 0 }));
      } else {
        console.log(`\nNo active ${HI_LO_NEBULA_DISPLAY_NAME} games.\n`);
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
  const normalizedAction = normalizeCliAction(actionName);
  const profile = loadProfile();
  const displayMode = opts.json ? 'json' : (opts.display || profile.cardDisplay || 'full');
  const isJson = displayMode === 'json';

  if (normalizedAction === null) {
    const err = { error: `Unknown action: ${actionName}` };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ Unknown action: ${actionName}\n`);
    }
    return;
  }

  let gameId = opts.game || getOldestActiveGame('hi-lo-nebula');
  if (!gameId) {
    const err = { error: 'No active Hi-Lo Nebula game' };
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
    const err = { error: 'Game is not awaiting a player decision' };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return;
  }

  if (normalizedAction === 'cashout') {
    if (!state.canCashOut) {
      const err = { error: 'Cashout is not available yet' };
      if (isJson) {
        console.log(JSON.stringify(err));
      } else {
        console.error(`\n❌ ${err.error}\n`);
      }
      return;
    }
    await executeCashOut({ publicClient, walletClient, gameId });
    state = await getGameState(publicClient, gameId, runtimeConfig);
  } else {
    await executeGuess({
      account,
      publicClient,
      walletClient,
      gameId,
      direction: normalizedAction,
      vrfFee: runtimeConfig.vrfFee,
    });
    state = await waitForState(publicClient, gameId, runtimeConfig);
  }

  console.log(renderGame(state, { displayMode }));

  if (state.isComplete) {
    maybePlayWinChime(state, isJson);
    completeGame(gameId, {
      wagerApe: state.initialBetAmountApe,
      walletAddress: account.address,
    });
  }
}

async function gameLoop(account, publicClient, walletClient, initialState, opts = {}) {
  const displayMode = opts.displayMode || 'full';
  const isJson = displayMode === 'json';
  const verbose = Boolean(opts.verbose);
  const autoMode = opts.autoMode || null;
  const autoPlay = isAutoModeEnabled(autoMode);
  const solver = Boolean(opts.solver);
  let runtimeConfig = opts.runtimeConfig || await getRuntimeConfig(publicClient);
  const gpPerApe = opts.gpPerApe;
  let feesPaidApe = Number(opts.initialFeeApe) || 0;
  let state = initialState;
  const gameId = state.gameId;
  let summary = null;

  while (true) {
    const decisionMode = resolveDecisionMode({ autoMode, autoPlay, solver });
    const decision = state.awaitingDecision && decisionMode
      ? resolveDecision(state, decisionMode, runtimeConfig)
      : null;
    const suggestionLine = decision && solver && !autoPlay
      ? formatDecisionSuggestion(decision)
      : null;

    console.log(renderGame(state, { displayMode }));

    if (state.isComplete) {
      maybePlayWinChime(state, isJson);
      summary = getCompletedGameSummary(state, { feesPaidApe });
      completeGame(gameId, {
        wagerApe: summary?.bet ?? state.initialBetAmountApe,
        gpPerApe,
        walletAddress: account.address,
      });
      if (!isJson) {
        console.log(`Game ${gameId} complete!\n`);
      }
      break;
    }

    if (state.awaitingInitialDeal || state.awaitingGuessResult) {
      if (verbose && !isJson) {
        console.log(`  Waiting for ${state.awaitingInitialDeal ? 'initial card' : 'guess result'}...`);
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
      if (!isJson && suggestionLine) {
        console.log(suggestionLine);
      }
      nextAction = await promptForDecision(state);
      if (nextAction === 'quit') {
        if (!isJson) {
          console.log(`  💡 To resume: ${BINARY_NAME} hi-lo-nebula resume\n`);
        }
        return null;
      }
    }

    if (nextAction.type === 'cashout') {
      await executeCashOut({
        publicClient,
        walletClient,
        gameId,
      });
      state = await getGameState(publicClient, gameId, runtimeConfig);
      continue;
    }

    runtimeConfig = await getRuntimeConfig(publicClient);
    await executeGuess({
      account,
      publicClient,
      walletClient,
      gameId,
      direction: nextAction.direction,
      vrfFee: runtimeConfig.vrfFee,
    });
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

function resolveDecision(state, autoMode, runtimeConfig) {
  if (isBestAutoMode(autoMode)) {
    return getBestDecision(state, runtimeConfig);
  }
  return getSimpleDecision(state);
}

async function promptForDecision(state) {
  while (true) {
    const input = (await prompt(renderActionPrompt())).trim().toLowerCase();
    if (input === 'q' || input === 'quit' || input === 'exit') {
      return 'quit';
    }

    const normalized = normalizeCliAction(input);
    if (normalized === 'cashout') {
      if (state.canCashOut) {
        return { type: 'cashout', label: 'Cash Out', reason: 'manual cashout' };
      }
      console.log('\n❌ Cashout is not available yet.\n');
      continue;
    }

    if (normalized === null) {
      console.log('\n❌ Valid choices: high, lower, same, cashout, quit.\n');
      continue;
    }

    if (!state.availableDirections.includes(normalized)) {
      console.log(`\n❌ ${formatGuessLabel(normalized)} is not available from ${state.currentCardLabel}.\n`);
      continue;
    }

    return {
      type: 'guess',
      direction: normalized,
      label: formatGuessLabel(normalized),
      reason: 'manual choice',
    };
  }
}

function formatDecisionSuggestion(decision) {
  if (!decision) {
    return null;
  }
  if (decision.type === 'cashout') {
    return 'Suggested action is to Cash Out: c';
  }
  return `Suggested action is to guess ${decision.label}: ${getDecisionKey(decision)}`;
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

  switch (Number(decision?.direction)) {
    case 1:
      return 'l';
    case 2:
      return 'h';
    case 3:
      return 's';
    default:
      return '?';
  }
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
    totalWageredApe: getTotalWageredApe(state),
    feesPaidApe,
    netProfitApe: getNetProfitApe(state),
    exactPayout: true,
  };
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
    rtpGame: 'hi-lo-nebula',
    gpPerApe,
  }));
  console.log('');
}
