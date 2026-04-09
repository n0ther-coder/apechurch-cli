/**
 * Unit Tests: lib/games/roulette.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseEther } from 'viem';
import { resolveGame } from '../../registry.js';
import {
  calculateRouletteBetAmounts,
  parseRouletteBets,
} from '../../lib/games/roulette.js';

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
});
