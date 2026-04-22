# Cosmic Plinko Odds and Payouts

> Summary: Exact per-ball payout distributions for every verified Cosmic Plinko mode, derived from the contract-backed weighted-bucket tables.

This note summarizes the exact **per-ball** payout distributions for **Cosmic Plinko** across all verified modes.

## How Cosmic Plinko works

Cosmic Plinko is not a peg-by-peg physics simulation in the contract. Each ball resolves as one weighted bucket draw against a fixed mode-specific cumulative table.

Ball count does **not** change the underlying per-ball distribution. It only changes variance and Solidity floor-division dust when the wager is split with `floor(totalBetAmount / numBalls)`.

## How to read the tables

- **Net Profit (>1x)** counts only buckets that return more than stake.
- **At Stake (>=1x)** adds exact `1x` buckets where they exist.
- **Partial Return (0<x<1x)** covers sub-stake buckets that still return something.
- Each numbered row is one distinct final multiplier, aggregated across any mirrored buckets with the same payout.

## Low

| Rank | Outcome |
| --- | --- |
| RTP | `97.73%` |
| Net Profit (>1x) | `17.20%` (156/907) |
| At Stake (>=1x) | `17.20%` (156/907) |
| Partial Return (0<x<1x) | `82.80%` (751/907) |
| 1 | `0.4x @ 82.80% (751/907)` |
| 2 | `1.2x @ 6.62% (60/907)` |
| 3 | `2x @ 4.41% (40/907)` |
| 4 | `3x @ 3.31% (30/907)` |
| 5 | `7x @ 1.54% (14/907)` |
| 6 | `11x @ 0.66% (6/907)` |
| 7 | `20x @ 0.44% (4/907)` |
| 8 | `50x @ 0.22% (2/907)` |

## Modest

| Rank | Outcome |
| --- | --- |
| RTP | `97.76%` |
| Net Profit (>1x) | `9.87%` (86/871) |
| At Stake (>=1x) | `9.87%` (86/871) |
| Partial Return (0<x<1x) | `90.13%` (785/871) |
| 1 | `0.3x @ 80.37% (700/871)` |
| 2 | `0.5x @ 9.76% (85/871)` |
| 3 | `2x @ 5.74% (50/871)` |
| 4 | `5x @ 2.30% (20/871)` |
| 5 | `11x @ 1.03% (9/871)` |
| 6 | `25x @ 0.46% (4/871)` |
| 7 | `50x @ 0.23% (2/871)` |
| 8 | `100x @ 0.11% (1/871)` |

## High

| Rank | Outcome |
| --- | --- |
| RTP | `97.80%` |
| Net Profit (>1x) | `14.37%` (209/1454) |
| At Stake (>=1x) | `14.37%` (209/1454) |
| Partial Return (0<x<1x) | `85.63%` (1245/1454) |
| 1 | `0.1x @ 58.12% (845/1454)` |
| 2 | `0.4x @ 27.51% (200/727)` |
| 3 | `1.5x @ 6.19% (45/727)` |
| 4 | `3x @ 4.13% (30/727)` |
| 5 | `5x @ 2.06% (15/727)` |
| 6 | `10x @ 1.20% (35/2908)` |
| 7 | `25x @ 0.52% (15/2908)` |
| 8 | `50x @ 0.17% (5/2908)` |
| 9 | `100x @ 0.07% (1/1454)` |
| 10 | `250x @ 0.03% (1/2908)` |

## Scoreboard

#### `play cosmic 120 --risk high --balls 30 --loop --max-games 100`

|      payout | game title    | game mode        |     bet | multiplier | datetime UTC             |
|-------------|---------------|------------------|---------|------------|--------------------------|
| 1036.40 APE | Cosmic Plinko | High             | 120 APE |      8.64x | [2026-04-20T10:28:32.000Z](https://www.ape.church/games/cosmic-plinko?id=68560375314317493137151539550036327114428585860911247097385292306264852445280) |

## Sources

1. [docs/verification/COSMIC_PLINKO_CONTRACT.md](../verification/COSMIC_PLINKO_CONTRACT.md) — verified weighted-bucket model, mode tables, and exact RTP references.
2. [lib/rtp.js](../../lib/rtp.js) — exact bucket-weight and payout tables used by the CLI.
