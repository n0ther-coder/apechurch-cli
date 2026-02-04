/**
 * Monkey Match game handler
 * 5 barrels pop out monkeys - form poker-style hands for payouts.
 * 
 * Game Modes:
 *   1 (Low Risk):   6 monkey types - easier to match, lower payouts
 *   2 (Normal Risk): 7 monkey types - harder to match, better mid-tier payouts
 * 
 * Best hand: Five of a Kind = 50x
 */
import { encodeAbiParameters } from 'viem';
import { getStaticVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';

/**
 * Play Monkey Match
 */
export async function playMonkeyMatch({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  mode,
  referral,
  timeoutMs,
}) {
  const refAddress = getValidRefAddress(referral);
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  // Validate mode (1=Low Risk, 2=Normal Risk), default to 1
  let gameMode = mode ?? gameEntry.config.mode.default;
  if (gameMode < 1) gameMode = 1;
  if (gameMode > 2) gameMode = 2;

  // Get static VRF fee (same as slots)
  const vrfFee = await getStaticVrfFee(publicClient, gameEntry.contract);

  // Encode game data: (uint8 gameMode, uint256 gameId, address ref, bytes32 userRandomWord)
  const encodedData = encodeAbiParameters(
    [
      { name: 'gameMode', type: 'uint8' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [gameMode, gameId, refAddress, userRandomWord]
  );

  const modeNames = { 1: 'Low Risk', 2: 'Normal Risk' };
  const config = {
    mode: gameMode,
    modeName: modeNames[gameMode] || 'Low Risk',
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
 * Get monkey match config from options/strategy
 */
export function getMonkeyMatchConfig(opts, positionalConfig, strategyConfig, randomIntInclusive) {
  const config = {};

  // Determine mode (1=Low Risk, 2=Normal Risk)
  if (opts.mode !== undefined) {
    config.mode = parseInt(opts.mode);
  } else if (positionalConfig.mode !== undefined) {
    config.mode = positionalConfig.mode;
  } else {
    // Default to Low Risk (1) for auto-play, occasionally Normal (2)
    // 70% Low Risk, 30% Normal Risk
    config.mode = Math.random() < 0.7 ? 1 : 2;
  }

  // Clamp to valid range
  if (config.mode < 1) config.mode = 1;
  if (config.mode > 2) config.mode = 2;

  return config;
}
