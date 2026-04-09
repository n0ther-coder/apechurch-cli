/**
 * Unit Tests: lib/wallet-analysis.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseEther } from 'viem';
import { JUNGLE_PLINKO_CONTRACT } from '../../lib/constants.js';
import {
  analyzeWalletHistory,
  diagnoseUnsyncedSupportedGames,
  mergeDownloadedHistoryGames,
  syncSavedStatefulHistoryGames,
  summarizeHistoryGames,
  summarizeHistoryGamesByGame,
} from '../../lib/wallet-analysis.js';
import { BLACKJACK_CONTRACT } from '../../lib/stateful/blackjack/constants.js';
import { VIDEO_POKER_CONTRACT } from '../../lib/stateful/video-poker/constants.js';

const WALLET = '0x1111111111111111111111111111111111111111';
const SPONSOR = '0x2222222222222222222222222222222222222222';
const APESTRONG = '0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600';
const ROULETTE = '0x1f48A104C1808eb4107f3999999D36aeafEC56d5';

describe('Wallet History Analysis', () => {
  describe('summarizeHistoryGames', () => {
    it('aggregates synced history stats and excludes unsynced saved games', () => {
      const summary = summarizeHistoryGames({
        wallet: WALLET,
        last_synced_block: '100',
        last_download_on: '2026-03-29T12:00:00.000Z',
        games: [
          {
            contract: APESTRONG,
            gameId: '1',
            timestamp: 1_700_000_000_000,
            last_sync_on: '2026-03-29T12:00:00.000Z',
            wager_wei: parseEther('10').toString(),
            payout_wei: parseEther('20').toString(),
            contract_fee_wei: parseEther('1').toString(),
            gas_fee_wei: parseEther('0.5').toString(),
            gp_received_raw: '25',
            wape_received_wei: parseEther('10').toString(),
            won: true,
            push: false,
          },
          {
            contract: ROULETTE,
            gameId: '2',
            timestamp: 1_700_000_100_000,
            last_sync_on: '2026-03-29T12:00:00.000Z',
            wager_wei: parseEther('5').toString(),
            payout_wei: parseEther('5').toString(),
            contract_fee_wei: '0',
            gas_fee_wei: parseEther('0.5').toString(),
            gp_received_raw: '5',
            wape_received_wei: parseEther('5').toString(),
            won: false,
            push: true,
          },
          {
            contract: VIDEO_POKER_CONTRACT,
            gameId: '3',
            timestamp: 1_700_000_200_000,
            last_sync_on: null,
            last_sync_msg: null,
          },
        ],
      }, {
        current_gp_balance_raw: '42',
        current_gp_balance_display: '42',
        current_wape_balance_wei: parseEther('3').toString(),
        current_wape_balance_ape: '3',
      });

      assert.strictEqual(summary.total_saved_games, 3);
      assert.strictEqual(summary.games, 2);
      assert.strictEqual(summary.unsynced_games, 1);
      assert.strictEqual(summary.wins, 1);
      assert.strictEqual(summary.pushes, 1);
      assert.strictEqual(summary.losses, 0);
      assert.strictEqual(summary.total_wagered_ape, '15');
      assert.strictEqual(summary.total_payout_ape, '25');
      assert.strictEqual(summary.contract_fees_paid_ape, '1');
      assert.strictEqual(summary.gas_paid_ape, '1');
      assert.strictEqual(summary.gross_result_ape, '10');
      assert.strictEqual(summary.net_result_ape, '8');
      assert.strictEqual(summary.win_rate, 50.0);
      assert.strictEqual(summary.rtp, 166.7);
      assert.strictEqual(summary.max_hit_x, 2);
      assert.strictEqual(summary.total_gp_received_display, '30');
      assert.strictEqual(summary.total_wape_received_ape, '15');
      assert.strictEqual(summary.current_gp_balance_display, '42');
      assert.strictEqual(summary.current_wape_balance_ape, '3');
    });

    it('groups synced history stats by game and keeps unsupported entries as unsynced', () => {
      const breakdown = summarizeHistoryGamesByGame({
        wallet: WALLET,
        last_synced_block: '100',
        last_download_on: '2026-03-29T12:00:00.000Z',
        games: [
          {
            contract: APESTRONG,
            game: 'ApeStrong',
            game_key: 'ape-strong',
            gameId: '1',
            timestamp: 1_700_000_000_000,
            last_sync_on: '2026-03-29T12:00:00.000Z',
            wager_wei: parseEther('10').toString(),
            payout_wei: parseEther('20').toString(),
            contract_fee_wei: parseEther('1').toString(),
            gas_fee_wei: parseEther('0.5').toString(),
            gp_received_raw: '25',
            wape_received_wei: parseEther('10').toString(),
            won: true,
            push: false,
          },
          {
            contract: APESTRONG,
            game: 'ApeStrong',
            game_key: 'ape-strong',
            gameId: '2',
            timestamp: 1_700_000_050_000,
            last_sync_on: '2026-03-29T12:00:00.000Z',
            wager_wei: parseEther('3').toString(),
            payout_wei: '0',
            contract_fee_wei: parseEther('0.3').toString(),
            gas_fee_wei: parseEther('0.2').toString(),
            gp_received_raw: '3',
            wape_received_wei: parseEther('3').toString(),
            won: false,
            push: false,
          },
          {
            contract: ROULETTE,
            game: 'Roulette',
            game_key: 'roulette',
            gameId: '3',
            timestamp: 1_700_000_100_000,
            last_sync_on: '2026-03-29T12:00:00.000Z',
            wager_wei: parseEther('5').toString(),
            payout_wei: parseEther('5').toString(),
            contract_fee_wei: '0',
            gas_fee_wei: parseEther('0.5').toString(),
            gp_received_raw: '5',
            wape_received_wei: parseEther('5').toString(),
            won: false,
            push: true,
          },
          {
            contract: VIDEO_POKER_CONTRACT,
            game: 'Blackjack',
            game_key: 'blackjack',
            gameId: '4',
            timestamp: 1_700_000_200_000,
            last_sync_on: null,
            last_sync_msg: null,
          },
        ],
      });

      assert.strictEqual(breakdown.length, 3);

      const apeStrong = breakdown.find((entry) => entry.game_key === 'ape-strong');
      const roulette = breakdown.find((entry) => entry.game_key === 'roulette');
      const blackjack = breakdown.find((entry) => entry.game_key === 'blackjack');

      assert.ok(apeStrong);
      assert.ok(roulette);
      assert.ok(blackjack);

      assert.strictEqual(apeStrong.wallet, WALLET);
      assert.strictEqual(apeStrong.total_saved_games, 2);
      assert.strictEqual(apeStrong.games, 2);
      assert.strictEqual(apeStrong.wins, 1);
      assert.strictEqual(apeStrong.losses, 1);
      assert.strictEqual(apeStrong.total_wagered_ape, '13');
      assert.strictEqual(apeStrong.total_payout_ape, '20');
      assert.strictEqual(apeStrong.max_hit_x, 2);
      assert.strictEqual(apeStrong.contract_fees_paid_ape, '1.3');
      assert.strictEqual(apeStrong.gas_paid_ape, '0.7');
      assert.strictEqual(apeStrong.total_gp_received_display, '28');
      assert.strictEqual(apeStrong.total_wape_received_ape, '13');

      assert.strictEqual(roulette.total_saved_games, 1);
      assert.strictEqual(roulette.games, 1);
      assert.strictEqual(roulette.pushes, 1);
      assert.strictEqual(roulette.total_wagered_ape, '5');
      assert.strictEqual(roulette.total_payout_ape, '5');
      assert.strictEqual(roulette.max_hit_x, 1);

      assert.strictEqual(blackjack.total_saved_games, 1);
      assert.strictEqual(blackjack.games, 0);
      assert.strictEqual(blackjack.unsynced_games, 1);
      assert.strictEqual(blackjack.total_wagered_ape, '0');
      assert.strictEqual(blackjack.max_hit_x, null);
      assert.strictEqual(blackjack.total_gp_received_display, '0');
    });

    it('groups synced history stats by saved variant key when available', () => {
      const breakdown = summarizeHistoryGamesByGame({
        wallet: WALLET,
        last_synced_block: '100',
        last_download_on: '2026-03-29T12:00:00.000Z',
        games: [
          {
            contract: APESTRONG,
            game: 'Keno ✔︎',
            game_key: 'keno',
            variant_key: 'keno:picks:4',
            variant_label: 'Picks 4',
            rtp_game: 'keno',
            rtp_config: { picks: 4 },
            gameId: '1',
            timestamp: 1_700_000_000_000,
            last_sync_on: '2026-03-29T12:00:00.000Z',
            wager_wei: parseEther('10').toString(),
            payout_wei: parseEther('9').toString(),
            contract_fee_wei: '0',
            gas_fee_wei: '0',
            gp_received_raw: '10',
            wape_received_wei: parseEther('10').toString(),
            won: false,
            push: false,
          },
          {
            contract: APESTRONG,
            game: 'Keno ✔︎',
            game_key: 'keno',
            variant_key: 'keno:picks:5',
            variant_label: 'Picks 5',
            rtp_game: 'keno',
            rtp_config: { picks: 5 },
            gameId: '2',
            timestamp: 1_700_000_050_000,
            last_sync_on: '2026-03-29T12:00:00.000Z',
            wager_wei: parseEther('10').toString(),
            payout_wei: parseEther('12').toString(),
            contract_fee_wei: '0',
            gas_fee_wei: '0',
            gp_received_raw: '10',
            wape_received_wei: parseEther('10').toString(),
            won: true,
            push: false,
          },
        ],
      });

      assert.deepStrictEqual(breakdown.map((entry) => ({
        game: entry.game,
        variant_key: entry.variant_key,
        rtp_config: entry.rtp_config,
        max_hit_x: entry.max_hit_x,
      })), [
        {
          game: 'Keno ✔︎ (Picks 4)',
          variant_key: 'keno:picks:4',
          rtp_config: { picks: 4 },
          max_hit_x: 0.9,
        },
        {
          game: 'Keno ✔︎ (Picks 5)',
          variant_key: 'keno:picks:5',
          rtp_config: { picks: 5 },
          max_hit_x: 1.2,
        },
      ]);
    });

    it('normalizes legacy video poker bet variants into the grouped base and jackpot tiers', () => {
      const breakdown = summarizeHistoryGamesByGame({
        wallet: WALLET,
        last_synced_block: '100',
        last_download_on: '2026-03-29T12:00:00.000Z',
        games: [
          {
            contract: VIDEO_POKER_CONTRACT,
            game: 'Video Poker ✔︎',
            game_key: 'video-poker',
            variant_key: 'video-poker:bet:25',
            variant_label: 'Bet 25 APE',
            rtp_game: 'video-poker',
            rtp_config: { betAmountApe: 25 },
            gameId: '1',
            timestamp: 1_700_000_000_000,
            last_sync_on: '2026-03-29T12:00:00.000Z',
            wager_wei: parseEther('25').toString(),
            payout_wei: parseEther('50').toString(),
            contract_fee_wei: '0',
            gas_fee_wei: '0',
            gp_received_raw: '25',
            wape_received_wei: parseEther('25').toString(),
            won: true,
            push: false,
          },
          {
            contract: VIDEO_POKER_CONTRACT,
            game: 'Video Poker ✔︎',
            game_key: 'video-poker',
            variant_key: 'video-poker:bet:100:jackpot',
            variant_label: 'Bet 100 + jackpot',
            rtp_game: 'video-poker',
            rtp_config: { betAmountApe: 100, jackpotApe: 25000 },
            gameId: '2',
            timestamp: 1_700_000_050_000,
            last_sync_on: '2026-03-29T12:00:00.000Z',
            wager_wei: parseEther('100').toString(),
            payout_wei: parseEther('250').toString(),
            contract_fee_wei: '0',
            gas_fee_wei: '0',
            gp_received_raw: '100',
            wape_received_wei: parseEther('100').toString(),
            won: true,
            push: false,
          },
        ],
      });

      assert.deepStrictEqual(breakdown.map((entry) => ({
        game: entry.game,
        variant_key: entry.variant_key,
        rtp_config: entry.rtp_config,
      })), [
        {
          game: 'Video Poker ✔︎ (Bet 1/5/10/25/50 APE)',
          variant_key: 'video-poker:bet:base',
          rtp_config: { betAmountApe: 25 },
        },
        {
          game: 'Video Poker ✔︎ (Bet 100 APE)',
          variant_key: 'video-poker:bet:100',
          rtp_config: { betAmountApe: 100, jackpotApe: 25000 },
        },
      ]);
    });

    it('collapses legacy Plinko variants that differ only by balls into one mode row', () => {
      const breakdown = summarizeHistoryGamesByGame({
        wallet: WALLET,
        last_synced_block: '100',
        last_download_on: '2026-03-29T12:00:00.000Z',
        games: [
          {
            contract: JUNGLE_PLINKO_CONTRACT,
            game: 'Jungle Plinko ✔︎',
            game_key: 'jungle-plinko',
            variant_key: 'jungle-plinko:mode:0:balls:10',
            variant_label: 'Mode 0 / 10 balls',
            gameId: '1',
            timestamp: 1_700_000_000_000,
            last_sync_on: '2026-03-29T12:00:00.000Z',
            wager_wei: parseEther('5').toString(),
            payout_wei: parseEther('6').toString(),
            contract_fee_wei: '0',
            gas_fee_wei: '0',
            gp_received_raw: '5',
            wape_received_wei: parseEther('5').toString(),
            won: true,
            push: false,
          },
          {
            contract: JUNGLE_PLINKO_CONTRACT,
            game: 'Jungle Plinko ✔︎',
            game_key: 'jungle-plinko',
            config: { mode: 0, balls: 50 },
            variant_key: 'jungle-plinko:mode:0:balls:50',
            variant_label: 'Mode 0 / 50 balls',
            rtp_game: 'jungle-plinko',
            rtp_config: { mode: 0, balls: 50 },
            gameId: '2',
            timestamp: 1_700_000_050_000,
            last_sync_on: '2026-03-29T12:00:00.000Z',
            wager_wei: parseEther('5').toString(),
            payout_wei: parseEther('3').toString(),
            contract_fee_wei: '0',
            gas_fee_wei: '0',
            gp_received_raw: '5',
            wape_received_wei: parseEther('5').toString(),
            won: false,
            push: false,
          },
        ],
      });

      assert.deepStrictEqual(breakdown.map((entry) => ({
        game: entry.game,
        variant_key: entry.variant_key,
        variant_label: entry.variant_label,
        rtp_config: entry.rtp_config,
        games: entry.games,
      })), [
        {
          game: 'Jungle Plinko ✔︎ (Safe)',
          variant_key: 'jungle-plinko:mode:0',
          variant_label: 'Safe',
          rtp_config: { mode: 0 },
          games: 2,
        },
      ]);
    });
  });

  describe('mergeDownloadedHistoryGames', () => {
    it('prefers the synced on-chain settlement record when it conflicts with a richer local cache', () => {
      const merged = mergeDownloadedHistoryGames(
        [
          {
            contract: '0x6a48A513A46955D8622C809Fce876d2f11142003',
            gameId: '42',
            tx: '0xplay',
            settlement_tx: '0xsettle',
            transaction_from: WALLET,
            sponsored_transaction: false,
            chain_timestamp: 1774786033,
            timestamp: 1774786033000,
            wager_wei: parseEther('5').toString(),
            payout_wei: parseEther('6').toString(),
            contract_fee_wei: parseEther('0.1').toString(),
            contract_fee_ape: '0.1',
            gas_fee_wei: parseEther('0.02').toString(),
            gas_fee_ape: '0.02',
            gp_received_raw: '25',
            gp_received_display: '25',
            wape_received_wei: parseEther('5').toString(),
            wape_received_ape: '5',
            net_result_wei: parseEther('0.88').toString(),
            net_result_ape: '0.88',
            pnl_ape: '0.88',
            gross_result_wei: parseEther('1').toString(),
            gross_result_ape: '1',
            won: true,
            push: false,
            last_sync_on: '2026-03-29T16:46:36.398Z',
          },
        ],
        [
          {
            contract: '0x6a48A513A46955D8622C809Fce876d2f11142003',
            gameId: '42',
            tx: '0xsettle',
            settlement_tx: '0xsettle',
            transaction_from: SPONSOR,
            sponsored_transaction: true,
            chain_timestamp: 1774786034,
            timestamp: 1774786034000,
            wager_wei: parseEther('5').toString(),
            payout_wei: parseEther('6').toString(),
            contract_fee_wei: '0',
            contract_fee_ape: '0',
            gas_fee_wei: '0',
            gas_fee_ape: '0',
            gp_received_raw: '0',
            gp_received_display: '0',
            wape_received_wei: '0',
            wape_received_ape: '0',
            net_result_wei: parseEther('1').toString(),
            net_result_ape: '1',
            pnl_ape: '1',
            gross_result_wei: parseEther('1').toString(),
            gross_result_ape: '1',
            won: true,
            push: false,
            last_sync_on: '2026-03-29T17:28:34.923Z',
          },
        ],
        '2026-03-29T17:28:34.923Z'
      );

      assert.strictEqual(merged.length, 1);
      assert.strictEqual(merged[0].tx, '0xsettle');
      assert.strictEqual(merged[0].settlement_tx, '0xsettle');
      assert.strictEqual(merged[0].transaction_from, SPONSOR);
      assert.strictEqual(merged[0].sponsored_transaction, true);
      assert.strictEqual(merged[0].contract_fee_ape, '0');
      assert.strictEqual(merged[0].gas_fee_ape, '0');
      assert.strictEqual(merged[0].gp_received_display, '0');
      assert.strictEqual(merged[0].wape_received_ape, '0');
      assert.strictEqual(merged[0].chain_timestamp, 1774786034);
      assert.strictEqual(merged[0].timestamp, 1774786034000);
      assert.strictEqual(merged[0].net_result_ape, '1');
      assert.strictEqual(merged[0].last_sync_on, '2026-03-29T17:28:34.923Z');
    });

    it('applies refresh diagnostics to supported local-only games that remain unsynced', () => {
      const diagnostics = new Map([
        ['0x1f48a104c1808eb4107f3999999d36aeafec56d5:7', {
          last_sync_on: '2026-03-29T18:00:00.000Z',
          last_sync_msg: 'execution reverted',
        }],
      ]);

      const merged = mergeDownloadedHistoryGames(
        [
          {
            contract: ROULETTE,
            gameId: '7',
            timestamp: 1_700_000_000_000,
            tx: '0xabc',
            last_sync_on: null,
            last_sync_msg: null,
          },
        ],
        [],
        '2026-03-29T18:00:00.000Z',
        diagnostics
      );

      assert.strictEqual(merged[0].last_sync_on, '2026-03-29T18:00:00.000Z');
      assert.strictEqual(merged[0].last_sync_msg, 'execution reverted');
    });
  });

  describe('syncSavedStatefulHistoryGames', () => {
    it('rebuilds completed video poker history entries from getGameInfo', async () => {
      const syncTimestamp = '2026-04-02T12:00:00.000Z';
      const result = await syncSavedStatefulHistoryGames({
        async readContract(params) {
          assert.strictEqual(params.functionName, 'getGameInfo');
          assert.strictEqual(params.address, VIDEO_POKER_CONTRACT);
          return {
            player: WALLET,
            betAmount: parseEther('25'),
            totalPayout: parseEther('50'),
            initialCards: [],
            finalCards: [],
            gameState: 3,
            handStatus: 2,
            awaitingRNG: false,
            timestamp: 1_777_777_777n,
          };
        },
      }, [
        {
          contract: VIDEO_POKER_CONTRACT,
          gameId: '77',
          timestamp: 0,
        },
      ], WALLET, syncTimestamp);

      assert.strictEqual(result.games.length, 1);
      assert.strictEqual(result.diagnosticsByGameKey.size, 0);
      assert.strictEqual(result.games[0].game_key, 'video-poker');
      assert.strictEqual(result.games[0].variant_key, 'video-poker:bet:base');
      assert.deepStrictEqual(result.games[0].rtp_config, { betAmountApe: 25 });
      assert.strictEqual(result.games[0].wager_wei, parseEther('25').toString());
      assert.strictEqual(result.games[0].payout_wei, parseEther('50').toString());
      assert.strictEqual(result.games[0].net_result_ape, '25');
      assert.strictEqual(result.games[0].max_hit_x, undefined);
      assert.strictEqual(result.games[0].last_sync_on, syncTimestamp);
      assert.strictEqual(result.games[0].last_sync_msg, 'ok');
      assert.strictEqual(result.games[0].settled, true);
      assert.strictEqual(result.games[0].timestamp, 1_777_777_777_000);
    });

    it('rebuilds completed blackjack history entries from getGameInfo', async () => {
      const syncTimestamp = '2026-04-02T12:00:00.000Z';
      const result = await syncSavedStatefulHistoryGames({
        async readContract(params) {
          assert.strictEqual(params.functionName, 'getGameInfo');
          assert.strictEqual(params.address, BLACKJACK_CONTRACT);
          return {
            user: WALLET,
            gameState: 5,
            activeHandIndex: 0,
            playerHands: [
              { cards: [], handValue: 20, isSoft: false, status: 1, bet: parseEther('10') },
              { cards: [], handValue: 0, isSoft: false, status: 1, bet: 0n },
            ],
            dealerHand: { cards: [], handValue: 18, isSoft: false, status: 1, bet: 0n },
            sideBets: [
              { bet: 0n, amountForHouse: 0n, payout: 0n },
              { bet: 0n, amountForHouse: 0n, payout: 0n },
            ],
            insuranceBet: { bet: 0n, amountForHouse: 0n, payout: 0n },
            awaitingRandomNumber: false,
            initialBet: parseEther('10'),
            totalBet: parseEther('10'),
            totalPayout: parseEther('20'),
            surrendered: false,
            timestamp: 1_888_888_888n,
          };
        },
      }, [
        {
          contract: BLACKJACK_CONTRACT,
          gameId: '88',
          timestamp: 0,
        },
      ], WALLET, syncTimestamp);

      assert.strictEqual(result.games.length, 1);
      assert.strictEqual(result.diagnosticsByGameKey.size, 0);
      assert.strictEqual(result.games[0].game_key, 'blackjack');
      assert.strictEqual(result.games[0].variant_key, 'blackjack:main-only');
      assert.deepStrictEqual(result.games[0].rtp_config, { mainBetApe: 10, playerSideApe: 0, dealerSideApe: 0 });
      assert.strictEqual(result.games[0].wager_wei, parseEther('10').toString());
      assert.strictEqual(result.games[0].payout_wei, parseEther('20').toString());
      assert.strictEqual(result.games[0].net_result_ape, '10');
      assert.strictEqual(result.games[0].last_sync_on, syncTimestamp);
      assert.strictEqual(result.games[0].last_sync_msg, 'ok');
      assert.strictEqual(result.games[0].settled, true);
      assert.strictEqual(result.games[0].timestamp, 1_888_888_888_000);
    });
  });

  describe('diagnoseUnsyncedSupportedGames', () => {
    it('classifies missing, reverted, and successful unsynced stateless transactions', async () => {
      const diagnostics = await diagnoseUnsyncedSupportedGames({
        async getTransactionReceipt({ hash }) {
          if (hash === '0xreverted') {
            return { status: 'reverted' };
          }
          if (hash === '0xsuccess') {
            return { status: 'success' };
          }
          throw new Error('not found');
        },
      }, [
        { contract: ROULETTE, gameId: '1', tx: '0xreverted' },
        { contract: APESTRONG, gameId: '2', tx: '0xsuccess' },
        { contract: APESTRONG, gameId: '3' },
        { contract: APESTRONG, gameId: '4', tx: '0xmissing' },
        { contract: BLACKJACK_CONTRACT, gameId: '5' },
      ], [], '2026-03-29T18:30:00.000Z');

      assert.strictEqual(diagnostics.get(`${ROULETTE.toLowerCase()}:1`)?.last_sync_msg, 'execution reverted');
      assert.strictEqual(diagnostics.get(`${APESTRONG.toLowerCase()}:2`)?.last_sync_msg, 'no settlement event found');
      assert.strictEqual(diagnostics.get(`${APESTRONG.toLowerCase()}:3`)?.last_sync_msg, 'missing play transaction hash');
      assert.ok(diagnostics.get(`${APESTRONG.toLowerCase()}:4`)?.last_sync_msg.startsWith('transaction receipt unavailable'));
      assert.strictEqual(diagnostics.has(`${BLACKJACK_CONTRACT.toLowerCase()}:5`), false);
    });
  });

  describe('analyzeWalletHistory', () => {
    it('scans settlement logs in chunks and counts fees only when the wallet paid the tx', async () => {
      const chunkCalls = [];
      const txCalls = [];
      const receiptCalls = [];
      const blockCalls = [];
      const txByHash = {
        ['0x' + 'a'.repeat(64)]: {
          hash: '0x' + 'a'.repeat(64),
          from: WALLET,
          value: parseEther('1.1'),
          gasPrice: parseEther('0.0000001'),
        },
        ['0x' + 'b'.repeat(64)]: {
          hash: '0x' + 'b'.repeat(64),
          from: SPONSOR,
          value: parseEther('2.2'),
          gasPrice: parseEther('0.0000001'),
        },
      };
      const receiptByHash = {
        ['0x' + 'a'.repeat(64)]: {
          logs: [],
          gasUsed: 2_000_000n,
          effectiveGasPrice: parseEther('0.0000001'),
        },
        ['0x' + 'b'.repeat(64)]: {
          logs: [],
          gasUsed: 3_000_000n,
          effectiveGasPrice: parseEther('0.0000001'),
        },
      };
      const blockByNumber = {
        75: { timestamp: 1_700_000_000n },
        100: { timestamp: 1_700_000_100n },
      };
      const publicClient = {
        async getBlockNumber() {
          return 100n;
        },
        async getLogs(params) {
          if (params.topics) {
            return [];
          }

          chunkCalls.push({
            fromBlock: params.fromBlock,
            toBlock: params.toBlock,
          });

          if (params.fromBlock === 50n) {
            return [
              {
                address: APESTRONG,
                blockNumber: 75n,
                logIndex: 0,
                transactionHash: '0x' + 'a'.repeat(64),
                removed: false,
                args: {
                  user: WALLET,
                  gameId: 42n,
                  buyIn: parseEther('1'),
                  payout: parseEther('2'),
                },
              },
            ];
          }

          if (params.fromBlock === 100n) {
            return [
              {
                address: ROULETTE,
                blockNumber: 100n,
                logIndex: 0,
                transactionHash: '0x' + 'b'.repeat(64),
                removed: false,
                args: {
                  user: WALLET,
                  gameId: 7n,
                  buyIn: parseEther('2'),
                  payout: 0n,
                },
              },
            ];
          }

          return [];
        },
        async getTransaction({ hash }) {
          txCalls.push(hash);
          return txByHash[hash];
        },
        async getTransactionReceipt({ hash }) {
          receiptCalls.push(hash);
          return receiptByHash[hash];
        },
        async getBlock({ blockNumber }) {
          blockCalls.push(blockNumber);
          return blockByNumber[Number(blockNumber)];
        },
        async readContract(params) {
          if (params.functionName === 'getCurrentEXP') {
            return 12n;
          }

          if (params.functionName === 'balanceOf') {
            return parseEther('3');
          }

          throw new Error(`Unexpected contract read: ${params.functionName}`);
        },
      };

      const analysis = await analyzeWalletHistory(publicClient, WALLET, {
        chunkSize: 50n,
      });

      assert.deepStrictEqual(chunkCalls, [
        { fromBlock: 0n, toBlock: 49n },
        { fromBlock: 50n, toBlock: 99n },
        { fromBlock: 100n, toBlock: 100n },
      ]);
      assert.strictEqual(txCalls.length, 2);
      assert.strictEqual(receiptCalls.length, 2);
      assert.deepStrictEqual(blockCalls, [100n, 75n]);
      assert.strictEqual(analysis.stats.games, 2);
      assert.strictEqual(analysis.stats.total_saved_games, 2);
      assert.strictEqual(analysis.stats.total_wagered_ape, '3');
      assert.strictEqual(analysis.stats.total_payout_ape, '2');
      assert.strictEqual(analysis.stats.contract_fees_paid_ape, '0.1');
      assert.strictEqual(analysis.stats.gas_paid_ape, '0.2');
      assert.strictEqual(analysis.stats.net_result_ape, '-1.3');
      assert.strictEqual(analysis.stats.win_rate, 50.0);
      assert.strictEqual(analysis.stats.rtp, 66.7);
      assert.strictEqual(analysis.stats.current_gp_balance_display, '12');
      assert.strictEqual(analysis.stats.current_wape_balance_ape, '3');
      assert.strictEqual(analysis.recent_games.length, 2);
      assert.strictEqual(analysis.recent_games[0].game, 'Roulette ✔︎');
      assert.strictEqual(analysis.recent_games[0].contract_fee_ape, '0');
      assert.strictEqual(analysis.recent_games[0].gas_fee_ape, '0');
      assert.strictEqual(analysis.recent_games[0].sponsored_transaction, true);
      assert.strictEqual(analysis.recent_games[1].game, 'ApeStrong ✔︎');
      assert.strictEqual(analysis.recent_games[1].chain_timestamp, 1700000000);
      assert.strictEqual(analysis.recent_games[1].contract_fee_ape, '0.1');
      assert.strictEqual(analysis.recent_games[1].gas_fee_ape, '0.2');
    });
  });
});
