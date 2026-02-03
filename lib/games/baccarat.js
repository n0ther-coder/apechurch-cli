/**
 * Baccarat game handler
 */
import { encodeAbiParameters, formatEther, parseEther } from 'viem';
import { getStaticVrfFee, executeGame, randomBytes32, randomUint256, getValidRefAddress } from './base.js';

/**
 * Parse baccarat bet config
 * Supports:
 *   "BANKER" or "PLAYER" or "TIE" - all on one
 *   "140,BANKER,10,TIE" - explicit amounts
 */
export function parseBaccaratBet(betConfig, totalWagerWei) {
  if (!betConfig || typeof betConfig !== 'string') {
    throw new Error('No bet specified for baccarat. Use: PLAYER, BANKER, TIE, or "<amount> BANKER <amount> TIE"');
  }

  const parts = betConfig.split(',').map(b => b.trim().toUpperCase()).filter(b => b.length > 0);
  
  if (parts.length === 0) {
    throw new Error('No valid bet found.');
  }

  let playerBankerBet = BigInt(0);
  let tieBet = BigInt(0);
  let isBanker = false;
  let playerBankerAmount = null;
  let tieAmount = null;

  // Simple case: just "PLAYER", "BANKER", or "TIE"
  if (parts.length === 1) {
    const bet = parts[0];
    if (bet === 'PLAYER') {
      return { playerBankerBet: totalWagerWei, tieBet: BigInt(0), isBanker: false };
    } else if (bet === 'BANKER') {
      return { playerBankerBet: totalWagerWei, tieBet: BigInt(0), isBanker: true };
    } else if (bet === 'TIE') {
      return { playerBankerBet: BigInt(0), tieBet: totalWagerWei, isBanker: false };
    } else {
      throw new Error(`Invalid bet: "${bet}". Use: PLAYER, BANKER, or TIE`);
    }
  }

  // Complex case: parse "amount BET amount BET" pattern
  let i = 0;
  while (i < parts.length) {
    const current = parts[i];
    
    // Check if it's a number (amount)
    const amount = parseFloat(current);
    if (!isNaN(amount) && amount > 0) {
      // Next part should be the bet type
      const betType = parts[i + 1];
      if (!betType) {
        throw new Error(`Expected bet type after amount ${amount}`);
      }
      
      const amountWei = parseEther(String(amount));
      
      if (betType === 'PLAYER') {
        if (playerBankerAmount !== null) {
          throw new Error('Cannot specify PLAYER amount twice');
        }
        if (isBanker) {
          throw new Error('Cannot bet on both PLAYER and BANKER');
        }
        playerBankerAmount = amountWei;
        isBanker = false;
        i += 2;
      } else if (betType === 'BANKER') {
        if (playerBankerAmount !== null) {
          throw new Error('Cannot specify BANKER amount twice');
        }
        playerBankerAmount = amountWei;
        isBanker = true;
        i += 2;
      } else if (betType === 'TIE') {
        if (tieAmount !== null) {
          throw new Error('Cannot specify TIE amount twice');
        }
        tieAmount = amountWei;
        i += 2;
      } else {
        throw new Error(`Invalid bet type: "${betType}". Use: PLAYER, BANKER, or TIE`);
      }
    } else if (current === 'PLAYER' || current === 'BANKER' || current === 'TIE') {
      throw new Error(`Missing amount before ${current}. Use: "<amount> ${current}"`);
    } else {
      throw new Error(`Invalid token: "${current}". Expected amount or bet type.`);
    }
  }

  playerBankerBet = playerBankerAmount || BigInt(0);
  tieBet = tieAmount || BigInt(0);

  // Validate total matches
  const specifiedTotal = playerBankerBet + tieBet;
  if (specifiedTotal !== totalWagerWei) {
    const specifiedApe = formatEther(specifiedTotal);
    const expectedApe = formatEther(totalWagerWei);
    throw new Error(`Bet amounts (${specifiedApe} APE) don't match total wager (${expectedApe} APE)`);
  }

  return { playerBankerBet, tieBet, isBanker };
}

/**
 * Get default baccarat bet based on strategy
 */
export function getBaccaratDefaultBet(strategy) {
  if (strategy === 'conservative') {
    return 'BANKER';
  }
  return Math.random() < 0.5 ? 'PLAYER' : 'BANKER';
}

/**
 * Play a Baccarat game
 */
export async function playBaccarat({
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

  // Parse baccarat bet
  const { playerBankerBet, tieBet, isBanker } = parseBaccaratBet(bet, wager);

  // Get VRF fee
  const vrfFee = await getStaticVrfFee(publicClient, gameEntry.contract);

  // Encode game data
  const encodedData = encodeAbiParameters(
    [
      { name: 'gameId', type: 'uint256' },
      { name: 'playerBankerBet', type: 'uint256' },
      { name: 'tieBet', type: 'uint256' },
      { name: 'isBanker', type: 'bool' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [gameId, playerBankerBet, tieBet, isBanker, refAddress, userRandomWord]
  );

  // Build config for output
  const betType = isBanker ? 'BANKER' : (playerBankerBet > 0n ? 'PLAYER' : '');
  const hasTie = tieBet > 0n;
  const config = {
    bet,
    betType: hasTie && betType ? `${betType},TIE` : (hasTie ? 'TIE' : betType),
    playerBankerBet: formatEther(playerBankerBet),
    tieBet: formatEther(tieBet),
    isBanker,
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
 * Get baccarat config from options/strategy
 */
export function getBaccaratConfig(opts, positionalConfig, strategyConfig) {
  if (opts.bet) {
    return { bet: opts.bet };
  } else if (positionalConfig.bet) {
    return { bet: positionalConfig.bet };
  } else {
    const baccaratConfig = strategyConfig.baccarat || { defaultBet: 'random' };
    const bet = baccaratConfig.defaultBet === 'random'
      ? (Math.random() < 0.5 ? 'PLAYER' : 'BANKER')
      : baccaratConfig.defaultBet;
    return { bet };
  }
}
