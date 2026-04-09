/**
 * Unit Tests: lib/history.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseEther } from 'viem';
import {
  BEAR_DICE_CONTRACT,
  BACCARAT_CONTRACT,
  COSMIC_PLINKO_CONTRACT,
  JUNGLE_PLINKO_CONTRACT,
  ROULETTE_CONTRACT,
} from '../../lib/constants.js';
import {
  fetchSavedHistoryEntries,
  fetchHistoryEntriesForContract,
  resolveHistoryGameName,
  selectHistoryGames,
} from '../../lib/history.js';
import { VIDEO_POKER_CONTRACT } from '../../lib/stateful/video-poker/constants.js';

describe('History Helpers', () => {
  describe('selectHistoryGames', () => {
    it('respects limit by default', () => {
      const games = [{ id: 1 }, { id: 2 }, { id: 3 }];
      assert.deepStrictEqual(selectHistoryGames(games, { limit: 2 }), [{ id: 1 }, { id: 2 }]);
    });

    it('returns all games when --all is requested', () => {
      const games = [{ id: 1 }, { id: 2 }, { id: 3 }];
      assert.deepStrictEqual(selectHistoryGames(games, { limit: 1, all: true }), games);
    });
  });

  describe('resolveHistoryGameName', () => {
    it('resolves stateful video poker contract names', () => {
      assert.strictEqual(resolveHistoryGameName(VIDEO_POKER_CONTRACT), 'Video Poker ✔︎');
    });

    it('falls back to registered standard game names', () => {
      assert.strictEqual(
        resolveHistoryGameName('0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600'),
        'ApeStrong'
      );
    });

    it('adds the ABI verified badge for verified Plinko, Roulette, Baccarat, and Bear-A-Dice contracts', () => {
      assert.strictEqual(resolveHistoryGameName(BEAR_DICE_CONTRACT), 'Bear-A-Dice ✔︎');
      assert.strictEqual(resolveHistoryGameName(BACCARAT_CONTRACT), 'Baccarat ✔︎');
      assert.strictEqual(resolveHistoryGameName(JUNGLE_PLINKO_CONTRACT), 'Jungle Plinko ✔︎');
      assert.strictEqual(resolveHistoryGameName(COSMIC_PLINKO_CONTRACT), 'Cosmic Plinko ✔︎');
      assert.strictEqual(resolveHistoryGameName(ROULETTE_CONTRACT), 'Roulette ✔︎');
    });
  });

  describe('fetchHistoryEntriesForContract', () => {
    it('reads standard games via getEssentialGameInfo', async () => {
      const calls = [];
      const publicClient = {
        async readContract(params) {
          calls.push(params);
          return [
            ['0x1111111111111111111111111111111111111111'],
            [parseEther('1')],
            [parseEther('2.5')],
            [1234n],
            [true],
          ];
        },
      };

      const { entries, failedFetches } = await fetchHistoryEntriesForContract(publicClient, '0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600', [
        { gameId: '42', timestamp: 1000 },
      ]);

      assert.strictEqual(calls[0].functionName, 'getEssentialGameInfo');
      assert.strictEqual(failedFetches, 0);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].game, 'ApeStrong');
      assert.strictEqual(entries[0].wager_ape, '1');
      assert.strictEqual(entries[0].payout_ape, '2.5');
      assert.strictEqual(entries[0].pnl_ape, '1.5');
      assert.strictEqual(entries[0].won, true);
    });

    it('reads video poker history via getGameInfo', async () => {
      const calls = [];
      const publicClient = {
        async readContract(params) {
          calls.push(params);
          return {
            player: '0x2222222222222222222222222222222222222222',
            betAmount: parseEther('25'),
            totalPayout: parseEther('45'),
            gameState: 3,
            timestamp: 4567n,
          };
        },
      };

      const { entries, failedFetches } = await fetchHistoryEntriesForContract(publicClient, VIDEO_POKER_CONTRACT, [
        { gameId: '99', timestamp: 2000 },
      ]);

      assert.strictEqual(calls[0].functionName, 'getGameInfo');
      assert.strictEqual(failedFetches, 0);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].game, 'Video Poker ✔︎');
      assert.strictEqual(entries[0].wager_ape, '25');
      assert.strictEqual(entries[0].payout_ape, '45');
      assert.strictEqual(entries[0].pnl_ape, '20');
      assert.strictEqual(entries[0].settled, true);
    });
  });

  describe('fetchSavedHistoryEntries', () => {
    it('groups saved games by contract and sorts combined results', async () => {
      const calls = [];
      const publicClient = {
        async readContract(params) {
          calls.push(params);

          if (params.address === VIDEO_POKER_CONTRACT) {
            return {
              player: '0x2222222222222222222222222222222222222222',
              betAmount: parseEther('25'),
              totalPayout: parseEther('45'),
              gameState: 3,
              timestamp: 9999n,
            };
          }

          return [
            ['0x1111111111111111111111111111111111111111'],
            [parseEther('1')],
            [parseEther('2.5')],
            [1234n],
            [true],
          ];
        },
      };

      const { entries, failedFetches } = await fetchSavedHistoryEntries(publicClient, [
        { contract: '0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600', gameId: '42', timestamp: 1000, gp_received_raw: '5' },
        { contract: VIDEO_POKER_CONTRACT, gameId: '99', timestamp: 2000 },
      ]);

      assert.strictEqual(calls.length, 2);
      assert.strictEqual(failedFetches, 0);
      assert.strictEqual(entries.length, 2);
      assert.strictEqual(entries[0].game, 'Video Poker ✔︎');
      assert.strictEqual(entries[0].gp_received_display, null);
      assert.strictEqual(entries[1].game, 'ApeStrong');
      assert.strictEqual(entries[1].gp_received_display, '5');
      assert.ok(entries[0].timestamp > entries[1].timestamp, 'Combined results should be sorted by saved timestamp');
    });
  });
});
