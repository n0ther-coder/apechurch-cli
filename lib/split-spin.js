import { formatEther, parseAbi, parseEther } from 'viem';
import { normalizeWagerAmount, sanitizeError } from './utils.js';

export const SPLIT_GAME_TYPES = Object.freeze(['blocks', 'plinko', 'primes', 'speedkeno', 'slots']);
export const SPIN_ALIAS_GAME_TYPES = Object.freeze(['blocks', 'plinko', 'slots']);
export const LOOP_BET_SPLIT_GAME_TYPES = Object.freeze(['roulette', 'baccarat', 'apestrong', 'keno', 'beardice', 'monkeymatch', 'gimbozsmash', 'speedcrash']);

export function getBetSplitValue(options = {}) {
  return options.betSplit ?? options.spin;
}

export function getBetSplitOptionName(options = {}) {
  return options.betSplit !== undefined ? '--bet-split' : '--spin';
}

export function isLoopBetSplit(gameEntry, options = {}) {
  return (options.betSplit !== undefined && LOOP_BET_SPLIT_GAME_TYPES.includes(gameEntry?.type))
    || (getBetSplitValue(options) !== undefined && gameEntry?.type === 'blocks' && options.survive !== undefined);
}

export function validateSpinUsage(gameEntry, options = {}, positionalConfig = {}) {
  const value = getBetSplitValue(options);
  if (value === undefined) return;
  const optionName = getBetSplitOptionName(options);
  if (options.spin !== undefined && options.betSplit !== undefined) {
    throw new Error('Use only one of --spin and --bet-split.');
  }
  if (options.spin !== undefined && !SPIN_ALIAS_GAME_TYPES.includes(gameEntry?.type)) {
    throw new Error('--spin is only for slots, Plinko, and Blocks. Use --bet-split for other supported games.');
  }
  if (options.bonus) throw new Error(`${optionName} cannot be combined with --bonus.`);
  if (isLoopBetSplit(gameEntry, options)) {
    if (!options.loop) throw new Error(`${optionName} requires --loop for independent whole games, including survival games.`);
    if (options.betStrategy && options.betStrategy !== 'flat') {
      throw new Error('--bet-split fixes the wager per game and cannot be combined with a dynamic --bet-strategy.');
    }
    const wagerWei = parseSpinAmount(value, optionName);
    if (options.minBet !== undefined && wagerWei < parseSpinAmount(options.minBet, '--min-bet')) {
      throw new Error('--bet-split is below --min-bet; the exact wager cannot be increased.');
    }
    if (options.maxBet !== undefined && wagerWei > parseSpinAmount(options.maxBet, '--max-bet')) {
      throw new Error('--bet-split exceeds --max-bet; the exact wager cannot be reduced.');
    }
    return;
  }
  if (!gameEntry || !SPLIT_GAME_TYPES.includes(gameEntry.type)) {
    throw new Error(`${optionName} requires an explicitly selected supported stateless game.`);
  }
  if (['split', 'survive', 'balls', 'games', 'runs', 'rolls'].some(key => options[key] !== undefined)
    || ['balls', 'games', 'spins', 'runs', 'rolls', 'split', 'survive'].some(key => positionalConfig[key] !== undefined)) {
    throw new Error(`${optionName} cannot be combined with --split, --survive, or an explicit attempt count.`);
  }
  validateNativeBetSplit(gameEntry, value, optionName);
}

function validateNativeBetSplit(gameEntry, value, optionName) {
  if (!SPLIT_GAME_TYPES.includes(gameEntry?.type)) throw new Error(`${optionName} requires a native split game.`);
  const spinWei = parseSpinAmount(value, optionName);
  const minimum = parseEther(String(gameEntry.config.minBetPerSpinApe ?? '0'));
  const maximum = gameEntry.config.maxBetPerSpinApe;
  if (spinWei < minimum || (maximum !== undefined && spinWei > parseEther(String(maximum)))) {
    throw new Error(`${gameEntry.name}: ${optionName} is outside the allowed bet size (minimum ${formatEther(minimum)} APE${maximum === undefined ? '' : `, maximum ${maximum} APE`}).`);
  }
}

function parseSpinAmount(spin, optionName = '--spin') {
  try {
    return parseEther(normalizeWagerAmount(spin));
  } catch {
    throw new Error(`${optionName} must be a positive decimal APE amount with at most 18 decimals.`);
  }
}

function countConfig(gameEntry) {
  const field = { blocks: 'split', plinko: 'balls', primes: 'runs', speedkeno: 'games', slots: 'spins' }[gameEntry.type];
  return gameEntry.config[field];
}

// All arithmetic stays in wei: neither the remainder nor display rounding is wagered.
export function resolveSpinWager(gameEntry, amountApe, spin, { maxSplit, optionName = '--spin' } = {}) {
  validateNativeBetSplit(gameEntry, spin, optionName);
  if (amountApe === undefined) throw new Error(`${optionName} needs a wager budget to calculate the attempt count.`);
  const budgetWei = parseEther(normalizeWagerAmount(amountApe));
  const spinWei = parseSpinAmount(spin, optionName);
  const limits = countConfig(gameEntry);
  let count = budgetWei / spinWei;
  const cap = BigInt(Math.min(limits.max, maxSplit ?? limits.max));
  if (count > cap) count = cap;
  if (count < BigInt(limits.min)) {
    throw new Error(`${optionName} produces ${count} attempts; ${gameEntry.name} requires at least ${limits.min}. Increase the bet budget or reduce ${optionName}.`);
  }
  const wagerWei = count * spinWei;
  return {
    split: Number(count),
    spin: formatEther(spinWei),
    amount: formatEther(wagerWei),
    unspent: formatEther(budgetWei - wagerWei),
  };
}

export async function resolveLiveSpinWager(publicClient, gameEntry, amountApe, spin, { optionName = '--spin' } = {}) {
  // Validate locally before making a read, including the zero-attempt case.
  resolveSpinWager(gameEntry, amountApe, spin, { optionName });
  const getter = { plinko: 'maxBalls', slots: 'MAX_SPINS', speedkeno: 'MAX_GAMES', blocks: 'MAX_RUNS', primes: 'MAX_RUNS' }[gameEntry.type];
  let maximum;
  try {
    maximum = BigInt(await publicClient.readContract({
      address: gameEntry.contract,
      abi: parseAbi([`function ${getter}() view returns (uint256)`]),
      functionName: getter,
    }));
    if (maximum < 0n || maximum > 255n) throw new Error('Invalid contract attempt limit.');
  } catch (error) {
    throw new Error(`Cannot verify ${optionName} contract limits: ${sanitizeError(error)}`);
  }
  return resolveSpinWager(gameEntry, amountApe, spin, { maxSplit: Number(maximum), optionName });
}

// A session budget counts initial wagers, independently of payouts and survival steps.
export function resolveLoopBetSplit(gameEntry, amountApe, options = {}) {
  validateSpinUsage(gameEntry, options);
  if (!isLoopBetSplit(gameEntry, options)) throw new Error('--bet-split requires a supported single-game loop.');
  if (amountApe === undefined) throw new Error('--bet-split requires an explicit total wager budget.');
  const budgetWei = parseEther(normalizeWagerAmount(amountApe));
  const wagerWei = parseSpinAmount(getBetSplitValue(options), getBetSplitOptionName(options));
  const count = budgetWei / wagerWei;
  if (count === 0n) throw new Error('--bet-split produces 0 games; increase the budget or reduce --bet-split.');
  return { budgetWei, wagerWei, count, amount: formatEther(wagerWei), unspent: formatEther(budgetWei % wagerWei) };
}

export function applySpinConfig(config, plan) {
  config.split = plan.split;
  if (config.survive !== undefined || config.compounding !== undefined) config.compounding = false;
  delete config.survive;
  return config;
}
