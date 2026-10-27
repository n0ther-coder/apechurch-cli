import { reportLoopFailure } from '../../terminal-summary.js';
import { assertCompleteResultCosts } from '../../game-costs.js';
import { aggregateEconomicsPayloads, pickEconomicsFields } from '../../economics.js';
/**
 * Hi-Lo Nebula interactive implementation.
 */
import readline from 'readline';
import { formatEther } from 'viem';
import { resolveGameDisplayName } from '../../../registry.js';
import { createClients, getBalanceWithRetry } from '../../wallet.js';
import { loadProfile, resolveGpPerApeInfo, formatGpPerApeNotice } from '../../profile.js';
import {
  calculateNextBet,
  getBankrollFractionRuntimeError,
  getBetStrategyUsageError,
  getStrategyNames,
  resolveStrategy,
} from '../../strategies/index.js';
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
import {
  WINSTON_LADDER_FIRST_PAYOUT_FACTOR,
  WINSTON_LADDER_TWO_GAME_PAYOUT_FACTOR,
  getBestDecision,
  getSimpleDecision,
  getWinstonLadderDecision,
} from './strategy.js';
import {
  AUTO_MODE_BEST,
  AUTO_MODE_SIMPLE,
  AUTO_MODE_WINSTON_LADDER,
  formatAutoModes,
  isAutoModeEnabled,
  isBestAutoMode,
  normalizeAutoMode,
} from '../auto.js';
import {
  DEFAULT_LOOP_DELAY_SECONDS,
  formatDelayMs,
  getAutoThinkDelayMs,
  getLoopDelayMs,
  normalizeHumanTiming,
  resolveLoopDelaySeconds,
  sleep,
} from '../timing.js';

const HI_LO_NEBULA_DISPLAY_NAME = resolveGameDisplayName({
  gameKey: 'hi-lo-nebula',
  contract: HI_LO_NEBULA_CONTRACT,
  fallbackName: 'Hi-Lo Nebula',
});
const MIN_BALANCE_FLOOR = 1;
const HI_LO_NEBULA_AUTO_MODES = Object.freeze([
  AUTO_MODE_SIMPLE,
  AUTO_MODE_BEST,
  AUTO_MODE_WINSTON_LADDER,
]);

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

function normalizeSolverMode(rawMode) {
  if (rawMode === undefined || rawMode === null || rawMode === false) {
    return null;
  }
  if (rawMode === true || String(rawMode).trim() === '') {
    return AUTO_MODE_BEST;
  }
  return normalizeAutoMode(rawMode, HI_LO_NEBULA_AUTO_MODES);
}

function isWinstonLadderMode(autoMode) {
  return autoMode === AUTO_MODE_WINSTON_LADDER;
}

function getWinstonLadderContextForFirstGame(autoMode, initialBetApe) {
  if (!isWinstonLadderMode(autoMode)) {
    return null;
  }
  const bet = Number(initialBetApe) || 0;
  return {
    roundIndex: 1,
    initialBetApe: bet,
    firstPayoutApe: 0,
    ladderTargetPayoutApe: bet * WINSTON_LADDER_TWO_GAME_PAYOUT_FACTOR,
  };
}

function getWinstonLadderContextForSecondGame(autoMode, firstSummary, initialBetApe) {
  if (!isWinstonLadderMode(autoMode) || !firstSummary) {
    return null;
  }
  const bet = Number(initialBetApe) || Number(firstSummary.bet) || 0;
  const firstPayoutApe = Number(firstSummary.payout) || 0;
  if (!(bet > 0)) {
    return null;
  }
  if (firstPayoutApe - Number(firstSummary.feesPaidApe ?? 0) >= (bet * (WINSTON_LADDER_FIRST_PAYOUT_FACTOR - 1)) + bet - 1e-9) {
    return null;
  }
  return {
    roundIndex: 2,
    initialBetApe: bet,
    firstPayoutApe,
    ladderTargetPayoutApe: bet * WINSTON_LADDER_TWO_GAME_PAYOUT_FACTOR + Number(firstSummary.feesPaidApe ?? 0),
  };
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

export async function start(amount, opts = {}) {
  const progress = {};
  try {
    return await startSession(amount, opts, progress);
  } catch (error) {
    if (progress.stats) reportLoopFailure(progress.stats, { game: 'hi-lo-nebula', error, json: progress.json, silent: progress.json, loop: Boolean(opts.loop) });
    throw error;
  }
}

async function startSession(amount, opts = {}, progress = {}) {
  const profile = loadProfile();
  const displayMode = opts.json ? 'json' : (opts.display || profile.cardDisplay || 'full');
  const isJson = displayMode === 'json';
  const verbose = Boolean(opts.verbose);
  const loopMode = opts.loop || false;
  const resilient = Boolean(opts.resilient);
  let humanTiming;
  const autoMode = normalizeAutoMode(opts.auto, HI_LO_NEBULA_AUTO_MODES);
  const solverMode = normalizeSolverMode(opts.solver);
  let targetBalance;
  let minProfit;
  let minBalance;
  let maxLoss;
  let maxGames;
  let targetX;
  let targetProfitApe;
  let retrace;
  let recoverLoss;
  let givebackProfit;
  const maxBet = opts.maxBet ? parseFloat(opts.maxBet) : null;
  const minBet = opts.minBet ? parseFloat(opts.minBet) : null;
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
    throw error;
  }

  if (opts.auto !== undefined && autoMode === null) {
    const err = { error: `Invalid --auto mode: "${opts.auto}". Valid values: ${formatAutoModes(HI_LO_NEBULA_AUTO_MODES)}.` };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return;
  }

  if (opts.solver !== undefined && solverMode === null) {
    const err = { error: `Invalid --solver mode: "${opts.solver}". Valid values: ${formatAutoModes(HI_LO_NEBULA_AUTO_MODES)}.` };
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
    throw error;
  }

  const betStrategyName = opts.betStrategy || 'flat';
  let betStrategy;
  try {
    betStrategy = resolveStrategy(betStrategyName);
  } catch (error) {
    throw error;
  }
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
      minBalance,
      maxLoss,
      maxGames,
      targetX,
      targetProfit: targetProfitApe,
      retrace,
      recoverLoss,
      givebackProfit,
    } = parseLoopTerminalOptions(opts));
  } catch (error) {
    throw error;
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

  if (opts.minBet !== undefined && (Number.isNaN(minBet) || minBet <= 0)) {
    const err = { error: `Invalid --min-bet value: "${opts.minBet}". Must be a positive number.` };
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
  const existingGameId = await checkUnfinished({
    json: isJson,
    autoResume: isAutoModeEnabled(autoMode, HI_LO_NEBULA_AUTO_MODES),
  });
  if (existingGameId) {
    if (!loopMode) {
      return resume(existingGameId, opts);
    }
    pendingResumeGameId = existingGameId;
  }

  const betStrategyUsageError = getBetStrategyUsageError(betStrategy, {
    bankrollCap: opts.bankrollCap ?? null,
    bankrollStop: opts.bankrollStop ?? null,
    loopMode,
    hasBaseBet: amount !== undefined && amount !== null,
    minBalance,
    maxLoss,
  });
  if (betStrategyUsageError) {
    const err = { error: betStrategyUsageError };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return;
  }

  const validation = (amount === undefined || amount === null) && betStrategy.requiresNoBaseBet
    ? { valid: true, amountApe: 0 }
    : validateBetAmount(amount);
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
  Object.assign(progress, { stats: createLoopStats(), json: isJson });
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
        resilient,
      });
    } catch (error) {
      throw error;
    }

    if (!isJson) {
      console.log(`   Game ID: ${started.gameId}`);
      console.log(`   TX: ${started.hash}\n`);
    }

    const state = await waitForState(publicClient, started.gameId, runtimeConfig, {
      resilient,
      transactionHash: started.hash,
      walletAddress: account.address,
    });
    let lastStartedGame = started;
    let summary = await gameLoop(account, publicClient, walletClient, state, {
      displayMode,
      autoMode,
      solverMode,
      verbose,
      runtimeConfig,
      initialFeeApe,
      gpPerApe,
      winstonLadderContext: getWinstonLadderContextForFirstGame(autoMode, validation.amountApe),
      resilient,
    });
    if (summary) recordLoopGame(progress.stats, {
      won: summary.won, wageredApe: summary.bet, payoutApe: summary.payout,
      feesPaidApe: summary.feesPaidApe, economics: summary.accounting_version ? summary : null,
    });
    const ladderResults = summary ? [{
      gameId: started.gameId,
      betApe: validation.amountApe,
      gameSummary: summary,
    }] : [];

    const secondLadderContext = getWinstonLadderContextForSecondGame(autoMode, summary, validation.amountApe);
    if (secondLadderContext) {
      const secondRuntimeConfig = await getRuntimeConfig(publicClient);
      const secondFeeApe = Number(secondRuntimeConfig.vrfFee ? Number(secondRuntimeConfig.vrfFee) / 1e18 : 0);
      const balanceBeforeSecond = await getBalanceWithRetry(publicClient, account.address);
      const balanceBeforeSecondApe = parseFloat(formatEther(balanceBeforeSecond));
      const availableApe = Math.max(balanceBeforeSecondApe - GAS_RESERVE_APE, 0);
      const requiredApe = validation.amountApe + secondFeeApe;

      if (availableApe < requiredApe) {
        if (!isJson) {
          console.log(`\n🛑 Stopping winston-ladder: cannot afford second ${validation.amountApe.toFixed(2)} APE bet (have ${availableApe.toFixed(2)} APE available)\n`);
        }
      } else {
        if (verbose && !isJson) {
          console.log(`\n🌌 Starting ${HI_LO_NEBULA_DISPLAY_NAME} winston-ladder game 2 (${validation.amountApe} APE)`);
          console.log(`   First payout: ${secondLadderContext.firstPayoutApe.toFixed(4)} APE`);
          console.log(`   Target total payout: ${secondLadderContext.ladderTargetPayoutApe.toFixed(4)} APE`);
          console.log(`   VRF fee: ${secondFeeApe.toFixed(4)} APE\n`);
        }

        try {
          lastStartedGame = await startGame({
            account,
            publicClient,
            walletClient,
            betAmountApe: validation.amountApe,
            vrfFee: secondRuntimeConfig.vrfFee,
            json: isJson,
            resilient,
          });
        } catch (error) {
          throw error;
        }

        if (lastStartedGame.gameId !== started.gameId) {
          if (!isJson) {
            console.log(`   Game ID: ${lastStartedGame.gameId}`);
            console.log(`   TX: ${lastStartedGame.hash}\n`);
          }

          const secondState = await waitForState(publicClient, lastStartedGame.gameId, secondRuntimeConfig, {
            resilient,
            transactionHash: lastStartedGame.hash,
            walletAddress: account.address,
          });
          const secondSummary = await gameLoop(account, publicClient, walletClient, secondState, {
            displayMode,
            autoMode,
            solverMode,
            verbose,
            runtimeConfig: secondRuntimeConfig,
            initialFeeApe: secondFeeApe,
            gpPerApe,
            winstonLadderContext: secondLadderContext,
            resilient,
          });
          if (secondSummary) recordLoopGame(progress.stats, {
            won: secondSummary.won, wageredApe: secondSummary.bet, payoutApe: secondSummary.payout,
            feesPaidApe: secondSummary.feesPaidApe, economics: secondSummary.accounting_version ? secondSummary : null,
          });
          summary = secondSummary;
          if (secondSummary) {
            ladderResults.push({
              gameId: lastStartedGame.gameId,
              betApe: validation.amountApe,
              gameSummary: secondSummary,
            });
          }
        }
      }
    }

    if (isJson && ladderResults.length > 1) {
      console.log(JSON.stringify({ status: 'complete', game: 'hi-lo-nebula', games_played: ladderResults.length,
        games_detail: ladderResults.map((row) => row.gameSummary),
        ...aggregateEconomicsPayloads(ladderResults.map((row) => row.gameSummary)) }));
    }
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
      gameId: lastStartedGame.gameId,
      betApe: validation.amountApe,
      gameSummary: summary,
      ...(ladderResults.length > 1 ? { ladderResults } : {}),
    };
  }

  let gamesPlayed = 0;
  let startingBalance = null;
  let lastGameResult = null;
  const loopStats = createLoopStats();
  Object.assign(progress, { stats: loopStats, json: isJson });
  const loopTerminalState = createLoopTerminalState();
  let betStrategyState = betStrategy.init(baseBet, { maxBet, minBet, fraction: betStrategy.fraction });
  let currentRtpConfig = { betAmountApe: baseBet };
  let pendingWinstonLadderSecond = null;

  if (!isJson) {
    console.log(`${formatGpPerApeNotice({ info: gpPerApeInfo })}\n`);
  }

  async function finalizeIteration({ gameSummary, balanceBeforeGame, fallbackBetApe }) {
    gamesPlayed += 1;

    lastGameResult = gameSummary;

    if (gameSummary) {
      recordLoopGame(loopStats, {
        won: gameSummary.won,
        wageredApe: gameSummary.bet,
        payoutApe: gameSummary.payout,
        feesPaidApe: gameSummary.feesPaidApe,
        economics: gameSummary.accounting_version ? gameSummary : null,
        rtpGame: 'hi-lo-nebula',
        rtpConfig: currentRtpConfig,
      });
    }

    const balanceAfterBal = await getBalanceWithRetry(publicClient, account.address);
    const balanceAfterGame = parseFloat(formatEther(balanceAfterBal));
    return balanceAfterGame;
  }

  while (true) {
    const balance = await getBalanceWithRetry(publicClient, account.address);
    const balanceApe = parseFloat(formatEther(balance));
    const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);

    if (startingBalance === null) {
      startingBalance = balanceApe;
      const derivedLossControls = deriveLoopLossControls({
        bankrollCap: opts.bankrollCap ?? null,
        bankrollStop: opts.bankrollStop ?? null,
        startingBalanceWei: balance,
        minBalance,
        maxLoss,
        startingBalanceApe: startingBalance,
      });
      minBalance = derivedLossControls.minBalance;
      maxLoss = derivedLossControls.maxLoss;
      if (derivedLossControls.bankrollCapState) loopTerminalState.bankrollCap = derivedLossControls.bankrollCapState;

      const bankrollFractionRuntimeError = getBankrollFractionRuntimeError(betStrategy, { maxLoss: getRemainingBankrollApe({ bankrollCapState: loopTerminalState.bankrollCap, bankrollCap: opts.bankrollCap ?? null, bankrollStop: opts.bankrollStop ?? null, currentBalanceApe: startingBalance, startingBalanceApe: startingBalance, maxLoss, minBalance, sessionPnlApe: 0 }) });
      if (bankrollFractionRuntimeError) {
        const err = { error: bankrollFractionRuntimeError };
        if (isJson) {
          console.log(JSON.stringify(err));
        } else {
          console.error(`\n❌ ${err.error}\n`);
        }
        return;
      }
    }

    let gameSummary;
    let fallbackBetApe = baseBet;
    let ladderContext = null;

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
      let consumedWinstonLadderSecond = null;
      if (pendingWinstonLadderSecond) {
        consumedWinstonLadderSecond = pendingWinstonLadderSecond;
        currentBet = pendingWinstonLadderSecond.betApe;
        ladderContext = pendingWinstonLadderSecond.context;
        pendingWinstonLadderSecond = null;
      } else if (loopMode) {
        const bankrollRemainingApe = getRemainingBankrollApe({ bankrollCapState: loopTerminalState.bankrollCap,
          bankrollCap: opts.bankrollCap ?? null,
          bankrollStop: opts.bankrollStop ?? null,
          minBalance,
          sessionPnlApe: loopStats.totalPayoutApe - loopStats.totalWageredApe - loopStats.totalFeesPaidApe,
          totalWagerApe: loopStats.totalWageredApe,
          currentBalanceApe: balanceApe,
          startingBalanceApe: startingBalance,
          maxLoss,
        });
        const { bet: nextBet, state: newState, capped } = calculateNextBet(
          betStrategy,
          betStrategyState,
          lastGameResult,
          { maxBet, minBet, availableBalance: availableApe, bankrollRemainingApe }
        );
        betStrategyState = newState;
        currentBet = nextBet;

        if (!isJson && betStrategyName !== 'flat') {
          const betInfo = capped ? ' (capped)' : '';
          console.log(`   📊 ${betStrategyName}: betting ${currentBet.toFixed(2)} APE${betInfo}`);
        }
      }
      ladderContext ||= getWinstonLadderContextForFirstGame(autoMode, currentBet);

      const runtimeConfig = await getRuntimeConfig(publicClient);
      const initialFeeApe = Number(runtimeConfig.vrfFee ? Number(runtimeConfig.vrfFee) / 1e18 : 0);
      const requiredApe = currentBet + initialFeeApe;

      const preGameTerminalCondition = getBalanceLoopTerminalCondition({
        bankrollCap: opts.bankrollCap ?? null,
        bankrollStop: opts.bankrollStop ?? null,
        economics: loopStats.economics,
        sessionPnlApe: loopStats.totalPayoutApe - loopStats.totalWageredApe - loopStats.totalFeesPaidApe,
          totalWagerApe: loopStats.totalWageredApe,
          currentBalanceApe: balanceApe,
        startingBalanceApe: startingBalance,
        targetBalance,
        minProfit,
        minBalance,
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
          resilient,
        });
      } catch (error) {
        // The transaction layer already exhausted its retry policy.
        // Preserve the failed costs and stop instead of opening a new game.
        throw error;
      }

      currentRtpConfig = { betAmountApe: currentBet };

      const state = await waitForState(publicClient, started.gameId, runtimeConfig, {
        resilient,
        transactionHash: started.hash,
        walletAddress: account.address,
      });
      gameSummary = await gameLoop(account, publicClient, walletClient, state, {
        completedGameNumber: gamesPlayed + 1,
        displayMode,
        autoMode,
        solverMode,
        verbose,
        runtimeConfig,
        initialFeeApe,
        gpPerApe,
        gameLabel: formatLoopGameLabel(gamesPlayed + 1, maxGames),
        maxGames,
        winstonLadderContext: ladderContext,
        resilient,
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
    const canQueueWinstonSecond = Number(ladderContext?.roundIndex || 1) === 1;
    const nextWinstonLadderContext = canQueueWinstonSecond
      ? getWinstonLadderContextForSecondGame(autoMode, gameSummary, fallbackBetApe)
      : null;
    pendingWinstonLadderSecond = nextWinstonLadderContext
      ? { betApe: fallbackBetApe, context: nextWinstonLadderContext }
      : null;

    const nextDelayMs = getLoopDelayMs({ delaySeconds: loopDelaySeconds, human: humanTiming });
    const singleGameTerminalCondition = getSingleGameLoopTerminalCondition({
      gameResult: gameSummary,
      targetX,
      targetProfit: targetProfitApe,
      retrace,
    });
    const sessionTerminalCondition = getBalanceLoopTerminalCondition({
      bankrollCap: opts.bankrollCap ?? null,
      bankrollStop: opts.bankrollStop ?? null,
      economics: loopStats.economics,
      sessionPnlApe: loopStats.totalPayoutApe - loopStats.totalWageredApe - loopStats.totalFeesPaidApe,
          totalWagerApe: loopStats.totalWageredApe,
          currentBalanceApe: balanceAfterGame,
      startingBalanceApe: startingBalance,
      targetBalance,
      minProfit,
      minBalance,
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
  if (loopMode && isJson && loopStats.economics?.length) {
    console.log(JSON.stringify({ game: 'hi-lo-nebula', status: 'complete', loop: true,
      games_played: loopStats.economics.length, games_detail: loopStats.economics,
      ...aggregateEconomicsPayloads(loopStats.economics) }));
  }
}

export async function resume(gameIdInput, opts = {}) {
  const profile = loadProfile();
  const displayMode = opts.json ? 'json' : (opts.display || profile.cardDisplay || 'full');
  const isJson = displayMode === 'json';
  const resilient = Boolean(opts.resilient);
  const autoMode = normalizeAutoMode(opts.auto, HI_LO_NEBULA_AUTO_MODES);
  const solverMode = normalizeSolverMode(opts.solver);
  const gameIds = gameIdInput ? [gameIdInput] : getActiveGames('hi-lo-nebula');

  if (opts.auto !== undefined && autoMode === null) {
    const err = { error: `Invalid --auto mode: "${opts.auto}". Valid values: ${formatAutoModes(HI_LO_NEBULA_AUTO_MODES)}.` };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return { status: 'blocked', gameId: null, betApe: null, gameSummary: null };
  }

  if (opts.solver !== undefined && solverMode === null) {
    const err = { error: `Invalid --solver mode: "${opts.solver}". Valid values: ${formatAutoModes(HI_LO_NEBULA_AUTO_MODES)}.` };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return { status: 'blocked', gameId: null, betApe: null, gameSummary: null };
  }

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
  const showSingleGameBalance = !isJson && opts.completedGameNumber == null;
  let gpPerApe;
  try {
    gpPerApe = resolveGpPerApeInfo({ cliGpPerApe: opts.gpApe, profile }).gpPerApe;
  } catch (error) {
    if (error.accounting || error.code === 'ACCOUNTING_INCOMPLETE') throw error;
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
        solverMode,
        verbose: Boolean(opts.verbose),
        runtimeConfig,
        gpPerApe,
        maxGames: opts.maxGames ?? null,
        winstonLadderContext: getWinstonLadderContextForFirstGame(autoMode, state.initialBetAmountApe),
        resilient,
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
      if (error.accounting || error.code === 'ACCOUNTING_INCOMPLETE') throw error;
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
  const resilient = Boolean(opts.resilient);
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
    const result = await executeCashOut({ publicClient, walletClient, gameId, resilient, json: isJson });
    state = await getGameState(publicClient, gameId, runtimeConfig);
    state.lastActionTxHash = result?.hash ?? null;
  } else {
    const result = await executeGuess({
      account,
      publicClient,
      walletClient,
      gameId,
      direction: normalizedAction,
      vrfFee: runtimeConfig.vrfFee,
      resilient,
      json: isJson,
    });
    state = await waitForState(publicClient, gameId, runtimeConfig, {
      resilient,
      transactionHash: result?.hash ?? null,
      walletAddress: account.address,
    });
    state.lastActionTxHash = result?.hash ?? null;
  }

  console.log(renderGame(state, { displayMode }));

  if (state.isComplete) {
    maybePlayWinChime(state, isJson);
    completeGame(gameId, {
      wagerApe: state.initialBetAmountApe,
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
  const autoPlay = isAutoModeEnabled(autoMode, HI_LO_NEBULA_AUTO_MODES);
  const resilient = Boolean(opts.resilient);
  const completedGameNumber = opts.completedGameNumber ?? null;
  const solverMode = opts.solverMode || (opts.solver ? AUTO_MODE_BEST : null);
  const solver = Boolean(solverMode);
  const winstonLadderContext = opts.winstonLadderContext || null;
  let runtimeConfig = opts.runtimeConfig || await getRuntimeConfig(publicClient);
  const gpPerApe = opts.gpPerApe;
  const maxGames = opts.maxGames ?? null;
  let feesPaidApe = Number(opts.initialFeeApe) || 0;
  let lastActionTxHash = null;
  let state = initialState;
  const gameId = state.gameId;
  let summary = null;

  while (true) {
    const decisionMode = resolveDecisionMode({ autoMode, autoPlay, solver, solverMode });
    const decision = state.awaitingDecision && decisionMode
      ? resolveDecision(state, decisionMode, runtimeConfig, { winstonLadderContext })
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

    if (state.awaitingInitialDeal || state.awaitingGuessResult) {
      if (verbose && !isJson) {
        console.log(`  Waiting for ${state.awaitingInitialDeal ? 'initial card' : 'guess result'}...`);
      }
      state = await waitForState(publicClient, gameId, runtimeConfig, {
        resilient,
        transactionHash: lastActionTxHash,
        walletAddress: account.address,
      });
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
      const result = await executeCashOut({
      publicClient,
      walletClient,
      gameId,
      resilient,
      json: isJson,
    });
      lastActionTxHash = result?.hash ?? null;
      state = await getGameState(publicClient, gameId, runtimeConfig);
      continue;
    }

    runtimeConfig = await getRuntimeConfig(publicClient);
    const result = await executeGuess({
      account,
      publicClient,
      walletClient,
      gameId,
      direction: nextAction.direction,
      vrfFee: runtimeConfig.vrfFee,
      resilient,
      json: isJson,
    });
    lastActionTxHash = result?.hash ?? null;
    feesPaidApe += Number(runtimeConfig.vrfFee) / 1e18;
    state = await waitForState(publicClient, gameId, runtimeConfig, {
      resilient,
      transactionHash: lastActionTxHash,
      walletAddress: account.address,
    });
  }

  return summary;
}

export function resolveDecisionMode({
  autoMode = null,
  autoPlay = false,
  solver = false,
  solverMode = null,
} = {}) {
  if (autoPlay) {
    return autoMode;
  }
  return solverMode || (solver ? AUTO_MODE_BEST : null);
}

function resolveDecision(state, autoMode, runtimeConfig, { winstonLadderContext = null } = {}) {
  if (autoMode === AUTO_MODE_WINSTON_LADDER) {
    return getWinstonLadderDecision(state, {
      ...winstonLadderContext,
      initialBetApe: winstonLadderContext?.initialBetApe ?? state.initialBetAmountApe,
      currentCostsApe: Number(state.cost_ape ?? 0),
    });
  }
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
  assertCompleteResultCosts(state);
  if (!state?.isComplete) {
    return null;
  }

  return {
    ...pickEconomicsFields(state),
    won: state.pnl_wei != null ? BigInt(state.pnl_wei) > 0n : state.payout > state.initialBetAmount,
    bet: state.initialBetAmountApe,
    payout: state.payoutApe,
    totalWageredApe: getTotalWageredApe(state),
    feesPaidApe: state.cost_ape === undefined || state.cost_ape === null ? feesPaidApe : Number(state.cost_ape),
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
