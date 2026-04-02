/**
 * Unit Tests: lib/rtp.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { stripAnsi } from '../../lib/ansi.js';
import {
  formatRtpTripletValues,
  formatGameVariantName,
  getGameCalculatedRtpReference,
  getGameCalculatedVariantReferences,
  getConfiguredGameMaxPayoutReference,
  getConfiguredGameExpectedRtpReference,
  getGameExpectedRtpReference,
  getGameMaxPayoutReference,
  getGameTheoreticalRtpReference,
  resolveConfiguredGameVariant,
} from '../../lib/rtp.js';

describe('RTP Helpers', () => {
  it('uses the lowest calculated RTP when a game has multiple pick-specific values', () => {
    const expected = getGameExpectedRtpReference('keno');

    assert.strictEqual(expected.display, '93.32%');
    assert.strictEqual(expected.min, 93.3169);
    assert.strictEqual(expected.max, 93.3169);
    assert.strictEqual(expected.value, 93.3169);
    assert.strictEqual(expected.referenceType, 'calculated');
    assert.strictEqual(expected.calculationKind, 'exact');
    assert.strictEqual(stripAnsi(formatRtpTripletValues({ game: 'keno', currentRtp: null })), '93.32% 👌 / 86.35% / …');
  });

  it('prefers calculated RTP over theoretical RTP when both are present', () => {
    const effective = getGameExpectedRtpReference('ape-strong');
    const calculated = getGameCalculatedRtpReference('ape-strong');
    const theoretical = getGameTheoreticalRtpReference('ape-strong');

    assert.strictEqual(effective, calculated);
    assert.notStrictEqual(calculated, theoretical);
    assert.strictEqual(calculated.display, '97.50%');
    assert.strictEqual(calculated.referenceType, 'calculated');
    assert.strictEqual(calculated.calculationKind, 'exact');
  });

  it('keeps the configured expected RTP for games with mode-specific values', () => {
    const expected = getConfiguredGameExpectedRtpReference({ game: 'monkey-match', config: { mode: 2 } });

    assert.strictEqual(expected.display, '98.20%');
    assert.strictEqual(expected.min, 98.198);
    assert.strictEqual(expected.max, 98.198);
    assert.strictEqual(expected.value, 98.198);
    assert.strictEqual(expected.referenceType, 'calculated');
    assert.strictEqual(expected.calculationKind, 'exact');
  });

  it('uses the on-chain Jungle Plinko mode table even when balls are specified', () => {
    const expected = getConfiguredGameExpectedRtpReference({
      game: 'jungle-plinko',
      config: { mode: 4, balls: 50 },
    });
    const maxPayout = getConfiguredGameMaxPayoutReference({
      game: 'jungle-plinko',
      config: { mode: 4, balls: 50 },
    });

    assert.strictEqual(expected.display, '97.99%');
    assert.strictEqual(expected.referenceType, 'calculated');
    assert.strictEqual(expected.calculationKind, 'exact');
    assert.strictEqual(maxPayout.display, '1,000x');
  });

  it('uses the on-chain Cosmic Plinko mode table even when balls are specified', () => {
    const expected = getConfiguredGameExpectedRtpReference({
      game: 'cosmic',
      config: { mode: 2, balls: 30 },
    });
    const maxPayout = getConfiguredGameMaxPayoutReference({
      game: 'cosmic-plinko',
      config: { mode: 2, balls: 30 },
    });

    assert.strictEqual(expected.display, '97.80%');
    assert.strictEqual(expected.referenceType, 'calculated');
    assert.strictEqual(expected.calculationKind, 'exact');
    assert.strictEqual(maxPayout.display, '250x');
  });

  it('canonicalizes Plinko variants to risk mode only, ignoring balls', () => {
    const jungle = resolveConfiguredGameVariant({
      game: 'jungle-plinko',
      config: { mode: 0, balls: 10 },
    });
    const cosmic = resolveConfiguredGameVariant({
      game: 'cosmic-plinko',
      variantKey: 'cosmic-plinko:mode:2:balls:30',
      variantLabel: 'Mode 2 / 30 balls',
    });

    assert.deepStrictEqual(jungle, {
      gameKey: 'jungle-plinko',
      variantKey: 'jungle-plinko:mode:0',
      variantLabel: 'Safe',
      rtpGame: 'jungle-plinko',
      rtpConfig: { mode: 0 },
    });
    assert.deepStrictEqual(cosmic, {
      gameKey: 'cosmic-plinko',
      variantKey: 'cosmic-plinko:mode:2',
      variantLabel: 'High',
      rtpGame: 'cosmic-plinko',
      rtpConfig: { mode: 2 },
    });
  });

  it('exposes calculated RTP constants for each exact mode of a game', () => {
    const variants = getGameCalculatedVariantReferences('primes');

    assert.deepStrictEqual(variants.map((variant) => ({
      variantLabel: variant.variantLabel,
      display: variant.calculated.display,
    })), [
      { variantLabel: 'Easy', display: '98.00%' },
      { variantLabel: 'Medium', display: '98.00%' },
      { variantLabel: 'Hard', display: '98.00%' },
      { variantLabel: 'Extreme', display: '98.04%' },
    ]);
  });

  it('exposes exact calculated RTP constants for every Jungle Plinko mode', () => {
    const variants = getGameCalculatedVariantReferences('jungle-plinko');

    assert.deepStrictEqual(variants.map((variant) => ({
      variantLabel: variant.variantLabel,
      display: variant.calculated.display,
      maxPayout: variant.maxPayout.display,
    })), [
      { variantLabel: 'Safe', display: '98.00%', maxPayout: '2.2x' },
      { variantLabel: 'Low', display: '97.97%', maxPayout: '5x' },
      { variantLabel: 'Medium', display: '97.97%', maxPayout: '15x' },
      { variantLabel: 'High', display: '97.94%', maxPayout: '100x' },
      { variantLabel: 'Extreme', display: '97.99%', maxPayout: '1,000x' },
    ]);
  });

  it('exposes exact calculated RTP constants for every Cosmic Plinko mode', () => {
    const variants = getGameCalculatedVariantReferences('cosmic');

    assert.deepStrictEqual(variants.map((variant) => ({
      variantLabel: variant.variantLabel,
      display: variant.calculated.display,
      maxPayout: variant.maxPayout.display,
    })), [
      { variantLabel: 'Low', display: '97.73%', maxPayout: '50x' },
      { variantLabel: 'Modest', display: '97.76%', maxPayout: '100x' },
      { variantLabel: 'High', display: '97.80%', maxPayout: '250x' },
    ]);
  });

  it('returns the highest known max payout for a game when mode is unspecified', () => {
    const maxPayout = getGameMaxPayoutReference('keno');

    assert.strictEqual(maxPayout.display, '1,000,000x');
    assert.strictEqual(maxPayout.value, 1000000);
  });

  it('keeps max payout mode-specific when the config identifies a variant', () => {
    const exact = getConfiguredGameMaxPayoutReference({ game: 'keno', config: { picks: 5 } });
    const formula = getConfiguredGameMaxPayoutReference({ game: 'ape-strong', config: { range: 25 } });

    assert.strictEqual(exact.display, '200x');
    assert.strictEqual(formula.display, '3.9x');
  });

  it('computes config-aware max payout for combo-aware games', () => {
    const roulette = getConfiguredGameMaxPayoutReference({ game: 'roulette', config: { bet: 'RED,BLACK' } });
    const baccarat = getConfiguredGameMaxPayoutReference({
      game: 'baccarat',
      config: { betType: 'BANKER,TIE', playerBankerBet: '9', tieBet: '1' },
    });
    const videoPoker = getConfiguredGameMaxPayoutReference({
      game: 'video-poker',
      config: { betAmountApe: 100, jackpotApe: 25000 },
    });

    assert.strictEqual(roulette.display, '1.025x');
    assert.strictEqual(baccarat.display, '1.8x');
    assert.strictEqual(videoPoker.display, '500x + 💰');
  });

  it('groups video poker variants into base bets and the jackpot tier', () => {
    const variants = getGameCalculatedVariantReferences('video-poker');

    assert.deepStrictEqual(variants.map((variant) => ({
      variantLabel: variant.variantLabel,
      maxPayout: variant.maxPayout.display,
    })), [
      { variantLabel: 'Bet 1/5/10/25/50 APE', maxPayout: '250x' },
      { variantLabel: 'Bet 100 APE', maxPayout: '250x + 💰' },
    ]);
  });

  it('leaves mixed blackjack max payout unavailable because the combined cap is mode-dependent', () => {
    const mixed = getConfiguredGameMaxPayoutReference({
      game: 'blackjack',
      config: { mainBetApe: 10, playerSideApe: 1 },
    });

    assert.strictEqual(mixed, null);
  });

  it('uses the per-bet calculated constant for fixed-base video poker modes', () => {
    const expected = getConfiguredGameExpectedRtpReference({ game: 'video-poker', config: { betAmountApe: 25 } });

    assert.strictEqual(expected.display, '98.16%');
    assert.strictEqual(expected.referenceType, 'calculated');
    assert.strictEqual(expected.calculationKind, 'exact');
  });

  it('distinguishes blackjack main-only, side-only, and dealer-side-only RTP cases', () => {
    const variants = getGameCalculatedVariantReferences('blackjack');

    assert.deepStrictEqual(variants.map((variant) => ({
      variantLabel: variant.variantLabel,
      display: variant.calculated.display,
      calculationKind: variant.calculated.calculationKind,
    })), [
      { variantLabel: 'Main Only', display: '100.05%', calculationKind: 'statistical' },
      { variantLabel: 'Side Only', display: '79.88%', calculationKind: 'exact' },
      { variantLabel: 'Dealer Side Only', display: '82.02%', calculationKind: 'exact' },
    ]);
  });

  it('weights blackjack mixed RTP from the configured exposure split', () => {
    const exactSides = getConfiguredGameExpectedRtpReference({
      game: 'blackjack',
      config: { playerSideApe: 1, dealerSideApe: 1 },
    });
    const mixed = getConfiguredGameExpectedRtpReference({
      game: 'blackjack',
      config: { mainBetApe: 10, playerSideApe: 1 },
    });

    assert.strictEqual(exactSides.calculationKind, 'exact');
    assert.strictEqual(exactSides.display, '80.95%');
    assert.strictEqual(mixed.calculationKind, 'statistical');
    assert.strictEqual(mixed.display, '98.22%');
  });

  it('formats all RTP references with two decimals in rendered output', () => {
    assert.strictEqual(stripAnsi(formatRtpTripletValues({ game: 'video-poker', currentRtp: null })), '98.16% 👌 / 89.53% / …');
  });

  it('marks documented theoretical RTP references with a document badge', () => {
    assert.strictEqual(stripAnsi(formatRtpTripletValues({ game: 'bubblegum-heist', currentRtp: null })), '97.80% 📄 / 97.26% / …');
  });

  it('shows a statistical badge when the calculated RTP comes from Monte Carlo', () => {
    assert.strictEqual(stripAnsi(formatRtpTripletValues({ game: 'blackjack', currentRtp: null })), '100.05% 🔮 / 96.84% / …');
  });

  it('renders missing expected, reported, and current RTP values as an ellipsis', () => {
    assert.strictEqual(stripAnsi(formatRtpTripletValues({ game: null, reportedRtp: null, currentRtp: null })), '… / … / …');
  });

  it('does not append the same variant suffix twice', () => {
    assert.strictEqual(formatGameVariantName('Keno (Picks 5)', 'Picks 5'), 'Keno (Picks 5)');
  });
});
