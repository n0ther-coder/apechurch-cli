/**
 * Unit Tests: lib/status.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { VIDEO_POKER_CONTRACT } from '../../lib/stateful/video-poker/constants.js';
import {
  buildGameStatusSummary,
  buildHistoryGameStatusSummary,
  resolveActiveGameName,
  summarizeUnfinishedGames,
} from '../../lib/status.js';

const APE_STRONG_CONTRACT = '0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600';

describe('Status Helpers', () => {
  describe('resolveActiveGameName', () => {
    it('maps known stateful games to their display names', () => {
      assert.strictEqual(resolveActiveGameName('blackjack'), 'Blackjack');
      assert.strictEqual(resolveActiveGameName('video-poker'), 'Video Poker');
    });

    it('title-cases unknown dashed game types', () => {
      assert.strictEqual(resolveActiveGameName('monkey-match'), 'Monkey Match');
    });
  });

  describe('summarizeUnfinishedGames', () => {
    it('returns sorted unfinished summaries and ignores empty lists', () => {
      const summaries = summarizeUnfinishedGames({
        blackjack: ['7'],
        'video-poker': ['11', '12'],
        empty: [],
      });

      assert.deepStrictEqual(summaries, [
        {
          key: 'video-poker',
          game: 'Video Poker',
          unfinished_games: 2,
          game_ids: ['11', '12'],
        },
        {
          key: 'blackjack',
          game: 'Blackjack',
          unfinished_games: 1,
          game_ids: ['7'],
        },
      ]);
    });
  });

  describe('buildGameStatusSummary', () => {
    it('combines completed history with unfinished counts', () => {
      const summary = buildGameStatusSummary({
        historyGames: [
          { contract: APE_STRONG_CONTRACT, gameId: '1' },
          { contract: APE_STRONG_CONTRACT, gameId: '2' },
          { contract: VIDEO_POKER_CONTRACT, gameId: '3' },
        ],
        historyEntries: [
          { contract: APE_STRONG_CONTRACT, game: 'ApeStrong', pnl_ape: '1.5000', wager_ape: '1', payout_ape: '2.5', won: true, push: false, settled: true },
          { contract: APE_STRONG_CONTRACT, game: 'ApeStrong', pnl_ape: '-0.5000', wager_ape: '1', payout_ape: '0.5', won: false, push: false, settled: true },
          { contract: VIDEO_POKER_CONTRACT, game: 'Video Poker', pnl_ape: '5.0000', wager_ape: '10', payout_ape: '15', won: true, push: false, settled: true },
        ],
        activeGames: {
          blackjack: ['77'],
          'video-poker': ['88', '99'],
        },
      });

      assert.deepStrictEqual(summary, [
        {
          game: 'Video Poker',
          games_played: 1,
          net_profit_ape: '5.0000',
          net_profit_complete: true,
          wins: 1,
          pushes: 0,
          losses: 0,
          win_rate: 100,
          rtp: 150,
          unfinished_games: 2,
          unfinished_game_ids: ['88', '99'],
        },
        {
          game: 'Blackjack',
          games_played: 0,
          net_profit_ape: '0.0000',
          net_profit_complete: true,
          wins: 0,
          pushes: 0,
          losses: 0,
          win_rate: null,
          rtp: null,
          unfinished_games: 1,
          unfinished_game_ids: ['77'],
        },
        {
          game: 'ApeStrong',
          games_played: 2,
          net_profit_ape: '1.0000',
          net_profit_complete: true,
          wins: 1,
          pushes: 0,
          losses: 1,
          win_rate: 50,
          rtp: 150,
          unfinished_games: 0,
          unfinished_game_ids: [],
        },
      ]);
    });

    it('marks net profit unavailable when on-chain history is incomplete', () => {
      const summary = buildGameStatusSummary({
        historyGames: [
          { contract: APE_STRONG_CONTRACT, gameId: '1' },
          { contract: APE_STRONG_CONTRACT, gameId: '2' },
        ],
        historyEntries: [
          { contract: APE_STRONG_CONTRACT, game: 'ApeStrong', pnl_ape: '1.5000', wager_ape: '1', payout_ape: '2.5', won: true, push: false, settled: true },
        ],
        activeGames: {},
      });

      assert.deepStrictEqual(summary, [
        {
          game: 'ApeStrong',
          games_played: 2,
          net_profit_ape: null,
          net_profit_complete: false,
          wins: null,
          pushes: null,
          losses: null,
          win_rate: null,
          rtp: null,
          unfinished_games: 0,
          unfinished_game_ids: [],
        },
      ]);
    });

    it('builds the same compact game-status shape from history breakdown stats', () => {
      const summary = buildHistoryGameStatusSummary({
        historyBreakdown: [
          {
            game: 'Bear-A-Dice',
            total_saved_games: 3,
            games: 3,
            wins: 2,
            pushes: 0,
            losses: 1,
            total_wagered_ape: '12',
            total_payout_ape: '15',
            net_result_ape: '3',
            unsynced_games: 0,
          },
          {
            game: 'Blackjack',
            total_saved_games: 1,
            games: 0,
            wins: 0,
            pushes: 0,
            losses: 0,
            total_wagered_ape: '0',
            total_payout_ape: '0',
            net_result_ape: '0',
            unsynced_games: 1,
          },
        ],
        activeGames: {
          blackjack: ['7'],
        },
      });

      assert.deepStrictEqual(summary, [
        {
          game: 'Blackjack',
          games_played: 1,
          net_profit_ape: null,
          net_profit_complete: false,
          wins: null,
          pushes: null,
          losses: null,
          win_rate: null,
          rtp: null,
          unfinished_games: 1,
          unfinished_game_ids: ['7'],
        },
        {
          game: 'Bear-A-Dice',
          games_played: 3,
          net_profit_ape: '3.0000',
          net_profit_complete: true,
          wins: 2,
          pushes: 0,
          losses: 1,
          win_rate: 66.67,
          rtp: 125,
          unfinished_games: 0,
          unfinished_game_ids: [],
        },
      ]);
    });
  });
});
