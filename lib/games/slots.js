/**
 * Slots game handler (Dino Dough, Bubblegum Heist)
 */
import { encodeAbiParameters } from 'viem';
import { ensureIntRange } from '../utils.js';
import { getStaticVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';

/**
 * Play a Slots game
 */
export async function playSlots({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  spins,
  referral,
  timeoutMs,
}) {
  const refAddress = getValidRefAddress(referral);
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  // Validate spins
  const spinsValue = ensureIntRange(
    spins ?? gameEntry.config.spins.default,
    'spins',
    gameEntry.config.spins.min,
    gameEntry.config.spins.max
  );

  // Get VRF fee
  const vrfFee = await getStaticVrfFee(publicClient, gameEntry.contract);

  // Encode game data
  const encodedData = encodeAbiParameters(
    [
      { name: 'gameId', type: 'uint256' },
      { name: 'numSpins', type: 'uint8' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [gameId, spinsValue, refAddress, userRandomWord]
  );

  const config = { spins: spinsValue };

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
 * Get slots config from options/strategy
 */
export function getSlotsConfig(opts, positionalConfig, strategyConfig, randomIntInclusive) {
  if (opts.spins !== undefined) {
    return { spins: parseInt(opts.spins) };
  } else if (positionalConfig.spins !== undefined) {
    return { spins: positionalConfig.spins };
  } else {
    const [spinMin, spinMax] = strategyConfig.slots?.spins || [1, 15];
    return { spins: randomIntInclusive(spinMin, spinMax) };
  }
}
