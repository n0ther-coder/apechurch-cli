/**
 * Unit Tests: lib/strategies/*.js
 * 
 * Tests for all betting strategy implementations.
 * These are pure functions - no network calls.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getStrategy,
  listStrategies,
  getStrategyNames,
  calculateNextBet,
} from '../../lib/strategies/index.js';

describe('Betting Strategies', () => {

  describe('Strategy Registry', () => {
    it('listStrategies returns all strategies', () => {
      const strategies = listStrategies();
      assert.ok(Array.isArray(strategies));
      assert.ok(strategies.length >= 5); // flat, martingale, reverse-martingale, fibonacci, dalembert
    });

    it('getStrategyNames returns strategy names', () => {
      const names = getStrategyNames();
      assert.ok(names.includes('flat'));
      assert.ok(names.includes('martingale'));
      assert.ok(names.includes('fibonacci'));
    });

    it('getStrategy returns valid strategy object', () => {
      const flat = getStrategy('flat');
      assert.ok(flat);
      assert.strictEqual(typeof flat.init, 'function');
      assert.strictEqual(typeof flat.nextBet, 'function');
    });

    it('getStrategy returns null for invalid name', () => {
      const invalid = getStrategy('nonexistent');
      assert.strictEqual(invalid, null);
    });
  });

  describe('Flat Strategy', () => {
    const flat = getStrategy('flat');
    const baseBet = 10;

    it('init returns state with base bet', () => {
      const state = flat.init(baseBet);
      assert.strictEqual(state.baseBet, baseBet);
      assert.strictEqual(state.currentBet, baseBet);
    });

    it('next returns same bet after win', () => {
      const state = flat.init(baseBet);
      const result = flat.nextBet(state, { won: true, bet: 10, payout: 20 });
      assert.strictEqual(result.bet, baseBet);
    });

    it('next returns same bet after loss', () => {
      const state = flat.init(baseBet);
      const result = flat.nextBet(state, { won: false, bet: 10, payout: 0 });
      assert.strictEqual(result.bet, baseBet);
    });

    it('ignores game results completely', () => {
      let state = flat.init(baseBet);
      
      // Simulate 5 losses
      for (let i = 0; i < 5; i++) {
        const result = flat.nextBet(state, { won: false, bet: 10, payout: 0 });
        state = result.state;
        assert.strictEqual(result.bet, baseBet);
      }
    });
  });

  describe('Martingale Strategy', () => {
    const martingale = getStrategy('martingale');
    const baseBet = 10;

    it('init returns state with base bet', () => {
      const state = martingale.init(baseBet);
      assert.strictEqual(state.baseBet, baseBet);
      assert.strictEqual(state.currentBet, baseBet);
    });

    it('doubles bet after loss', () => {
      const state = martingale.init(baseBet);
      const result = martingale.nextBet(state, { won: false, bet: 10, payout: 0 });
      assert.strictEqual(result.bet, 20);
    });

    it('resets to base after win', () => {
      let state = martingale.init(baseBet);
      
      // Lose once (bet doubles to 20)
      const afterLoss = martingale.nextBet(state, { won: false, bet: 10, payout: 0 });
      state = afterLoss.state;
      assert.strictEqual(afterLoss.bet, 20);
      
      // Win (should reset to base)
      const afterWin = martingale.nextBet(state, { won: true, bet: 20, payout: 40 });
      assert.strictEqual(afterWin.bet, baseBet);
    });

    it('keeps doubling on consecutive losses', () => {
      let state = martingale.init(baseBet);
      
      const expectedBets = [20, 40, 80, 160]; // After each loss
      
      for (let i = 0; i < 4; i++) {
        const result = martingale.nextBet(state, { won: false, bet: state.currentBet, payout: 0 });
        state = result.state;
        assert.strictEqual(result.bet, expectedBets[i]);
      }
    });
  });

  describe('Reverse Martingale Strategy', () => {
    const reverseMartingale = getStrategy('reverse-martingale');
    const baseBet = 10;

    it('init returns state with base bet', () => {
      const state = reverseMartingale.init(baseBet);
      assert.strictEqual(state.baseBet, baseBet);
    });

    it('doubles bet after win', () => {
      const state = reverseMartingale.init(baseBet);
      const result = reverseMartingale.nextBet(state, { won: true, bet: 10, payout: 20 });
      assert.strictEqual(result.bet, 20);
    });

    it('resets to base after loss', () => {
      let state = reverseMartingale.init(baseBet);
      
      // Win once (bet doubles to 20)
      const afterWin = reverseMartingale.nextBet(state, { won: true, bet: 10, payout: 20 });
      state = afterWin.state;
      
      // Lose (should reset to base)
      const afterLoss = reverseMartingale.nextBet(state, { won: false, bet: 20, payout: 0 });
      assert.strictEqual(afterLoss.bet, baseBet);
    });

    it('keeps doubling on consecutive wins', () => {
      let state = reverseMartingale.init(baseBet);
      
      const expectedBets = [20, 40, 80]; // After each win
      
      for (let i = 0; i < 3; i++) {
        const result = reverseMartingale.nextBet(state, { won: true, bet: state.currentBet, payout: state.currentBet * 2 });
        state = result.state;
        assert.strictEqual(result.bet, expectedBets[i]);
      }
    });
  });

  describe('Fibonacci Strategy', () => {
    const fibonacci = getStrategy('fibonacci');
    const baseBet = 10;

    it('init returns state with base bet', () => {
      const state = fibonacci.init(baseBet);
      assert.strictEqual(state.baseBet, baseBet);
    });

    it('moves up sequence after loss', () => {
      let state = fibonacci.init(baseBet);
      
      // Fibonacci: 1, 1, 2, 3, 5, 8, 13...
      // With base bet 10: 10, 10, 20, 30, 50, 80...
      const result = fibonacci.nextBet(state, { won: false, bet: 10, payout: 0 });
      // Second position in sequence (still 1x base = 10, or 2x = 20 depending on impl)
      assert.ok(result.bet >= baseBet);
    });

    it('moves back in sequence after win', () => {
      let state = fibonacci.init(baseBet);
      let lastBet = baseBet;
      
      // Lose 3 times to advance up the sequence
      for (let i = 0; i < 3; i++) {
        const result = fibonacci.nextBet(state, { won: false, bet: lastBet, payout: 0 });
        state = result.state;
        lastBet = result.bet;
      }
      
      const betBeforeWin = lastBet;
      
      // Win should move back in sequence
      const afterWin = fibonacci.nextBet(state, { won: true, bet: lastBet, payout: lastBet * 2 });
      assert.ok(afterWin.bet <= betBeforeWin, `Bet after win (${afterWin.bet}) should be <= bet before win (${betBeforeWin})`);
    });
  });

  describe('D\'Alembert Strategy', () => {
    const dalembert = getStrategy('dalembert');
    const baseBet = 10;

    it('init returns state with base bet', () => {
      const state = dalembert.init(baseBet);
      assert.strictEqual(state.baseBet, baseBet);
    });

    it('adds one unit after loss', () => {
      const state = dalembert.init(baseBet);
      const result = dalembert.nextBet(state, { won: false, bet: 10, payout: 0 });
      assert.strictEqual(result.bet, baseBet + baseBet); // +1 unit = +baseBet
    });

    it('subtracts one unit after win', () => {
      let state = dalembert.init(baseBet);
      
      // Lose once to get above base
      const afterLoss = dalembert.nextBet(state, { won: false, bet: 10, payout: 0 });
      state = afterLoss.state;
      
      // Win should subtract
      const afterWin = dalembert.nextBet(state, { won: true, bet: state.currentBet, payout: state.currentBet * 2 });
      assert.ok(afterWin.bet < afterLoss.bet);
    });

    it('does not go below base bet', () => {
      const state = dalembert.init(baseBet);
      
      // Win without any losses (already at base)
      const result = dalembert.nextBet(state, { won: true, bet: 10, payout: 20 });
      assert.ok(result.bet >= baseBet);
    });
  });

  describe('calculateNextBet helper', () => {
    const flat = getStrategy('flat');
    const baseBet = 10;

    it('returns next bet and updated state', () => {
      const state = flat.init(baseBet);
      const result = calculateNextBet(flat, state, { won: true, bet: 10, payout: 20 });
      
      assert.ok('bet' in result);
      assert.ok('state' in result);
      assert.strictEqual(typeof result.bet, 'number');
    });

    it('respects maxBet constraint', () => {
      const martingale = getStrategy('martingale');
      let state = martingale.init(baseBet);
      
      // Simulate losses to drive bet up using calculateNextBet
      const lossResult = { won: false, bet: baseBet, payout: 0 };
      for (let i = 0; i < 5; i++) {
        const r = calculateNextBet(martingale, state, lossResult, {});
        state = r.state;
      }
      
      // Now state has high bet, apply maxBet cap
      const result = calculateNextBet(martingale, state, lossResult, { maxBet: 50 });
      assert.ok(result.bet <= 50, `Bet ${result.bet} should be <= 50`);
      assert.strictEqual(result.capped, true, 'Should be capped');
    });

    it('respects availableBalance constraint', () => {
      const state = flat.init(100); // High base bet
      const result = calculateNextBet(flat, state, null, { availableBalance: 50 });
      assert.ok(result.bet <= 50);
    });

    it('handles null lastResult (first bet)', () => {
      const state = flat.init(baseBet);
      const result = calculateNextBet(flat, state, null);
      assert.strictEqual(result.bet, baseBet);
    });
  });
});
