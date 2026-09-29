# Geez Diggerz Odds and Payouts

> Summary: Exact per-spin payout distribution for the checked-in Geez Diggerz reel snapshot.

This note summarizes the exact **per-spin payout distribution** for **Geez Diggerz** from the checked-in reel weights and full ordered paytable.

The probabilities below are per spin and do not depend on spin count. Splitting a total wager can introduce Solidity floor-division dust.

## Paytable source and change controls

- **Source:** The complete ordered-triple payouts and reel weights in [payout-tables.js](../../lib/payout-tables.js) were reread from public contract getters at ApeChain block `50311380` on 2026-09-25. The figures below are a dated gross-payout snapshot, excluding transaction fees.
- **Contract control:** With `oddsLocked = false`, the owner-only `setReels` and `batchSetPayouts` can change reel weights and payout entries. Reel changes alter symbol probabilities; payout changes alter gross multipliers and the probabilities attached to payout amounts. `lockOdds` makes both setters reject updates when the flag is true. The observed flag was false on the dated check, so RTP and variance are not live guarantees.
- **Play settings:** Spin count leaves each spin's table unchanged but changes the distribution of the combined payout and can introduce floor-division dust when the wager is split.

## Reading This Table

- Probabilities aggregate all ordered symbol triples with the same payout.
- Payouts are shown as gross multipliers of the per-spin wager.
- The checked-in snapshot uses the same cumulative `82`-stop reel on all `3` reels, so the exact probability model is fully symmetric across reel position.

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

## Variance

Variance is computed over `X = payout / total stake`. With multiple spins, the total wager is split evenly and independent spin payouts are averaged, so session variance is the per-spin variance divided by `numSpins`. The table ignores Solidity floor-division dust for wagers that are not evenly divisible by `numSpins`.

The exact denominator for one spin is `82^3 = 551,368` ordered reel-stop triples.

| Spins | RTP | Variance | Std. Dev. |
|------:|----:|---------:|----------:|
| `1` | `97.69455246%` | `7.085240` | `2.661811` |
| `5` | `97.69455246%` | `1.417048` | `1.190398` |
| `15` | `97.69455246%` | `0.472349` | `0.687276` |

## Sources

1. [../verification/GEEZ_DIGGERZ_CONTRACT.md](../verification/GEEZ_DIGGERZ_CONTRACT.md) — verified slot-family write/read path, live reel snapshot, and selected paytable entries.
2. [../../lib/rtp.js](../../lib/rtp.js) — exact RTP constant and CLI-facing metadata for Geez Diggerz.
