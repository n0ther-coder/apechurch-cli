# Bubblegum Heist Analytics

> Summary: Exact per-spin payout distribution, RTP, and variance for the checked-in Bubblegum Heist paytable and reel weights.

Bubblegum Heist is a three-reel ordered slots game. Each spin consumes three VRF words, maps one word to each reel, and pays `getPayout(symbol0, symbol1, symbol2)` for the exact left-to-right symbol triple.

## Paytable source and change controls

- **Source:** The complete ordered-triple payouts and reel weights in [payout-tables.js](../../lib/payout-tables.js) were reread from public contract getters at ApeChain block `50311380` on 2026-09-25. The figures below are a dated gross-payout snapshot, excluding transaction fees.
- **Contract control:** With `oddsLocked = false`, the owner-only `setReels` and `batchSetPayouts` can change reel weights and payout entries. Reel changes alter symbol probabilities; payout changes alter gross multipliers and the probabilities attached to payout amounts. `lockOdds` makes both setters reject updates when the flag is true. The observed flag was false on the dated check, so RTP and variance are not live guarantees.
- **Play settings:** Spin count leaves each spin's table unchanged but changes the distribution of the combined payout and can introduce floor-division dust when the wager is split.

## Reading This Table

- Probabilities aggregate all ordered symbol triples with the same payout.
- Payouts are gross multipliers of the per-spin wager.
- Multiple spins average independent per-spin multipliers when the total wager divides evenly by the spin count.

## Summary Stats

- Exact RTP: `97.79962375%`
- Positive payout (`> 0x`): `51.63750000%`
- Net profit before fees (`> 1x`): `26.31250000%`
- Break-even before fees (`= 1x`): `12.87500000%`
- Partial refund (`0x < payout < 1x`): `12.45000000%`
- Loss (`0x`): `48.36250000%`

## Exact Reel Snapshot

Each reel has `100` stops. The symbol weights recorded on 2026-04-09 were unchanged when reread at block `50311380`.

| Symbol index | Reel 1 stops | Reel 2 stops | Reel 3 stops |
|-------------:|-------------:|-------------:|-------------:|
| `0` | `10/100` | `5/100` | `5/100` |
| `1` | `15/100` | `10/100` | `15/100` |
| `2` | `15/100` | `20/100` | `20/100` |
| `3` | `25/100` | `25/100` | `25/100` |
| `4` | `35/100` | `40/100` | `35/100` |

For any ordered triple `(a, b, c)`:

```text
P(a, b, c) = stops1[a] / 100 * stops2[b] / 100 * stops3[c] / 100
payout(a, b, c) = getPayout(a, b, c) / 10_000
```

The complete `5 × 5 × 5` ordered matrix is stored in [lib/payout-tables.js](../../lib/payout-tables.js).

## Exact Distribution

| Payout | Probability |
|--------|------------:|
| `100x` | `0.02500000%` |
| `25x` | `0.16250000%` |
| `12x` | `0.41250000%` |
| `11x` | `0.22500000%` |
| `10x` | `0.23750000%` |
| `8x` | `0.42500000%` |
| `7.2x` | `0.12500000%` |
| `6x` | `0.60000000%` |
| `5.1428x` | `0.17500000%` |
| `4.8x` | `0.93750000%` |
| `4.5x` | `0.20000000%` |
| `4x` | `1.28750000%` |
| `3.6x` | `0.50000000%` |
| `3.4285x` | `0.78750000%` |
| `3x` | `1.50000000%` |
| `2.88x` | `0.62500000%` |
| `2.5714x` | `0.70000000%` |
| `2.4x` | `1.50000000%` |
| `2.25x` | `0.40000000%` |
| `2.0571x` | `0.43750000%` |
| `2x` | `2.46250000%` |
| `1.8x` | `1.50000000%` |
| `1.7142x` | `1.57500000%` |
| `1.6x` | `1.12500000%` |
| `1.5x` | `1.20000000%` |
| `1.4693x` | `0.61250000%` |
| `1.44x` | `1.25000000%` |
| `1.2857x` | `1.40000000%` |
| `1.2x` | `2.25000000%` |
| `1.125x` | `0.80000000%` |
| `1.0285x` | `0.87500000%` |
| `1x` | `12.87500000%` |
| `0.75x` | `8.25000000%` |
| `0.5x` | `4.20000000%` |
| `0x` | `48.36250000%` |

## Variance

Let `X` be the gross payout divided by the per-spin wager. From the checked-in matrix and reel weights:

```text
E[X] = sum_(a,b,c) P(a,b,c) * payout(a,b,c)
E[X^2] = sum_(a,b,c) P(a,b,c) * payout(a,b,c)^2
Var(X) = E[X^2] - E[X]^2
```

The exact denominator for one spin is `100^3 = 1,000,000` ordered reel-stop triples. For independent equal-sized spins, session variance is the per-spin variance divided by `numSpins`. The table ignores Solidity floor-division dust when the total wager is not evenly divisible by `numSpins`.

| Spins | RTP | Variance | Std. Dev. |
|------:|----:|---------:|----------:|
| `1` | `97.79962375%` | `5.789042` | `2.406043` |
| `5` | `97.79962375%` | `1.157808` | `1.076015` |
| `15` | `97.79962375%` | `0.385936` | `0.621238` |

## Sources

1. [../verification/BUBBLEGUM_HEIST_CONTRACT.md](../verification/BUBBLEGUM_HEIST_CONTRACT.md) — verified contract rules, reel weights, and selected payout entries.
2. [../../lib/payout-tables.js](../../lib/payout-tables.js) — complete ordered payout matrix and reel weights used for these figures.
3. [../../lib/rtp.js](../../lib/rtp.js) — exact RTP reference used by the CLI.
