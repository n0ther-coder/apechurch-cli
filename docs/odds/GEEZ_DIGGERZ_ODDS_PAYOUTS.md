# Geez Diggerz Odds and Payouts

> Summary: Exact per-spin payout distribution for the live Geez Diggerz reel snapshot promoted on 2026-04-10.

This note summarizes the exact **per-spin payout distribution** for **Geez Diggerz** from the live reel tables and full ordered paytable snapshot recorded in the repo.

Spin count only changes floor-division dust against the total wager. The probabilities below are per spin.

## Reading This Table

- Probabilities aggregate all ordered symbol triples with the same payout.
- Payouts are shown as gross multipliers of the per-spin wager.
- The live contract currently uses the same cumulative `82`-stop reel on all `3` reels, so the exact probability model is fully symmetric across reel position.

## Summary Stats

- Exact RTP: `97.69455246%`
- Positive payout (`> 0x`): `41.02378085%`
- Net profit (`> 1x`): `29.99593738%`
- Break-even (`= 1x`): `1.93917674%`
- Partial refund (`0x < payout < 1x`): `9.08866673%`
- Loss (`0x`): `58.97621915%`

## Exact Distribution

| Payout | Probability |
|--------|------------:|
| `50x` | `0.18136707%` |
| `10x` | `0.83991091%` |
| `8x` | `0.65836247%` |
| `6x` | `0.70733158%` |
| `5x` | `3.92968036%` |
| `4x` | `0.49767125%` |
| `3.5x` | `1.06643839%` |
| `3x` | `1.59875074%` |
| `2.5x` | `1.01148416%` |
| `2x` | `8.54674192%` |
| `1.5x` | `5.80011898%` |
| `1.25x` | `5.15807954%` |
| `1x` | `1.93917674%` |
| `0.5x` | `6.26804602%` |
| `0.25x` | `2.82062071%` |
| `0x` | `58.97621915%` |

## Sources

1. [../verification/GEEZ_DIGGERZ_CONTRACT.md](../verification/GEEZ_DIGGERZ_CONTRACT.md) — verified slot-family write/read path, live reel snapshot, and selected paytable entries.
2. [../../lib/rtp.js](../../lib/rtp.js) — exact RTP constant and CLI-facing metadata for Geez Diggerz.
