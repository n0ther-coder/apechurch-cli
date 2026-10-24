import { formatEther, parseAbi, parseEther } from 'viem';
import { normalizeWagerAmount, sanitizeError } from './utils.js';

export const SPLIT_GAME_TYPES = Object.freeze(['blocks', 'plinko', 'primes', 'speedkeno', 'slots']);

export function validateSpinUsage(gameEntry, options = {}, positionalConfig = {}) {
  if (options.spin === undefined) return;
  if (!gameEntry || !SPLIT_GAME_TYPES.includes(gameEntry.type)) {
    throw new Error('--spin requires an explicitly selected split game (Blocks, Plinko, Primes, Speed Keno, or slots).');
  }
  if (['split', 'survive', 'balls', 'games', 'runs', 'rolls'].some(key => options[key] !== undefined)
    || ['balls', 'games', 'spins', 'runs', 'rolls', 'split', 'survive'].some(key => positionalConfig[key] !== undefined)) {
    throw new Error('--spin cannot be combined with --split, --survive, or an explicit attempt count.');
  }
  const spinWei = parseSpinAmount(options.spin);
  const minimum = parseEther(String(gameEntry.config.minBetPerSpinApe ?? '0'));
  const maximum = gameEntry.config.maxBetPerSpinApe;
  if (spinWei < minimum || (maximum !== undefined && spinWei > parseEther(String(maximum)))) {
    throw new Error(`${gameEntry.name}: --spin is outside the allowed bet size (minimum ${formatEther(minimum)} APE${maximum === undefined ? '' : `, maximum ${maximum} APE`}).`);
  }
}

function parseSpinAmount(spin) {
  try {
    return parseEther(normalizeWagerAmount(spin));
  } catch {
    throw new Error('--spin must be a positive decimal APE amount with at most 18 decimals.');
  }
}

function countConfig(gameEntry) {
  const field = { blocks: 'split', plinko: 'balls', primes: 'runs', speedkeno: 'games', slots: 'spins' }[gameEntry.type];
  return gameEntry.config[field];
}

// All arithmetic stays in wei: neither the remainder nor display rounding is wagered.
export function resolveSpinWager(gameEntry, amountApe, spin, { maxSplit } = {}) {
  validateSpinUsage(gameEntry, { spin });
  if (amountApe === undefined) throw new Error('--spin needs a wager budget to calculate the attempt count.');
  const budgetWei = parseEther(normalizeWagerAmount(amountApe));
  const spinWei = parseSpinAmount(spin);
  const limits = countConfig(gameEntry);
  let count = budgetWei / spinWei;
  const cap = BigInt(Math.min(limits.max, maxSplit ?? limits.max));
  if (count > cap) count = cap;
  if (count < BigInt(limits.min)) {
    throw new Error(`--spin produces ${count} attempts; ${gameEntry.name} requires at least ${limits.min}. Increase the bet budget or reduce --spin.`);
  }
  const wagerWei = count * spinWei;
  return {
    split: Number(count),
    spin: formatEther(spinWei),
    amount: formatEther(wagerWei),
    unspent: formatEther(budgetWei - wagerWei),
  };
}

export async function resolveLiveSpinWager(publicClient, gameEntry, amountApe, spin) {
  // Validate locally before making a read, including the zero-attempt case.
  resolveSpinWager(gameEntry, amountApe, spin);
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
    throw new Error(`Cannot verify --spin contract limits: ${sanitizeError(error)}`);
  }
  return resolveSpinWager(gameEntry, amountApe, spin, { maxSplit: Number(maximum) });
}

export function applySpinConfig(config, plan) {
  config.split = plan.split;
  if (config.survive !== undefined || config.compounding !== undefined) config.compounding = false;
  delete config.survive;
  return config;
}
