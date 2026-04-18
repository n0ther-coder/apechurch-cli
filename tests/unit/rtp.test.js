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
  getUniformGameMaxPayoutReference,
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
    assert.strictEqual(calculated.display, '97.38%');
    assert.strictEqual(calculated.referenceType, 'calculated');
    assert.strictEqual(calculated.calculationKind, 'exact');
    assert.ok(Math.abs(calculated.value - 97.375) < 1e-12);
  });

  it('keeps the configured expected RTP for games with mode-specific values', () => {
    const expected = getConfiguredGameExpectedRtpReference({ game: 'monkey-match', config: { mode: 2 } });

    assert.strictEqual(expected.display, '98.29%');
    assert.strictEqual(expected.min, 98.29237817576009);
    assert.strictEqual(expected.max, 98.29237817576009);
    assert.strictEqual(expected.value, 98.29237817576009);
    assert.strictEqual(expected.referenceType, 'calculated');
    assert.strictEqual(expected.calculationKind, 'exact');
  });

  it('uses verified exact RTP references for baccarat single bets and weighted combo bets', () => {
    const banker = getConfiguredGameExpectedRtpReference({ game: 'baccarat', config: { bet: 'BANKER' } });
    const combo = getConfiguredGameExpectedRtpReference({
      game: 'baccarat',
      config: { betType: 'BANKER,TIE', playerBankerBet: '9', tieBet: '1' },
    });

    assert.strictEqual(banker.display, '98.94%');
    assert.strictEqual(banker.referenceType, 'calculated');
    assert.strictEqual(banker.calculationKind, 'exact');
    assert.ok(Math.abs(banker.value - 98.93600098947358) < 1e-12);

    assert.strictEqual(combo.display, '97.63%');
    assert.strictEqual(combo.referenceType, 'calculated');
    assert.strictEqual(combo.calculationKind, 'exact');
    assert.ok(Math.abs(combo.value - 97.63070218854734) < 1e-12);
  });

  it('exposes exact calculated RTP constants for each verified Baccarat bet class', () => {
    const variants = getGameCalculatedVariantReferences('baccarat');

    assert.deepStrictEqual(variants.map((variant) => ({
      variantLabel: variant.variantLabel,
      display: variant.calculated.display,
      maxPayout: variant.maxPayout.display,
    })), [
      { variantLabel: 'PLAYER', display: '98.77%', maxPayout: '2x' },
      { variantLabel: 'BANKER', display: '98.94%', maxPayout: '1.95x' },
      { variantLabel: 'TIE', display: '85.88%', maxPayout: '9x' },
    ]);
  });

  it('exposes exact calculated RTP constants for each verified Monkey Match mode', () => {
    const variants = getGameCalculatedVariantReferences('monkey-match');

    assert.deepStrictEqual(variants.map((variant) => ({
      variantLabel: variant.variantLabel,
      display: variant.calculated.display,
      maxPayout: variant.maxPayout.display,
    })), [
      { variantLabel: 'Low Risk', display: '97.99%', maxPayout: '50x' },
      { variantLabel: 'Normal Risk', display: '98.29%', maxPayout: '50x' },
    ]);
  });

  it('exposes exact calculated RTP constants for each verified Blocks mode and roll count', () => {
    const variants = getGameCalculatedVariantReferences('blocks');
    const byLabel = new Map(variants.map((variant) => [variant.variantLabel, variant]));

    assert.strictEqual(variants.length, 10);
    assert.strictEqual(byLabel.get('Low / 1 roll').calculated.display, '44.77%');
    assert.strictEqual(byLabel.get('Low / 5 rolls').maxPayout.display, '97,656,250,000,000,000x');
    assert.strictEqual(byLabel.get('High / 1 roll').calculated.display, '42.37%');
    assert.strictEqual(byLabel.get('High / 5 rolls').maxPayout.display, '3,125,000,000,000,000,000x');
  });

  it('uses the lowest verified exact RTP when Bear-A-Dice has multiple difficulty/roll variants', () => {
    const expected = getGameExpectedRtpReference('bear-dice');

    assert.strictEqual(expected.display, '97.25%');
    assert.strictEqual(expected.referenceType, 'calculated');
    assert.strictEqual(expected.calculationKind, 'exact');
    assert.ok(Math.abs(expected.value - 97.2529154277591) < 1e-12);
  });

  it('exposes exact calculated RTP constants for verified Bear-A-Dice difficulty and roll pairs', () => {
    const variants = getGameCalculatedVariantReferences('bear-dice');
    const byLabel = new Map(variants.map((variant) => [variant.variantLabel, variant]));

    assert.strictEqual(variants.length, 25);
    assert.strictEqual(byLabel.get('Easy / 1 roll').calculated.display, '97.89%');
    assert.strictEqual(byLabel.get('Normal / 5 rolls').calculated.display, '97.25%');
    assert.strictEqual(byLabel.get('Master / 5 rolls').maxPayout.display, '1,847,949.193x');
  });

  it('exposes exact calculated RTP constants for each verified Keno pick count and the best EV at 5 picks', () => {
    const variants = getGameCalculatedVariantReferences('keno');
    const byLabel = new Map(variants.map((variant) => [variant.variantLabel, variant]));

    assert.strictEqual(byLabel.get('Picks 1').calculated.display, '93.75%');
    assert.strictEqual(byLabel.get('Picks 5').calculated.display, '94.68%');
    assert.strictEqual(byLabel.get('Picks 10').maxPayout.display, '1,000,000x');

    const bestVariant = variants.reduce((best, candidate) => (
      candidate.calculated.value > best.calculated.value ? candidate : best
    ));

    assert.strictEqual(bestVariant.variantLabel, 'Picks 5');
    assert.strictEqual(bestVariant.calculated.value, 94.6801);
  });

  it('exposes exact calculated RTP constants for each verified Speed Keno pick count and the best EV at 5 picks', () => {
    const variants = getGameCalculatedVariantReferences('speed-keno');
    const byLabel = new Map(variants.map((variant) => [variant.variantLabel, variant]));

    assert.strictEqual(byLabel.get('Picks 1').calculated.display, '97.50%');
    assert.strictEqual(byLabel.get('Picks 5').calculated.display, '97.84%');
    assert.strictEqual(byLabel.get('Picks 5').maxPayout.display, '2,000x');

    const bestVariant = variants.reduce((best, candidate) => (
      candidate.calculated.value > best.calculated.value ? candidate : best
    ));

    assert.strictEqual(bestVariant.variantLabel, 'Picks 5');
    assert.strictEqual(bestVariant.calculated.value, 97.8377);
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

  it('uses the verified Blocks mode and roll table when runs are specified', () => {
    const expected = getConfiguredGameExpectedRtpReference({
      game: 'blocks',
      config: { mode: 1, runs: 5 },
    });
    const maxPayout = getConfiguredGameMaxPayoutReference({
      game: 'blocks',
      config: { mode: 1, runs: 5 },
    });

    assert.strictEqual(expected.display, '1.37%');
    assert.strictEqual(expected.referenceType, 'calculated');
    assert.strictEqual(expected.calculationKind, 'exact');
    assert.strictEqual(maxPayout.display, '3,125,000,000,000,000,000x');
  });

  it('uses the verified Bear-A-Dice payout table for configured RTP and max payout', () => {
    const expected = getConfiguredGameExpectedRtpReference({
      game: 'bear-dice',
      config: { difficulty: 4, rolls: 5 },
    });
    const maxPayout = getConfiguredGameMaxPayoutReference({
      game: 'bear-dice',
      config: { difficulty: 4, rolls: 5 },
    });

    assert.strictEqual(expected.display, '97.80%');
    assert.strictEqual(expected.referenceType, 'calculated');
    assert.strictEqual(expected.calculationKind, 'exact');
    assert.ok(Math.abs(expected.value - 97.79744326762116) < 1e-12);
    assert.strictEqual(maxPayout.display, '1,847,949.193x');
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

  it('canonicalizes Primes variants to difficulty only, ignoring runs', () => {
    const primes = resolveConfiguredGameVariant({
      game: 'primes',
      config: { difficulty: 3, runs: 20 },
    });

    assert.deepStrictEqual(primes, {
      gameKey: 'primes',
      variantKey: 'primes:mode:extreme',
      variantLabel: 'Extreme',
      rtpGame: 'primes',
      rtpConfig: { difficulty: 3 },
    });
  });

  it('canonicalizes Blocks variants by risk mode and runs', () => {
    const blocks = resolveConfiguredGameVariant({
      game: 'blocks',
      config: { mode: 1, runs: 5 },
    });

    assert.deepStrictEqual(blocks, {
      gameKey: 'blocks',
      variantKey: 'blocks:mode:hard:rolls:5',
      variantLabel: 'High / 5 rolls',
      rtpGame: 'blocks',
      rtpConfig: { mode: 1, runs: 5 },
    });
  });

  it('canonicalizes Roulette variants to chip counts by bet class', () => {
    const variant = resolveConfiguredGameVariant({
      game: 'roulette',
      config: { bet: '0,00,BLACK' },
    });

    assert.deepStrictEqual(variant, {
      gameKey: 'roulette',
      variantKey: 'roulette:chips:single-number:2:red-black:1',
      variantLabel: '2 Single Number, 1 Red/Black',
      rtpGame: 'roulette',
      rtpConfig: { bet: '0,00,BLACK' },
    });
  });

  it('canonicalizes Bear-A-Dice variants by exact difficulty and roll count', () => {
    const variant = resolveConfiguredGameVariant({
      game: 'bear-dice',
      config: { difficulty: 4, rolls: 5 },
    });

    assert.deepStrictEqual(variant, {
      gameKey: 'bear-dice',
      variantKey: 'bear-dice:difficulty:4:rolls:5',
      variantLabel: 'Master / 5 rolls',
      rtpGame: 'bear-dice',
      rtpConfig: { difficulty: 4, rolls: 5 },
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

  it('keeps unresolved max payout unavailable when different modes have different caps', () => {
    assert.strictEqual(getUniformGameMaxPayoutReference('blocks'), null);
    assert.strictEqual(getUniformGameMaxPayoutReference('baccarat'), null);
    assert.strictEqual(getUniformGameMaxPayoutReference('ape-strong'), null);
  });

  it('keeps unresolved max payout when every known mode shares the same cap', () => {
    const monkeyMatch = getUniformGameMaxPayoutReference('monkey-match');
    const sushi = getUniformGameMaxPayoutReference('sushi-showdown');

    assert.strictEqual(monkeyMatch.display, '50x');
    assert.strictEqual(monkeyMatch.value, 50);
    assert.strictEqual(sushi.display, '500x');
    assert.strictEqual(sushi.value, 500);
  });

  it('keeps max payout mode-specific when the config identifies a variant', () => {
    const exact = getConfiguredGameMaxPayoutReference({ game: 'keno', config: { picks: 5 } });
    const formula = getConfiguredGameMaxPayoutReference({ game: 'ape-strong', config: { range: 25 } });

    assert.strictEqual(exact.display, '200x');
    assert.strictEqual(formula.display, '3.9x');
  });

  it('uses the verified ApeStrong live payout table for configured RTP and max payout', () => {
    const rtp = getConfiguredGameExpectedRtpReference({
      game: 'ape-strong',
      config: { range: 75 },
    });
    const maxPayout = getConfiguredGameMaxPayoutReference({
      game: 'ape-strong',
      config: { range: 95 },
    });

    assert.strictEqual(rtp.display, '97.49%');
    assert.strictEqual(rtp.referenceType, 'calculated');
    assert.strictEqual(rtp.calculationKind, 'exact');
    assert.ok(Math.abs(rtp.value - 97.4925) < 1e-12);
    assert.strictEqual(maxPayout.display, '1.025x');
    assert.ok(Math.abs(maxPayout.value - 1.025) < 1e-12);
  });

  it('uses the verified live slot tables for all supported slot games', () => {
    const dino = getConfiguredGameExpectedRtpReference({
      game: 'dino-dough',
      config: { spins: 15 },
    });
    const bubblegum = getConfiguredGameExpectedRtpReference({
      game: 'bubblegum-heist',
      config: { spins: 7 },
    });
    const geez = getConfiguredGameExpectedRtpReference({
      game: 'geez-diggerz',
      config: { spins: 9 },
    });
    const sushi = getConfiguredGameExpectedRtpReference({
      game: 'sushi-showdown',
      config: { spins: 5 },
    });
    const dinoMaxPayout = getConfiguredGameMaxPayoutReference({
      game: 'dino-dough',
      config: { spins: 3 },
    });
    const bubblegumMaxPayout = getConfiguredGameMaxPayoutReference({
      game: 'bubblegum-heist',
      config: { spins: 10 },
    });
    const geezMaxPayout = getConfiguredGameMaxPayoutReference({
      game: 'geez-diggerz',
      config: { spins: 1 },
    });
    const sushiMaxPayout = getConfiguredGameMaxPayoutReference({
      game: 'sushi-showdown',
      config: { spins: 12 },
    });

    assert.strictEqual(dino.display, '97.90%');
    assert.strictEqual(dino.referenceType, 'calculated');
    assert.strictEqual(dino.calculationKind, 'exact');
    assert.ok(Math.abs(dino.value - 97.89751366817333) < 1e-12);

    assert.strictEqual(bubblegum.display, '97.80%');
    assert.strictEqual(bubblegum.referenceType, 'calculated');
    assert.strictEqual(bubblegum.calculationKind, 'exact');
    assert.ok(Math.abs(bubblegum.value - 97.79962375) < 1e-12);

    assert.strictEqual(geez.display, '97.69%');
    assert.strictEqual(geez.referenceType, 'calculated');
    assert.strictEqual(geez.calculationKind, 'exact');
    assert.ok(Math.abs(geez.value - 97.694552458612) < 1e-12);

    assert.strictEqual(sushi.display, '97.87%');
    assert.strictEqual(sushi.referenceType, 'calculated');
    assert.strictEqual(sushi.calculationKind, 'exact');
    assert.ok(Math.abs(sushi.value - 97.87165381190353) < 1e-12);

    assert.strictEqual(dinoMaxPayout.display, '333x');
    assert.strictEqual(bubblegumMaxPayout.display, '100x');
    assert.strictEqual(geezMaxPayout.display, '50x');
    assert.strictEqual(sushiMaxPayout.display, '500x');
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

  it('marks verified slot RTP references as exact rather than merely documented', () => {
    assert.strictEqual(stripAnsi(formatRtpTripletValues({ game: 'bubblegum-heist', currentRtp: null })), '97.80% 👌 / 97.26% / …');
    assert.strictEqual(stripAnsi(formatRtpTripletValues({ game: 'dino-dough', currentRtp: null })), '97.90% 👌 / 97.80% / …');
    assert.strictEqual(stripAnsi(formatRtpTripletValues({ game: 'geez-diggerz', currentRtp: null })), '97.69% 👌 / 97.25% / …');
    assert.strictEqual(stripAnsi(formatRtpTripletValues({ game: 'sushi-showdown', currentRtp: null })), '97.87% 👌 / 95.99% / …');
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
