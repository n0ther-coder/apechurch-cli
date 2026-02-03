/**
 * Strategy configuration and game selection for Ape Church CLI
 */
import { GAME_REGISTRY, resolveGame } from '../registry.js';
import { DEFAULT_COOLDOWN_MS } from './constants.js';
import { normalizeStrategy } from './profile.js';
import { clampRange, randomIntInclusive, chooseWeighted } from './utils.js';

/**
 * Get strategy configuration for a given strategy name
 */
export function getStrategyConfig(strategy) {
  const normalized = normalizeStrategy(strategy);
  const defaultWeights = Object.fromEntries(
    GAME_REGISTRY.map((game) => [game.key, 1])
  );
  const configs = {
    conservative: {
      minBetApe: 1,
      targetBetPct: 0.05,
      maxBetPct: 0.1,
      baseCooldownMs: 60 * 1000,
      plinko: { mode: [0, 1], balls: [80, 100] },
      slots: { spins: [10, 15] },
      roulette: { defaultBet: 'RED,BLACK' },
      baccarat: { defaultBet: 'BANKER' },
      apestrong: { range: [60, 80] },
      keno: { picks: [1, 3] },
      gameWeights: defaultWeights,
    },
    balanced: {
      minBetApe: 1,
      targetBetPct: 0.08,
      maxBetPct: 0.15,
      baseCooldownMs: 30 * 1000,
      plinko: { mode: [1, 2], balls: [50, 90] },
      slots: { spins: [7, 12] },
      roulette: { defaultBet: 'random' },
      baccarat: { defaultBet: 'random' },
      apestrong: { range: [40, 60] },
      keno: { picks: [3, 6] },
      gameWeights: defaultWeights,
    },
    aggressive: {
      minBetApe: 1,
      targetBetPct: 0.12,
      maxBetPct: 0.25,
      baseCooldownMs: 15 * 1000,
      plinko: { mode: [2, 4], balls: [20, 70] },
      slots: { spins: [3, 10] },
      roulette: { defaultBet: 'random' },
      baccarat: { defaultBet: 'random' },
      apestrong: { range: [25, 50] },
      keno: { picks: [5, 8] },
      gameWeights: defaultWeights,
    },
    degen: {
      minBetApe: 1,
      targetBetPct: 0.2,
      maxBetPct: 0.35,
      baseCooldownMs: 10 * 1000,
      plinko: { mode: [3, 4], balls: [10, 40] },
      slots: { spins: [2, 6] },
      roulette: { defaultBet: 'random' },
      baccarat: { defaultBet: 'random' },
      apestrong: { range: [5, 30] },
      keno: { picks: [8, 10] },
      gameWeights: defaultWeights,
    },
  };
  return configs[normalized];
}

/**
 * Normalize game weights with overrides
 */
function normalizeWeights(baseWeights, overrideWeights) {
  const weights = { ...baseWeights };
  if (overrideWeights && typeof overrideWeights === 'object') {
    for (const [key, value] of Object.entries(overrideWeights)) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        weights[key] = parsed;
      }
    }
  }
  return weights;
}

/**
 * Normalize a range with fallback
 */
function normalizeRange(range, fallback) {
  if (!Array.isArray(range) || range.length !== 2) return fallback;
  const min = Number(range[0]);
  const max = Number(range[1]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return fallback;
  return [Math.min(min, max), Math.max(min, max)];
}

/**
 * Apply profile overrides to strategy config
 */
export function applyProfileOverrides(strategyConfig, overrides) {
  const nextConfig = { ...strategyConfig };
  if (!overrides || typeof overrides !== 'object') return nextConfig;

  if (Number.isFinite(overrides.min_bet_ape)) {
    nextConfig.minBetApe = Math.max(Number(overrides.min_bet_ape), 0);
  }
  if (Number.isFinite(overrides.target_bet_pct)) {
    nextConfig.targetBetPct = Math.max(Number(overrides.target_bet_pct), 0);
  }
  if (Number.isFinite(overrides.max_bet_pct)) {
    nextConfig.maxBetPct = Math.max(Number(overrides.max_bet_pct), 0);
  }
  if (Number.isFinite(overrides.base_cooldown_ms)) {
    nextConfig.baseCooldownMs = Math.max(Number(overrides.base_cooldown_ms), 0);
  }

  if (overrides.game_weights) {
    nextConfig.gameWeights = normalizeWeights(nextConfig.gameWeights, overrides.game_weights);
  }

  if (overrides.plinko) {
    nextConfig.plinko = {
      ...nextConfig.plinko,
      mode: normalizeRange(overrides.plinko.mode, nextConfig.plinko.mode),
      balls: normalizeRange(overrides.plinko.balls, nextConfig.plinko.balls),
    };
  }

  if (overrides.slots) {
    nextConfig.slots = {
      ...nextConfig.slots,
      spins: normalizeRange(overrides.slots.spins, nextConfig.slots.spins),
    };
  }

  return nextConfig;
}

/**
 * Calculate wager based on available balance and strategy
 */
export function calculateWager(availableApe, strategyConfig) {
  const maxAllowed = availableApe * strategyConfig.maxBetPct;
  if (maxAllowed < strategyConfig.minBetApe) return 0;
  const target = Math.max(strategyConfig.minBetApe, availableApe * strategyConfig.targetBetPct);
  return Math.min(target, maxAllowed);
}

/**
 * Select a game and config based on strategy
 */
export function selectGameAndConfig(strategyConfig) {
  const options = GAME_REGISTRY.map((game) => ({
    value: game.key,
    weight: strategyConfig.gameWeights?.[game.key] ?? 1,
  }));
  const gameChoice = chooseWeighted(options);
  const gameEntry = resolveGame(gameChoice);
  if (!gameEntry) {
    return { game: GAME_REGISTRY[0]?.key || 'jungle-plinko' };
  }

  if (gameEntry.type === 'plinko') {
    const [modeMin, modeMax] = clampRange(
      strategyConfig.plinko.mode[0],
      strategyConfig.plinko.mode[1],
      gameEntry.config.mode.min,
      gameEntry.config.mode.max
    );
    const [ballMin, ballMax] = clampRange(
      strategyConfig.plinko.balls[0],
      strategyConfig.plinko.balls[1],
      gameEntry.config.balls.min,
      gameEntry.config.balls.max
    );
    const mode = randomIntInclusive(modeMin, modeMax);
    const balls = randomIntInclusive(ballMin, ballMax);
    return { game: gameEntry.key, mode, balls };
  }

  if (gameEntry.type === 'slots') {
    const [spinMin, spinMax] = clampRange(
      strategyConfig.slots.spins[0],
      strategyConfig.slots.spins[1],
      gameEntry.config.spins.min,
      gameEntry.config.spins.max
    );
    const spins = randomIntInclusive(spinMin, spinMax);
    return { game: gameEntry.key, spins };
  }

  if (gameEntry.type === 'roulette') {
    const rouletteConfig = strategyConfig.roulette || { defaultBet: 'random' };
    let bet = rouletteConfig.defaultBet;
    if (bet === 'random') {
      bet = Math.random() < 0.5 ? 'RED' : 'BLACK';
    }
    return { game: gameEntry.key, bet };
  }

  if (gameEntry.type === 'baccarat') {
    const baccaratConfig = strategyConfig.baccarat || { defaultBet: 'random' };
    let bet = baccaratConfig.defaultBet;
    if (bet === 'random') {
      bet = Math.random() < 0.5 ? 'PLAYER' : 'BANKER';
    }
    return { game: gameEntry.key, bet };
  }

  if (gameEntry.type === 'apestrong') {
    const apestrongConfig = strategyConfig.apestrong || { range: [40, 60] };
    const [rangeMin, rangeMax] = clampRange(
      apestrongConfig.range[0],
      apestrongConfig.range[1],
      gameEntry.config.range.min,
      gameEntry.config.range.max
    );
    const range = randomIntInclusive(rangeMin, rangeMax);
    return { game: gameEntry.key, range };
  }

  if (gameEntry.type === 'keno') {
    const kenoConfig = strategyConfig.keno || { picks: [3, 6] };
    const [picksMin, picksMax] = clampRange(
      kenoConfig.picks[0],
      kenoConfig.picks[1],
      gameEntry.config.picks.min,
      gameEntry.config.picks.max
    );
    const picks = randomIntInclusive(picksMin, picksMax);
    return { game: gameEntry.key, picks };
  }

  return { game: gameEntry.key };
}

/**
 * Compute cooldown based on strategy and win/loss streaks
 */
export function computeCooldownMs(strategyConfig, state) {
  const base = strategyConfig.baseCooldownMs || DEFAULT_COOLDOWN_MS;
  if (state.consecutiveWins >= 3) return Math.max(Math.floor(base * 0.25), 60_000);
  if (state.consecutiveWins >= 2) return Math.max(Math.floor(base * 0.5), 60_000);
  if (state.consecutiveLosses >= 3) return Math.min(Math.floor(base * 3), 2 * 60 * 60 * 1000);
  if (state.consecutiveLosses >= 2) return Math.min(Math.floor(base * 2), 2 * 60 * 60 * 1000);
  return base;
}
