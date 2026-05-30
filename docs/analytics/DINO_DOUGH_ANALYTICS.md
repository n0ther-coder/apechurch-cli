# Dino Dough Analytics

> Summary: Exact reel model, selected live payout rows, and exact RTP for Dino Dough. The full payout distribution and variance are not locally reproducible because the complete ordered paytable snapshot is not persisted in this repo.

Dino Dough is a three-reel ordered slots game. Each spin consumes three VRF words, maps one word to each reel, and pays `getPayout(symbol0, symbol1, symbol2)` for the exact left-to-right symbol triple.

Spin count only changes floor-division dust against the total wager. The model below is per spin.

## Exact Reel Snapshot

The live getter snapshot recorded on **2026-04-09** has `190` stops per reel.

| Symbol index | Reel 1 stops | Reel 2 stops | Reel 3 stops |
|-------------:|-------------:|-------------:|-------------:|
| `0` | `10/190` | `5/190` | `5/190` |
| `1` | `15/190` | `10/190` | `10/190` |
| `2` | `30/190` | `40/190` | `40/190` |
| `3` | `40/190` | `40/190` | `40/190` |
| `4` | `45/190` | `45/190` | `40/190` |
| `5` | `50/190` | `50/190` | `55/190` |

For any ordered triple `(a, b, c)`:

```text
P(a, b, c) = stops1[a] / 190 * stops2[b] / 190 * stops3[c] / 190
payout(a, b, c) = getPayout(a, b, c) / 10_000
```

## Selected Exact Payout Rows

Only selected `getPayout(...)` rows are persisted in the docs today.

| Ordered triple | Multiplier |
|----------------|-----------:|
| `0,0,0` | `333x` |
| `0,0,1` | `60x` |
| `0,1,0` | `60x` |
| `1,0,0` | `60x` |
| `2,0,0` | `53.3333x` |
| `1,1,1` | `50x` |
| `0,1,1` | `40x` |
| `3,0,0` | `40x` |
| `1,0,1` | `40x` |
| `1,1,0` | `40x` |

## Exact RTP

The full live `getPayout(symbol0, symbol1, symbol2)` matrix was read on **2026-04-09** and used to compute:

| Metric | Value |
|--------|------:|
| Exact per-spin RTP | `97.89751366817333%` |
| Displayed rounded RTP | `97.90%` |
| Max persisted payout | `333x` |

If the buy-in is not evenly divisible across `numSpins`, Solidity floor division scales effective RTP by:

```text
floor(totalBetAmount / numSpins) * numSpins / totalBetAmount
```

## Variance

Exact variance is not currently recoverable from local files. Variance needs the second moment:

```text
E[X^2] = sum_(a,b,c) P(a,b,c) * payout(a,b,c)^2
Var(X) = E[X^2] - E[X]^2
```

The repo records `E[X]` as exact RTP and selected high-value rows, but it does not persist the complete `6 * 6 * 6` ordered paytable snapshot needed to recompute `E[X^2]`. A future exact analytics note should first snapshot every `getPayout(a,b,c)` row from the live contract, especially because `oddsLocked = false` at the recorded read time.

## Sources

1. [docs/verification/DINO_DOUGH_CONTRACT.md](../verification/DINO_DOUGH_CONTRACT.md) - verified source trail, live reel snapshot, selected paytable rows, and exact RTP.
2. [lib/rtp.js](../../lib/rtp.js) - exact RTP reference used by the CLI.
