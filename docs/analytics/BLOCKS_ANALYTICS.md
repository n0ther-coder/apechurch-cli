# Blocks Odds and Payouts

> Summary: Exact `Low` / `High` consecutive-roll analytics for Blocks, derived from exhaustive enumeration of all `6^9 = 10,077,696` possible `3x3` boards and the verified contract's max-of-a-kind rule.

This note summarizes the exact Blocks payout surface across the verified `Low` and `High` modes and all supported consecutive-roll counts (`1` to `5`).

## How Blocks works

Each Blocks roll resolves a `3x3` board with `9` tiles and `6` equally likely colors. The contract does **not** search for connected components. It counts how many times each color appears and uses the **largest same-color count** (`max-of-a-kind`) as the payout key.

For the chosen mode and roll count, each **surviving** roll multiplies the current payout by the verified multiplier for that roll's max count, while any **dead** count is an immediate loss for the whole game. There is **no cash-out** and **no partial payout**: Blocks is strictly **all-or-nothing** across consecutive rolls.

Mode names should be read as:

- `Low` = pays from max count `3` upward.
- `High` = pays only from max count `4` upward.

## Exact single-roll max-count distribution

The table below is the exact result of enumerating all `10,077,696` possible `3x3` boards. It matches the public Blocks page percentages when rounded to four decimals.

| Largest Same-Color Count | Exact Boards | Probability | Low | High |
|---:|---:|---:|---:|---:|
| 2 | `1,587,600` | `15.754%` | `0.00x` | `0.00x` |
| 3 | `5,628,000` | `55.846%` | `1.01x` | `0.00x` |
| 4 | `2,320,920` | `23.030%` | `1.20x` | `2.25x` |
| 5 | `472,500` | `4.689%` | `2.00x` | `6.60x` |
| 6 | `63,000` | `0.625%` | `5.00x` | `15.00x` |
| 7 | `5,400` | `0.054%` | `20.00x` | `80.00x` |
| 8 | `270` | `0.003%` | `200.00x` | `600.00x` |
| 9 | `6` | `0.000%` | `2500.00x` | `5000.00x` |

There is no largest count `1` on a `9`-tile board with `6` colors.

## How to read the roll tables

- `RTP`, `Win`, and `Loss` are computed from the full exact max-count distribution for that mode and roll count.
- The max-count rows are a compact same-count ladder: row `k` means every surviving roll hit count `k`, so the cell shows `k x k x ... x k`.
- This keeps the matrix readable while still anchoring each column from the lowest to the highest paying count.
- All displayed multipliers are rounded to 2 decimals.
- All displayed percentages are rounded to 3 decimals.

## Low

| Max Count | Survive 1 roll | Survive 2 rolls | Survive 3 rolls | Survive 4 rolls | Survive 5 rolls |
|---|---|---|---|---|---|
| RTP | `98.300%` | `96.629%` | `94.986%` | `93.372%` | `91.785%` |
| Win | `84.246%` | `70.975%` | `59.794%` | `50.374%` | `42.438%` |
| Loss | `0x @ 15.754%` | `0x @ 29.025%` | `0x @ 40.206%` | `0x @ 49.626%` | `0x @ 57.562%` |
| 3 | `1.01x @ 55.846%` | `1.02x @ 31.188%` | `1.03x @ 17.417%` | `1.04x @ 9.727%` | `1.05x @ 5.432%` |
| 4 | `1.20x @ 23.030%` | `1.44x @ 5.304%` | `1.73x @ 1.222%` | `2.07x @ 0.281%` | `2.49x @ 0.065%` |
| 5 | `2.00x @ 4.689%` | `4.00x @ 0.220%` | `8.00x @ 0.010%` | `16.00x @ 0.000%` | `32.00x @ 0.000%` |
| 6 | `5.00x @ 0.625%` | `25.00x @ 0.004%` | `125.00x @ 0.000%` | `625.00x @ 0.000%` | `3125.00x @ 0.000%` |
| 7 | `20.00x @ 0.054%` | `400.00x @ 0.000%` | `8000.00x @ 0.000%` | `160000.00x @ 0.000%` | `3200000.00x @ 0.000%` |
| 8 | `200.00x @ 0.003%` | `40000.00x @ 0.000%` | `8000000.00x @ 0.000%` | `1600000000.00x @ 0.000%` | `320000000000.00x @ 0.000%` |
| 9 | `2500.00x @ 0.000%` | `6250000.00x @ 0.000%` | `15625000000.00x @ 0.000%` | `39062500000000.00x @ 0.000%` | `97656250000000000.00x @ 0.000%` |

## High

| Max Count | Survive 1 roll | Survive 2 rolls | Survive 3 rolls | Survive 4 rolls | Survive 5 rolls |
|---|---|---|---|---|---|
| RTP | `98.332%` | `96.691%` | `95.078%` | `93.492%` | `91.932%` |
| Win | `28.400%` | `8.066%` | `2.291%` | `0.651%` | `0.185%` |
| Loss | `0x @ 71.600%` | `0x @ 91.934%` | `0x @ 97.709%` | `0x @ 99.349%` | `0x @ 99.815%` |
| 4 | `2.25x @ 23.030%` | `5.06x @ 5.304%` | `11.39x @ 1.222%` | `25.63x @ 0.281%` | `57.67x @ 0.065%` |
| 5 | `6.60x @ 4.689%` | `43.56x @ 0.220%` | `287.50x @ 0.010%` | `1897.47x @ 0.000%` | `12523.33x @ 0.000%` |
| 6 | `15.00x @ 0.625%` | `225.00x @ 0.004%` | `3375.00x @ 0.000%` | `50625.00x @ 0.000%` | `759375.00x @ 0.000%` |
| 7 | `80.00x @ 0.054%` | `6400.00x @ 0.000%` | `512000.00x @ 0.000%` | `40960000.00x @ 0.000%` | `3276800000.00x @ 0.000%` |
| 8 | `600.00x @ 0.003%` | `360000.00x @ 0.000%` | `216000000.00x @ 0.000%` | `129600000000.00x @ 0.000%` | `77760000000000.00x @ 0.000%` |
| 9 | `5000.00x @ 0.000%` | `25000000.00x @ 0.000%` | `125000000000.00x @ 0.000%` | `625000000000000.00x @ 0.000%` | `3125000000000000000.00x @ 0.000%` |

## Variance

Variance is computed over `X = payout / stake` for the full Blocks game. Unlike batched games, consecutive Blocks rolls are not averaged: surviving rolls compound the payout and any dead roll zeroes the whole game. That makes variance grow sharply as roll count increases.

| Mode | Rolls | RTP | Variance | Std. Dev. |
| --- | ---: | ---: | ---: | ---: |
| Low | 1 | `98.3001%` | `5.285957` | `2.299121` |
| Low | 2 | `96.6291%` | `38.156879` | `6.177125` |
| Low | 5 | `91.7845%` | `9553.058592` | `97.739749` |
| High | 1 | `98.3317%` | `31.606680` | `5.621982` |
| High | 2 | `96.6912%` | `1060.103974` | `32.559238` |
| High | 5 | `91.9322%` | `36671464.115827` | `6055.696832` |

## Sources

1. [docs/verification/BLOCKS_CONTRACT.md](../verification/BLOCKS_CONTRACT.md) - verified ABI surface, official mode naming, and max-of-a-kind settlement rule.
2. [original-games.md](https://docs.ape.church/games/player-vs-house/original-games.md) - official Blocks gameplay wording (`risk level`, `consecutive rolls`, and multipliers applied to the wager).
3. [lib/rtp.js](../../lib/rtp.js) - exact Blocks constants and RTP references used by the CLI.
