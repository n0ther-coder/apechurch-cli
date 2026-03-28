/**
 * Unit Tests: lib/status.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { VIDEO_POKER_CONTRACT } from '../../lib/stateful/video-poker/constants.js';
import {
  buildGameStatusSummary,
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
          { contract: APE_STRONG_CONTRACT, game: 'ApeStrong', pnl_ape: '1.5000' },
          { contract: APE_STRONG_CONTRACT, game: 'ApeStrong', pnl_ape: '-0.5000' },
          { contract: VIDEO_POKER_CONTRACT, game: 'Video Poker', pnl_ape: '5.0000' },
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
          unfinished_games: 2,
          unfinished_game_ids: ['88', '99'],
        },
        {
          game: 'Blackjack',
          games_played: 0,
          net_profit_ape: '0.0000',
          net_profit_complete: true,
          unfinished_games: 1,
          unfinished_game_ids: ['77'],
        },
        {
          game: 'ApeStrong',
          games_played: 2,
          net_profit_ape: '1.0000',
          net_profit_complete: true,
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
          { contract: APE_STRONG_CONTRACT, game: 'ApeStrong', pnl_ape: '1.5000' },
        ],
        activeGames: {},
      });

      assert.deepStrictEqual(summary, [
        {
          game: 'ApeStrong',
          games_played: 2,
          net_profit_ape: null,
          net_profit_complete: false,
          unfinished_games: 0,
          unfinished_game_ids: [],
        },
      ]);
    });
  });
});
