/**
 * Unit Tests: lib/games/roulette.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { decodeAbiParameters, parseEther } from 'viem';
import { resolveGame } from '../../registry.js';
import {
  calculateRouletteBetAmounts,
  parseRouletteBets,
  playRoulette,
} from '../../lib/games/roulette.js';
import { getRouletteOutcomePayouts, resolveRouletteWager, serializeRouletteWager } from '../../lib/roulette-bets.js';

const rouletteEntry = resolveGame('roulette');

describe('Roulette Helpers', () => {
  it('maps documented bets to the verified on-chain codes', () => {
    assert.deepStrictEqual(
      parseRouletteBets('0,17,00,RED,COLUMN:1', rouletteEntry),
      [1, 18, 38, 50, 42]
    );

    assert.deepStrictEqual(
      parseRouletteBets('DOZEN:2,odd,black', rouletteEntry),
      [40, 48, 49]
    );
  });

  it('keeps a single-leg wager strictly below the total bet amount', () => {
    const totalWagerWei = parseEther('10');

    assert.deepStrictEqual(
      calculateRouletteBetAmounts(totalWagerWei, [50]),
      [totalWagerWei - 1n]
    );
  });

  it('splits multi-leg wagers evenly', () => {
    assert.deepStrictEqual(
      calculateRouletteBetAmounts(parseEther('9'), [50, 49, 42]),
      [parseEther('3'), parseEther('3'), parseEther('3')]
    );
  });

  it('allocates exact decimal chips and retains unallocated wager separately', () => {
    const wager = resolveRouletteWager({ wagerWei: parseEther('2.5'), bet: 'RED=3,BLACK', chips: '5', gameEntry: rouletteEntry });
    assert.deepStrictEqual(wager.amounts, [parseEther('1.5'), parseEther('0.5')]);
    assert.strictEqual(wager.unallocatedWei, parseEther('0.5'));
    const config = serializeRouletteWager(wager);
    assert.deepStrictEqual(config.chipCounts, ['3', '1']);
    assert.strictEqual(config.chipValue, '0.5');
    assert.strictEqual(config.chips, '5');
    assert.strictEqual(config.allocatedChips, '4');
    assert.strictEqual(config.warnings.length, 1);
    assert.strictEqual(config.bet, 'RED=3,BLACK=1');
    assert.strictEqual(config.wagerAmountApe, '2.5');
    assert.doesNotThrow(() => JSON.stringify(config));
    const payouts = getRouletteOutcomePayouts(wager.gameNumbers, wager.amounts);
    assert.strictEqual(payouts.filter(row => row.payoutWei === 0n).length, 2);
    assert.strictEqual(payouts.filter(row => row.payoutWei === parseEther('3.075')).length, 18);
    assert.strictEqual(payouts.filter(row => row.payoutWei === parseEther('1.025')).length, 18);
  });

  it('infers purchased chips from the bet list and accepts an equal explicit count without warnings', () => {
    for (const chips of [undefined, '4']) {
      const wager = resolveRouletteWager({ wagerWei: parseEther('5'), bet: 'RED=3,BLACK=1', chips, gameEntry: rouletteEntry });
      assert.deepStrictEqual(wager.amounts, [parseEther('3.75'), parseEther('1.25')]);
      assert.strictEqual(wager.chips, '4');
      assert.strictEqual(wager.chipValue, '1.25');
      assert.deepStrictEqual(wager.warnings, []);
      assert.strictEqual(wager.unallocatedWei, 0n);
    }
  });

  it('rounds chip value down to wei and retains division dust in the wager', () => {
    const wager = resolveRouletteWager({ wagerWei: 10n, bet: 'RED=2,BLACK=1', gameEntry: rouletteEntry });
    assert.deepStrictEqual(wager.amounts, [6n, 3n]);
    assert.strictEqual(wager.unallocatedWei, 1n);
  });

  it('keeps chip counts and wei products exact above Number safe-integer precision', () => {
    const wager = resolveRouletteWager({ wagerWei: 9007199254741000n, bet: '0=9007199254740993,00=2', chips: '9007199254741000', gameEntry: rouletteEntry });
    assert.deepStrictEqual(wager.amounts, [9007199254740993n, 2n]);
    assert.strictEqual(wager.unallocatedWei, 5n);
  });

  it('rejects invalid counts, tokens, duplicate aliases, and insufficient purchased chips', () => {
    const resolve = (bet, chips = '5', total = '5') => resolveRouletteWager({ wagerWei: parseEther(total), bet, chips, gameEntry: rouletteEntry });
    for (const bet of ['RED=0', 'RED=-1', 'RED=1.5', 'RED=', 'RED=1:2', 'RED=1e2', '17oops', '17.5']) {
      assert.throws(() => resolve(bet));
    }
    for (const bet of ['RED=1,RED=2', 'COLUMN:1=1,COLUMN:1=2']) assert.throws(() => resolve(bet), /Duplicate/);
    for (const value of ['0', '-1', '1e3', '1.5', '0.0001']) assert.throws(() => resolve('RED=1', value), /chips/);
    assert.throws(() => resolve('RED=3,BLACK=3'), /less than/);
    assert.strictEqual(resolve('RED=5').amounts[0], parseEther('5') - 1n);
    assert.throws(() => resolve('RED=1,BLACK=1', '3', '0.000000000000000002'), /at least 1 wei/);
    assert.strictEqual(resolve('RED=1', '2', '2').amounts[0], parseEther('1'));
  });

  it('encodes component amounts unchanged and adds VRF only to transaction value', async () => {
    const fee = parseEther('0.125');
    let submitted;
    const publicClient = {
      async readContract() { return fee; },
      async estimateContractGas() { return 100000n; },
    };
    const walletClient = {
      async writeContract(request) {
        submitted = request;
        throw new Error('Synthetic allocation inspection stop');
      },
    };
    await assert.rejects(playRoulette({
      account: { address: '0x1111111111111111111111111111111111111111' },
      publicClient, walletClient, gameEntry: rouletteEntry,
      wager: parseEther('5'), bet: 'RED=3,BLACK=1', chips: '5',
      xGameId: '42', xRef: '0x0000000000000000000000000000000000000000',
      xUserRandomWord: `0x${'1'.repeat(64)}`, timeoutMs: 0,
    }), /Synthetic allocation inspection stop/);
    assert.strictEqual(submitted.value, parseEther('5') + fee);
    const [codes, amounts] = decodeAbiParameters([
      { type: 'uint8[]' }, { type: 'uint256[]' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' },
    ], submitted.args[1]);
    assert.deepStrictEqual(codes, [50, 49]);
    assert.deepStrictEqual(amounts, [parseEther('3'), parseEther('1')]);
  });
});

describe('Roulette grid groups and exact shuffle', () => {
  it('enumerates the complete 1–36 grid without inventing native group codes', async () => {
    const { ROULETTE_BET_CATALOG: catalog } = await import('../../lib/roulette-layout.js');
    const counts = {};
    for (const entry of catalog) {
      counts[entry.type] = (counts[entry.type] || 0) + 1;
      assert.ok(entry.gameNumbers.every(code => code >= 1 && code <= 50));
      if (['split', 'street', 'square', 'line'].includes(entry.type)) {
        assert.ok(entry.pockets.every(n => n >= 1 && n <= 36));
        assert.deepStrictEqual(entry.gameNumbers, entry.pockets.map(n => n + 1));
      }
    }
    assert.deepStrictEqual(counts, { number: 38, dozen: 3, column: 3, half: 2, parity: 2, color: 2, split: 57, street: 12, line: 11, square: 22 });
  });

  it('rejects invalid geometry, ambiguous greens, old syntax and empty entries', () => {
    for (const bet of ['SPLIT:3-4', 'SPLIT:11-8', 'SPLIT:1-5', 'SPLIT:0-1', 'SPLIT:0-00', 'STREET:0', 'STREET:2', 'STREET:00', 'SQUARE:3-7', 'SQUARE:34-38', 'SQUARE:1-6', 'LINE:2-7', 'LINE:34-39', 'LINE:1-5', 'DOZEN:0', 'COLUMN:4', 'FIRST_HALF', 'FIRST_THIRD:2', 'RED:2', 'RED,,BLACK', ',RED', 'RED,']) {
      assert.throws(() => resolveRouletteWager({ wagerWei: parseEther('6'), bet }), undefined, bet);
    }
  });

  it('expands each group with the contract straight multiplier and excludes both greens', () => {
    for (const [bet, size] of [['SPLIT:35-36', 2], ['STREET:34', 3], ['SQUARE:32-36', 4], ['LINE:31-36', 6]]) {
      const wager = resolveRouletteWager({ wagerWei: parseEther('6'), bet });
      assert.strictEqual(wager.gameNumbers.length, size);
      assert.ok(wager.amounts.every(amount => amount === parseEther('6') / BigInt(size)));
      const payouts = getRouletteOutcomePayouts(wager.gameNumbers, wager.amounts);
      assert.strictEqual(payouts.filter(row => row.payoutWei > 0n).length, size);
      assert.ok(payouts.filter(row => row.payoutWei > 0n).every(row => row.payoutWei === parseEther('221.4') / BigInt(size)));
      assert.strictEqual(payouts.find(row => row.pocket === 0).payoutWei, 0n);
      assert.strictEqual(payouts.find(row => row.pocket === 37).payoutWei, 0n);
    }
  });

  it('merges overlapping native codes after equal group division and retains all dust', () => {
    const wager = resolveRouletteWager({ wagerWei: 11n, bet: 'SPLIT:1-2=1,SQUARE:1-5=1' });
    assert.deepStrictEqual(wager.gameNumbers, [2, 3, 5, 6]);
    assert.deepStrictEqual(wager.amounts, [3n, 3n, 1n, 1n]);
    assert.strictEqual(wager.unallocatedWei, 3n);
    assert.throws(() => resolveRouletteWager({ wagerWei: 2n, bet: 'STREET:1' }), /at least 1 wei/);
    assert.throws(() => resolveRouletteWager({ wagerWei: 1n, bet: 'RED' }), /strictly less/);
  });

  it('reads historical weighted labels without accepting them as new commands', async () => {
    const { resolveRouletteConfigWager } = await import('../../lib/roulette-bets.js');
    const historical = resolveRouletteConfigWager({ wagerAmountApe: '3', bet: 'FIRST_THIRD:2,FIRST_COL:1' });
    const current = resolveRouletteWager({ wagerWei: parseEther('3'), bet: 'DOZEN:1=2,COLUMN:1=1' });
    assert.deepStrictEqual(historical.gameNumbers, current.gameNumbers);
    assert.deepStrictEqual(historical.amounts, current.amounts);
  });

  it('preserves indexed types, chips, all joint wins and every wei payout across varied shuffles', async () => {
    const { prepareRouletteWager } = await import('../../lib/roulette-shuffle.js');
    const { parseRouletteBetEntries, getRouletteWinSignature } = await import('../../lib/roulette-layout.js');
    let seed = 7301;
    const randomIndex = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * max); };
    for (const bet of ['9=1,RED=2', '0=1,00=1,EVEN=2,LOW=1', 'SPLIT:8-11=2,STREET:4=1,SQUARE:2-6=1,LINE:7-12=1,LOW=1', 'DOZEN:2=2,COLUMN:3=2,17=1,21=1']) {
      const params = { wagerWei: 601n, bet, chips: '8' };
      const original = resolveRouletteWager(params);
      const entries = parseRouletteBetEntries(bet);
      const signature = getRouletteWinSignature(entries);
      const payouts = value => getRouletteOutcomePayouts(value.gameNumbers, value.amounts).map(row => String(row.payoutWei)).sort();
      const choices = new Set();
      for (let i = 0; i < 30; i++) {
        const shuffled = prepareRouletteWager({ ...params, shuffle: true, randomIndex });
        const actual = parseRouletteBetEntries(shuffled.bet);
        assert.deepStrictEqual(actual.map(entry => [entry.type, entry.chips]), entries.map(entry => [entry.type, entry.chips]));
        assert.strictEqual(getRouletteWinSignature(actual), signature);
        assert.deepStrictEqual(payouts(shuffled), payouts(original));
        assert.strictEqual(shuffled.unallocatedWei, original.unallocatedWei);
        assert.strictEqual(shuffled.chips, '8');
        assert.strictEqual(shuffled.shuffleInfo.originalBet, original.bet);
        choices.add(shuffled.bet);
      }
      assert.ok(choices.size > 1, bet);
    }
  });

  it('fails closed when the shuffle search budget is exhausted', async () => {
    const { prepareRouletteWager } = await import('../../lib/roulette-shuffle.js');
    assert.throws(() => prepareRouletteWager({ wagerWei: parseEther('2'), bet: '9=1,RED=1', shuffle: true, randomIndex: () => 0, maxAttempts: 3 }), /search limit.*No transaction/);
  });

  it('checks the live native-entry limit before submitting any transaction', async () => {
    let submitted = false;
    await assert.rejects(playRoulette({
      account: { address: '0x1111111111111111111111111111111111111111' },
      publicClient: { async readContract() { return 1n; } },
      walletClient: { async writeContract() { submitted = true; } },
      gameEntry: rouletteEntry, wager: parseEther('6'), bet: 'LINE:1-6', timeoutMs: 0,
    }), /MAX_GUESSES/);
    assert.strictEqual(submitted, false);
  });
});
