/**
 * ApeStrong game handler (pick your odds dice)
 */
import { encodeAbiParameters } from 'viem';
import { ensureIntRange } from '../utils.js';
import { getStaticVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';

/**
 * Play an ApeStrong game
 */
export async function playApestrong({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  range,
  referral,
  timeoutMs,
}) {
  const refAddress = getValidRefAddress(referral);
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  // Validate range
  const rangeValue = ensureIntRange(
    range ?? gameEntry.config.range.default,
    'range',
    gameEntry.config.range.min,
    gameEntry.config.range.max
  );

  // Get VRF fee
  const vrfFee = await getStaticVrfFee(publicClient, gameEntry.contract);

  // Encode game data: (uint8 edgeFlipRange, uint256 gameId, address ref, bytes32 userRandomWord)
  const encodedData = encodeAbiParameters(
    [
      { name: 'edgeFlipRange', type: 'uint8' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [rangeValue, gameId, refAddress, userRandomWord]
  );

  // Calculate approximate payout multiplier: ~97.5 / range
  const approxPayout = (97.5 / rangeValue).toFixed(2);
  const config = {
    range: rangeValue,
    winChance: `${rangeValue}%`,
    approxPayout: `${approxPayout}x`,
  };

  return executeGame({
    account,
    publicClient,
    walletClient,
    contractAddress: gameEntry.contract,
    encodedData,
    wager,
    vrfFee,
    gameId,
    gameEntry,
    config,
    timeoutMs,
  });
}

/**
 * Get apestrong config from options/strategy
 */
export function getApestrongConfig(opts, positionalConfig, strategyConfig, randomIntInclusive) {
  if (opts.range !== undefined) {
    return { range: parseInt(opts.range) };
  } else if (positionalConfig.range !== undefined) {
    return { range: positionalConfig.range };
  } else {
    const [rangeMin, rangeMax] = strategyConfig.apestrong?.range || [40, 60];
    return { range: randomIntInclusive(rangeMin, rangeMax) };
  }
}
