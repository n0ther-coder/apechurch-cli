/** Verified native codes and conventional inside bets on the 1–36 grid. */
import { ROULETTE_POCKETS, isRouletteWinningPocket } from './payout-tables.js';

export const ROULETTE_BNF = Object.freeze([
  '<roulette-bets> ::= <roulette-entry> ( "," <roulette-entry> )*',
  '<roulette-entry> ::= <roulette-bet> [ "=" <roulette-chip-count> ]',
  '<roulette-bet> ::= "0" | "00" | <roulette-number> | "RED" | "BLACK" | "EVEN" | "ODD" | "LOW" | "HIGH" | "DOZEN:" <roulette-section> | "COLUMN:" <roulette-section> | "SPLIT:" <roulette-number> "-" <roulette-number> | "STREET:" <roulette-number> | "SQUARE:" <roulette-number> "-" <roulette-number> | "LINE:" <roulette-number> "-" <roulette-number>',
  '<roulette-section> ::= "1" | "2" | "3"',
  '<roulette-number> ::= <integer>                    ; 1 <= value <= 36',
  '<roulette-chip-count> ::= <integer>                ; positive; omitted per-bet count defaults to 1',
  '<roulette-chips> ::= <integer>                     ; positive purchased count; defaults to the sum of per-bet counts',
  '; SPLIT: adjacent grid numbers a < b; STREET: first number is 1,4,...,34.',
  '; SQUARE: lower/upper endpoints a,b with b=a+4, a in columns 1 or 2.',
  '; LINE: endpoints a,b with b=a+5, a=1,4,...,31. Inside groups exclude 0 and 00.',
  '; Roulette: purchased chips < allocated chips is an error before wallet access or transactions.',
  '; Roulette: purchased chips > allocated chips warns and continues with the difference unallocated.',
  '; Roulette chip value = floor(total wager in wei / purchased chips).',
  '; Inside groups split their allocation equally over native straight bets, rounding down to wei.',
  '; --shuffle preserves types, chip counts, all joint win probabilities and exact payout distribution.',
  '; Shuffle uses bounded rejection sampling; failure stops before submitting a transaction.',
]);

const catalog = [];
function native(bet, type, code) {
  catalog.push(Object.freeze({ bet, type, gameNumber: code, gameNumbers: Object.freeze([code]),
    pockets: Object.freeze(ROULETTE_POCKETS.filter(pocket => isRouletteWinningPocket(code, pocket))) }));
}
function inside(bet, type, pockets) {
  catalog.push(Object.freeze({ bet, type, gameNumbers: Object.freeze(pockets.map(n => n + 1)), pockets: Object.freeze(pockets) }));
}
native('0', 'number', 1);
for (let n = 1; n <= 36; n++) native(String(n), 'number', n + 1);
native('00', 'number', 38);
for (let n = 1; n <= 3; n++) native(`DOZEN:${n}`, 'dozen', n + 38);
for (let n = 1; n <= 3; n++) native(`COLUMN:${n}`, 'column', n + 41);
for (const [bet, type, code] of [['LOW', 'half', 45], ['HIGH', 'half', 46], ['EVEN', 'parity', 47], ['ODD', 'parity', 48], ['BLACK', 'color', 49], ['RED', 'color', 50]]) native(bet, type, code);
for (let a = 1; a <= 36; a++) {
  if (a % 3 !== 0) inside(`SPLIT:${a}-${a + 1}`, 'split', [a, a + 1]);
  if (a <= 33) inside(`SPLIT:${a}-${a + 3}`, 'split', [a, a + 3]);
  if (a % 3 === 1) {
    inside(`STREET:${a}`, 'street', [a, a + 1, a + 2]);
    if (a <= 31) inside(`LINE:${a}-${a + 5}`, 'line', Array.from({ length: 6 }, (_, i) => a + i));
  }
  if (a <= 32 && a % 3 !== 0) inside(`SQUARE:${a}-${a + 4}`, 'square', [a, a + 1, a + 3, a + 4]);
}
export const ROULETTE_BET_CATALOG = Object.freeze(catalog);
const byBet = new Map(catalog.map(entry => [entry.bet, entry]));

export function parseRouletteBetEntries(betString) {
  if (typeof betString !== 'string' || !betString.trim()) throw new Error('No bet specified for roulette. Use BET=CHIPS entries.');
  const seen = new Set();
  return betString.split(',').map(segment => {
    const parts = segment.trim().toUpperCase().split('=').map(value => value.trim());
    const [bet, count] = parts;
    if (parts.length > 2 || (count !== undefined && (!/^\d+$/.test(count) || BigInt(count) <= 0n))) {
      throw new Error(`Invalid Roulette chip count: "${segment}". Use BET=CHIPS with a positive integer count.`);
    }
    const selection = byBet.get(bet);
    if (!selection) throw new Error(`Invalid Roulette bet: "${bet}". Use a documented BET=CHIPS selection; inside groups must follow the 1–36 grid (0 and 00 are straight bets only).`);
    if (seen.has(bet)) throw new Error(`Duplicate Roulette bet: ${bet}. Combine its chips in one entry.`);
    seen.add(bet);
    return { ...selection, chips: count === undefined ? null : BigInt(count).toString() };
  });
}

export function parseRouletteBets(betString) {
  return [...new Set(parseRouletteBetEntries(betString).flatMap(entry => entry.gameNumbers))];
}

/** Indexed membership histogram: includes every intersection and its complement. */
export function getRouletteWinSignature(entries) {
  const masks = new Map();
  for (const pocket of ROULETTE_POCKETS) {
    let mask = 0n;
    entries.forEach((entry, index) => { if (entry.pockets.includes(pocket)) mask |= 1n << BigInt(index); });
    masks.set(mask, (masks.get(mask) || 0) + 1);
  }
  return [...masks].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
    .map(([mask, count]) => `${mask}:${count}`).join(',');
}
