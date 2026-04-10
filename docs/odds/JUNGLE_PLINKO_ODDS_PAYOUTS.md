# Jungle Plinko Odds and Payouts

> Summary: Exact per-ball payout distributions for every verified Jungle Plinko mode, derived from the contract-backed weighted-bucket tables.

This note summarizes the exact **per-ball** payout distributions for **Jungle Plinko** across all verified modes.

## How Jungle Plinko works

Jungle Plinko is not a peg-by-peg physics simulation in the contract. Each ball resolves as one weighted bucket draw against a fixed mode-specific cumulative table.

Ball count does **not** change the underlying per-ball distribution. It only changes variance and Solidity floor-division dust when the wager is split with `floor(totalBetAmount / numBalls)`.

## How to read the tables

- **Net Profit (>1x)** counts only buckets that return more than stake.
- **At Stake (>=1x)** adds exact `1x` buckets where they exist.
- **Partial Return (0<x<1x)** covers sub-stake buckets that still return something.
- Each numbered row is one distinct final multiplier, aggregated across any mirrored buckets with the same payout.

## Safe

| Rank | Outcome |
| --- | --- |
| RTP | `98.00%` |
| Net Profit (>1x) | `53.33%` (8/15) |
| At Stake (>=1x) | `53.33%` (8/15) |
| Partial Return (0<x<1x) | `46.67%` (7/15) |
| 1 | `1.2x @ 38.10% (8/21)` |
| 2 | `0.35x @ 19.05% (4/21)` |
| 3 | `0.5x @ 19.05% (4/21)` |
| 4 | `2.2x @ 15.24% (16/105)` |
| 5 | `0.3x @ 8.57% (3/35)` |

## Low

| Rank | Outcome |
| --- | --- |
| RTP | `97.97%` |
| Net Profit (>1x) | `40.00%` (2/5) |
| At Stake (>=1x) | `40.00%` (2/5) |
| Partial Return (0<x<1x) | `60.00%` (3/5) |
| 1 | `1.25x @ 26.67% (4/15)` |
| 2 | `0.4x @ 21.33% (16/75)` |
| 3 | `0.25x @ 20.27% (76/375)` |
| 4 | `0.6x @ 18.40% (23/125)` |
| 5 | `2.5x @ 10.67% (8/75)` |
| 6 | `5x @ 2.67% (2/75)` |

## Medium

| Rank | Outcome |
| --- | --- |
| RTP | `97.97%` |
| Net Profit (>1x) | `30.85%` (91/295) |
| At Stake (>=1x) | `30.85%` (91/295) |
| Partial Return (0<x<1x) | `69.15%` (204/295) |
| 1 | `0.3x @ 28.14% (83/295)` |
| 2 | `0.6x @ 27.12% (16/59)` |
| 3 | `1.2x @ 16.95% (10/59)` |
| 4 | `0.1x @ 13.90% (41/295)` |
| 5 | `2.5x @ 10.17% (6/59)` |
| 6 | `6.2x @ 3.39% (2/59)` |
| 7 | `15x @ 0.34% (1/295)` |

## High

| Rank | Outcome |
| --- | --- |
| RTP | `97.94%` |
| Net Profit (>1x) | `23.33%` (359/1539) |
| At Stake (>=1x) | `23.33%` (359/1539) |
| Partial Return (0<x<1x) | `76.67%` (1180/1539) |
| 1 | `0.2x @ 22.74% (350/1539)` |
| 2 | `0.25x @ 22.74% (350/1539)` |
| 3 | `0.5x @ 19.49% (100/513)` |
| 4 | `0.1x @ 11.70% (20/171)` |
| 5 | `1.5x @ 11.70% (20/171)` |
| 6 | `2.1x @ 7.15% (110/1539)` |
| 7 | `4.2x @ 2.60% (40/1539)` |
| 8 | `8.8x @ 1.04% (16/1539)` |
| 9 | `17.5x @ 0.52% (8/1539)` |
| 10 | `33x @ 0.26% (4/1539)` |
| 11 | `100x @ 0.06% (1/1539)` |

## Extreme

| Rank | Outcome |
| --- | --- |
| RTP | `97.99%` |
| Net Profit (>1x) | `22.18%` (5616/25321) |
| At Stake (>=1x) | `22.18%` (5616/25321) |
| Partial Return (0<x<1x) | `77.82%` (19705/25321) |
| 1 | `0.1x @ 24.68% (6250/25321)` |
| 2 | `0.2x @ 20.14% (5100/25321)` |
| 3 | `0.05x @ 17.20% (4355/25321)` |
| 4 | `0.4x @ 15.80% (4000/25321)` |
| 5 | `1.4x @ 9.87% (2500/25321)` |
| 6 | `2x @ 5.92% (1500/25321)` |
| 7 | `4x @ 3.95% (1000/25321)` |
| 8 | `9x @ 1.58% (400/25321)` |
| 9 | `15x @ 0.59% (150/25321)` |
| 10 | `35x @ 0.20% (50/25321)` |
| 11 | `100x @ 0.04% (10/25321)` |
| 12 | `250x @ 0.02% (5/25321)` |
| 13 | `1000x @ 0.00% (1/25321)` |

## Sources

1. [docs/verification/JUNGLE_PLINKO_CONTRACT.md](../verification/JUNGLE_PLINKO_CONTRACT.md) — verified weighted-bucket model, mode tables, and exact RTP references.
2. [lib/rtp.js](../../lib/rtp.js) — exact bucket-weight and payout tables used by the CLI.
