/**
 * Resolve and format the paytable for `game <name> --paytable`.
 *
 * Multipliers are serialized as decimal strings so bot callers do not lose
 * precision on large compounding tables. They are gross payout multipliers of
 * the complete game wager, before transaction fees.
 */
import { parseEther } from 'viem';
import { parseGameConfigValue } from './game-config.js';
import { parseBaccaratBet } from './games/baccarat.js';
import { getBlocksGridLabel, parseBlocksGrid } from './games/blocks.js';
import { parseGimbozSmashInput } from './games/gimbozsmash.js';
import { buildGlydeOrCrashConfig } from './games/glydeorcrash.js';
import { calculateRouletteBetAmounts, parseRouletteBets } from './games/roulette.js';
import {
  BACCARAT_PAYOUT_NUMERATORS,
  BEAR_DICE_MODE_TABLES,
  BLACKJACK_PAYOUTS,
  BLOCKS_PAYOUTS_BY_GRID,
  COSMIC_PLINKO_OUTCOME_TABLES,
  JUNGLE_PLINKO_OUTCOME_TABLES,
  KENO_PAYOUTS_BY_PICKS,
  maxTablePayout,
  MONKEY_MATCH_OUTCOME_TABLES,
  PRIMES_MODE_TABLES,
  ROULETTE_POCKETS,
  getRouletteBetPayoutUnits,
  isRouletteWinningPocket,
  SPEED_KENO_PAYOUTS_BY_PICKS,
  SLOT_OUTCOME_TABLES,
  VIDEO_POKER_PAYOUTS,
} from './payout-tables.js';
import {
  getApestrongPayoutMultiplier,
  getGimbozSmashPayoutMultiplier,
} from './rtp.js';
import {
  BET_AMOUNTS as VIDEO_POKER_BET_AMOUNTS,
  HandStatusNames,
  MAX_BET_INDEX as VIDEO_POKER_MAX_BET_INDEX,
} from './stateful/video-poker/constants.js';

function normalizeDecimal(value) {
  const raw = String(value).trim().replace(/,/g, '').replace(/x$/i, '');
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return raw;
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  let [whole = '0', fraction = ''] = unsigned.split('.');
  whole = whole.replace(/^0+(?=\d)/, '') || '0';
  fraction = fraction.replace(/0+$/, '');
  const normalized = fraction ? `${whole}.${fraction}` : whole;
  return negative && normalized !== '0' ? `-${normalized}` : normalized;
}

function scaledIntegerToDecimal(value, scaleDigits) {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scaleDigits + 1, '0');
  const whole = scaleDigits > 0 ? digits.slice(0, -scaleDigits) : digits;
  const fraction = scaleDigits > 0 ? digits.slice(-scaleDigits).replace(/0+$/, '') : '';
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

function parseDecimalParts(value) {
  const normalized = normalizeDecimal(value);
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`Cannot multiply non-numeric payout multiplier: ${value}`);
  }
  const [whole, fraction = ''] = normalized.split('.');
  return { integer: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function multiplyDecimals(left, right) {
  const a = parseDecimalParts(left);
  const b = parseDecimalParts(right);
  return scaledIntegerToDecimal(a.integer * b.integer, a.scale + b.scale);
}

function formatRatio(numerator, denominator, precision = 18) {
  if (denominator === 0n) return null;
  const scale = 10n ** BigInt(precision);
  return scaledIntegerToDecimal((numerator * scale) / denominator, precision);
}

function formatUpperRatio(numerator, denominator, precision = 18) {
  if (denominator === 0n) return null;
  const scale = 10n ** BigInt(precision);
  return scaledIntegerToDecimal(((numerator * scale) + denominator - 1n) / denominator, precision);
}

function requireSplitAmount(options, game, split) {
  const amount = String(requireOption(options, 'amount', game));
  let wagerWei;
  try { wagerWei = parseEther(amount); } catch { throw new Error('--amount must be a positive APE amount.'); }
  if (wagerWei < BigInt(split)) {
    throw new Error(`--amount must provide at least 1 wei per ${split} split games.`);
  }
  return { amount: normalizeDecimal(amount), wagerWei };
}

function getSplitExtrema(min, max, wagerWei, split, { divideWagerFirst = true } = {}) {
  const runs = BigInt(split);
  const perRunWager = divideWagerFirst ? wagerWei / runs : wagerWei;
  const payoutWei = (multiplier) => {
    const { integer, scale } = parseDecimalParts(multiplier);
    return (perRunWager * integer) / ((10n ** BigInt(scale)) * (divideWagerFirst ? 1n : runs));
  };
  return {
    min: min === null ? null : formatRatio(payoutWei(min) * runs, wagerWei),
    max: max === null ? null : formatUpperRatio(payoutWei(max) * runs, wagerWei),
  };
}

function compareMultipliers(left, right) {
  const a = Number(left);
  const b = Number(right);
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  if (Number.isFinite(a)) return -1;
  if (Number.isFinite(b)) return 1;
  return String(left).localeCompare(String(right));
}

function payoutRowsFromValues(values) {
  return [...new Set(values.map(normalizeDecimal))]
    .sort(compareMultipliers)
    .map((multiplier) => ({ multiplier }));
}

function normalizeRows(rows) {
  const seen = new Set();
  return rows
    .map((row) => ({ ...row, multiplier: normalizeDecimal(row.multiplier) }))
    .filter((row) => {
      const key = `${row.condition || ''}\u0000${row.multiplier}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => compareMultipliers(left.multiplier, right.multiplier));
}

function getExtrema(rows) {
  const values = rows.map((row) => row.multiplier).sort(compareMultipliers);
  return { min: values[0] ?? null, max: values.at(-1) ?? null };
}

function createResult(game, parameters, {
  rows = null,
  min = null,
  max = null,
  reason = null,
} = {}) {
  const normalizedRows = Array.isArray(rows) ? normalizeRows(rows) : null;
  const extrema = normalizedRows ? getExtrema(normalizedRows) : { min: null, max: null };
  return {
    game,
    parameters,
    multiplier_basis: 'gross_payout_over_wager_before_fees',
    min_multiplier: min === null ? extrema.min : normalizeDecimal(min),
    max_multiplier: max === null ? extrema.max : normalizeDecimal(max),
    payouts_enumerated: Boolean(normalizedRows),
    ...(normalizedRows ? { payout_count: normalizedRows.length, payouts: normalizedRows } : {}),
    ...(reason ? { enumeration_reason: reason } : {}),
  };
}

function requireOption(options, optionName, game) {
  const value = options?.[optionName];
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`${game} paytable requires --${optionName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} because play has no fixed default for it.`);
  }
  return value;
}

function ensureInteger(value, label, min, max) {
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) throw new Error(`--${label} must be an integer between ${min} and ${max}.`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`--${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

function publicConfigValue(gameEntry, field, internalValue) {
  const option = gameEntry?.config?.[field]?.options?.find((candidate) => Number(candidate.value) === Number(internalValue));
  return option?.publicValue ?? internalValue;
}

function resolveRisk(gameEntry, field, rawValue) {
  if (rawValue === undefined) return Number(gameEntry.config[field].default);
  return parseGameConfigValue(gameEntry, field, String(rawValue), { numericKind: 'public' });
}

function valuesFromOutcomeTable(table) {
  return payoutRowsFromValues((table || []).map((outcome) => outcome.payoutMultiplier));
}

function enumerateProducts(baseValues, count) {
  let values = ['1'];
  for (let index = 0; index < count; index += 1) {
    values = [...new Set(values.flatMap((current) => baseValues.map((next) => multiplyDecimals(current, next))))];
  }
  return payoutRowsFromValues(values);
}

function getKenoPayouts(gameEntry, options) {
  const picks = ensureInteger(options.picks ?? gameEntry.config.picks.default, 'picks', gameEntry.config.picks.min, gameEntry.config.picks.max);
  const table = KENO_PAYOUTS_BY_PICKS[picks];
  const rows = Object.entries(table).map(([hits, multiplier]) => ({
    condition: `${hits} hit${Number(hits) === 1 ? '' : 's'}`,
    multiplier,
  }));
  return createResult(gameEntry.key, { picks }, { rows });
}

function getSpeedKenoPayouts(gameEntry, options) {
  const picks = ensureInteger(options.picks ?? gameEntry.config.picks.default, 'picks', gameEntry.config.picks.min, gameEntry.config.picks.max);
  const split = ensureInteger(options.split ?? gameEntry.config.games.default, 'split', gameEntry.config.games.min, gameEntry.config.games.max);
  const rows = Object.entries(SPEED_KENO_PAYOUTS_BY_PICKS[picks]).map(([hits, multiplier]) => ({
    condition: `${hits} hit${Number(hits) === 1 ? '' : 's'}`,
    multiplier,
  }));
  const { min, max } = getExtrema(normalizeRows(rows));
  if (split > 1) {
    const { amount, wagerWei } = requireSplitAmount(options, gameEntry.key, split);
    return createResult(gameEntry.key, { picks, split, amount }, {
      ...getSplitExtrema(min, max, wagerWei, split), reason: 'split_greater_than_one',
    });
  }
  return createResult(gameEntry.key, { picks, split }, { rows });
}

function getPlinkoPayouts(gameEntry, options) {
  const mode = resolveRisk(gameEntry, 'mode', options.risk);
  const split = ensureInteger(options.split ?? gameEntry.config.balls.default, 'split', gameEntry.config.balls.min, gameEntry.config.balls.max);
  const table = gameEntry.key === 'jungle-plinko'
    ? JUNGLE_PLINKO_OUTCOME_TABLES[mode]
    : COSMIC_PLINKO_OUTCOME_TABLES[mode];
  const rows = valuesFromOutcomeTable(table);
  const { min, max } = getExtrema(rows);
  const parameters = { risk: publicConfigValue(gameEntry, 'mode', mode), split };
  if (split > 1) {
    const { amount, wagerWei } = requireSplitAmount(options, gameEntry.key, split);
    return createResult(gameEntry.key, { ...parameters, amount }, {
      ...getSplitExtrema(min, max, wagerWei, split), reason: 'split_greater_than_one',
    });
  }
  return createResult(gameEntry.key, parameters, { rows });
}

function getSlotsPayouts(gameEntry, options) {
  const rawSplit = options.split ?? options.spins ?? gameEntry.config.spins.default;
  const split = ensureInteger(rawSplit, 'split', gameEntry.config.spins.min, gameEntry.config.spins.max);
  let rows = null;
  let min = '0';
  let max = null;
  let reason = null;

  if (SLOT_OUTCOME_TABLES[gameEntry.key]) {
    rows = valuesFromOutcomeTable(SLOT_OUTCOME_TABLES[gameEntry.key]);
    max = getExtrema(rows).max;
  } else if (gameEntry.key === 'reel-pirates') {
    reason = 'maximum_not_determinable_from_public_contract_data';
  }

  if (split > 1) {
    const { amount, wagerWei } = requireSplitAmount(options, gameEntry.key, split);
    return createResult(gameEntry.key, { split, amount }, {
      ...getSplitExtrema(min, max, wagerWei, split),
      reason: reason ?? 'split_greater_than_one',
    });
  }
  return rows
    ? createResult(gameEntry.key, { split }, { rows, min, max })
    : createResult(gameEntry.key, { split }, { min, max, reason });
}

function getRoulettePayouts(gameEntry, options) {
  const rawBet = requireOption(options, 'bet', gameEntry.key);
  const gameNumbers = parseRouletteBets(String(rawBet), gameEntry);
  const bets = String(rawBet).split(',').map((bet) => bet.trim().toUpperCase()).filter(Boolean);
  const amount = String(requireOption(options, 'amount', gameEntry.key));
  let wagerWei;
  try { wagerWei = parseEther(amount); } catch { throw new Error('--amount must be a positive APE amount.'); }
  if (wagerWei <= 0n) throw new Error('--amount must be a positive APE amount.');
  const amounts = calculateRouletteBetAmounts(wagerWei, gameNumbers);
  const grouped = new Map();
  for (const pocket of ROULETTE_POCKETS) {
    const payoutWei = gameNumbers.reduce((sum, gameNumber, index) => sum + (
      isRouletteWinningPocket(gameNumber, pocket)
        ? (amounts[index] * BigInt(getRouletteBetPayoutUnits(gameNumber))) / 1000n
        : 0n
    ), 0n);
    const multiplier = formatRatio(payoutWei, wagerWei);
    const pockets = grouped.get(multiplier) || [];
    pockets.push(pocket === 37 ? '00' : String(pocket));
    grouped.set(multiplier, pockets);
  }
  const rows = [...grouped.entries()].map(([multiplier, pockets]) => ({
    condition: `pocket ${pockets.join(', ')}`,
    multiplier,
  }));
  return createResult(gameEntry.key, { bet: bets.join(','), amount: normalizeDecimal(amount) }, { rows });
}

function getBaccaratPayouts(gameEntry, options) {
  const rawBet = String(requireOption(options, 'bet', gameEntry.key)).trim();
  const amount = String(requireOption(options, 'amount', gameEntry.key));
  let totalWagerWei;
  try { totalWagerWei = parseEther(amount); } catch { throw new Error('--amount must be a positive APE amount.'); }
  if (totalWagerWei <= 0n) throw new Error('--amount must be a positive APE amount.');
  const parsed = parseBaccaratBet(rawBet, totalWagerWei);
  const playerPayout = parsed.isBanker ? 0n : (parsed.playerBankerBet * BigInt(BACCARAT_PAYOUT_NUMERATORS.player)) / 100n;
  const bankerPayout = parsed.isBanker ? (parsed.playerBankerBet * BigInt(BACCARAT_PAYOUT_NUMERATORS.banker)) / 100n : 0n;
  const tiePayout = parsed.playerBankerBet + ((parsed.tieBet * BigInt(BACCARAT_PAYOUT_NUMERATORS.tie)) / 100n);
  const rows = [
    { condition: 'Player wins', multiplier: formatRatio(playerPayout, totalWagerWei) },
    { condition: 'Banker wins', multiplier: formatRatio(bankerPayout, totalWagerWei) },
    { condition: 'Tie', multiplier: formatRatio(tiePayout, totalWagerWei) },
  ];
  return createResult(gameEntry.key, { bet: rawBet.toUpperCase(), amount: normalizeDecimal(amount) }, { rows });
}

function getBlocksPayouts(gameEntry, options) {
  if (options.split !== undefined && options.survive !== undefined) {
    throw new Error('Options --split and --survive cannot be used together for Blocks.');
  }
  const gridMode = parseBlocksGrid(options.grid, { defaultMode: Number(gameEntry.config.grid.default) });
  const mode = resolveRisk(gameEntry, 'mode', options.risk);
  const split = options.split === undefined ? null : ensureInteger(options.split, 'split', 1, 5);
  const survive = split === null ? ensureInteger(options.survive ?? gameEntry.config.runs.default, 'survive', 1, 5) : null;
  const baseRows = Object.entries(BLOCKS_PAYOUTS_BY_GRID[gridMode][mode]).map(([maxCount, multiplier]) => ({
    condition: `${maxCount} matching tiles`,
    multiplier,
  }));
  const uniqueBaseValues = ['0', ...baseRows.map((row) => normalizeDecimal(row.multiplier))];
  const maxBase = getExtrema(payoutRowsFromValues(uniqueBaseValues)).max;
  const parameters = {
    grid: getBlocksGridLabel(gridMode),
    risk: publicConfigValue(gameEntry, 'mode', mode),
    split,
    survive,
  };
  if (split !== null && split > 1) {
    const { amount, wagerWei } = requireSplitAmount(options, gameEntry.key, split);
    return createResult(gameEntry.key, { ...parameters, amount }, {
      ...getSplitExtrema('0', maxBase, wagerWei, split, { divideWagerFirst: false }),
      reason: 'split_greater_than_one',
    });
  }
  if (survive > 1) {
    const rows = enumerateProducts(uniqueBaseValues, survive);
    return createResult(gameEntry.key, parameters, { rows });
  }
  return createResult(gameEntry.key, parameters, { rows: baseRows });
}

function getBearDicePayouts(gameEntry, options) {
  const difficulty = resolveRisk(gameEntry, 'difficulty', options.risk);
  const survive = ensureInteger(options.survive ?? gameEntry.config.rolls.default, 'survive', 1, 5);
  const payoutsBySum = BEAR_DICE_MODE_TABLES[difficulty]?.payoutsByRuns?.[survive];
  const safeRows = Object.entries(payoutsBySum).map(([sum, payout]) => ({
    condition: `sum ${sum}`,
    multiplier: scaledIntegerToDecimal(BigInt(payout), 2),
  }));
  const parameters = { risk: publicConfigValue(gameEntry, 'difficulty', difficulty), survive };
  if (survive === 1) {
    return createResult(gameEntry.key, parameters, { rows: [{ condition: 'losing sum', multiplier: '0' }, ...safeRows] });
  }
  const values = ['0', ...safeRows.map((row) => row.multiplier)];
  return createResult(gameEntry.key, parameters, { rows: enumerateProducts(values, survive) });
}

function getPrimesPayouts(gameEntry, options) {
  const difficulty = resolveRisk(gameEntry, 'difficulty', options.risk);
  const split = ensureInteger(options.split ?? gameEntry.config.runs.default, 'split', 1, 20);
  const table = PRIMES_MODE_TABLES[difficulty];
  const rows = [
    { condition: 'not prime and not zero', multiplier: '0' },
    { condition: 'prime', multiplier: scaledIntegerToDecimal(BigInt(table.primeMultiplier), 4) },
    { condition: 'zero', multiplier: scaledIntegerToDecimal(BigInt(table.zeroMultiplier), 4) },
  ];
  const parameters = { risk: publicConfigValue(gameEntry, 'difficulty', difficulty), split };
  const { min, max } = getExtrema(normalizeRows(rows));
  if (split > 1) {
    const { amount, wagerWei } = requireSplitAmount(options, gameEntry.key, split);
    return createResult(gameEntry.key, { ...parameters, amount }, {
      ...getSplitExtrema(min, max, wagerWei, split), reason: 'split_greater_than_one',
    });
  }
  return createResult(gameEntry.key, parameters, { rows });
}

function getGimbozSmashPayouts(gameEntry, options) {
  const parsed = parseGimbozSmashInput({
    range: options.range,
    outRange: options.outRange,
    cover: options.cover,
    defaultRange: gameEntry.config.range.default,
  });
  const multiplier = getGimbozSmashPayoutMultiplier(parsed.winCount);
  return createResult(gameEntry.key, {
    range: options.range ?? (options.cover === undefined && options.outRange === undefined ? gameEntry.config.range.default : null),
    cover: options.cover === undefined ? null : Number(options.cover),
    out_range: options.outRange ?? null,
    covered_numbers: parsed.winCount,
  }, {
    rows: [
      { condition: 'miss', multiplier: '0' },
      { condition: 'covered number', multiplier },
    ],
  });
}

function getBlackjackPayouts(options) {
  const side = String(options.side ?? '0');
  let sideWei;
  try { sideWei = parseEther(side); } catch { throw new Error('--side must be a non-negative APE amount.'); }
  if (sideWei < 0n) throw new Error('--side must be a non-negative APE amount.');
  if (sideWei === 0n) {
    return createResult('blackjack', { side: '0' }, {
      min: '0',
      max: String(BLACKJACK_PAYOUTS.natural),
      reason: 'stateful_actions_change_total_stake',
    });
  }
  const amount = String(requireOption(options, 'amount', 'blackjack'));
  let amountWei;
  try { amountWei = parseEther(amount); } catch { throw new Error('--amount must be a positive APE amount.'); }
  if (amountWei <= 0n) throw new Error('--amount must be a positive APE amount.');
  return createResult('blackjack', { amount: normalizeDecimal(amount), side: normalizeDecimal(side) }, {
    min: '0',
    reason: 'stateful_actions_change_total_stake_and_side_bet_combination',
  });
}

function getCashDashPayouts() {
  return createResult('cash-dash', {}, {
    min: '0',
    reason: 'stateful_compounding_and_mutable_row_payouts',
  });
}

function getVideoPokerPayouts(options) {
  const amount = Number(requireOption(options, 'amount', 'video-poker'));
  if (!VIDEO_POKER_BET_AMOUNTS.includes(amount)) {
    throw new Error(`--amount must be one of: ${VIDEO_POKER_BET_AMOUNTS.join(', ')} APE.`);
  }
  const jackpotEligible = amount === VIDEO_POKER_BET_AMOUNTS[VIDEO_POKER_MAX_BET_INDEX];
  const parameters = { amount: normalizeDecimal(amount) };
  if (jackpotEligible) {
    return createResult('video-poker', parameters, {
      min: '0',
      max: `${maxTablePayout(Object.values(VIDEO_POKER_PAYOUTS))} + jackpot/${amount}`,
      reason: 'dynamic_jackpot',
    });
  }
  const rows = Object.entries(VIDEO_POKER_PAYOUTS).map(([status, multiplier]) => ({
    condition: HandStatusNames[status],
    multiplier,
  }));
  return createResult('video-poker', parameters, {
    rows,
    min: '0',
    max: String(maxTablePayout(Object.values(VIDEO_POKER_PAYOUTS))),
  });
}

/**
 * Return the normalized paytable description for one catalog entry.
 */
export function getGamePaytable(gameEntry, options = {}) {
  const key = gameEntry?.key;
  if (!key) throw new Error('Unknown game.');

  switch (key) {
    case 'keno': return getKenoPayouts(gameEntry, options);
    case 'speed-keno': return getSpeedKenoPayouts(gameEntry, options);
    case 'jungle-plinko':
    case 'cosmic-plinko': return getPlinkoPayouts(gameEntry, options);
    case 'dino-dough':
    case 'bubblegum-heist':
    case 'geez-diggerz':
    case 'sushi-showdown':
    case 'reel-pirates': return getSlotsPayouts(gameEntry, options);
    case 'roulette': return getRoulettePayouts(gameEntry, options);
    case 'baccarat': return getBaccaratPayouts(gameEntry, options);
    case 'blocks': return getBlocksPayouts(gameEntry, options);
    case 'bear-dice': return getBearDicePayouts(gameEntry, options);
    case 'primes': return getPrimesPayouts(gameEntry, options);
    case 'ape-strong': {
      const cover = ensureInteger(options.cover ?? gameEntry.config.range.default, 'cover', gameEntry.config.range.min, gameEntry.config.range.max);
      return createResult(key, { cover }, { rows: [
        { condition: 'miss', multiplier: '0' },
        { condition: 'win', multiplier: getApestrongPayoutMultiplier(cover) },
      ] });
    }
    case 'gimboz-smash': return getGimbozSmashPayouts(gameEntry, options);
    case 'glyde-or-crash': {
      const config = buildGlydeOrCrashConfig(options.multiplier ?? gameEntry.config.multiplier.default, gameEntry);
      const multiplier = scaledIntegerToDecimal(BigInt(config.multiplierBasisPoints), 4);
      return createResult(key, { multiplier: config.multiplier }, { rows: [
        { condition: 'crash before target', multiplier: '0' },
        { condition: 'target reached', multiplier },
      ] });
    }
    case 'monkey-match': {
      const mode = resolveRisk(gameEntry, 'mode', options.risk);
      return createResult(key, { risk: publicConfigValue(gameEntry, 'mode', mode) }, {
        rows: valuesFromOutcomeTable(MONKEY_MATCH_OUTCOME_TABLES[mode]),
      });
    }
    case 'blackjack': return getBlackjackPayouts(options);
    case 'cash-dash': return getCashDashPayouts();
    case 'hi-lo-nebula': return createResult(key, {}, {
      min: '0',
      reason: 'stateful_compounding_and_dynamic_jackpot',
    });
    case 'video-poker': return getVideoPokerPayouts(options);
    default: throw new Error(`Payout information is unavailable for ${key}.`);
  }
}

function formatPlainTable(headers, rows) {
  const widths = headers.map((header, index) => Math.max(
    header.length,
    ...rows.map((row) => String(row[index] ?? '').length),
  ));
  const render = (row) => row.map((value, index) => String(value ?? '').padEnd(widths[index])).join('  ').trimEnd();
  return [render(headers), render(widths.map((width) => '-'.repeat(width))), ...rows.map(render)].join('\n');
}

/** Format a paytable description for terminal use. */
export function formatGamePaytable(result) {
  const lines = [`${String(result.game).toUpperCase()} PAYTABLE`, '', 'Parameters'];
  const parameters = Object.entries(result.parameters || {});
  lines.push(parameters.length
    ? formatPlainTable(['parameter', 'value'], parameters.map(([name, value]) => [name, value === null ? 'none' : value]))
    : '(none)');
  lines.push('', 'Overall multipliers', formatPlainTable(
    ['min_multiplier', 'max_multiplier'],
    [[result.min_multiplier === null ? 'unknown' : `${result.min_multiplier}x`, result.max_multiplier === null ? 'unknown' : `${result.max_multiplier}x`]],
  ));
  if (result.payouts_enumerated) {
    const hasConditions = result.payouts.some((row) => row.condition);
    lines.push('', 'Paytable', formatPlainTable(
      hasConditions ? ['condition', 'multiplier'] : ['multiplier'],
      result.payouts.map((row) => hasConditions
        ? [row.condition || '', `${row.multiplier}x`]
        : [`${row.multiplier}x`]),
    ));
  }
  if (result.enumeration_reason) lines.push('', `Enumeration: ${result.enumeration_reason}`);
  return lines.join('\n');
}
