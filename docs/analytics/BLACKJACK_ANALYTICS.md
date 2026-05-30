# Blackjack Analytics

> Summary: Exact side-bet payout surfaces for Blackjack, plus explicit limits for the main H17 game where this repo does not keep a closed-form full-game distribution.

This note intentionally separates exact side-bet math from the main Blackjack hand. The main game is stateful, strategy-dependent, and modeled elsewhere in the repo with solver and statistical references; this file does not publish a Monte Carlo-derived main-game distribution.

## Exact Side-Bet Model

The public side-bet model used by this repo treats side-bet draws as independent / with replacement.

The player-side payout rows are mutually exclusive in the local model:

- `Diamond Sevens` is the top row and pays `500x`.
- `Perfect Pair` then covers the other same-card pairs and pays `20x`.
- `Natural Blackjack` pays `5x`.
- All other outcomes pay `0x`.

The public `Perfect Pair` headline probability is `52/2704` before the Diamond Sevens top-row carve-out; the mutually exclusive `20x` row used for the exact local EV is therefore `51/2704`.

The dealer-side lane is modeled as one `2x` side bet that wins if either dealer-side condition is true:

```text
P(Dealer Ten) = 4 / 13
P(Match Dealer) = 25 / 169
P(dealer side win) = 4/13 + 25/169 - (4/13 * 25/169) = 901/2197
```

## Exact Distributions

| Row | Player Side | Dealer Side |
|-----|-------------|-------------|
| RTP | `79.8817%` (`2160/2704`) | `82.0209%` (`1802/2197`) |
| Net Profit (`>1x`) | `6.6568%` (`180/2704`) | `41.0105%` (`901/2197`) |
| Loss (`0x`) | `93.3432%` (`2524/2704`) | `58.9895%` (`1296/2197`) |
| Top payout | `500x @ 0.0370% (1/2704)` | `2x @ 41.0105% (901/2197)` |
| Mid payout | `20x @ 1.8861% (51/2704)` |  |
| Low payout | `5x @ 4.7337% (128/2704)` |  |

## Variance

Variance is computed over `X = payout / side-bet stake`.

| Lane | RTP | Variance | Std. Dev. |
|------|----:|---------:|----------:|
| Player Side | `79.8817%` | `100.545324` | `10.027229` |
| Dealer Side | `82.0209%` | `0.967675` | `0.983705` |

The player-side variance is dominated by the `500x` Diamond Sevens row.

## What Is Not Exact Here

- Main-hand Blackjack RTP is not represented as a closed-form pre-deal distribution in this repo.
- A live-state solver can compute exact EV for a specific observed state, but that is not the same artifact as a compact full-game analytics table.
- Insurance is state-dependent: it is only offered on a dealer Ace and depends on the actual remaining deck state. This note does not collapse it to a single unconditional row.

## Sources

1. [docs/verification/BLACKJACK_CONTRACT.md](../verification/BLACKJACK_CONTRACT.md) - public ABI trail, side-bet table, H17 evidence, and modeling notes.
2. [docs/archive/TRANSPARENCY_REFERENCE.md](../archive/TRANSPARENCY_REFERENCE.md) - archived public side-bet odds and replacement-model note.
3. [lib/rtp.js](../../lib/rtp.js) - exact side-lane RTP references used by the CLI.
