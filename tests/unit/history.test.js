/**
 * Unit Tests: lib/history.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseEther } from 'viem';
import {
  BEAR_DICE_CONTRACT,
  BACCARAT_CONTRACT,
  BUBBLEGUM_HEIST_CONTRACT,
  COSMIC_PLINKO_CONTRACT,
  DINO_DOUGH_CONTRACT,
  GEEZ_DIGGERZ_CONTRACT,
  GIMBOZ_SMASH_CONTRACT,
  JUNGLE_PLINKO_CONTRACT,
  ROULETTE_CONTRACT,
  SUSHI_SHOWDOWN_CONTRACT,
} from '../../lib/constants.js';
import {
  buildHistoryWapeLeaderboard,
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

  describe('buildHistoryWapeLeaderboard', () => {
    it('groups wagered wAPE by UTC ISO week from newest to oldest', () => {
      const syncedAt = '2026-04-02T00:00:00.000Z';
      const mondayWeekOne = Date.UTC(2024, 0, 1, 0, 0, 0) / 1000;
      const sundayWeekOne = Date.UTC(2024, 0, 7, 23, 59, 59) / 1000;
      const mondayWeekTwo = Date.UTC(2024, 0, 8, 0, 0, 0) / 1000;
      const leaderboard = buildHistoryWapeLeaderboard({
        games: [
          {
            timestamp: sundayWeekOne * 1000,
            chain_timestamp: sundayWeekOne,
            wager_wei: parseEther('5').toString(),
            payout_wei: '0',
            wape_received_wei: '0',
            last_sync_on: syncedAt,
            last_sync_msg: 'ok',
          },
          {
            timestamp: mondayWeekTwo * 1000,
            chain_timestamp: mondayWeekTwo,
            wager_wei: parseEther('2.5').toString(),
            payout_wei: '0',
            wape_received_wei: '0',
            last_sync_on: syncedAt,
            last_sync_msg: 'ok',
          },
          {
            timestamp: mondayWeekOne * 1000,
            chain_timestamp: mondayWeekOne,
            wager_wei: parseEther('1').toString(),
            payout_wei: '0',
            wape_received_wei: '0',
            last_sync_on: syncedAt,
            last_sync_msg: 'ok',
          },
        ],
      });

      assert.strictEqual(leaderboard.total_wagered_ape, '8.5');
      assert.strictEqual(leaderboard.total_games, 3);
      assert.deepStrictEqual(
        leaderboard.weeks.map((week) => [week.year, week.week, week.wagered_ape, week.games]),
        [
          [2024, 2, '2.5', 1],
          [2024, 1, '6', 2],
        ],
      );
      assert.strictEqual(leaderboard.weeks[0].week_start_utc, '2024-01-08T00:00:00.000Z');
      assert.strictEqual(leaderboard.weeks[1].week_start_utc, '2024-01-01T00:00:00.000Z');
    });

    it('excludes unsynced and reverted games from the weekly leaderboard', () => {
      const leaderboard = buildHistoryWapeLeaderboard({
        games: [
          {
            timestamp: Date.UTC(2024, 0, 8, 12, 0, 0),
            wager_wei: parseEther('10').toString(),
            payout_wei: '0',
            wape_received_wei: parseEther('10').toString(),
            last_sync_on: '2026-04-02T00:00:00.000Z',
            last_sync_msg: 'ok',
          },
          {
            timestamp: Date.UTC(2024, 0, 8, 12, 0, 0),
            wape_received_wei: parseEther('10').toString(),
          },
          {
            timestamp: Date.UTC(2024, 0, 8, 12, 0, 0),
            wager_wei: parseEther('10').toString(),
            payout_wei: '0',
            wape_received_wei: parseEther('10').toString(),
            last_sync_on: '2026-04-02T00:00:00.000Z',
            last_sync_msg: 'execution reverted',
          },
        ],
      });

      assert.strictEqual(leaderboard.total_wagered_ape, '10');
      assert.strictEqual(leaderboard.total_games, 1);
      assert.strictEqual(leaderboard.weeks.length, 1);
      assert.strictEqual(leaderboard.weeks[0].wagered_ape, '10');
    });
  });

  describe('resolveHistoryGameName', () => {
    it('resolves stateful video poker contract names', () => {
      assert.strictEqual(resolveHistoryGameName(VIDEO_POKER_CONTRACT), 'Video Poker ✔︎');
    });

    it('falls back to registered standard game names', () => {
      assert.strictEqual(
        resolveHistoryGameName('0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600'),
        'ApeStrong ✔︎'
      );
    });

    it('adds the ABI verified badge for verified simple-game contracts', () => {
      assert.strictEqual(resolveHistoryGameName(DINO_DOUGH_CONTRACT), 'Dino Dough ✔︎');
      assert.strictEqual(resolveHistoryGameName(BUBBLEGUM_HEIST_CONTRACT), 'Bubblegum Heist ✔︎');
      assert.strictEqual(resolveHistoryGameName(GEEZ_DIGGERZ_CONTRACT), 'Geez Diggerz ✔︎');
      assert.strictEqual(resolveHistoryGameName(GIMBOZ_SMASH_CONTRACT), 'Gimboz Smash ✔︎');
      assert.strictEqual(resolveHistoryGameName(SUSHI_SHOWDOWN_CONTRACT), 'Sushi Showdown ✔︎');
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
      assert.strictEqual(entries[0].game, 'ApeStrong ✔︎');
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
      assert.strictEqual(entries[1].game, 'ApeStrong ✔︎');
      assert.strictEqual(entries[1].gp_received_display, '5');
      assert.ok(entries[0].timestamp > entries[1].timestamp, 'Combined results should be sorted by saved timestamp');
    });
  });
});
