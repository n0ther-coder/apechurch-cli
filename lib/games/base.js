/**
 * Base game utilities - shared logic for all game types
 */
import { formatEther } from 'viem';
import { GAME_CONTRACT_ABI, PLINKO_VRF_ABI, SLOTS_VRF_ABI } from '../constants.js';
import { sanitizeError, randomBytes32, randomUint256, getValidRefAddress, formatApeAmount } from '../utils.js';
import { saveGameToHistory } from '../profile.js';

/**
 * Get VRF fee from contract (static - no args)
 */
export async function getStaticVrfFee(publicClient, contractAddress) {
  try {
    return await publicClient.readContract({
      address: contractAddress,
      abi: SLOTS_VRF_ABI,
      functionName: 'getVRFFee',
    });
  } catch (error) {
    throw new Error(`Failed to read VRF fee: ${sanitizeError(error)}`);
  }
}

/**
 * Get VRF fee from contract (plinko-style with gas limit)
 */
export async function getPlinkoVrfFee(publicClient, contractAddress, customGasLimit) {
  try {
    return await publicClient.readContract({
      address: contractAddress,
      abi: PLINKO_VRF_ABI,
      functionName: 'getVRFFee',
      args: [customGasLimit],
    });
  } catch (error) {
    throw new Error(`Failed to read VRF fee: ${sanitizeError(error)}`);
  }
}

/**
 * Watch for GameEnded event
 */
export function watchGameEnded({ publicClient, contractAddress, account, gameId, timeoutMs, onResult }) {
  let resolved = false;
  
  const unwatch = publicClient.watchContractEvent({
    address: contractAddress,
    abi: GAME_CONTRACT_ABI,
    eventName: 'GameEnded',
    args: { user: account.address },
    onLogs: (logs) => {
      for (const log of logs) {
        // Compare as strings to handle BigInt comparison
        if (log?.args?.gameId?.toString() === gameId?.toString() && !resolved) {
          resolved = true;
          onResult(log.args);
          break;
        }
      }
    },
    onError: (error) => {
      if (!resolved) {
        resolved = true;
        onResult(null, error);
      }
    },
  });

  // Set up timeout if specified
  let timeoutId = null;
  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        onResult(null);
      }
    }, timeoutMs);
  }

  return { unwatch, timeoutId };
}

/**
 * Send game transaction and wait for result
 */
export async function executeGame({
  account,
  publicClient,
  walletClient,
  contractAddress,
  encodedData,
  wager,
  vrfFee,
  gameId,
  gameEntry,
  config,
  timeoutMs,
}) {
  const totalValue = wager + vrfFee;
  const gameUrl = `https://www.ape.church/games/${gameEntry.slug}?id=${gameId.toString()}`;

  // Set up event watching
  let resolveEvent;
  let rejectEvent;
  const eventPromise = new Promise((resolve, reject) => {
    resolveEvent = resolve;
    rejectEvent = reject;
  });

  const { unwatch, timeoutId } = watchGameEnded({
    publicClient,
    contractAddress,
    account,
    gameId,
    timeoutMs: timeoutMs > 0 ? timeoutMs : 0,
    onResult: (result, error) => {
      if (error) rejectEvent(error);
      else resolveEvent(result);
    },
  });

  // Send transaction
  let txHash;
  try {
    txHash = await walletClient.writeContract({
      address: contractAddress,
      abi: GAME_CONTRACT_ABI,
      functionName: 'play',
      args: [account.address, encodedData],
      value: totalValue,
    });
  } catch (error) {
    unwatch();
    if (timeoutId) clearTimeout(timeoutId);
    throw new Error(`Transaction failed: ${sanitizeError(error)}`);
  }

  // Save to history
  saveGameToHistory({
    contract: contractAddress,
    gameId: gameId.toString(),
    timestamp: Date.now(),
  });

  // Build initial response
  const response = {
    status: 'pending',
    action: 'bet',
    game: gameEntry.key,
    contract: contractAddress,
    tx: txHash,
    gameId: gameId.toString(),
    game_url: gameUrl,
    config,
    wager_wei: wager.toString(),
    wager_ape: formatEther(wager),
    vrf_fee_wei: vrfFee.toString(),
    vrf_fee_ape: formatEther(vrfFee),
    total_value_wei: totalValue.toString(),
    total_value_ape: formatEther(totalValue),
    result: null,
  };

  // Wait for result if timeout allows (0 = don't wait)
  if (timeoutMs === 0) {
    // Don't wait, return pending
    unwatch();
    if (timeoutId) clearTimeout(timeoutId);
    return response;
  }

  // Poll for result (more reliable than event watching)
  const pollInterval = 1000; // 1 second
  const maxAttempts = Math.ceil(timeoutMs / pollInterval);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, pollInterval));
    
    try {
      const [, buyIns, payouts, , hasEndeds] = await publicClient.readContract({
        address: contractAddress,
        abi: GAME_CONTRACT_ABI,
        functionName: 'getEssentialGameInfo',
        args: [[gameId]],
      });
      
      if (hasEndeds[0]) {
        response.status = 'complete';
        response.result = {
          buy_in_wei: buyIns[0].toString(),
          buy_in_ape: formatEther(buyIns[0]),
          payout_wei: payouts[0].toString(),
          payout_ape: formatEther(payouts[0]),
        };
        break;
      }
    } catch {
      // Polling failed, continue trying
    }
  }
  
  unwatch();
  if (timeoutId) clearTimeout(timeoutId);

  return response;
}

// Re-export commonly used utilities for game handlers
export { randomBytes32, randomUint256, getValidRefAddress, formatApeAmount, sanitizeError };
