# Speed Keno Odds and Payouts

> Summary: Exact hit-count payout distributions for every verified Speed Keno pick count, derived from the contract-backed hypergeometric draw model.

This note summarizes the exact **hit-count payout distributions** for **Speed Keno** across every verified pick count.

## How Speed Keno works

Speed Keno draws 5 winning numbers from `20` without replacement. Because the draw is symmetric, the exact distribution depends only on how many numbers you pick, not on which specific numbers you chose.

## How to read the table

- **Positive Payout (>0x)** includes both profitable outcomes and partial returns under `1x`.
- **Net Profit (>1x)** counts only the hit counts that return more than stake.
- **Partial Return (0<x<1x)** isolates outcomes that pay something back but still lose money net.
- Each `Hits h` row shows the exact multiplier together with its unconditional probability.

| Row | Picks 1 | Picks 2 | Picks 3 | Picks 4 | Picks 5 |
| --- | --- | --- | --- | --- | --- |
| RTP | `97.50%` | `97.37%` | `97.81%` | `97.42%` | `97.84%` |
| Positive Payout (>0x) | `100.00%` (1/1) | `100.00%` (1/1) | `100.00%` (1/1) | `100.00%` (1/1) | `100.00%` (1/1) |
| Net Profit (>1x) | `25.00%` (1/4) | `44.74%` (17/38) | `14.04%` (8/57) | `24.87%` (241/969) | `26.63%` (4129/15504) |
| Partial Return (0<x<1x) | `75.00%` (3/4) | `55.26%` (21/38) | `85.96%` (49/57) | `75.13%` (728/969) | `73.37%` (11375/15504) |
| Loss (0x) | `0x` @ `0.00%` (0/1) | `0x` @ `0.00%` (0/1) | `0x` @ `0.00%` (0/1) | `0x` @ `0.00%` (0/1) | `0x` @ `0.00%` (0/1) |
| Hits 0 | `0.5x @ 75.00% (3/4)` | `0.25x @ 55.26% (21/38)` | `0.5x @ 39.91% (91/228)` | `0.5x @ 28.17% (91/323)` | `1.25x @ 19.37% (1001/5168)` |
| Hits 1 | `2.4x @ 25.00% (1/4)` | `1.45x @ 39.47% (15/38)` | `0.5x @ 46.05% (35/76)` | `0.5x @ 46.96% (455/969)` | `0.2x @ 44.02% (2275/5168)` |
| Hits 2 |  | `5x @ 5.26% (1/19)` | `2.5x @ 13.16% (5/38)` | `1.5x @ 21.67% (70/323)` | `0.5x @ 29.35% (2275/7752)` |
| Hits 3 |  |  | `25x @ 0.88% (1/114)` | `5.5x @ 3.10% (10/323)` | `3x @ 6.77% (175/2584)` |
| Hits 4 |  |  |  | `100x @ 0.10% (1/969)` | `35x @ 0.48% (25/5168)` |
| Hits 5 |  |  |  |  | `2000x @ 0.01% (1/15504)` |

## Sources

1. [docs/verification/SPEED_KENO_CONTRACT.md](../verification/SPEED_KENO_CONTRACT.md) — verified payout matrix, draw model, and exact RTP references.
2. [lib/rtp.js](../../lib/rtp.js) — exact RTP constants used by the CLI for the verified pick counts.
