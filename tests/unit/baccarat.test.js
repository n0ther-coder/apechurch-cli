/**
 * Unit Tests: lib/games/baccarat.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseEther } from 'viem';
import { parseBaccaratBet } from '../../lib/games/baccarat.js';

describe('Baccarat Helpers', () => {
  it('maps simple bets to the verified on-chain tuple fields', () => {
    assert.deepStrictEqual(
      parseBaccaratBet('PLAYER', parseEther('10')),
      {
        playerBankerBet: parseEther('10'),
        tieBet: 0n,
        isBanker: false,
      }
    );

    assert.deepStrictEqual(
      parseBaccaratBet('BANKER', parseEther('10')),
      {
        playerBankerBet: parseEther('10'),
        tieBet: 0n,
        isBanker: true,
      }
    );

    assert.deepStrictEqual(
      parseBaccaratBet('TIE', parseEther('10')),
      {
        playerBankerBet: 0n,
        tieBet: parseEther('10'),
        isBanker: false,
      }
    );
  });

  it('parses documented combo bets into the verified main-plus-tie layout', () => {
    assert.deepStrictEqual(
      parseBaccaratBet('140 BANKER 10 TIE', parseEther('150')),
      {
        playerBankerBet: parseEther('140'),
        tieBet: parseEther('10'),
        isBanker: true,
      }
    );
  });

  it('rejects combo bets that mix player and banker sides', () => {
    assert.throws(
      () => parseBaccaratBet('100 PLAYER 50 BANKER', parseEther('150')),
      /Cannot specify (PLAYER|BANKER) amount twice|both PLAYER and BANKER/
    );
  });
});
