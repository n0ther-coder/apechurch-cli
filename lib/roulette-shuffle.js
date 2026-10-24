/** Exact structural equivalence, sampled without assuming roulette symmetries. */
import { randomInt } from 'node:crypto';
import { ROULETTE_BET_CATALOG, parseRouletteBetEntries } from './roulette-layout.js';
import { getRouletteOutcomePayouts, resolveRouletteWager } from './roulette-bets.js';

const ALL_POCKETS = (1n << 38n) - 1n;
const masks = new Map(ROULETTE_BET_CATALOG.map(entry => [entry.bet,
  entry.pockets.reduce((mask, pocket) => mask | (1n << BigInt(pocket)), 0n)]));
const byType = new Map();
for (const entry of ROULETTE_BET_CATALOG) {
  if (!byType.has(entry.type)) byType.set(entry.type, []);
  byType.get(entry.type).push(entry);
}
function countBits(bits) {
  let count = 0;
  while (bits) { bits &= bits - 1n; count++; }
  return count;
}
function splitCells(cells, mask) {
  return cells.flatMap(cell => [cell & mask, cell & (ALL_POCKETS ^ mask)]).filter(Boolean);
}
function payoutSignature(wager) {
  return getRouletteOutcomePayouts(wager.gameNumbers, wager.amounts).map(row => row.payoutWei)
    .sort((a, b) => a < b ? -1 : a > b ? 1 : 0).join(',');
}

/**
 * Uniform independent choices, rejecting the entire draw when a joint count
 * differs. Early prefix rejection changes neither the accepted set nor its
 * probabilities. No approximate candidate or unchecked fallback is returned.
 * Entry positions retain their original type and chip count, including greens.
 */
export function prepareRouletteWager({ shuffle = false, randomIndex = randomInt,
  maxAttempts = 50000, ...params }) {
  const original = resolveRouletteWager(params);
  if (!shuffle) return original;
  const entries = parseRouletteBetEntries(params.bet);
  const order = entries.map((entry, index) => ({ entry, index, candidates: byType.get(entry.type) }))
    .sort((a, b) => a.candidates.length - b.candidates.length || a.index - b.index);
  let cells = [ALL_POCKETS];
  const expected = order.map(({ entry }) => {
    const mask = masks.get(entry.bet);
    const counts = cells.map(cell => countBits(cell & mask));
    cells = splitCells(cells, mask);
    return counts;
  });
  const expectedPayouts = payoutSignature(original);
  let checks = 0;
  for (let attempt = 1; attempt <= maxAttempts && checks < 500000; attempt++) {
    let partitions = [ALL_POCKETS];
    const chosen = new Array(entries.length);
    const seen = new Set();
    let valid = true;
    for (let depth = 0; depth < order.length; depth++) {
      if (checks >= 500000) { valid = false; break; }
      checks++;
      const { candidates, index, entry } = order[depth];
      const candidate = candidates[randomIndex(candidates.length)];
      if (!candidate) throw new Error('Invalid Roulette shuffle random index.');
      const mask = masks.get(candidate.bet);
      if (seen.has(candidate.bet) || partitions.some((cell, i) => countBits(cell & mask) !== expected[depth][i])) {
        valid = false;
        break;
      }
      seen.add(candidate.bet);
      partitions = splitCells(partitions, mask);
      chosen[index] = `${candidate.bet}=${entry.chips ?? '1'}`;
    }
    if (!valid) continue;
    const wager = resolveRouletteWager({ ...params, bet: chosen.join(',') });
    if (payoutSignature(wager) !== expectedPayouts) continue;
    return { ...wager, shuffleInfo: { originalBet: original.bet, attempts: attempt } };
  }
  throw new Error('Roulette --shuffle could not sample an exact equivalent within its search limit. Simplify the bet list or omit --shuffle. No transaction was submitted.');
}
