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
      parseRouletteBets('0,17,00,RED,FIRST_COL', rouletteEntry),
      [1, 18, 38, 50, 42]
    );

    assert.deepStrictEqual(
      parseRouletteBets('SECOND_THIRD,odd,black', rouletteEntry),
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
    const wager = resolveRouletteWager({ wagerWei: parseEther('2.5'), bet: 'RED:3,BLACK', chips: '5', gameEntry: rouletteEntry });
    assert.deepStrictEqual(wager.amounts, [parseEther('1.5'), parseEther('0.5')]);
    assert.strictEqual(wager.unallocatedWei, parseEther('0.5'));
    const config = serializeRouletteWager(wager);
    assert.deepStrictEqual(config.chipCounts, ['3', '1']);
    assert.strictEqual(config.chipValue, '0.5');
    assert.strictEqual(config.chips, '5');
    assert.strictEqual(config.allocatedChips, '4');
    assert.strictEqual(config.warnings.length, 1);
    assert.strictEqual(config.bet, 'RED:3,BLACK:1');
    assert.strictEqual(config.wagerAmountApe, '2.5');
    assert.doesNotThrow(() => JSON.stringify(config));
    const payouts = getRouletteOutcomePayouts(wager.gameNumbers, wager.amounts);
    assert.strictEqual(payouts.filter(row => row.payoutWei === 0n).length, 2);
    assert.strictEqual(payouts.filter(row => row.payoutWei === parseEther('3.075')).length, 18);
    assert.strictEqual(payouts.filter(row => row.payoutWei === parseEther('1.025')).length, 18);
  });

  it('infers purchased chips from the bet list and accepts an equal explicit count without warnings', () => {
    for (const chips of [undefined, '4']) {
      const wager = resolveRouletteWager({ wagerWei: parseEther('5'), bet: 'RED:3,BLACK:1', chips, gameEntry: rouletteEntry });
      assert.deepStrictEqual(wager.amounts, [parseEther('3.75'), parseEther('1.25')]);
      assert.strictEqual(wager.chips, '4');
      assert.strictEqual(wager.chipValue, '1.25');
      assert.deepStrictEqual(wager.warnings, []);
      assert.strictEqual(wager.unallocatedWei, 0n);
    }
  });

  it('rounds chip value down to wei and retains division dust in the wager', () => {
    const wager = resolveRouletteWager({ wagerWei: 10n, bet: 'RED:2,BLACK:1', gameEntry: rouletteEntry });
    assert.deepStrictEqual(wager.amounts, [6n, 3n]);
    assert.strictEqual(wager.unallocatedWei, 1n);
  });

  it('keeps chip counts and wei products exact above Number safe-integer precision', () => {
    const wager = resolveRouletteWager({ wagerWei: 9007199254741000n, bet: '0:9007199254740993,00:2', chips: '9007199254741000', gameEntry: rouletteEntry });
    assert.deepStrictEqual(wager.amounts, [9007199254740993n, 2n]);
    assert.strictEqual(wager.unallocatedWei, 5n);
  });

  it('rejects invalid counts, tokens, duplicate aliases, and insufficient purchased chips', () => {
    const resolve = (bet, chips = '5', total = '5') => resolveRouletteWager({ wagerWei: parseEther(total), bet, chips, gameEntry: rouletteEntry });
    for (const bet of ['RED:0', 'RED:-1', 'RED:1.5', 'RED:', 'RED:1:2', 'RED:1e2', '17oops', '17.5']) {
      assert.throws(() => resolve(bet));
    }
    for (const bet of ['RED:1,RED:2', 'FIRST_COL:1,FIRST_COLUMN:2']) assert.throws(() => resolve(bet), /Duplicate/);
    for (const value of ['0', '-1', '1e3', '1.5', '0.0001']) assert.throws(() => resolve('RED:1', value), /chips/);
    assert.throws(() => resolve('RED:3,BLACK:3'), /less than/);
    assert.strictEqual(resolve('RED:5').amounts[0], parseEther('5') - 1n);
    assert.throws(() => resolve('RED:1,BLACK:1', '3', '0.000000000000000002'), /at least 1 wei/);
    assert.strictEqual(resolve('RED:1', '2', '2').amounts[0], parseEther('1'));
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
      wager: parseEther('5'), bet: 'RED:3,BLACK:1', chips: '5',
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
