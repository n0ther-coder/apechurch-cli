import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GAME_REGISTRY, resolveGame } from '../../registry.js';
import { formatGamePaytable, getGamePaytable } from '../../lib/game-paytable.js';

describe('game paytable descriptions', () => {
  it('uses the same fixed Keno default as play and reports every paytable parameter', () => {
    const result = getGamePaytable(resolveGame('keno'));

    assert.deepStrictEqual(result.parameters, { picks: 5 });
    assert.strictEqual(result.min_multiplier, '0');
    assert.strictEqual(result.max_multiplier, '200');
    assert.strictEqual(result.payouts_enumerated, true);
    assert.deepStrictEqual(
      result.payouts.map((payout) => [payout.condition, payout.multiplier]),
      [
        ['1 hit', '0'],
        ['2 hits', '1.1'],
        ['0 hits', '1.25'],
        ['3 hits', '2.5'],
        ['4 hits', '10'],
        ['5 hits', '200'],
      ],
    );
  });

  it('enumerates one Speed Keno game and emits bounds only for the default split', () => {
    const single = getGamePaytable(resolveGame('speed-keno'), { picks: 5, split: 1 });
    const split = getGamePaytable(resolveGame('speed-keno'), { picks: 5, amount: '1' });

    assert.deepStrictEqual(single.parameters, { picks: 5, split: 1 });
    assert.strictEqual(single.payout_count, 6);
    assert.strictEqual(single.min_multiplier, '0.2');
    assert.strictEqual(single.max_multiplier, '2000');

    assert.deepStrictEqual(split.parameters, { picks: 5, split: 20, amount: '1' });
    assert.strictEqual(split.payouts_enumerated, false);
    assert.strictEqual(split.min_multiplier, '0.2');
    assert.strictEqual(split.max_multiplier, '2000');
    assert.ok(!Object.hasOwn(split, 'payouts'));
  });

  it('names a paytable parameter that has no fixed play default', () => {
    assert.throws(
      () => getGamePaytable(resolveGame('roulette')),
      /roulette paytable requires --bet/,
    );
  });

  it('uses wager-level Roulette rounding and shared payout rules', () => {
    assert.throws(
      () => getGamePaytable(resolveGame('roulette'), { bet: 'RED' }),
      /roulette paytable requires --amount/,
    );
    const result = getGamePaytable(resolveGame('roulette'), { bet: 'RED', amount: '1' });
    assert.deepStrictEqual(result.parameters, { bet: 'RED', amount: '1' });
    assert.strictEqual(result.min_multiplier, '0');
    assert.strictEqual(result.max_multiplier, '2.049999999999999997');
  });

  it('requires a Baccarat wager to account for Banker integer rounding', () => {
    assert.throws(
      () => getGamePaytable(resolveGame('baccarat'), { bet: 'BANKER' }),
      /baccarat paytable requires --amount/,
    );
    const result = getGamePaytable(resolveGame('baccarat'), { bet: 'BANKER', amount: '1' });
    assert.deepStrictEqual(result.parameters, { bet: 'BANKER', amount: '1' });
    assert.strictEqual(result.max_multiplier, '1.95');
  });

  it('reports all Blocks paytable parameters and compounds survival payouts', () => {
    const result = getGamePaytable(resolveGame('blocks'), {
      grid: '2x2',
      risk: 'High',
      survive: 2,
    });

    assert.deepStrictEqual(result.parameters, {
      grid: '2x2',
      risk: 1,
      split: null,
      survive: 2,
    });
    assert.strictEqual(result.min_multiplier, '0');
    assert.strictEqual(result.max_multiplier, '2601');
    assert.deepStrictEqual(result.payouts.map((payout) => payout.multiplier), ['0', '64', '408', '2601']);
  });

  it('keeps an indeterminable public maximum explicit instead of inventing one', () => {
    const result = getGamePaytable(resolveGame('reel-pirates'), { split: 1 });

    assert.deepStrictEqual(result.parameters, { split: 1 });
    assert.strictEqual(result.min_multiplier, '0');
    assert.strictEqual(result.max_multiplier, null);
    assert.strictEqual(result.payouts_enumerated, false);
  });

  it('enumerates every distinct payout of the four verified slot matrices', () => {
    for (const [key, count, max] of [
      ['dino-dough', 50, '333'],
      ['bubblegum-heist', 35, '100'],
      ['geez-diggerz', 16, '50'],
      ['sushi-showdown', 45, '500'],
    ]) {
      const result = getGamePaytable(resolveGame(key), { split: 1 });
      assert.strictEqual(result.payouts_enumerated, true);
      assert.strictEqual(result.payout_count, count);
      assert.strictEqual(result.min_multiplier, '0');
      assert.strictEqual(result.max_multiplier, max);
    }
  });

  it('does not mistake stateful row or card factors for complete-session payouts', () => {
    for (const key of ['cash-dash', 'hi-lo-nebula']) {
      const result = getGamePaytable({ key });
      assert.strictEqual(result.payouts_enumerated, false);
      assert.strictEqual(result.min_multiplier, '0');
      assert.strictEqual(result.max_multiplier, null);
    }
  });

  it('shows bounds only for the dynamic Video Poker jackpot and does not invent a Blackjack side-bet maximum', () => {
    const poker = getGamePaytable({ key: 'video-poker' }, { amount: 400 });
    assert.deepStrictEqual(poker.parameters, { amount: '400' });
    assert.strictEqual(poker.payouts_enumerated, false);
    assert.strictEqual(poker.min_multiplier, '0');
    assert.strictEqual(poker.max_multiplier, '250 + jackpot/400');

    const blackjack = getGamePaytable({ key: 'blackjack' }, { amount: '10.000000000000000001', side: '1' });
    assert.deepStrictEqual(blackjack.parameters, { amount: '10.000000000000000001', side: '1' });
    assert.strictEqual(blackjack.payouts_enumerated, false);
    assert.strictEqual(blackjack.min_multiplier, '0');
    assert.strictEqual(blackjack.max_multiplier, null);
  });

  it('provides bounds and resolved parameters for the entire supported catalog', () => {
    const supplemental = [
      { key: 'blackjack' },
      { key: 'cash-dash' },
      { key: 'hi-lo-nebula' },
      { key: 'video-poker' },
    ];
    const options = {
      baccarat: { bet: 'PLAYER', amount: 1 },
      roulette: { bet: 'RED', amount: 1 },
      'speed-keno': { amount: 10 },
      'jungle-plinko': { amount: 10 },
      'cosmic-plinko': { amount: 10 },
      'dino-dough': { amount: 10 },
      'bubblegum-heist': { amount: 10 },
      'geez-diggerz': { amount: 10 },
      'sushi-showdown': { amount: 10 },
      'reel-pirates': { amount: 10 },
      primes: { amount: 10 },
      'video-poker': { amount: 25 },
    };

    for (const game of [...GAME_REGISTRY, ...supplemental]) {
      const result = getGamePaytable(game, options[game.key] || {});
      assert.strictEqual(result.game, game.key);
      assert.ok(result.parameters && typeof result.parameters === 'object');
      assert.ok(Object.hasOwn(result, 'min_multiplier'));
      assert.ok(Object.hasOwn(result, 'max_multiplier'));
    }
  });

  it('formats parameters, overall bounds, and payout rows as terminal tables', () => {
    const output = formatGamePaytable(getGamePaytable(resolveGame('speed-keno'), { picks: 5, split: 1 }));

    assert.match(output, /Parameters/);
    assert.match(output, /picks\s+5/);
    assert.match(output, /min_multiplier\s+max_multiplier/);
    assert.match(output, /0\.2x\s+2000x/);
    assert.match(output, /5 hits\s+2000x/);
  });
});
