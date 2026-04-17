/**
 * Hi-Lo Nebula transactions and polling helpers.
 */
import { encodeAbiParameters, parseEther } from 'viem';
import { resolveGameDisplayName } from '../../../registry.js';
import {
  addActiveGame,
  estimateGpFromWagerApe,
  loadProfile,
  removeActiveGame,
  resolveGpPerApe,
  saveGameToHistory,
} from '../../profile.js';
import { getValidRefAddress, randomBytes32, randomUint256, sanitizeError } from '../../utils.js';
import { GuessDirection, HI_LO_NEBULA_ABI, HI_LO_NEBULA_CONTRACT } from './constants.js';
import { getGameState } from './state.js';

const HI_LO_NEBULA_DISPLAY_NAME = resolveGameDisplayName({
  gameKey: 'hi-lo-nebula',
  contract: HI_LO_NEBULA_CONTRACT,
  fallbackName: 'Hi-Lo Nebula',
});

export async function startGame({
  account,
  publicClient,
  walletClient,
  betAmountApe,
  vrfFee,
  json = false,
}) {
  const profile = loadProfile();
  const referral = getValidRefAddress(profile.referral);
  const betWei = parseEther(String(betAmountApe));
  const gameId = randomUint256();
  const totalValue = betWei + vrfFee;
  const gameData = encodeAbiParameters(
    [
      { type: 'uint256' },
      { type: 'address' },
      { type: 'bytes32' },
    ],
    [gameId, referral, randomBytes32()]
  );

  const maxRetries = 1;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const hash = await walletClient.writeContract({
        address: HI_LO_NEBULA_CONTRACT,
        abi: HI_LO_NEBULA_ABI,
        functionName: 'play',
        args: [account.address, gameData],
        value: totalValue,
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 90000,
      });

      if (receipt.status !== 'success') {
        throw new Error('Transaction reverted on-chain');
      }

      addActiveGame('hi-lo-nebula', gameId);
      saveGameToHistory({
        contract: HI_LO_NEBULA_CONTRACT,
        gameId: gameId.toString(),
        timestamp: Date.now(),
        tx: hash,
        game: HI_LO_NEBULA_DISPLAY_NAME,
        game_key: 'hi-lo-nebula',
        rtp_game: 'hi-lo-nebula',
        walletAddress: account.address,
      });
      return { hash, receipt, gameId: gameId.toString() };
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries && !json) {
        console.log(`   ⚠️  Transaction failed, retrying in 3s... (${sanitizeError(error)})`);
      }
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  throw new Error(`Failed to start ${HI_LO_NEBULA_DISPLAY_NAME} after retry: ${sanitizeError(lastError)}`);
}

export async function executeGuess({
  account,
  publicClient,
  walletClient,
  gameId,
  direction,
  vrfFee,
}) {
  const hash = await walletClient.writeContract({
    address: HI_LO_NEBULA_CONTRACT,
    abi: HI_LO_NEBULA_ABI,
    functionName: 'makeGuess',
    args: [BigInt(gameId), Number(direction), randomBytes32()],
    value: vrfFee,
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: 90000,
  });

  if (receipt.status !== 'success') {
    throw new Error('Guess transaction reverted');
  }

  return { hash, receipt };
}

export async function executeCashOut({
  publicClient,
  walletClient,
  gameId,
}) {
  const hash = await walletClient.writeContract({
    address: HI_LO_NEBULA_CONTRACT,
    abi: HI_LO_NEBULA_ABI,
    functionName: 'cashOut',
    args: [BigInt(gameId)],
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: 90000,
  });

  if (receipt.status !== 'success') {
    throw new Error('Cashout transaction reverted');
  }

  return { hash, receipt };
}

export async function waitForState(publicClient, gameId, runtimeConfig, opts = {}) {
  const maxAttempts = opts.maxAttempts || 60;
  const interval = opts.interval || 2000;
  const onPoll = typeof opts.onPoll === 'function' ? opts.onPoll : () => {};

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const state = await getGameState(publicClient, gameId, runtimeConfig);
    if (!state.awaitingInitialDeal && !state.awaitingGuessResult) {
      return state;
    }

    onPoll(attempt, state);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Timeout waiting for Hi-Lo Nebula state transition');
}

export function completeGame(gameId, {
  wagerApe = null,
  gpPerApe = null,
  walletAddress = null,
  txHash = null,
} = {}) {
  removeActiveGame('hi-lo-nebula', gameId);
  const estimatedGp = wagerApe !== null && wagerApe !== undefined
    ? estimateGpFromWagerApe({
        wagerApe,
        gpPerApe: gpPerApe ?? resolveGpPerApe({ walletAddress }),
      })
    : null;
  saveGameToHistory({
    contract: HI_LO_NEBULA_CONTRACT,
    gameId: gameId.toString(),
    timestamp: Date.now(),
    tx: txHash,
    game: HI_LO_NEBULA_DISPLAY_NAME,
    game_key: 'hi-lo-nebula',
    rtp_game: 'hi-lo-nebula',
    gp_received_raw: estimatedGp,
    gp_source: estimatedGp !== null ? 'local-estimate' : undefined,
    walletAddress,
  });
}

export function normalizeCliAction(actionName) {
  const normalized = String(actionName || '').trim().toLowerCase();
  switch (normalized) {
    case 'higher':
    case 'high':
    case 'h':
      return GuessDirection.HIGHER;
    case 'lower':
    case 'low':
    case 'l':
      return GuessDirection.LOWER;
    case 'same':
    case 'push':
    case 's':
      return GuessDirection.SAME;
    case 'cash':
    case 'cashout':
    case 'c':
      return 'cashout';
    default:
      return null;
  }
}
