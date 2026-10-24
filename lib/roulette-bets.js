/** Pure Roulette parsing, allocation, and payout helpers shared by play and analytics. */
import { formatEther, parseEther } from 'viem';
import { ROULETTE_POCKETS, getRouletteBetPayoutUnits, isRouletteWinningPocket } from './payout-tables.js';

const UINT256_MAX = (1n << 256n) - 1n;

export function parseRouletteBetEntries(betString, gameEntry) {
  if (typeof betString !== 'string' || !betString.trim()) {
    throw new Error('No bet specified for roulette. Use: RED, BLACK, 0, 00, 1-36, etc.');
  }
  const segments = betString.split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
  if (!segments.length) throw new Error('No valid bets found for roulette.');
  const seen = new Set();
  return segments.map(segment => {
    const parts = segment.split(':').map(value => value.trim());
    const [bet, count] = parts;
    if (parts.length > 2 || (count !== undefined && (!/^\d+$/.test(count) || BigInt(count) <= 0n))) {
      throw new Error(`Invalid Roulette chip count: "${segment}". Use BET:CHIPS with a positive integer count.`);
    }
    const gameNumber = gameEntry.betTypes?.[bet]
      ?? (/^(?:[1-9]|[12]\d|3[0-6])$/.test(bet) ? Number(bet) + 1 : undefined);
    if (gameNumber === undefined) {
      throw new Error(`Invalid bet: "${bet}". Use 0, 00, 1-36, RED, BLACK, ODD, EVEN, halves, thirds, or columns.`);
    }
    if (seen.has(gameNumber)) throw new Error(`Duplicate Roulette bet: ${bet}. Combine its chips in one entry.`);
    seen.add(gameNumber);
    return { bet, gameNumber, chips: count === undefined ? null : BigInt(count).toString() };
  });
}

export function parseRouletteBets(betString, gameEntry) {
  return parseRouletteBetEntries(betString, gameEntry).map(entry => entry.gameNumber);
}

/** Legacy allocation retains equal splitting and the single-leg 1-wei adjustment. */
export function calculateRouletteBetAmounts(totalWagerWei, gameNumbers) {
  if (totalWagerWei <= 0n || !gameNumbers.length) throw new Error('Roulette requires a positive wager and at least one bet.');
  const amountPerBet = totalWagerWei / BigInt(gameNumbers.length);
  if (amountPerBet === 0n) throw new Error('Wager too small to split across all bets.');
  const amounts = gameNumbers.map(() => amountPerBet);
  if (amounts.length === 1) {
    amounts[0] -= 1n;
    if (amounts[0] <= 0n) throw new Error('Wager too small (need more than 1 wei for single bet).');
  }
  return amounts;
}

function validateAmounts(wagerWei, gameNumbers, amounts) {
  if (wagerWei <= 0n || wagerWei > UINT256_MAX) throw new Error('Roulette wager must be a positive uint256 amount.');
  if (!gameNumbers.length || amounts.length !== gameNumbers.length) throw new Error('Roulette bet and amount arrays must have matching, nonzero lengths.');
  if (new Set(gameNumbers).size !== gameNumbers.length || gameNumbers.some(code => !Number.isInteger(code) || code < 1 || code > 50)) {
    throw new Error('Roulette bets must use distinct valid on-chain codes.');
  }
  if (amounts.some(amount => amount <= 0n || amount >= wagerWei)) {
    throw new Error('Each Roulette bet must be positive and strictly less than the total wager. Increase the total or reduce the chip allocation.');
  }
  const allocatedWei = amounts.reduce((sum, amount) => sum + amount, 0n);
  if (allocatedWei > wagerWei) throw new Error('Roulette chip allocation exceeds the total wager.');
  return { allocatedWei, unallocatedWei: wagerWei - allocatedWei };
}

export function resolveRouletteWager({ wagerWei, bet, chips, gameEntry }) {
  const entries = parseRouletteBetEntries(bet, gameEntry);
  const gameNumbers = entries.map(entry => entry.gameNumber);
  if (wagerWei <= 0n || wagerWei > UINT256_MAX) throw new Error('Roulette wager must be a positive uint256 amount.');
  const chipCounts = entries.map(entry => entry.chips ?? '1');
  const allocatedChips = chipCounts.reduce((sum, count) => sum + BigInt(count), 0n);
  const text = chips === undefined ? allocatedChips.toString() : String(chips).trim();
  if (!/^\d+$/.test(text) || BigInt(text) <= 0n || BigInt(text) > UINT256_MAX) {
    throw new Error('--chips must be a positive integer within uint256 range.');
  }
  const purchasedChips = BigInt(text);
  if (purchasedChips < allocatedChips) {
    throw new Error(`--chips (${purchasedChips}) is less than the sum of chips in --bet (${allocatedChips}). No transaction was submitted.`);
  }
  const warnings = purchasedChips > allocatedChips
    ? [`--chips (${purchasedChips}) exceeds the sum of chips in --bet (${allocatedChips}); proceeding with ${purchasedChips - allocatedChips} unallocated chip(s). Their value remains part of the wager and stays at risk.`]
    : [];
  const chipWei = wagerWei / purchasedChips;
  if (chipWei === 0n) throw new Error('Wager too small: each purchased chip must be worth at least 1 wei.');
  const amounts = chipCounts.map(count => BigInt(count) * chipWei);
  // The contract requires every component to be strictly below the total.
  // Preserve the existing single-bet adjustment when all chips cover one bet.
  if (amounts.length === 1 && amounts[0] === wagerWei) amounts[0] -= 1n;
  const allocation = validateAmounts(wagerWei, gameNumbers, amounts);
  const chipMode = chips !== undefined || entries.some(entry => entry.chips !== null);
  return {
    wagerWei, gameNumbers, amounts, ...allocation,
    bet: entries.map((entry, index) => `${entry.bet}${chipMode ? `:${chipCounts[index]}` : ''}`).join(','),
    chips: purchasedChips.toString(), allocatedChips: allocatedChips.toString(),
    chipValue: formatEther(chipWei), chipCounts, warnings,
  };
}

export function serializeRouletteWager(wager) {
  return {
    bet: wager.bet,
    gameNumbers: wager.gameNumbers,
    numBets: wager.gameNumbers.length,
    wagerAmountApe: formatEther(wager.wagerWei),
    betAmountsWei: wager.amounts.map(amount => amount.toString()),
    allocatedAmountApe: formatEther(wager.allocatedWei),
    unallocatedAmountApe: formatEther(wager.unallocatedWei),
    chips: wager.chips,
    allocatedChips: wager.allocatedChips,
    chipValue: wager.chipValue,
    chipCounts: wager.chipCounts,
    ...(wager.warnings.length ? { warnings: wager.warnings } : {}),
  };
}

/** Recover exact allocations from either play parameters or saved contract amounts. */
export function resolveRouletteConfigWager(config, gameEntry) {
  const amount = config?.wagerAmountApe ?? config?.amount;
  if (amount === undefined || amount === null) return null;
  const wagerWei = parseEther(String(amount));
  if (Array.isArray(config.betAmountsWei) && Array.isArray(config.gameNumbers)) {
    const gameNumbers = config.gameNumbers.map(Number);
    const amounts = config.betAmountsWei.map(value => BigInt(value));
    return { wagerWei, gameNumbers, amounts, ...validateAmounts(wagerWei, gameNumbers, amounts) };
  }
  return resolveRouletteWager({ wagerWei, bet: config.bet, chips: config.chips, gameEntry });
}

export function getRouletteOutcomePayouts(gameNumbers, amounts) {
  return ROULETTE_POCKETS.map(pocket => ({
    pocket,
    payoutWei: gameNumbers.reduce((sum, code, index) => sum + (isRouletteWinningPocket(code, pocket)
      ? (amounts[index] * BigInt(getRouletteBetPayoutUnits(code))) / 1000n : 0n), 0n),
  }));
}
