# Blocks Odds and Payouts

> Summary: Exact `Low` / `High` consecutive-roll analytics for Blocks, derived from exhaustive enumeration of all `6^9 = 10,077,696` possible `3x3` boards.

This note summarizes the exact Blocks payout surface across the verified `Low` and `High` modes and all supported consecutive-roll counts (`1` to `5`).

## How Blocks works

Each Blocks roll resolves a `3x3` board with `9` tiles and `6` equally likely colors. Only the **largest connected same-color cluster** matters.

For the chosen mode and roll count, each **surviving** roll multiplies the current payout by the verified cluster multiplier for that board, while any **dead** cluster is an immediate loss for the whole game. There is **no cash-out** and **no partial payout**: Blocks is strictly **all-or-nothing** across consecutive rolls.

Mode names should be read as:

- `Low` = pays from cluster `3` upward.
- `High` = pays only from cluster `4` upward.

## Exact single-roll cluster distribution

The table below is not based on the rounded public percentages. It is the exact result of enumerating all `10,077,696` possible `3x3` boards.

| Largest Cluster | Exact Boards | Probability | Low | High |
|---:|---:|---:|---:|---:|
| 1 | `1,166,910` | `11.579%` (`≈ 1.944 / 1.679 E-1`) | `0.00x` | `0.00x` |
| 2 | `5,094,600` | `50.553%` (`≈ 2.122 / 4.199`) | `0.00x` | `0.00x` |
| 3 | `2,760,840` | `27.396%` (`≈ 3.834 / 1.399 E-1`) | `1.01x` | `0.00x` |
| 4 | `814,920` | `8.086%` (`≈ 3.395 / 4.199 E-1`) | `1.20x` | `2.25x` |
| 5 | `198,750` | `1.972%` (`≈ 3.312 / 1.679 E-2`) | `2.00x` | `6.60x` |
| 6 | `36,600` | `0.363%` (`≈ 1.525 / 4.199 E-2`) | `5.00x` | `15.00x` |
| 7 | `4,800` | `0.048%` (`≈ 2.500 / 5.248 E-3`) | `20.00x` | `80.00x` |
| 8 | `270` | `0.003%` (`≈ 5.000 / 1.866 E-5`) | `200.00x` | `600.00x` |
| 9 | `6` | `0.000%` (`≈ 1.000 / 1.679 E-6`) | `2500.00x` | `5000.00x` |

## How to read the roll tables

- `RTP`, `Win`, and `Loss` are computed from the **full exact mixed-cluster distribution** for that mode and roll count.
- The cluster rows are a compact **same-cluster ladder**: row `k` means every surviving roll hit cluster `k`, so the cell shows `k × k × ... × k`.
- This keeps the matrix readable while still anchoring each column from the lowest to the highest paying cluster.
- All displayed multipliers are rounded to **2 decimals**.
- All displayed percentages are rounded to **3 decimals**.
- Every probability also includes a compact `a / b E-n` ratio. The exponent applies to the whole ratio and is omitted when it would be `E0`.

## Low

| Cluster | Survive 1 roll | Survive 2 rolls | Survive 3 rolls | Survive 4 rolls | Survive 5 rolls |
|---|---|---|---|---|---|
| RTP | `44.771%` | `20.044%` | `8.974%` | `4.018%` | `1.799%` |
| Win | `37.868%` (`≈ 6.360 / 1.679 E-1`) | `14.340%` (`≈ 4.045 / 2.821 E-1`) | `5.430%` (`≈ 2.572 / 4.738 E-1`) | `2.056%` (`≈ 1.636 / 7.958 E-1`) | `0.779%` (`≈ 1.040 / 1.336 E-2`) |
| Loss | `0x @ 62.132%` (`≈ 1.043 / 1.679`) | `0x @ 85.660%` (`≈ 2.416 / 2.821`) | `0x @ 94.570%` (`≈ 4.481 / 4.738`) | `0x @ 97.944%` (`≈ 7.795 / 7.958`) | `0x @ 99.221%` (`≈ 1.326 / 1.336`) |
| 3 | `1.01x @ 27.396%` (`≈ 3.834 / 1.399 E-1`) | `1.02x @ 7.505%` (`≈ 1.470 / 1.959 E-1`) | `1.03x @ 2.056%` (`≈ 5.638 / 2.742 E-2`) | `1.04x @ 0.563%` (`≈ 2.161 / 3.838 E-2`) | `1.05x @ 0.154%` (`≈ 8.289 / 5.372 E-3`) |
| 4 | `1.20x @ 8.086%` (`≈ 3.395 / 4.199 E-1`) | `1.44x @ 0.654%` (`≈ 1.152 / 1.763 E-2`) | `1.73x @ 0.053%` (`≈ 3.914 / 7.403 E-3`) | `2.07x @ 0.004%` (`≈ 1.329 / 3.108 E-4`) | `2.49x @ 0.000%` (`≈ 4.513 / 1.305 E-6`) |
| 5 | `2.00x @ 1.972%` (`≈ 3.312 / 1.679 E-2`) | `4.00x @ 0.039%` (`≈ 1.097 / 2.821 E-3`) | `8.00x @ 0.001%` (`≈ 3.634 / 4.738 E-5`) | `16.00x @ 0.000%` (`≈ 1.203 / 7.958 E-6`) | `32.00x @ 0.000%` (`≈ 3.988 / 1.336 E-9`) |
| 6 | `5.00x @ 0.363%` (`≈ 1.525 / 4.199 E-2`) | `25.00x @ 0.001%` (`≈ 2.325 / 1.763 E-5`) | `125.00x @ 0.000%` (`≈ 3.546 / 7.403 E-7`) | `625.00x @ 0.000%` (`≈ 5.408 / 3.108 E-10`) | `3125.00x @ 0.000%` (`≈ 8.248 / 1.305 E-13`) |
| 7 | `20.00x @ 0.048%` (`≈ 2.500 / 5.248 E-3`) | `400.00x @ 0.000%` (`≈ 6.250 / 2.754 E-7`) | `8000.00x @ 0.000%` (`≈ 1.562 / 1.446 E-10`) | `160000.00x @ 0.000%` (`≈ 3.906 / 7.589 E-13`) | `3200000.00x @ 0.000%` (`≈ 9.765 / 3.983 E-17`) |
| 8 | `200.00x @ 0.003%` (`≈ 5.000 / 1.866 E-5`) | `40000.00x @ 0.000%` (`≈ 2.500 / 3.482 E-9`) | `8000000.00x @ 0.000%` (`≈ 1.250 / 6.499 E-13`) | `1600000000.00x @ 0.000%` (`≈ 6.250 / 1.213 E-19`) | `320000000000.00x @ 0.000%` (`≈ 3.125 / 2.263 E-23`) |
| 9 | `2500.00x @ 0.000%` (`≈ 1.000 / 1.679 E-6`) | `6250000.00x @ 0.000%` (`≈ 1.000 / 2.821 E-12`) | `15625000000.00x @ 0.000%` (`≈ 1.000 / 4.738 E-18`) | `39062500000000.00x @ 0.000%` (`≈ 1.000 / 7.958 E-24`) | `97656250000000000.00x @ 0.000%` (`≈ 1.000 / 1.336 E-31`) |

## High

| Cluster | Survive 1 roll | Survive 2 rolls | Survive 3 rolls | Survive 4 rolls | Survive 5 rolls |
|---|---|---|---|---|---|
| RTP | `42.374%` | `17.956%` | `7.608%` | `3.224%` | `1.366%` |
| Win | `10.472%` (`≈ 1.758 / 1.679 E-1`) | `1.097%` (`≈ 3.093 / 2.821 E-2`) | `0.115%` (`≈ 5.441 / 4.738 E-3`) | `0.012%` (`≈ 9.571 / 7.958 E-4`) | `0.001%` (`≈ 1.683 / 1.336 E-5`) |
| Loss | `0x @ 89.528%` (`≈ 1.503 / 1.679`) | `0x @ 98.903%` (`≈ 2.790 / 2.821`) | `0x @ 99.885%` (`≈ 4.732 / 4.738`) | `0x @ 99.988%` (`≈ 7.957 / 7.958`) | `0x @ 99.999%` (`≈ 1.336 / 1.336`) |
| 4 | `2.25x @ 8.086%` (`≈ 3.395 / 4.199 E-1`) | `5.06x @ 0.654%` (`≈ 1.152 / 1.763 E-2`) | `11.39x @ 0.053%` (`≈ 3.914 / 7.403 E-3`) | `25.63x @ 0.004%` (`≈ 1.329 / 3.108 E-4`) | `57.67x @ 0.000%` (`≈ 4.513 / 1.305 E-6`) |
| 5 | `6.60x @ 1.972%` (`≈ 3.312 / 1.679 E-2`) | `43.56x @ 0.039%` (`≈ 1.097 / 2.821 E-3`) | `287.50x @ 0.001%` (`≈ 3.634 / 4.738 E-5`) | `1897.47x @ 0.000%` (`≈ 1.203 / 7.958 E-6`) | `12523.33x @ 0.000%` (`≈ 3.988 / 1.336 E-9`) |
| 6 | `15.00x @ 0.363%` (`≈ 1.525 / 4.199 E-2`) | `225.00x @ 0.001%` (`≈ 2.325 / 1.763 E-5`) | `3375.00x @ 0.000%` (`≈ 3.546 / 7.403 E-7`) | `50625.00x @ 0.000%` (`≈ 5.408 / 3.108 E-10`) | `759375.00x @ 0.000%` (`≈ 8.248 / 1.305 E-13`) |
| 7 | `80.00x @ 0.048%` (`≈ 2.500 / 5.248 E-3`) | `6400.00x @ 0.000%` (`≈ 6.250 / 2.754 E-7`) | `512000.00x @ 0.000%` (`≈ 1.562 / 1.446 E-10`) | `40960000.00x @ 0.000%` (`≈ 3.906 / 7.589 E-13`) | `3276800000.00x @ 0.000%` (`≈ 9.765 / 3.983 E-17`) |
| 8 | `600.00x @ 0.003%` (`≈ 5.000 / 1.866 E-5`) | `360000.00x @ 0.000%` (`≈ 2.500 / 3.482 E-9`) | `216000000.00x @ 0.000%` (`≈ 1.250 / 6.499 E-13`) | `129600000000.00x @ 0.000%` (`≈ 6.250 / 1.213 E-19`) | `77760000000000.00x @ 0.000%` (`≈ 3.125 / 2.263 E-23`) |
| 9 | `5000.00x @ 0.000%` (`≈ 1.000 / 1.679 E-6`) | `25000000.00x @ 0.000%` (`≈ 1.000 / 2.821 E-12`) | `125000000000.00x @ 0.000%` (`≈ 1.000 / 4.738 E-18`) | `625000000000000.00x @ 0.000%` (`≈ 1.000 / 7.958 E-24`) | `3125000000000000000.00x @ 0.000%` (`≈ 1.000 / 1.336 E-31`) |

## Sources

1. [docs/verification/BLOCKS_CONTRACT.md](../verification/BLOCKS_CONTRACT.md) — verified ABI surface, official mode naming, and the repo's consecutive-roll interpretation.
2. [original-games.md](https://docs.ape.church/games/player-vs-house/original-games.md) — official Blocks gameplay wording (`risk level`, `consecutive rolls`, and multipliers applied to the wager).
3. [lib/rtp.js](../../lib/rtp.js) — exact Blocks constants and RTP references used by the CLI.
