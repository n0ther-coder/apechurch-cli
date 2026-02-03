/**
 * Roulette game handler
 */
import { encodeAbiParameters } from 'viem';
import { getStaticVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';

/**
 * Parse roulette bet string into on-chain game numbers
 */
export function parseRouletteBets(betString, gameEntry) {
  if (!betString || typeof betString !== 'string') {
    throw new Error('No bet specified for roulette. Use: RED, BLACK, 0, 00, 1-36, etc.');
  }

  const betTypes = gameEntry.betTypes || {};
  const bets = betString.split(',').map(b => b.trim().toUpperCase()).filter(b => b.length > 0);
  
  if (bets.length === 0) {
    throw new Error('No valid bets found. Use: RED, BLACK, 0, 00, 1-36, etc.');
  }

  const gameNumbers = [];
  
  for (const bet of bets) {
    // Check if it's a named bet type (RED, BLACK, etc.)
    if (betTypes[bet] !== undefined) {
      gameNumbers.push(betTypes[bet]);
      continue;
    }
    
    // Check if it's a number 1-36
    const num = parseInt(bet, 10);
    if (!isNaN(num) && num >= 1 && num <= 36) {
      // Numbers 1-36 map to on-chain values 2-37 (offset by +1)
      gameNumbers.push(num + 1);
      continue;
    }
    
    throw new Error(`Invalid bet: "${bet}". Valid bets: 0, 00, 1-36, RED, BLACK, ODD, EVEN, FIRST_THIRD, SECOND_THIRD, THIRD_THIRD, FIRST_HALF, SECOND_HALF, FIRST_COL, SECOND_COL, THIRD_COL`);
  }
  
  return gameNumbers;
}

/**
 * Calculate bet amounts from total wager (handles 1-wei bug)
 */
export function calculateRouletteBetAmounts(totalWagerWei, gameNumbers) {
  const numBets = BigInt(gameNumbers.length);
  const amountPerBet = totalWagerWei / numBets;
  
  if (amountPerBet === BigInt(0)) {
    throw new Error('Wager too small to split across all bets.');
  }
  
  const amounts = [];
  for (let i = 0; i < gameNumbers.length; i++) {
    amounts.push(amountPerBet);
  }
  
  // Handle 1-wei bug: if single bet, subtract 1 wei
  if (gameNumbers.length === 1) {
    amounts[0] = amounts[0] - BigInt(1);
    if (amounts[0] <= BigInt(0)) {
      throw new Error('Wager too small (need more than 1 wei for single bet).');
    }
  }
  
  return amounts;
}

/**
 * Get default roulette bet based on strategy
 */
export function getRouletteDefaultBet(strategy) {
  if (strategy === 'conservative') {
    return 'RED,BLACK';
  }
  return Math.random() < 0.5 ? 'RED' : 'BLACK';
}

/**
 * Play a Roulette game
 */
export async function playRoulette({
  account,
  publicClient,
  walletClient,
  gameEntry,
  wager,
  bet,
  referral,
  timeoutMs,
}) {
  const refAddress = getValidRefAddress(referral);
  const gameId = randomUint256();
  const userRandomWord = randomBytes32();

  // Parse bet string into on-chain game numbers
  const gameNumbers = parseRouletteBets(bet, gameEntry);

  // Get VRF fee
  const vrfFee = await getStaticVrfFee(publicClient, gameEntry.contract);

  // Calculate bet amounts
  const betAmounts = calculateRouletteBetAmounts(wager, gameNumbers);

  // Encode game data
  const encodedData = encodeAbiParameters(
    [
      { name: 'gameNumbers', type: 'uint8[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [gameNumbers, betAmounts, gameId, refAddress, userRandomWord]
  );

  const config = { bet, gameNumbers, numBets: gameNumbers.length };

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
 * Get roulette config from options/strategy
 */
export function getRouletteConfig(opts, positionalConfig, strategyConfig) {
  if (opts.bet) {
    return { bet: opts.bet };
  } else if (positionalConfig.bet) {
    return { bet: positionalConfig.bet };
  } else {
    const rouletteConfig = strategyConfig.roulette || { defaultBet: 'random' };
    const bet = rouletteConfig.defaultBet === 'random' 
      ? (Math.random() < 0.5 ? 'RED' : 'BLACK')
      : rouletteConfig.defaultBet;
    return { bet };
  }
}
