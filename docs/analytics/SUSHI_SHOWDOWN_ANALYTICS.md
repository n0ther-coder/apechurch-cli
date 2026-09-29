# Sushi Showdown Odds and Payouts

> Summary: Exact per-spin payout distribution for the checked-in Sushi Showdown reel snapshot.

This note summarizes the exact **per-spin payout distribution** for **Sushi Showdown** from the checked-in reel weights and full ordered paytable.

The probabilities below are per spin and do not depend on spin count. Splitting a total wager can introduce Solidity floor-division dust.

## Paytable source and change controls

- **Source:** The complete ordered-triple payouts and reel weights in [payout-tables.js](../../lib/payout-tables.js) were reread from public contract getters at ApeChain block `50311380` on 2026-09-25. The figures below are a dated gross-payout snapshot, excluding transaction fees.
- **Contract control:** With `oddsLocked = false`, the owner-only `setReels` and `batchSetPayouts` can change reel weights and payout entries. Reel changes alter symbol probabilities; payout changes alter gross multipliers and the probabilities attached to payout amounts. `lockOdds` makes both setters reject updates when the flag is true. The observed flag was false on the dated check, so RTP and variance are not live guarantees.
- **Play settings:** Spin count leaves each spin's table unchanged but changes the distribution of the combined payout and can introduce floor-division dust when the wager is split.

## Reading This Table

- Probabilities aggregate all ordered symbol triples with the same payout.
- Payouts are shown as gross multipliers of the per-spin wager.
- Many payout rows are fractional because the checked-in contract paytable stores payouts in basis points, not in whole-number multipliers.

## Summary Stats

- Exact RTP: `97.87165381%`
- Positive payout (`> 0x`): `31.19306622%`
- Net profit (`> 1x`): `23.90830069%`
- Break-even (`= 1x`): `0.00%`
- Partial refund (`0x < payout < 1x`): `7.28476553%`
- Loss (`0x`): `68.80693378%`

## Exact Distribution

| Payout | Probability |
|--------|------------:|
| `500x` | `0.00546357%` |
| `100x` | `0.03642383%` |
| `55x` | `0.05995692%` |
| `50x` | `0.08094184%` |
| `30x` | `0.09713021%` |
| `22.6337x` | `0.01821191%` |
| `20x` | `0.03642383%` |
| `19.4003x` | `0.02124723%` |
| `16.9753x` | `0.14569531%` |
| `15x` | `0.21584490%` |
| `13.5802x` | `0.06070638%` |
| `12x` | `0.21584490%` |
| `10.1851x` | `0.08094184%` |
| `10x` | `0.08094184%` |
| `8.7301x` | `0.09443215%` |
| `8x` | `0.08094184%` |
| `7.6388x` | `0.64753471%` |
| `7x` | `0.47965534%` |
| `6.1111x` | `0.26980613%` |
| `5.8201x` | `0.07082411%` |
| `5.0925x` | `0.56659287%` |
| `5x` | `0.35974151%` |
| `4.5833x` | `0.08993538%` |
| `4.365x` | `0.28329644%` |
| `4.074x` | `0.10117730%` |
| `4x` | `0.65952610%` |
| `3.9285x` | `0.10492461%` |
| `3.8194x` | `2.69806131%` |
| `3.4375x` | `0.71948302%` |
| `3.395x` | `0.12141276%` |
| `3.0555x` | `1.34903065%` |
| `3x` | `0.89935377%` |
| `2.75x` | `0.29978459%` |
| `2.619x` | `0.15738691%` |
| `2.4444x` | `0.16862883%` |
| `2.2916x` | `1.07922452%` |
| `2.037x` | `0.40470920%` |
| `2x` | `1.12419221%` |
| `1.9642x` | `0.41969843%` |
| `1.8333x` | `0.22483844%` |
| `1.75x` | `5.30618724%` |
| `1.25x` | `3.97214581%` |
| `0.75x` | `3.83724275%` |
| `0.5x` | `3.44752278%` |
| `0x` | `68.80693378%` |

## Variance

Variance is computed over `X = payout / total stake`. With multiple spins, the total wager is split evenly and independent spin payouts are averaged, so session variance is the per-spin variance divided by `numSpins`. The table ignores Solidity floor-division dust for wagers that are not evenly divisible by `numSpins`.

The exact denominator for one spin is `229 * 234 * 249 = 13,342,914` ordered reel-stop triples.

| Spins | RTP | Variance | Std. Dev. |
|------:|----:|---------:|----------:|
| `1` | `97.87165381%` | `25.316614` | `5.031562` |
| `5` | `97.87165381%` | `5.063323` | `2.250183` |
| `15` | `97.87165381%` | `1.687774` | `1.299144` |

## Sources

1. [../verification/SUSHI_SHOWDOWN_CONTRACT.md](../verification/SUSHI_SHOWDOWN_CONTRACT.md) — verified slot-family write/read path, live reel snapshot, and selected paytable entries.
2. [../../lib/rtp.js](../../lib/rtp.js) — exact RTP constant and CLI-facing metadata for Sushi Showdown.
