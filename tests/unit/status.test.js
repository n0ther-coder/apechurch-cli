/**
 * Unit Tests: lib/status.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JUNGLE_PLINKO_CONTRACT } from '../../lib/constants.js';
import { VIDEO_POKER_CONTRACT } from '../../lib/stateful/video-poker/constants.js';
import {
  buildGameStatusSummary,
  buildHistoryGameStatusSummary,
  resolveActiveGameName,
  resolveActiveGameResumeCommand,
  summarizeUnfinishedGames,
} from '../../lib/status.js';

const APE_STRONG_CONTRACT = '0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600';

describe('Status Helpers', () => {
  describe('resolveActiveGameName', () => {
    it('maps known stateful games to their display names', () => {
      assert.strictEqual(resolveActiveGameName('blackjack'), 'Blackjack ✔︎');
      assert.strictEqual(resolveActiveGameName('video-poker'), 'Video Poker ✔︎');
    });

    it('title-cases unknown dashed game types', () => {
      assert.strictEqual(resolveActiveGameName('monkey-match'), 'Monkey Match ✔︎');
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
          game: 'Video Poker ✔︎',
          unfinished_games: 2,
          game_ids: ['11', '12'],
          resume_command: 'apechurch-cli video-poker resume [--game <id>][--auto [best] | --solver]',
          clear_command: 'apechurch-cli video-poker clear',
        },
        {
          key: 'blackjack',
          game: 'Blackjack ✔︎',
          unfinished_games: 1,
          game_ids: ['7'],
          resume_command: 'apechurch-cli blackjack resume [--game <id>][--auto [best]]',
          clear_command: 'apechurch-cli blackjack clear',
        },
      ]);
    });

    it('uses BNF-style resume hints for known stateful games', () => {
      assert.strictEqual(
        resolveActiveGameResumeCommand('video-poker'),
        'apechurch-cli video-poker resume [--game <id>][--auto [best] | --solver]'
      );
      assert.strictEqual(
        resolveActiveGameResumeCommand('blackjack'),
        'apechurch-cli blackjack resume [--game <id>][--auto [best]]'
      );
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
          { contract: APE_STRONG_CONTRACT, game: 'ApeStrong ✔︎', pnl_ape: '1.5000', wager_ape: '1', payout_ape: '2.5', won: true, push: false, settled: true },
          { contract: APE_STRONG_CONTRACT, game: 'ApeStrong ✔︎', pnl_ape: '-0.5000', wager_ape: '1', payout_ape: '0.5', won: false, push: false, settled: true },
          { contract: VIDEO_POKER_CONTRACT, game: 'Video Poker ✔︎', pnl_ape: '5.0000', wager_ape: '10', payout_ape: '15', won: true, push: false, settled: true },
        ],
        activeGames: {
          blackjack: ['77'],
          'video-poker': ['88', '99'],
        },
      });

      assert.deepStrictEqual(summary, [
        {
          game: 'ApeStrong ✔︎',
          group_key: 'ape-strong',
          base_game_key: 'ape-strong',
          variant_label: null,
          rtp_game: 'ape-strong',
          rtp_config: null,
          games_played: 2,
          net_profit_ape: '1.0000',
          net_profit_complete: true,
          wins: 1,
          pushes: 0,
          losses: 1,
          win_rate: 50,
          rtp: 150,
          max_hit_x: 2.5,
          unfinished_games: 0,
          unfinished_game_ids: [],
        },
        {
          game: 'Blackjack ✔︎',
          group_key: 'blackjack',
          base_game_key: 'blackjack',
          variant_label: null,
          rtp_game: 'blackjack',
          rtp_config: null,
          games_played: 0,
          net_profit_ape: '0.0000',
          net_profit_complete: true,
          wins: 0,
          pushes: 0,
          losses: 0,
          win_rate: null,
          rtp: null,
          max_hit_x: null,
          unfinished_games: 1,
          unfinished_game_ids: ['77'],
        },
        {
          game: 'Video Poker ✔︎',
          group_key: 'video-poker',
          base_game_key: 'video-poker',
          variant_label: null,
          rtp_game: 'video-poker',
          rtp_config: null,
          games_played: 1,
          net_profit_ape: '5.0000',
          net_profit_complete: true,
          wins: 1,
          pushes: 0,
          losses: 0,
          win_rate: 100,
          rtp: 150,
          max_hit_x: 1.5,
          unfinished_games: 2,
          unfinished_game_ids: ['88', '99'],
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
          { contract: APE_STRONG_CONTRACT, game: 'ApeStrong ✔︎', pnl_ape: '1.5000', wager_ape: '1', payout_ape: '2.5', won: true, push: false, settled: true },
        ],
        activeGames: {},
      });

      assert.deepStrictEqual(summary, [
        {
          game: 'ApeStrong ✔︎',
          group_key: 'ape-strong',
          base_game_key: 'ape-strong',
          variant_label: null,
          rtp_game: 'ape-strong',
          rtp_config: null,
          games_played: 2,
          net_profit_ape: null,
          net_profit_complete: false,
          wins: null,
          pushes: null,
          losses: null,
          win_rate: null,
          rtp: null,
          max_hit_x: null,
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
            max_hit_x: 2,
            unsynced_games: 0,
          },
          {
            game: 'Blackjack ✔︎',
            total_saved_games: 1,
            games: 0,
            wins: 0,
            pushes: 0,
            losses: 0,
            total_wagered_ape: '0',
            total_payout_ape: '0',
            net_result_ape: '0',
            max_hit_x: null,
            unsynced_games: 1,
          },
        ],
        activeGames: {
          blackjack: ['7'],
        },
      });

      assert.deepStrictEqual(summary, [
        {
          game: 'Bear-A-Dice',
          group_key: 'bear-dice',
          base_game_key: 'bear-dice',
          variant_label: null,
          rtp_game: 'bear-dice',
          rtp_config: null,
          games_played: 3,
          net_profit_ape: '3.0000',
          net_profit_complete: true,
          wins: 2,
          pushes: 0,
          losses: 1,
          win_rate: 66.67,
          rtp: 125,
          max_hit_x: 2,
          unfinished_games: 0,
          unfinished_game_ids: [],
        },
        {
          game: 'Blackjack ✔︎',
          group_key: 'blackjack',
          base_game_key: 'blackjack',
          variant_label: null,
          rtp_game: 'blackjack',
          rtp_config: null,
          games_played: 1,
          net_profit_ape: null,
          net_profit_complete: false,
          wins: null,
          pushes: null,
          losses: null,
          win_rate: null,
          rtp: null,
          max_hit_x: null,
          unfinished_games: 1,
          unfinished_game_ids: ['7'],
        },
      ]);
    });

    it('splits history rows by recognized mode config', () => {
      const summary = buildGameStatusSummary({
        historyGames: [
          { contract: APE_STRONG_CONTRACT, gameId: '1', game: 'Keno ✔︎', game_key: 'keno', config: { picks: 4 }, variant_key: 'keno:picks:4', variant_label: 'Picks 4', rtp_game: 'keno', rtp_config: { picks: 4 } },
          { contract: APE_STRONG_CONTRACT, gameId: '2', game: 'Keno ✔︎', game_key: 'keno', config: { picks: 5 }, variant_key: 'keno:picks:5', variant_label: 'Picks 5', rtp_game: 'keno', rtp_config: { picks: 5 } },
          { contract: APE_STRONG_CONTRACT, gameId: '3', game: 'Keno ✔︎', game_key: 'keno', config: { picks: 10 }, variant_key: 'keno:picks:10', variant_label: 'Picks 10', rtp_game: 'keno', rtp_config: { picks: 10 } },
        ],
        historyEntries: [
          { contract: APE_STRONG_CONTRACT, game: 'Keno ✔︎', game_key: 'keno', config: { picks: 4 }, variant_key: 'keno:picks:4', variant_label: 'Picks 4', rtp_game: 'keno', rtp_config: { picks: 4 }, pnl_ape: '-1.0000', wager_ape: '10', payout_ape: '9', won: false, push: false, settled: true },
          { contract: APE_STRONG_CONTRACT, game: 'Keno ✔︎', game_key: 'keno', config: { picks: 5 }, variant_key: 'keno:picks:5', variant_label: 'Picks 5', rtp_game: 'keno', rtp_config: { picks: 5 }, pnl_ape: '2.0000', wager_ape: '10', payout_ape: '12', won: true, push: false, settled: true },
          { contract: APE_STRONG_CONTRACT, game: 'Keno ✔︎', game_key: 'keno', config: { picks: 10 }, variant_key: 'keno:picks:10', variant_label: 'Picks 10', rtp_game: 'keno', rtp_config: { picks: 10 }, pnl_ape: '5.0000', wager_ape: '10', payout_ape: '15', won: true, push: false, settled: true },
        ],
      });

      assert.deepStrictEqual(summary.map((entry) => ({
        game: entry.game,
        group_key: entry.group_key,
        rtp_game: entry.rtp_game,
        rtp_config: entry.rtp_config,
      })), [
        {
          game: 'Keno ✔︎ (Picks 4)',
          group_key: 'keno:picks:4',
          rtp_game: 'keno',
          rtp_config: { picks: 4 },
        },
        {
          game: 'Keno ✔︎ (Picks 5)',
          group_key: 'keno:picks:5',
          rtp_game: 'keno',
          rtp_config: { picks: 5 },
        },
        {
          game: 'Keno ✔︎ (Picks 10)',
          group_key: 'keno:picks:10',
          rtp_game: 'keno',
          rtp_config: { picks: 10 },
        },
      ]);
    });

    it('canonicalizes legacy Plinko rows to risk-only variant buckets', () => {
      const summary = buildGameStatusSummary({
        historyGames: [
          {
            contract: JUNGLE_PLINKO_CONTRACT,
            gameId: '1',
            game: 'Jungle Plinko ✔︎',
            game_key: 'jungle-plinko',
            variant_key: 'jungle-plinko:mode:0:balls:10',
            variant_label: 'Mode 0 / 10 balls',
            rtp_game: 'jungle-plinko',
          },
          {
            contract: JUNGLE_PLINKO_CONTRACT,
            gameId: '2',
            game: 'Jungle Plinko ✔︎',
            game_key: 'jungle-plinko',
            config: { mode: 0, balls: 50 },
            variant_key: 'jungle-plinko:mode:0:balls:50',
            variant_label: 'Mode 0 / 50 balls',
            rtp_game: 'jungle-plinko',
            rtp_config: { mode: 0, balls: 50 },
          },
        ],
        historyEntries: [
          {
            contract: JUNGLE_PLINKO_CONTRACT,
            game: 'Jungle Plinko ✔︎',
            game_key: 'jungle-plinko',
            config: { mode: 0, balls: 10 },
            variant_key: 'jungle-plinko:mode:0:balls:10',
            variant_label: 'Mode 0 / 10 balls',
            rtp_game: 'jungle-plinko',
            rtp_config: { mode: 0, balls: 10 },
            pnl_ape: '1.0000',
            wager_ape: '5',
            payout_ape: '6',
            won: true,
            push: false,
            settled: true,
          },
          {
            contract: JUNGLE_PLINKO_CONTRACT,
            game: 'Jungle Plinko ✔︎',
            game_key: 'jungle-plinko',
            variant_key: 'jungle-plinko:mode:0:balls:50',
            variant_label: 'Mode 0 / 50 balls',
            rtp_game: 'jungle-plinko',
            pnl_ape: '-2.0000',
            wager_ape: '5',
            payout_ape: '3',
            won: false,
            push: false,
            settled: true,
          },
        ],
      });

      assert.deepStrictEqual(summary.map((entry) => ({
        game: entry.game,
        group_key: entry.group_key,
        games_played: entry.games_played,
        rtp_config: entry.rtp_config,
      })), [
        {
          game: 'Jungle Plinko ✔︎ (Safe)',
          group_key: 'jungle-plinko:mode:0',
          games_played: 2,
          rtp_config: { mode: 0 },
        },
      ]);
    });

    it('can include catalog rows for unplayed games and modes', () => {
      const summary = buildHistoryGameStatusSummary({
        historyBreakdown: [
          {
            game: 'Keno ✔︎ (Picks 5)',
            game_key: 'keno',
            variant_key: 'keno:picks:5',
            variant_label: 'Picks 5',
            rtp_game: 'keno',
            rtp_config: { picks: 5 },
            total_saved_games: 1,
            games: 1,
            wins: 1,
            pushes: 0,
            losses: 0,
            total_wagered_ape: '10',
            total_payout_ape: '20',
            net_result_ape: '10',
            unsynced_games: 0,
          },
        ],
        includeCatalog: true,
      });

      const byGame = new Map(summary.map((entry) => [entry.game, entry]));

      assert.ok(byGame.has('ApeStrong ✔︎'));
      assert.ok(byGame.has('Keno ✔︎ (Picks 1)'));
      assert.ok(byGame.has('Keno ✔︎ (Picks 5)'));
      assert.ok(byGame.has('Primes ✔︎ (Extreme)'));
      assert.ok(byGame.has('Video Poker ✔︎ (Bet 1/5/10/25/50 APE)'));
      assert.ok(byGame.has('Video Poker ✔︎ (Bet 100 APE)'));

      assert.strictEqual(byGame.get('ApeStrong ✔︎').games_played, 0);
      assert.strictEqual(byGame.get('Keno ✔︎ (Picks 1)').games_played, 0);
      assert.strictEqual(byGame.get('Keno ✔︎ (Picks 5)').games_played, 1);
      assert.strictEqual(byGame.get('Primes ✔︎ (Extreme)').games_played, 0);
    });
  });
});
