# Reel Pirates Analytics

> Summary: Current public mechanics and observed running statistics for Reel Pirates. This is intentionally not an exact RTP note.

Reel Pirates is now playable through the CLI, but the live contract is unverified on ApeScan. The repo therefore does not claim a closed-form RTP or exact outcome distribution.

## Known Mechanics

Reel Pirates is a match-anywhere cascade slot:

- regular-symbol wins pay when `8-9`, `10-11`, or `12+` identical symbols appear anywhere on the board
- winning symbols are removed and replaced, allowing additional cascade wins in the same spin
- `4+` scatter chests trigger `5` free spins
- scatters can appear during cascades and still trigger the bonus
- additional scatters during bonus play can award more free spins
- bonus-only multipliers are additive for that spin
- documented multiplier values are `2x`, `3x`, `5x`, `10x`, `25x`, `50x`, and `100x`

## Known Paytable

The UI paytable is normalized to a `1 APE` bet, so the values below can be read as gross multipliers of the per-spin base bet.

| Symbol | 8-9 match | 10-11 match | 12+ match |
|---|---:|---:|---:|
| Coral | `0.25x` | `0.75x` | `2x` |
| Fish bones / skeleton | `0.40x` | `1x` | `4x` |
| Shell | `0.50x` | `1.10x` | `5x` |
| Purple fish / anglerfish | `0.80x` | `1.25x` | `8x` |
| Gold coins | `1x` | `1.50x` | `10x` |
| Hook | `1.50x` | `2x` | `12x` |
| Anchor | `2x` | `5x` | `15x` |
| Treasure map | `2.50x` | `10x` | `25x` |
| Pirate hat | `10x` | `25x` | `50x` |

## Observed Running Stats

The supplied analytics snapshot reported:

| Metric | Value |
|---|---:|
| House Profit | `-11,485 APE` |
| Running RTP | `100.07%` |
| Total Wagered | `16,970,709 APE` |
| Total Games Played | `73,051` |

This is an observed moving statistic, not a theoretical return guarantee.

## What Is Not Yet Defensible

The current public source set does not prove:

- exact symbol frequencies
- exact cascade continuation probabilities
- exact bonus-trigger frequency
- exact bonus expected value
- exact long-run RTP
- exact maximum mathematical payout

## Sources

1. [../verification/REEL_PIRATES_CONTRACT.md](../verification/REEL_PIRATES_CONTRACT.md) — write-path evidence, known public mechanics, and verification limits.
2. [Slots Games docs](https://docs.ape.church/games/player-vs-house/slots-games) — official public Reel Pirates mechanics summary.
