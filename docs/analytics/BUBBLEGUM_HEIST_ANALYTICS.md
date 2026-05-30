# Bubblegum Heist Analytics

> Summary: Exact reel model, selected live payout rows, and exact RTP for Bubblegum Heist. The full payout distribution and variance are not locally reproducible because the complete ordered paytable snapshot is not persisted in this repo.

Bubblegum Heist is a three-reel ordered slots game in the same verified `Slots` ABI family as Dino Dough. Each spin consumes three VRF words, maps one word to each reel, and pays `getPayout(symbol0, symbol1, symbol2)` for the exact left-to-right symbol triple.

Spin count only changes floor-division dust against the total wager. The model below is per spin.

## Exact Reel Snapshot

The live getter snapshot recorded on **2026-04-09** has `100` stops per reel.

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

## Selected Exact Payout Rows

Only selected `getPayout(...)` rows are persisted in the docs today.

| Ordered triple | Multiplier |
|----------------|-----------:|
| `0,0,0` | `100x` |
| `0,0,1` | `25x` |
| `0,1,0` | `25x` |
| `1,0,0` | `25x` |
| `0,1,1` | `12x` |
| `1,0,1` | `12x` |
| `1,1,0` | `12x` |
| `2,1,0` | `12x` |
| `1,1,1` | `11x` |
| `0,0,2` | `10x` |

## Exact RTP

The full live `getPayout(symbol0, symbol1, symbol2)` matrix was read on **2026-04-09** and used to compute:

| Metric | Value |
|--------|------:|
| Exact per-spin RTP | `97.79962375%` |
| Displayed rounded RTP | `97.80%` |
| Max persisted payout | `100x` |

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

The repo records `E[X]` as exact RTP and selected high-value rows, but it does not persist the complete `5 * 5 * 5` ordered paytable snapshot needed to recompute `E[X^2]`. A future exact analytics note should first snapshot every `getPayout(a,b,c)` row from the live contract, especially because `oddsLocked = false` at the recorded read time.

## Sources

1. [docs/verification/BUBBLEGUM_HEIST_CONTRACT.md](../verification/BUBBLEGUM_HEIST_CONTRACT.md) - similar-match source trail, live reel snapshot, selected paytable rows, and exact RTP.
2. [lib/rtp.js](../../lib/rtp.js) - exact RTP reference used by the CLI.
