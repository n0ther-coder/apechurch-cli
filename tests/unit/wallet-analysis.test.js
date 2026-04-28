/**
 * Unit Tests: lib/wallet-analysis.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, parseEther } from 'viem';
import {
  BACCARAT_CONTRACT,
  BEAR_DICE_CONTRACT,
  BLOCKS_CONTRACT,
  COSMIC_PLINKO_CONTRACT,
  DINO_DOUGH_CONTRACT,
  ERC20_ABI,
  GAME_CONTRACT_ABI,
  GEEZ_DIGGERZ_CONTRACT,
  GLYDE_OR_CRASH_CONTRACT,
  GIMBOZ_SMASH_CONTRACT,
  GP_TOKEN_CONTRACT,
  HI_LO_NEBULA_CONTRACT,
  JUNGLE_PLINKO_CONTRACT,
  KENO_CONTRACT,
  MONKEY_MATCH_CONTRACT,
  PRIMES_CONTRACT,
  SPEED_KENO_CONTRACT,
  ZERO_ADDRESS,
} from '../../lib/constants.js';
import {
  analyzeWalletHistory,
  diagnoseUnsyncedSupportedGames,
  inferSavedHistoryGameVariants,
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

function buildGpTransferLog({ to, value }) {
  return {
    address: GP_TOKEN_CONTRACT,
    topics: encodeEventTopics({
      abi: ERC20_ABI,
      eventName: 'Transfer',
      args: {
        from: ZERO_ADDRESS,
        to,
      },
    }),
    data: encodeAbiParameters([{ name: 'value', type: 'uint256' }], [BigInt(value)]),
  };
}

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
      assert.strictEqual(summary.average_gp_per_ape, 2);
      assert.strictEqual(summary.total_wape_received_ape, '15');
      assert.strictEqual(summary.current_gp_balance_display, '42');
      assert.strictEqual(summary.current_wape_balance_ape, '3');
    });

    it('excludes execution-reverted records from saved-game counts and unsynced totals', () => {
      const summary = summarizeHistoryGames({
        wallet: WALLET,
        games: [
          {
            contract: APESTRONG,
            gameId: '1',
            timestamp: 1_700_000_000_000,
            last_sync_on: '2026-03-29T12:00:00.000Z',
            wager_wei: parseEther('10').toString(),
            payout_wei: parseEther('20').toString(),
            contract_fee_wei: '0',
            gas_fee_wei: '0',
            gp_received_raw: '25',
            wape_received_wei: parseEther('10').toString(),
            won: true,
            push: false,
          },
          {
            contract: ROULETTE,
            gameId: '2',
            timestamp: 1_700_000_100_000,
            last_sync_on: '2026-03-29T18:00:00.000Z',
            last_sync_msg: 'execution reverted',
          },
        ],
      });

      assert.strictEqual(summary.total_saved_games, 1);
      assert.strictEqual(summary.games, 1);
      assert.strictEqual(summary.unsynced_games, 0);
      assert.strictEqual(summary.total_wagered_ape, '10');
      assert.strictEqual(summary.max_hit_x, 2);
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
      assert.strictEqual(apeStrong.average_gp_per_ape, 2.154);
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
      assert.strictEqual(blackjack.average_gp_per_ape, null);
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
          game: 'Jungle Plinko ✔︎ (Low)',
          variant_key: 'jungle-plinko:mode:0',
          variant_label: 'Low',
          rtp_config: { mode: 0 },
          games: 2,
        },
      ]);
    });

    it('canonicalizes legacy Bear-A-Dice, Blocks, and Monkey Match risk labels in grouped stats', () => {
      const breakdown = summarizeHistoryGamesByGame({
        wallet: WALLET,
        games: [
          {
            contract: BEAR_DICE_CONTRACT,
            game: 'Bear-A-Dice ✔︎',
            game_key: 'bear-dice',
            variant_key: 'bear-dice:difficulty:1:rolls:5',
            variant_label: 'Normal / 5 rolls',
            rtp_game: 'bear-dice',
            gameId: '1',
            timestamp: 1_700_000_000_000,
            last_sync_on: '2026-03-29T12:00:00.000Z',
            wager_wei: parseEther('10').toString(),
            payout_wei: parseEther('15').toString(),
            contract_fee_wei: '0',
            gas_fee_wei: '0',
            gp_received_raw: '0',
            wape_received_wei: '0',
            won: true,
            push: false,
          },
          {
            contract: BLOCKS_CONTRACT,
            game: 'Blocks ✔︎',
            game_key: 'blocks',
            config: { mode: 0, modeName: 'Easy', runs: 3 },
            variant_key: 'blocks:mode:easy',
            variant_label: 'Easy',
            rtp_game: 'blocks',
            rtp_config: { mode: 0 },
            gameId: '2',
            timestamp: 1_700_000_050_000,
            last_sync_on: '2026-03-29T12:00:00.000Z',
            wager_wei: parseEther('10').toString(),
            payout_wei: '0',
            contract_fee_wei: '0',
            gas_fee_wei: '0',
            gp_received_raw: '0',
            wape_received_wei: '0',
            won: false,
            push: false,
          },
          {
            contract: MONKEY_MATCH_CONTRACT,
            game: 'Monkey Match ✔︎',
            game_key: 'monkey-match',
            variant_key: 'monkey-match:mode:1',
            variant_label: 'Low Risk',
            rtp_game: 'monkey-match',
            gameId: '3',
            timestamp: 1_700_000_100_000,
            last_sync_on: '2026-03-29T12:00:00.000Z',
            wager_wei: parseEther('10').toString(),
            payout_wei: parseEther('8').toString(),
            contract_fee_wei: '0',
            gas_fee_wei: '0',
            gp_received_raw: '0',
            wape_received_wei: '0',
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
      })), [
        {
          game: 'Bear-A-Dice ✔︎ (Medium / 5 rolls)',
          variant_key: 'bear-dice:difficulty:1:rolls:5',
          variant_label: 'Medium / 5 rolls',
          rtp_config: { difficulty: 1, rolls: 5 },
        },
        {
          game: 'Blocks ✔︎ (Low / 3 rolls)',
          variant_key: 'blocks:mode:easy:rolls:3',
          variant_label: 'Low / 3 rolls',
          rtp_config: { mode: 0, runs: 3 },
        },
        {
          game: 'Monkey Match ✔︎ (Low)',
          variant_key: 'monkey-match:mode:1',
          variant_label: 'Low',
          rtp_config: { mode: 1 },
        },
      ]);
    });

    it('drops execution-reverted records before grouping and counting per-variant history', () => {
      const breakdown = summarizeHistoryGamesByGame({
        wallet: WALLET,
        games: [
          {
            contract: BLOCKS_CONTRACT,
            game: 'Blocks ✔︎',
            game_key: 'blocks',
            config: { mode: 0, modeName: 'Low', runs: 1 },
            variant_key: 'blocks:mode:easy',
            variant_label: 'Low',
            rtp_game: 'blocks',
            rtp_config: { mode: 0 },
            gameId: '1',
            timestamp: 1_700_000_000_000,
            last_sync_on: '2026-03-29T12:00:00.000Z',
            wager_wei: parseEther('25').toString(),
            payout_wei: parseEther('30.3').toString(),
            contract_fee_wei: '0',
            gas_fee_wei: '0',
            gp_received_raw: '0',
            wape_received_wei: '0',
            won: true,
            push: false,
          },
          {
            contract: BLOCKS_CONTRACT,
            game: 'Blocks ✔︎',
            game_key: 'blocks',
            config: { mode: 0, modeName: 'Low', runs: 1 },
            variant_key: 'blocks:mode:easy',
            variant_label: 'Low',
            rtp_game: 'blocks',
            rtp_config: { mode: 0 },
            gameId: '2',
            timestamp: 1_700_000_100_000,
            last_sync_on: '2026-03-29T18:00:00.000Z',
            last_sync_msg: 'execution reverted',
          },
        ],
      });

      assert.strictEqual(breakdown.length, 1);
      assert.strictEqual(breakdown[0].variant_key, 'blocks:mode:easy:rolls:1');
      assert.strictEqual(breakdown[0].variant_label, 'Low / 1 roll');
      assert.strictEqual(breakdown[0].total_saved_games, 1);
      assert.strictEqual(breakdown[0].games, 1);
      assert.strictEqual(breakdown[0].unsynced_games, 0);
    });
  });

  describe('inferSavedHistoryGameVariants', () => {
    it('reconstructs missing saved-game variant metadata from cached play tx hashes', async () => {
      const gameId = 77n;
      const playInput = encodeFunctionData({
        abi: GAME_CONTRACT_ABI,
        functionName: 'play',
        args: [
          WALLET,
          encodeAbiParameters(
            [
              { name: 'riskMode', type: 'uint8' },
              { name: 'numRuns', type: 'uint8' },
              { name: 'gameId', type: 'uint256' },
              { name: 'ref', type: 'address' },
              { name: 'userRandomWord', type: 'bytes32' },
            ],
            [1, 4, gameId, ZERO_ADDRESS, '0x' + '22'.repeat(32)],
          ),
        ],
      });

      const result = await inferSavedHistoryGameVariants({
        async getTransaction({ hash }) {
          assert.strictEqual(hash, '0x' + 'c'.repeat(64));
          return {
            hash,
            input: playInput,
          };
        },
      }, [
        {
          contract: BLOCKS_CONTRACT,
          game: 'Blocks ✔︎',
          game_key: 'blocks',
          gameId: gameId.toString(),
          tx: '0x' + 'c'.repeat(64),
          timestamp: 1_700_000_000_000,
        },
      ]);

      assert.strictEqual(result.changed, true);
      assert.strictEqual(result.inferred, 1);
      assert.strictEqual(result.failedLookups, 0);
      assert.deepStrictEqual(result.games[0].config, {
        mode: 1,
        modeName: 'High',
        runs: 4,
      });
      assert.strictEqual(result.games[0].variant_key, 'blocks:mode:hard:rolls:4');
      assert.strictEqual(result.games[0].variant_label, 'High / 4 rolls');
      assert.deepStrictEqual(result.games[0].rtp_config, { mode: 1, runs: 4 });
    });

    it('normalizes saved records locally when config already contains the canonical risk metadata', async () => {
      let lookupCount = 0;
      const result = await inferSavedHistoryGameVariants({
        async getTransaction() {
          lookupCount += 1;
          return null;
        },
      }, [
        {
          contract: BLOCKS_CONTRACT,
          game: 'Blocks ✔︎',
          game_key: 'blocks',
          gameId: '1',
          tx: '0x' + 'd'.repeat(64),
          config: { mode: 0, modeName: 'Low', runs: 3 },
          variant_key: 'blocks:mode:easy',
          variant_label: 'Low',
          rtp_game: 'blocks',
          rtp_config: { mode: 0 },
        },
      ]);

      assert.strictEqual(lookupCount, 0);
      assert.strictEqual(result.changed, true);
      assert.strictEqual(result.inferred, 1);
      assert.strictEqual(result.games[0].variant_key, 'blocks:mode:easy:rolls:3');
      assert.strictEqual(result.games[0].variant_label, 'Low / 3 rolls');
      assert.deepStrictEqual(result.games[0].rtp_config, { mode: 0, runs: 3 });
    });

    it('re-infers stale Blocks mode-only metadata when the saved config is incomplete', async () => {
      let lookupCount = 0;
      const gameId = 501n;
      const playInput = encodeFunctionData({
        abi: GAME_CONTRACT_ABI,
        functionName: 'play',
        args: [
          WALLET,
          encodeAbiParameters(
            [
              { name: 'riskMode', type: 'uint8' },
              { name: 'numRuns', type: 'uint8' },
              { name: 'gameId', type: 'uint256' },
              { name: 'ref', type: 'address' },
              { name: 'userRandomWord', type: 'bytes32' },
            ],
            [0, 2, gameId, ZERO_ADDRESS, '0x' + '33'.repeat(32)],
          ),
        ],
      });

      const result = await inferSavedHistoryGameVariants({
        async getTransaction({ hash }) {
          lookupCount += 1;
          assert.strictEqual(hash, '0x' + 'f'.repeat(64));
          return {
            hash,
            input: playInput,
          };
        },
      }, [
        {
          contract: BLOCKS_CONTRACT,
          game: 'Blocks ✔︎',
          game_key: 'blocks',
          gameId: gameId.toString(),
          tx: '0x' + 'f'.repeat(64),
          config: { mode: 0, modeName: 'Easy' },
          variant_key: 'blocks:mode:easy',
          variant_label: 'Easy',
          rtp_game: 'blocks',
          rtp_config: { mode: 0 },
        },
      ]);

      assert.strictEqual(lookupCount, 1);
      assert.strictEqual(result.changed, true);
      assert.strictEqual(result.inferred, 1);
      assert.deepStrictEqual(result.games[0].config, {
        mode: 0,
        modeName: 'Low',
        runs: 2,
      });
      assert.strictEqual(result.games[0].variant_key, 'blocks:mode:easy:rolls:2');
      assert.strictEqual(result.games[0].variant_label, 'Low / 2 rolls');
      assert.deepStrictEqual(result.games[0].rtp_config, { mode: 0, runs: 2 });
    });

    it('falls back to getGameInfo when the saved tx is not the original play calldata', async () => {
      let txLookups = 0;
      let gameInfoLookups = 0;

      const result = await inferSavedHistoryGameVariants({
        async getTransaction({ hash }) {
          txLookups += 1;
          assert.strictEqual(hash, '0x' + 'e'.repeat(64));
          return {
            hash,
            input: '0x3d30bc0e',
          };
        },
        async readContract(params) {
          gameInfoLookups += 1;
          assert.strictEqual(params.address, BEAR_DICE_CONTRACT);
          assert.strictEqual(params.functionName, 'getGameInfo');
          assert.deepStrictEqual(params.args, [99n]);
          return {
            difficulty: 4,
            numRuns: 5,
          };
        },
      }, [
        {
          contract: BEAR_DICE_CONTRACT,
          game: 'Bear-A-Dice ✔︎',
          game_key: 'bear-dice',
          gameId: '99',
          tx: '0x' + 'e'.repeat(64),
          timestamp: 1_700_000_000_000,
        },
      ]);

      assert.strictEqual(txLookups, 1);
      assert.strictEqual(gameInfoLookups, 1);
      assert.strictEqual(result.changed, true);
      assert.strictEqual(result.inferred, 1);
      assert.strictEqual(result.failedLookups, 0);
      assert.deepStrictEqual(result.games[0].config, {
        difficulty: 4,
        difficultyName: 'Master',
        rolls: 5,
      });
      assert.strictEqual(result.games[0].variant_key, 'bear-dice:difficulty:4:rolls:5');
      assert.strictEqual(result.games[0].variant_label, 'Master / 5 rolls');
      assert.deepStrictEqual(result.games[0].rtp_config, {
        difficulty: 4,
        difficultyName: 'Master',
        rolls: 5,
      });
    });

    it('reconstructs Gimboz Smash targets from cached play calldata', async () => {
      const gameId = 700n;
      const playInput = encodeFunctionData({
        abi: GAME_CONTRACT_ABI,
        functionName: 'play',
        args: [
          WALLET,
          encodeAbiParameters(
            [
              { name: 'numWinIntervals', type: 'uint8' },
              { name: 'winStarts', type: 'uint8[2]' },
              { name: 'winEnds', type: 'uint8[2]' },
              { name: 'gameId', type: 'uint256' },
              { name: 'ref', type: 'address' },
              { name: 'userRandomWord', type: 'bytes32' },
            ],
            [2, [0, 79], [19, 99], gameId, ZERO_ADDRESS, '0x' + '34'.repeat(32)],
          ),
        ],
      });

      const result = await inferSavedHistoryGameVariants({
        async getTransaction({ hash }) {
          assert.strictEqual(hash, '0x' + 'd'.repeat(64));
          return {
            hash,
            input: playInput,
          };
        },
      }, [
        {
          contract: GIMBOZ_SMASH_CONTRACT,
          game: 'Gimboz Smash ✔︎',
          game_key: 'gimboz-smash',
          gameId: gameId.toString(),
          tx: '0x' + 'd'.repeat(64),
          timestamp: 1_700_000_000_000,
        },
      ]);

      assert.strictEqual(result.changed, true);
      assert.strictEqual(result.inferred, 1);
      assert.strictEqual(result.failedLookups, 0);
      assert.deepStrictEqual(result.games[0].config, {
        targets: '1-20,80-100',
        intervals: [
          { start: 1, end: 20 },
          { start: 80, end: 100 },
        ],
        numWinIntervals: 2,
        winCount: 41,
        winChance: '41%',
        payout: '2.378x',
      });
      assert.strictEqual(result.games[0].variant_key, 'gimboz-smash:count:41');
      assert.strictEqual(result.games[0].variant_label, 'Cover 41');
      assert.deepStrictEqual(result.games[0].rtp_config, { winCount: 41 });
    });

    it('reconstructs Gimboz Smash targets from getGameInfo when tx calldata is unavailable', async () => {
      const result = await inferSavedHistoryGameVariants({
        async getTransaction() {
          return { input: '0x3d30bc0e' };
        },
        async readContract(params) {
          assert.strictEqual(params.address, GIMBOZ_SMASH_CONTRACT);
          assert.strictEqual(params.functionName, 'getGameInfo');
          assert.deepStrictEqual(params.args, [701n]);
          return {
            numWinIntervals: 1,
            winStarts: [14, 0],
            winEnds: [78, 0],
          };
        },
      }, [
        {
          contract: GIMBOZ_SMASH_CONTRACT,
          game: 'Gimboz Smash ✔︎',
          game_key: 'gimboz-smash',
          gameId: '701',
          tx: '0x' + 'e'.repeat(64),
        },
      ]);

      assert.strictEqual(result.changed, true);
      assert.strictEqual(result.inferred, 1);
      assert.strictEqual(result.failedLookups, 0);
      assert.deepStrictEqual(result.games[0].config, {
        targets: '15-79',
        intervals: [{ start: 15, end: 79 }],
        numWinIntervals: 1,
        winCount: 65,
        winChance: '65%',
        payout: '1.5x',
      });
      assert.strictEqual(result.games[0].variant_key, 'gimboz-smash:count:65');
      assert.strictEqual(result.games[0].variant_label, 'Cover 65');
      assert.deepStrictEqual(result.games[0].rtp_config, { winCount: 65 });
    });

    it('reconstructs Glyde or Crash multipliers from cached play calldata', async () => {
      const gameId = 702n;
      const playInput = encodeFunctionData({
        abi: GAME_CONTRACT_ABI,
        functionName: 'play',
        args: [
          WALLET,
          encodeAbiParameters(
            [
              { name: 'targetMultiplier', type: 'uint256' },
              { name: 'gameId', type: 'uint256' },
              { name: 'ref', type: 'address' },
              { name: 'userRandomWord', type: 'bytes32' },
            ],
            [20000n, gameId, ZERO_ADDRESS, '0x' + '35'.repeat(32)],
          ),
        ],
      });

      const result = await inferSavedHistoryGameVariants({
        async getTransaction({ hash }) {
          assert.strictEqual(hash, '0x' + '1'.repeat(64));
          return {
            hash,
            input: playInput,
          };
        },
      }, [
        {
          contract: GLYDE_OR_CRASH_CONTRACT,
          game: 'Glyde or Crash ✔︎',
          game_key: 'glyde-or-crash',
          gameId: gameId.toString(),
          tx: '0x' + '1'.repeat(64),
        },
      ]);

      assert.strictEqual(result.changed, true);
      assert.strictEqual(result.inferred, 1);
      assert.strictEqual(result.failedLookups, 0);
      assert.deepStrictEqual(result.games[0].config, {
        multiplier: '2x',
        multiplierBasisPoints: 20000,
        targetMultiplier: 20000,
        winChance: '48.5%',
        payout: '2x',
        exactRtp: '97%',
      });
      assert.strictEqual(result.games[0].variant_key, 'glyde-or-crash:target:20000');
      assert.strictEqual(result.games[0].variant_label, 'Target 2x');
      assert.deepStrictEqual(result.games[0].rtp_config, {
        multiplierBasisPoints: 20000,
        multiplier: '2x',
      });
    });

    it('reconstructs Glyde or Crash multipliers from getGameInfo when tx calldata is unavailable', async () => {
      const result = await inferSavedHistoryGameVariants({
        async getTransaction() {
          return { input: '0x3d30bc0e' };
        },
        async readContract(params) {
          assert.strictEqual(params.address, GLYDE_OR_CRASH_CONTRACT);
          assert.strictEqual(params.functionName, 'getGameInfo');
          assert.deepStrictEqual(params.args, [703n]);
          return {
            targetMultiplier: 98979592n,
          };
        },
      }, [
        {
          contract: GLYDE_OR_CRASH_CONTRACT,
          game: 'Glyde or Crash ✔︎',
          game_key: 'glyde-or-crash',
          gameId: '703',
          tx: '0x' + '2'.repeat(64),
        },
      ]);

      assert.strictEqual(result.changed, true);
      assert.strictEqual(result.inferred, 1);
      assert.strictEqual(result.failedLookups, 0);
      assert.deepStrictEqual(result.games[0].config, {
        multiplier: '9,897.9592x',
        multiplierBasisPoints: 98979592,
        targetMultiplier: 98979592,
        winChance: '0.0097%',
        payout: '9,897.9592x',
        exactRtp: '96.01020424%',
      });
      assert.strictEqual(result.games[0].variant_key, 'glyde-or-crash:target:98979592');
      assert.strictEqual(result.games[0].variant_label, 'Target 9,897.9592x');
      assert.deepStrictEqual(result.games[0].rtp_config, {
        multiplierBasisPoints: 98979592,
        multiplier: '9,897.9592x',
      });
    });

    it('reconstructs Blocks, Primes, Speed Keno, and Cosmic Plinko from getGameInfo', async () => {
      const result = await inferSavedHistoryGameVariants({
        async getTransaction() {
          return { input: '0x3d30bc0e' };
        },
        async readContract(params) {
          switch (params.address) {
            case BLOCKS_CONTRACT:
              assert.deepStrictEqual(params.args, [201n]);
              return {
                riskMode: 1,
                numRuns: 5,
              };
            case PRIMES_CONTRACT:
              assert.deepStrictEqual(params.args, [202n]);
              return {
                difficulty: 3,
                numRuns: 9,
              };
            case SPEED_KENO_CONTRACT:
              assert.deepStrictEqual(params.args, [203n]);
              return {
                numGames: 4,
                gameNumbers: [1, 7, 20],
              };
            case COSMIC_PLINKO_CONTRACT:
              assert.deepStrictEqual(params.args, [204n]);
              return {
                gameMode: 2,
                numBalls: 12,
              };
            default:
              throw new Error(`Unexpected contract ${params.address}`);
          }
        },
      }, [
        {
          contract: BLOCKS_CONTRACT,
          game: 'Blocks ✔︎',
          game_key: 'blocks',
          gameId: '201',
          tx: '0x' + '1'.repeat(64),
        },
        {
          contract: PRIMES_CONTRACT,
          game: 'Primes ✔︎',
          game_key: 'primes',
          gameId: '202',
          tx: '0x' + '2'.repeat(64),
        },
        {
          contract: SPEED_KENO_CONTRACT,
          game: 'Speed Keno ✔︎',
          game_key: 'speed-keno',
          gameId: '203',
          tx: '0x' + '3'.repeat(64),
        },
        {
          contract: COSMIC_PLINKO_CONTRACT,
          game: 'Cosmic Plinko ✔︎',
          game_key: 'cosmic-plinko',
          gameId: '204',
          tx: '0x' + '4'.repeat(64),
        },
      ]);

      assert.strictEqual(result.changed, true);
      assert.strictEqual(result.inferred, 4);
      assert.strictEqual(result.failedLookups, 0);

      assert.deepStrictEqual(result.games[0].config, {
        mode: 1,
        modeName: 'High',
        runs: 5,
      });
      assert.strictEqual(result.games[0].variant_key, 'blocks:mode:hard:rolls:5');
      assert.strictEqual(result.games[0].variant_label, 'High / 5 rolls');
      assert.deepStrictEqual(result.games[0].rtp_config, { mode: 1, runs: 5 });

      assert.deepStrictEqual(result.games[1].config, {
        difficulty: 3,
        difficultyName: 'Extreme',
        runs: 9,
      });
      assert.strictEqual(result.games[1].variant_key, 'primes:mode:extreme');
      assert.strictEqual(result.games[1].variant_label, 'Extreme');
      assert.deepStrictEqual(result.games[1].rtp_config, { difficulty: 3 });

      assert.deepStrictEqual(result.games[2].config, {
        games: 4,
        picks: 3,
        numbers: [1, 7, 20],
      });
      assert.strictEqual(result.games[2].variant_key, 'speed-keno:picks:3');
      assert.strictEqual(result.games[2].variant_label, 'Picks 3');
      assert.deepStrictEqual(result.games[2].rtp_config, {
        games: 4,
        picks: 3,
        numbers: [1, 7, 20],
      });

      assert.deepStrictEqual(result.games[3].config, {
        mode: 2,
        modeName: 'High',
        balls: 12,
      });
      assert.strictEqual(result.games[3].variant_key, 'cosmic-plinko:mode:2');
      assert.strictEqual(result.games[3].variant_label, 'High');
      assert.deepStrictEqual(result.games[3].rtp_config, { mode: 2 });
    });

    it('reconstructs ApeStrong, Baccarat, Roulette, Keno, Jungle Plinko, Monkey Match, and Slots from getGameInfo', async () => {
      const result = await inferSavedHistoryGameVariants({
        async getTransaction() {
          return { input: '0x3d30bc0e' };
        },
        async readContract(params) {
          switch (params.address) {
            case APESTRONG:
              assert.deepStrictEqual(params.args, [301n]);
              return {
                edgeFlipRange: 42,
              };
            case BACCARAT_CONTRACT:
              assert.deepStrictEqual(params.args, [302n]);
              return {
                playerBankerBet: parseEther('140'),
                tieBet: parseEther('10'),
                betOnBanker: true,
              };
            case ROULETTE:
              assert.deepStrictEqual(params.args, [303n]);
              return {
                gameNumbers: [1, 38, 49],
              };
            case KENO_CONTRACT:
              assert.deepStrictEqual(params.args, [304n]);
              return {
                gameNumbers: [1, 7, 20, 33],
              };
            case JUNGLE_PLINKO_CONTRACT:
              assert.deepStrictEqual(params.args, [305n]);
              return {
                gameMode: 1,
                numBalls: 8,
              };
            case MONKEY_MATCH_CONTRACT:
              assert.deepStrictEqual(params.args, [306n]);
              return {
                gameMode: 2,
              };
            case DINO_DOUGH_CONTRACT:
              assert.deepStrictEqual(params.args, [307n]);
              return {
                num0: [1, 2, 3],
                num1: [2, 3, 4],
                num2: [3, 4, 5],
              };
            case GEEZ_DIGGERZ_CONTRACT:
              assert.deepStrictEqual(params.args, [308n]);
              return {
                betAmountPerSpin: parseEther('5'),
                totalBetAmount: parseEther('25'),
              };
            default:
              throw new Error(`Unexpected contract ${params.address}`);
          }
        },
      }, [
        {
          contract: APESTRONG,
          game: 'ApeStrong ✔︎',
          game_key: 'ape-strong',
          gameId: '301',
          tx: '0x' + '5'.repeat(64),
        },
        {
          contract: BACCARAT_CONTRACT,
          game: 'Baccarat ✔︎',
          game_key: 'baccarat',
          gameId: '302',
          tx: '0x' + '6'.repeat(64),
        },
        {
          contract: ROULETTE,
          game: 'Roulette ✔︎',
          game_key: 'roulette',
          gameId: '303',
          tx: '0x' + '7'.repeat(64),
        },
        {
          contract: KENO_CONTRACT,
          game: 'Keno ✔︎',
          game_key: 'keno',
          gameId: '304',
          tx: '0x' + '8'.repeat(64),
        },
        {
          contract: JUNGLE_PLINKO_CONTRACT,
          game: 'Jungle Plinko ✔︎',
          game_key: 'jungle-plinko',
          gameId: '305',
          tx: '0x' + '9'.repeat(64),
        },
        {
          contract: MONKEY_MATCH_CONTRACT,
          game: 'Monkey Match ✔︎',
          game_key: 'monkey-match',
          gameId: '306',
          tx: '0x' + 'a'.repeat(64),
        },
        {
          contract: DINO_DOUGH_CONTRACT,
          game: 'Dino Dough ✔︎',
          game_key: 'dino-dough',
          gameId: '307',
          tx: '0x' + 'b'.repeat(64),
        },
        {
          contract: GEEZ_DIGGERZ_CONTRACT,
          game: 'Geez Diggerz ✔︎',
          game_key: 'geez-diggerz',
          gameId: '308',
          tx: '0x' + 'c'.repeat(64),
        },
      ]);

      assert.strictEqual(result.changed, true);
      assert.strictEqual(result.inferred, 8);
      assert.strictEqual(result.failedLookups, 0);

      assert.deepStrictEqual(result.games[0].config, {
        range: 42,
      });
      assert.strictEqual(result.games[0].variant_key, 'ape-strong:range:42');
      assert.strictEqual(result.games[0].variant_label, 'Range 42');
      assert.deepStrictEqual(result.games[0].rtp_config, { range: 42 });

      assert.deepStrictEqual(result.games[1].config, {
        bet: '140 BANKER 10 TIE',
        betType: 'BANKER,TIE',
        playerBankerBet: '140',
        tieBet: '10',
        isBanker: true,
      });
      assert.strictEqual(result.games[1].variant_key, 'baccarat:bet:banker-tie');
      assert.strictEqual(result.games[1].variant_label, 'BANKER,TIE');
      assert.deepStrictEqual(result.games[1].rtp_config, {
        bet: '140 BANKER 10 TIE',
        betType: 'BANKER,TIE',
        playerBankerBet: '140',
        tieBet: '10',
        isBanker: true,
      });

      assert.deepStrictEqual(result.games[2].config, {
        bet: '0,00,BLACK',
        gameNumbers: [1, 38, 49],
        numBets: 3,
      });
      assert.strictEqual(result.games[2].variant_key, 'roulette:chips:single-number:2:red-black:1');
      assert.strictEqual(result.games[2].variant_label, '2 Single Number, 1 Red/Black');
      assert.deepStrictEqual(result.games[2].rtp_config, {
        bet: '0,00,BLACK',
        gameNumbers: [1, 38, 49],
        numBets: 3,
      });

      assert.deepStrictEqual(result.games[3].config, {
        picks: 4,
        numbers: [1, 7, 20, 33],
      });
      assert.strictEqual(result.games[3].variant_key, 'keno:picks:4');
      assert.strictEqual(result.games[3].variant_label, 'Picks 4');
      assert.deepStrictEqual(result.games[3].rtp_config, {
        picks: 4,
        numbers: [1, 7, 20, 33],
      });

      assert.deepStrictEqual(result.games[4].config, {
        mode: 1,
        modeName: 'Moderate',
        balls: 8,
      });
      assert.strictEqual(result.games[4].variant_key, 'jungle-plinko:mode:1');
      assert.strictEqual(result.games[4].variant_label, 'Moderate');
      assert.deepStrictEqual(result.games[4].rtp_config, { mode: 1 });

      assert.deepStrictEqual(result.games[5].config, {
        mode: 2,
        modeName: 'High',
      });
      assert.strictEqual(result.games[5].variant_key, 'monkey-match:mode:2');
      assert.strictEqual(result.games[5].variant_label, 'High');
      assert.deepStrictEqual(result.games[5].rtp_config, {
        mode: 2,
        modeName: 'High',
      });

      assert.deepStrictEqual(result.games[6].config, {
        spins: 3,
      });
      assert.strictEqual(result.games[6].variant_key, 'dino-dough:spins:3');
      assert.strictEqual(result.games[6].variant_label, '3 spins');
      assert.deepStrictEqual(result.games[6].rtp_config, { spins: 3 });

      assert.deepStrictEqual(result.games[7].config, {
        spins: 5,
      });
      assert.strictEqual(result.games[7].variant_key, 'geez-diggerz:spins:5');
      assert.strictEqual(result.games[7].variant_label, '5 spins');
      assert.deepStrictEqual(result.games[7].rtp_config, { spins: 5 });
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

    it('rebuilds completed hi-lo nebula history entries from getGameInfo', async () => {
      const syncTimestamp = '2026-04-02T12:00:00.000Z';
      const result = await syncSavedStatefulHistoryGames({
        async readContract(params) {
          assert.strictEqual(params.functionName, 'getGameInfo');
          assert.strictEqual(params.address, HI_LO_NEBULA_CONTRACT);
          return {
            initialBetAmount: parseEther('25'),
            payout: parseEther('44.6425'),
            user: WALLET,
            hasEnded: true,
            timestamp: 1_999_999_999n,
            rounds: [],
          };
        },
      }, [
        {
          contract: HI_LO_NEBULA_CONTRACT,
          gameId: '99',
          timestamp: 0,
        },
      ], WALLET, syncTimestamp);

      assert.strictEqual(result.games.length, 1);
      assert.strictEqual(result.diagnosticsByGameKey.size, 0);
      assert.strictEqual(result.games[0].game_key, 'hi-lo-nebula');
      assert.strictEqual(result.games[0].variant_key, 'hi-lo-nebula');
      assert.strictEqual(result.games[0].wager_wei, parseEther('25').toString());
      assert.strictEqual(result.games[0].payout_wei, parseEther('44.6425').toString());
      assert.strictEqual(result.games[0].settled, true);
      assert.strictEqual(result.games[0].timestamp, 1_999_999_999_000);
      assert.strictEqual(result.games[0].last_sync_msg, 'ok');
    });

    it('replaces local GP estimates with receipt-backed rewards for settled stateful games', async () => {
      const syncTimestamp = '2026-04-02T12:00:00.000Z';
      const txHash = '0x' + 'a'.repeat(64);
      const result = await syncSavedStatefulHistoryGames({
        async readContract(params) {
          assert.strictEqual(params.functionName, 'getGameInfo');
          return {
            player: WALLET,
            betAmount: parseEther('10'),
            totalPayout: parseEther('14'),
            initialCards: [],
            finalCards: [],
            gameState: 3,
            handStatus: 2,
            awaitingRNG: false,
            timestamp: 1_777_777_777n,
          };
        },
        async getTransaction({ hash }) {
          assert.strictEqual(hash, txHash);
          return { hash, from: WALLET };
        },
        async getTransactionReceipt({ hash }) {
          assert.strictEqual(hash, txHash);
          return {
            logs: [
              buildGpTransferLog({ to: WALLET, value: 72n }),
            ],
          };
        },
      }, [
        {
          contract: VIDEO_POKER_CONTRACT,
          gameId: '77',
          tx: txHash,
          gp_received_raw: '50',
          gp_source: 'local-estimate',
          timestamp: 0,
        },
      ], WALLET, syncTimestamp);

      assert.strictEqual(result.games.length, 1);
      assert.strictEqual(result.games[0].tx, txHash);
      assert.strictEqual(result.games[0].gp_received_raw, '72');
      assert.strictEqual(result.games[0].gp_received_display, '72');
      assert.strictEqual(result.games[0].gp_source, 'receipt');
    });

    it('keeps local GP estimates when the saved stateful tx has no reward transfer', async () => {
      const syncTimestamp = '2026-04-02T12:00:00.000Z';
      const txHash = '0x' + 'b'.repeat(64);
      const result = await syncSavedStatefulHistoryGames({
        async readContract() {
          return {
            user: WALLET,
            initialBetAmount: parseEther('25'),
            payout: parseEther('44.6425'),
            hasEnded: true,
            timestamp: 1_999_999_999n,
            rounds: [],
          };
        },
        async getTransaction() {
          return { hash: txHash, from: WALLET };
        },
        async getTransactionReceipt() {
          return { logs: [] };
        },
      }, [
        {
          contract: HI_LO_NEBULA_CONTRACT,
          gameId: '99',
          tx: txHash,
          gp_received_raw: '125',
          gp_source: 'local-estimate',
          timestamp: 0,
        },
      ], WALLET, syncTimestamp);

      assert.strictEqual(result.games.length, 1);
      assert.strictEqual(result.games[0].gp_received_raw, '125');
      assert.strictEqual(result.games[0].gp_source, 'local-estimate');
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
      assert.strictEqual(analysis.stats.average_gp_per_ape, 0);
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

    it('reconstructs stateless variant metadata from play calldata when the settlement log lacks config', async () => {
      const gameId = 42n;
      const blocksGameData = encodeAbiParameters(
        [
          { name: 'riskMode', type: 'uint8' },
          { name: 'numRuns', type: 'uint8' },
          { name: 'gameId', type: 'uint256' },
          { name: 'ref', type: 'address' },
          { name: 'userRandomWord', type: 'bytes32' },
        ],
        [0, 3, gameId, ZERO_ADDRESS, '0x' + '11'.repeat(32)],
      );
      const blocksPlayInput = encodeFunctionData({
        abi: GAME_CONTRACT_ABI,
        functionName: 'play',
        args: [WALLET, blocksGameData],
      });

      const publicClient = {
        async getBlockNumber() {
          return 10n;
        },
        async getLogs(params) {
          if (params.topics) {
            return [];
          }
          return [
            {
              address: BLOCKS_CONTRACT,
              blockNumber: 10n,
              logIndex: 0,
              transactionHash: '0x' + 'a'.repeat(64),
              removed: false,
              args: {
                user: WALLET,
                gameId,
                buyIn: parseEther('25'),
                payout: parseEther('30.3'),
              },
            },
          ];
        },
        async getTransaction() {
          return {
            hash: '0x' + 'a'.repeat(64),
            from: SPONSOR,
            value: parseEther('25'),
            gasPrice: 0n,
            input: blocksPlayInput,
          };
        },
        async getTransactionReceipt() {
          return {
            logs: [],
            gasUsed: 0n,
            effectiveGasPrice: 0n,
          };
        },
        async getBlock() {
          return { timestamp: 1_700_000_000n };
        },
        async readContract(params) {
          if (params.functionName === 'getCurrentEXP') {
            return 0n;
          }
          if (params.functionName === 'balanceOf') {
            return 0n;
          }
          throw new Error(`Unexpected contract read: ${params.functionName}`);
        },
      };

      const analysis = await analyzeWalletHistory(publicClient, WALLET);

      assert.strictEqual(analysis.recent_games.length, 1);
      assert.deepStrictEqual(analysis.recent_games[0].config, {
        mode: 0,
        modeName: 'Low',
        runs: 3,
      });
      assert.strictEqual(analysis.recent_games[0].variant_key, 'blocks:mode:easy:rolls:3');
      assert.strictEqual(analysis.recent_games[0].variant_label, 'Low / 3 rolls');
      assert.deepStrictEqual(analysis.recent_games[0].rtp_config, { mode: 0, runs: 3 });
    });
  });
});
