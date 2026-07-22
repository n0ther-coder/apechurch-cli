# Video Poker Odds and Payouts

> Summary: Exact documented final-hand payout surface for Video Poker / Gimboz Poker, with jackpot formula and explicit limits for strategy-dependent pre-draw analytics.

This note captures the exact final-hand/paytable surface documented for the verified Video Poker contract. It does not attempt to publish a single strategy-independent pre-draw distribution: manual hold choices and the `--auto best` solver produce policy-dependent paths.

## Verified Paytable Surface

The base paytable is fixed across the supported `10`, `25`, `50`, `100`, `250`, and `400 APE` denominations. The `400 APE` denomination is additionally jackpot-eligible on Royal Flush.

| Final Hand | Payout | Probability |
|------------|-------:|------------:|
| Royal Flush | `250x` | `0.0025%` |
| Straight Flush | `50x` | `0.0108%` |
| Four of a Kind | `25x` | `0.2363%` |
| Full House | `9x` | `1.1512%` |
| Flush | `6x` | `1.0995%` |
| Straight | `4x` | `1.1214%` |
| Three of a Kind | `3x` | `7.4449%` |
| Two Pair | `2x` | `12.9279%` |
| Jacks or Better | `1x` | `21.4585%` |
| Nothing | `0x` | `54.5470%` |

## Summary Stats

| Metric | Value |
|--------|------:|
| Exact base RTP | `98.1649%` |
| Net profit (`>1x`) | `23.9944%` |
| Push (`=1x`) | `21.4585%` |
| Loss (`0x`) | `54.5470%` |
| Max base payout | `250x` |

For the `400 APE` denomination, jackpot uplift is:

```text
RTP = 98.1649% + jackpot_ape / 160,000
Royal Flush payout multiplier = 250 + jackpot_ape / 400
```

## Variance

Variance is computed over `X = payout / stake`, using the documented final-hand probability surface above and excluding progressive jackpot uplift.

| Mode | RTP | Variance | Std. Dev. |
|------|----:|---------:|----------:|
| Base paytable, jackpot excluded | `98.1649%` | `5.255198` | `2.292422` |

With jackpot uplift at the `400 APE` denomination, let `b = jackpot_ape / 400` be the extra Royal Flush multiplier and `p = 0.000025` be the documented Royal Flush probability:

```text
E[X]_jackpot = 0.981649 + p * b
E[X^2]_jackpot = E[X^2]_base + p * ((250 + b)^2 - 250^2)
Var(X)_jackpot = E[X^2]_jackpot - E[X]_jackpot^2
```

## What Is Strategy-Dependent

- The contract supports one redraw decision; a player may hold any subset of the initial five cards.
- The local `--auto best` path evaluates hold choices exactly for the observed hand, but aggregating those decisions into a compact pre-draw distribution is a different strategy artifact.
- Standing pat costs no redraw VRF fee; replacing at least one card adds `vrfFeeRedraw()`. Fee-aware bankroll variance therefore depends on the selected hold policy.

## Sources

1. [docs/verification/VIDEO_POKER_CONTRACT.md](../verification/VIDEO_POKER_CONTRACT.md) - verified ABI surface, paytable, jackpot rule, and exact RTP notes.
2. [lib/stateful/video-poker/constants.js](../../lib/stateful/video-poker/constants.js) - local paytable and bet denomination constants.
3. [lib/stateful/video-poker/solver.js](../../lib/stateful/video-poker/solver.js) - exact per-hand hold EV solver.
