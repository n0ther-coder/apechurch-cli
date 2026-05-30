# Baccarat Odds and Payouts

> Summary: Exact payout distributions for the verified Baccarat bet lanes, plus a compact formula sheet for parameterized main-plus-tie overlays.

This note summarizes the exact **simple-lane payout distributions** for **Baccarat** and the exact formula for combined `main + TIE` bets.

## How Baccarat works

The verified contract supports three simple betting lanes:

- `PLAYER`
- `BANKER`
- `TIE`

It also supports parameterized combined bets where one main lane (`PLAYER` or `BANKER`) is paired with an explicit `TIE` amount. Because that split can be any positive ratio, there is no finite exhaustive table of all combinations.

## How to read the simple-bet table

- **Net Profit (>1x)** is the exact chance the chosen lane wins outright.
- **Push / Refund (1x)** applies only to `PLAYER` and `BANKER`, which refund on a tie.
- **Loss (0x)** is the chance the opposite main lane wins.
- Each positive payout row shows the lane multiplier together with its unconditional probability.

| Row | PLAYER | BANKER | TIE |
| --- | --- | --- | --- |
| RTP | `98.77%` | `98.94%` | `85.88%` |
| Net Profit (>1x) | `44.61%` (2153464/4826809) | `45.84%` (2212744/4826809) | `9.54%` (460601/4826809) |
| Push / Refund (1x) | `9.54% (460601/4826809)` | `9.54% (460601/4826809)` |  |
| Loss (0x) | `0x` @ `45.84%` (2212744/4826809) | `0x` @ `44.61%` (2153464/4826809) | `0x` @ `90.46%` (4366208/4826809) |
| Positive Payout | `2x @ 44.61% (2153464/4826809)` | `1.95x @ 45.84% (2212744/4826809)` | `9x @ 9.54% (460601/4826809)` |

## Combined Main + Tie Bets

For a total stake normalized to `1`, let `t` be the share allocated to `TIE` and `m = 1 - t` the share allocated to `PLAYER` or `BANKER`.

Exact payout multipliers are then:

```text
PLAYER + TIE:
- player wins -> 2m
- banker wins -> 0
- tie -> m + 9t

BANKER + TIE:
- banker wins -> 1.95m
- player wins -> 0
- tie -> m + 9t
```

Exact RTP is the wager-weighted average of the chosen main-lane RTP and the `TIE` RTP:

```text
RTP(main + tie) = m * RTP(main) + t * RTP(TIE)
```

| Tie Share | PLAYER Win Payout | BANKER Win Payout | Tie Payout | PLAYER+TIE RTP | BANKER+TIE RTP |
| --- | --- | --- | --- | --- | --- |
| Tie 5% | `1.9x` | `1.852x` | `1.4x` | `98.13%` | `98.28%` |
| Tie 10% | `1.8x` | `1.755x` | `1.8x` | `97.48%` | `97.63%` |
| Tie 25% | `1.5x` | `1.462x` | `3x` | `95.55%` | `95.67%` |
| Tie 50% | `1x` | `0.975x` | `5x` | `92.33%` | `92.41%` |

## Variance

Variance is computed over `X = payout / stake`. For simple lanes, the exact outcome probabilities are the same six-rank draw-tree counts used above. For combined bets, let `t` be the tie share and `m = 1 - t` be the main-lane share:

```text
Var(X) = E[X^2] - E[X]^2

PLAYER + TIE:
E[X^2] = P(player) * (2m)^2 + P(tie) * (m + 9t)^2

BANKER + TIE:
E[X^2] = P(banker) * (1.95m)^2 + P(tie) * (m + 9t)^2
```

| Bet | RTP | Variance | Std. Dev. |
|-----|----:|---------:|----------:|
| `PLAYER` | `98.7719%` | `0.904424` | `0.951012` |
| `BANKER` | `98.9360%` | `0.859764` | `0.927235` |
| `TIE` | `85.8830%` | `6.991882` | `2.644217` |
| `PLAYER+TIE`, tie share `5%` | `98.1274%` | `0.834724` | `0.913632` |
| `BANKER+TIE`, tie share `5%` | `98.2834%` | `0.794285` | `0.891227` |
| `PLAYER+TIE`, tie share `10%` | `97.4830%` | `0.804401` | `0.896884` |
| `BANKER+TIE`, tie share `10%` | `97.6307%` | `0.767973` | `0.876341` |
| `PLAYER+TIE`, tie share `25%` | `95.5496%` | `0.949686` | `0.974518` |
| `BANKER+TIE`, tie share `25%` | `95.6728%` | `0.924037` | `0.961268` |
| `PLAYER+TIE`, tie share `50%` | `92.3274%` | `1.979350` | `1.406894` |
| `BANKER+TIE`, tie share `50%` | `92.4095%` | `1.967481` | `1.402669` |

## Sources

1. [docs/verification/BACCARAT_CONTRACT.md](../verification/BACCARAT_CONTRACT.md) — verified tuple layout, payout constants, and exact six-rank draw-tree probabilities.
2. [lib/rtp.js](../../lib/rtp.js) — exact Baccarat RTP constants used by the CLI.
