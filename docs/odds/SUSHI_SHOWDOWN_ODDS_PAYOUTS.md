# Sushi Showdown Odds and Payouts

> Summary: Exact per-spin payout distribution for the live Sushi Showdown reel snapshot promoted on 2026-04-10.

This note summarizes the exact **per-spin payout distribution** for **Sushi Showdown** from the live reel tables and full ordered paytable snapshot recorded in the repo.

Spin count only changes floor-division dust against the total wager. The probabilities below are per spin.

## Reading This Table

- Probabilities aggregate all ordered symbol triples with the same payout.
- Payouts are shown as gross multipliers of the per-spin wager.
- Many payout rows are fractional because the live contract stores the slot paytable in basis points, not in whole-number multipliers.

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

## Sources

1. [../verification/SUSHI_SHOWDOWN_CONTRACT.md](../verification/SUSHI_SHOWDOWN_CONTRACT.md) — verified slot-family write/read path, live reel snapshot, and selected paytable entries.
2. [../../lib/rtp.js](../../lib/rtp.js) — exact RTP constant and CLI-facing metadata for Sushi Showdown.
