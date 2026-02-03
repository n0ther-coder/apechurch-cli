/**
 * Plinko game handler
 */
import { encodeAbiParameters } from 'viem';
import { ensureIntRange } from '../utils.js';
import { getPlinkoVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';

/**
 * Play a Plinko game
 */
export async function playPlinko({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  mode,
  balls,
  referral,
  timeoutMs,
}) {
  const refAddress = getValidRefAddress(referral);
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  // Validate and get config values
  const modeValue = ensureIntRange(
    mode ?? gameEntry.config.mode.default,
    'mode',
    gameEntry.config.mode.min,
    gameEntry.config.mode.max
  );
  const ballsValue = ensureIntRange(
    balls ?? gameEntry.config.balls.default,
    'balls',
    gameEntry.config.balls.min,
    gameEntry.config.balls.max
  );

  // Calculate VRF fee with custom gas limit
  const customGasLimit = gameEntry.vrf.baseGas + (ballsValue * gameEntry.vrf.perUnitGas);
  const vrfFee = await getPlinkoVrfFee(publicClient, gameEntry.contract, customGasLimit);

  // Encode game data
  const encodedData = encodeAbiParameters(
    [
      { name: 'gameMode', type: 'uint8' },
      { name: 'numBalls', type: 'uint8' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [modeValue, ballsValue, gameId, refAddress, userRandomWord]
  );

  const config = { mode: modeValue, balls: ballsValue };

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
 * Get plinko config from options/strategy
 */
export function getPlinkoConfig(opts, positionalConfig, gameEntry, strategyConfig, randomIntInclusive) {
  const config = {};
  
  if (opts.mode !== undefined) {
    config.mode = parseInt(opts.mode);
  } else if (positionalConfig.mode !== undefined) {
    config.mode = positionalConfig.mode;
  } else {
    const [modeMin, modeMax] = strategyConfig.plinko?.mode || [0, 4];
    config.mode = randomIntInclusive(modeMin, modeMax);
  }

  if (opts.balls !== undefined) {
    config.balls = parseInt(opts.balls);
  } else if (positionalConfig.balls !== undefined) {
    config.balls = positionalConfig.balls;
  } else {
    const [ballMin, ballMax] = strategyConfig.plinko?.balls || [10, 100];
    config.balls = randomIntInclusive(ballMin, ballMax);
  }

  return config;
}
