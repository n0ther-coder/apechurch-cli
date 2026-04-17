# Blocks Odds and Payouts

> Summary: Exact per-run payout distributions for both verified Blocks modes, derived from the verified contract path plus the published largest-cluster probability table.

This note summarizes the exact **per-run** payout distributions for **Blocks** across the verified `Easy` and `Hard` modes.

## How Blocks works

Each run resolves a `3x3` board with `9` blocks and `6` possible colors. The only statistic that matters for payout is the **largest connected color cluster** on the final board.

Mode changes the payout table only:

- **Easy** starts paying at a `3`-block cluster.
- **Hard** zeroes the `3`-block cluster and shifts value into rarer high-end outcomes.

Run count does **not** change the underlying per-run distribution. It only adds Solidity floor-division dust because the contract splits the total wager with `floor(totalBetAmount / numRuns)`.

## How to read the table

- **Positive Payout (>0x)** and **Net Profit (>1x)** are identical for Blocks, because every paying outcome is above stake.
- **Loss (0x)** covers all non-paying cluster outcomes for that mode.
- Each cluster row shows the exact multiplier together with its unconditional probability.

| Row | Easy | Hard |
| --- | --- | --- |
| RTP | `98.41%` | `98.55%` |
| Positive Payout (>0x) | `84.25%` | `28.40%` |
| Net Profit (>1x) | `84.25%` | `28.40%` |
| Loss (0x) | `0x @ 15.7535%` (`largest cluster < 3`) | `0x @ 71.5996%` (`largest cluster < 4`) |
| Largest cluster = 3 | `1.01x @ 55.8461%` | `0x @ 55.8461%` |
| Largest cluster = 4 | `1.2x @ 23.0303%` | `2.25x @ 23.0303%` |
| Largest cluster = 5 | `2x @ 4.6886%` | `6.6x @ 4.6886%` |
| Largest cluster = 6 | `5x @ 0.6251%` | `15x @ 0.6251%` |
| Largest cluster = 7 | `20x @ 0.0536%` | `80x @ 0.0536%` |
| Largest cluster = 8 | `200x @ 0.0027%` | `600x @ 0.0027%` |
| Largest cluster = 9 | `2500x @ 0.0001%` | `5000x @ 0.0001%` |

## Sources

1. [docs/verification/BLOCKS_CONTRACT.md](../verification/BLOCKS_CONTRACT.md) — verified tuple layout, fee path, and published cluster table used by the CLI.
2. [lib/rtp.js](../../lib/rtp.js) — exact Blocks mode constants used by the CLI.
