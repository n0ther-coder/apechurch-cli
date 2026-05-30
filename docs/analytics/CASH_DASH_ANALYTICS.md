# Cash Dash Odds and Payouts

> Summary: Exact row-level and fixed-depth cash-out analytics for Cash Dash. Whole-run RTP remains policy-dependent because the player can cash out after any safe row.

Cash Dash is a stateful death-tile ladder. Each row has one death tile. A safe guess multiplies the current cash-out value by the row payout; a death hit ends the run with `0x`.

There is no single canonical full-game distribution unless a cash-out policy is specified. The exact tables below use deterministic policies such as "cash out after `N` safe rows."

## Exact Row Formula

For a row with `t` tiles:

```text
P(safe) = (t - 1) / t
P(death) = 1 / t
safe payout = rowPayouts[t] / 10_000
one-step RTP = P(safe) * safe payout
Var(X) = P(safe) * safePayout^2 - oneStepRTP^2
```

This is gross game payout variance before VRF fees. The CLI's one-step net EV display can subtract the next VRF fee from continuation EV, but that fee is a deterministic cost for the action and does not change gross payout variance.

## Variance

The one-step and fixed-depth tables below both include exact variance over `X = payout / initial stake`. In the one-step table, the stake basis is the current row wager. In the fixed-depth table, the stake basis is the original Cash Dash start amount and the only positive outcome is cashing out at the target depth.

## One-Step Row Surface

| Tiles | Safe | Multiplier | One-step RTP | Variance | Std. Dev. |
|------:|-----:|-----------:|-------------:|---------:|----------:|
| `2` | `1/2` | `1.9200x` | `96.0000%` | `0.921600` | `0.960000` |
| `3` | `2/3` | `1.4400x` | `96.0000%` | `0.460800` | `0.678823` |
| `4` | `3/4` | `1.2800x` | `96.0000%` | `0.307200` | `0.554256` |
| `5` | `4/5` | `1.2000x` | `96.0000%` | `0.230400` | `0.480000` |
| `6` | `5/6` | `1.1500x` | `95.8333%` | `0.183681` | `0.428580` |
| `7` | `6/7` | `1.1000x` | `94.2857%` | `0.148163` | `0.384920` |

## Seed 0 Row Schedule

The CLI starts with `tilesetSeed = 0`. The local row helper matches the verified contract formula:

```text
round index i = 0, 1, 2, ...
if i > 0 and i % 20 == 0: tiles = 2
otherwise: tiles = 7 - (i % 5)
```

So the visible opening rows are `7, 6, 5, 4, 3`, repeating until round index `20`, where the next row uses `2` tiles.

## Fixed-Depth Cash-Out Examples

This table assumes `tilesetSeed = 0`, always chooses a still-hidden tile, and cashes out immediately after exactly `N` safe rows. It excludes VRF fees and any off-table transaction costs.

| Safe rows before cash-out | Final row tiles | Survival probability | Cash-out multiplier | RTP | Variance | Std. Dev. |
|--------------------------:|----------------:|---------------------:|--------------------:|----:|---------:|----------:|
| `1` | `7` | `85.714286%` | `1.100000x` | `94.285714%` | `0.148163` | `0.384920` |
| `2` | `6` | `71.428571%` | `1.265000x` | `90.357143%` | `0.326577` | `0.571469` |
| `3` | `5` | `57.142857%` | `1.518000x` | `86.742857%` | `0.564324` | `0.751215` |
| `4` | `4` | `42.857143%` | `1.943040x` | `83.273143%` | `0.924589` | `0.961555` |
| `5` | `3` | `28.571429%` | `2.797978x` | `79.942217%` | `1.597690` | `1.263997` |
| `10` | `3` | `8.163265%` | `7.828679x` | `63.907581%` | `4.594701` | `2.143525` |
| `15` | `3` | `2.332362%` | `21.904468x` | `51.089137%` | `10.929793` | `3.306024` |
| `20` | `3` | `0.666389%` | `61.288209x` | `40.841789%` | `24.864396` | `4.986421` |
| `21` | `2` | `0.333195%` | `117.673362x` | `39.208117%` | `45.983782` | `6.781134` |

## What Is Policy-Dependent

- A player can cash out after any safe row.
- `--auto` defaults to banking after one safe row unless `--cashout-after` targets deeper rows.
- Nonzero `tilesetSeed` values are still exact, but the row order depends on `keccak256(roundId, tilesetSeed)` and should be tabulated for that seed before publishing fixed-depth rows.

## Sources

1. [docs/verification/CASH_DASH_CONTRACT.md](../verification/CASH_DASH_CONTRACT.md) - verified row model, row payout table, and state transitions.
2. [lib/stateful/cash-dash/constants.js](../../lib/stateful/cash-dash/constants.js) - row payout constants and ABI.
3. [lib/stateful/cash-dash/state.js](../../lib/stateful/cash-dash/state.js) - local row schedule and payout progression helpers.
