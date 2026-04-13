/**
 * Hi-Lo Nebula interactive implementation.
 */
import readline from 'readline';
import { resolveGameDisplayName } from '../../../registry.js';
import { createClients } from '../../wallet.js';
import { loadProfile, resolveGpPerApeInfo } from '../../profile.js';
import {
  getActiveGameCount,
  getActiveGames,
  getOldestActiveGame,
  removeActiveGame,
} from '../../profile.js';
import { BINARY_NAME } from '../../constants.js';
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
  isAutoModeEnabled,
  isBestAutoMode,
  normalizeAutoMode,
} from '../auto.js';
import { getAutoThinkDelayMs, sleep } from '../timing.js';

const HI_LO_NEBULA_DISPLAY_NAME = resolveGameDisplayName({
  gameKey: 'hi-lo-nebula',
  contract: HI_LO_NEBULA_CONTRACT,
  fallbackName: 'Hi-Lo Nebula',
});

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
  const autoMode = normalizeAutoMode(opts.auto);
  let gpPerApe;

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
    gpPerApe = resolveGpPerApeInfo({ cliGpPerApe: opts.gpApe, profile }).gpPerApe;
  } catch (error) {
    const err = { error: error.message };
    if (isJson) {
      console.log(JSON.stringify(err));
    } else {
      console.error(`\n❌ ${err.error}\n`);
    }
    return;
  }

  const existingGameId = await checkUnfinished({ json: isJson });
  if (existingGameId) {
    return resume(existingGameId, opts);
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

  let state = await getGameState(publicClient, started.gameId, runtimeConfig);
  const summary = await gameLoop(account, publicClient, walletClient, state, {
    displayMode,
    autoMode,
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
  let runtimeConfig = opts.runtimeConfig || await getRuntimeConfig(publicClient);
  const gpPerApe = opts.gpPerApe;
  let feesPaidApe = Number(opts.initialFeeApe) || 0;
  let state = initialState;
  const gameId = state.gameId;
  let summary = null;

  while (true) {
    const decision = state.awaitingDecision
      ? resolveDecision(state, autoMode, runtimeConfig)
      : null;
    const suggestionLine = decision && !autoPlay
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
        console.log(`  🤖 ${formatDecisionSuggestion(decision)}`);
      }
      await sleep(getAutoThinkDelayMs());
    } else {
      if (!isJson && suggestionLine) {
        console.log(`Suggestion: ${suggestionLine}`);
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
    return 'No decision available.';
  }
  if (decision.type === 'cashout') {
    return `Cash Out (${decision.reason})`;
  }
  if (decision.evMultiplier) {
    return `${decision.label} (EV ${decision.evMultiplier.toFixed(3)}x, ${decision.reason})`;
  }
  return `${decision.label} (${decision.reason})`;
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
