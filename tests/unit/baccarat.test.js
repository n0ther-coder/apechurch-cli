/**
 * Unit Tests: lib/games/baccarat.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseEther } from 'viem';
import { getBaccaratWagerLimits, parseBaccaratBet, playBaccarat } from '../../lib/games/baccarat.js';

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

  it('scales the lanes in wei and assigns rounding dust by remainder', () => {
    assert.deepStrictEqual(parseBaccaratBet('42 BANKER 10 TIE', parseEther('50')), {
      playerBankerBet: parseEther('40.384615384615384615'),
      tieBet: parseEther('9.615384615384615385'),
      isBanker: true,
    });
    assert.deepStrictEqual(parseBaccaratBet('1 TIE 1 PLAYER', 3n), {
      playerBankerBet: 2n,
      tieBet: 1n,
      isBanker: false,
    });
    assert.throws(() => parseBaccaratBet('1 BANKER 1 TIE', 1n), /TIE allocation is 0 wei/);
    assert.throws(() => parseBaccaratBet('1 BANKER 999 TIE', 2n), /BANKER allocation is 0 wei/);
  });

  it('reads the tracker minimum and rejects a smaller wager before preparing a transaction', async () => {
    const contract = '0x0000000000000000000000000000000000000001';
    const manager = '0x0000000000000000000000000000000000000002';
    const tracker = '0x0000000000000000000000000000000000000003';
    const publicClient = {
      async readContract({ address, functionName, args }) {
        switch (functionName) {
          case 'GAME_ID': assert.equal(address, contract); return 6n;
          case 'manager': assert.equal(address, contract); return manager;
          case 'userInfoTracker': assert.equal(address, manager); return tracker;
          case 'getMinBetAmountForGame':
            assert.equal(address, tracker);
            assert.deepStrictEqual(args, [6n]);
            return parseEther('0.5');
          default: throw new Error(`Unexpected read: ${functionName}`);
        }
      },
    };
    assert.deepStrictEqual(await getBaccaratWagerLimits(publicClient, contract), {
      contractMinWagerWei: '1',
      minSelectedLegWei: '1',
      minWagerWei: '500000000000000000',
      minWagerApe: '0.5',
    });
    await assert.rejects(playBaccarat({
      publicClient, gameEntry: { contract }, bet: '35 BANKER 5 TIE', wager: parseEther('0.499'),
    }), /below the on-chain minimum of 0.5 APE/);
  });

  it('rejects combo bets that mix player and banker sides', () => {
    assert.throws(
      () => parseBaccaratBet('100 PLAYER 50 BANKER', parseEther('150')),
      /Cannot specify (PLAYER|BANKER) amount twice|both PLAYER and BANKER/
    );
  });
});
