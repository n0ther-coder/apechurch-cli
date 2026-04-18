/**
 * Unit Tests: lib/scores.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseEther } from 'viem';
import { buildWalletScores } from '../../lib/scores.js';

describe('Score Helpers', () => {
  describe('buildWalletScores', () => {
    it('builds highest multipliers and biggest payouts from saved history', () => {
      const scores = buildWalletScores({
        wallet: '0x1234567890abcdef1234567890abcdef12345678',
        last_download_on: '2026-04-17T10:15:00.000Z',
        games: [
          {
            game: 'ApeStrong ✔︎',
            game_key: 'ape-strong',
            config: { range: 5 },
            contract: '0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600',
            gameId: '101',
            timestamp: Date.parse('2026-04-17T10:00:00.000Z'),
            wager_wei: parseEther('1').toString(),
            payout_wei: parseEther('19.5').toString(),
            wager_ape: '1',
            payout_ape: '19.5',
            game_url: 'https://www.ape.church/games/ape-strong?id=101',
          },
          {
            game: 'Keno ✔︎',
            game_key: 'keno',
            config: { picks: 5 },
            contract: '0x0000000000000000000000000000000000000001',
            gameId: '102',
            timestamp: Date.parse('2026-04-17T11:00:00.000Z'),
            wager_wei: parseEther('10').toString(),
            payout_wei: parseEther('150').toString(),
            wager_ape: '10',
            payout_ape: '150',
            game_url: 'https://www.ape.church/games/keno?id=102',
          },
          {
            game: 'Cosmic Plinko ✔︎',
            game_key: 'cosmic-plinko',
            config: { mode: 2, balls: 8 },
            contract: '0x0000000000000000000000000000000000000002',
            gameId: '103',
            timestamp: Date.parse('2026-04-17T12:00:00.000Z'),
            wager_wei: parseEther('25').toString(),
            payout_wei: parseEther('300').toString(),
            wager_ape: '25',
            payout_ape: '300',
            game_url: 'https://www.ape.church/games/cosmic-plinko?id=103',
          },
        ],
      }, {
        updatedOn: '2026-04-17T12:30:00.000Z',
      });

      assert.strictEqual(scores.wallet, '0x1234567890abcdef1234567890abcdef12345678');
      assert.strictEqual(scores.updated_on, '2026-04-17T12:30:00.000Z');
      assert.strictEqual(scores.history_last_download_on, '2026-04-17T10:15:00.000Z');

      assert.deepStrictEqual(scores.highest_multipliers[0], {
        multiplier: '19.50',
        game_title: 'ApeStrong',
        game_mode: 'Range 5',
        bet: '1',
        payout: '19.50',
        datetime_utc: '2026-04-17T10:00:00.000Z',
        game_url: 'https://www.ape.church/games/ape-strong?id=101',
      });
      assert.deepStrictEqual(scores.highest_multipliers[1], {
        multiplier: '15.00',
        game_title: 'Keno',
        game_mode: 'Picks 5',
        bet: '10',
        payout: '150.00',
        datetime_utc: '2026-04-17T11:00:00.000Z',
        game_url: 'https://www.ape.church/games/keno?id=102',
      });
      assert.deepStrictEqual(scores.biggest_payouts[0], {
        payout: '300.00',
        game_title: 'Cosmic Plinko',
        game_mode: 'High',
        bet: '25',
        multiplier: '12.00',
        datetime_utc: '2026-04-17T12:00:00.000Z',
        game_url: 'https://www.ape.church/games/cosmic-plinko?id=103',
      });
    });

    it('caps both rankings at the top 20 entries', () => {
      const games = Array.from({ length: 21 }, (_, index) => {
        const bet = 1 + index;
        const payout = bet * (index + 1);
        return {
          game: 'ApeStrong ✔︎',
          game_key: 'ape-strong',
          config: { range: 50 - index },
          contract: '0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600',
          gameId: String(index + 1),
          timestamp: Date.parse('2026-04-17T00:00:00.000Z') + (index * 1000),
          wager_wei: parseEther(String(bet)).toString(),
          payout_wei: parseEther(String(payout)).toString(),
          wager_ape: String(bet),
          payout_ape: String(payout),
          game_url: `https://www.ape.church/games/ape-strong?id=${index + 1}`,
        };
      });

      const scores = buildWalletScores({
        wallet: '0x1234567890abcdef1234567890abcdef12345678',
        games,
      });

      assert.strictEqual(scores.highest_multipliers.length, 20);
      assert.strictEqual(scores.biggest_payouts.length, 20);
      assert.strictEqual(scores.highest_multipliers[0].multiplier, '21.00');
      assert.strictEqual(scores.biggest_payouts[0].payout, '441.00');
      assert.ok(
        scores.highest_multipliers.every((entry) => Number.parseFloat(entry.multiplier) >= 2),
        'The lowest-ranked multiplier should exclude the 1x tail entry'
      );
    });
  });
});
