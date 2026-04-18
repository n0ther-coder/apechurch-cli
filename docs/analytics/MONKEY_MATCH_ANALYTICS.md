# Monkey Match Odds and Payouts

> Summary: Exact five-draw payout distributions for both verified Monkey Match modes, derived from the contract-backed multiplicity model.

This note summarizes the exact **hand-class payout distributions** for **Monkey Match** across the verified `Low` and `High` modes.

## How Monkey Match works

Monkey Match draws `5` independent monkeys. The final hand is then scored as one of seven multiplicity classes:

- Five of a Kind
- Four of a Kind
- Full House
- Three of a Kind
- Two Pair
- One Pair
- No Match

There is no redraw phase and no further player choice after risk selection, so the entire exact distribution is closed-form.

## How to read the table

- **Positive Payout (>0x)** includes partial-return outcomes such as `One Pair`.
- **Net Profit (>1x)** counts only results that return more than stake.
- **Partial Return (0<x<1x)** isolates sub-stake payouts that are still better than a full whiff.
- Each hand row shows its exact multiplier together with its unconditional probability.

| Row | Low | High |
| --- | --- | --- |
| RTP | `97.99%` | `98.29%` |
| Positive Payout (>0x) | `90.74%` (49/54) | `85.01%` (2041/2401) |
| Net Profit (>1x) | `44.44%` (4/9) | `35.03%` (841/2401) |
| Partial Return (0<x<1x) | `46.30%` (25/54) | `49.98%` (1200/2401) |
| Loss (0x) | `0x` @ `9.26%` (5/54) | `0x` @ `14.99%` (360/2401) |
| One Pair | `0.2x @ 46.30% (25/54)` | `0.1x @ 49.98% (1200/2401)` |
| Two Pair | `1.25x @ 23.15% (25/108)` | `2x @ 18.74% (450/2401)` |
| Three of a Kind | `2x @ 15.43% (25/162)` | `3x @ 12.49% (300/2401)` |
| Full House | `4x @ 3.86% (25/648)` | `4x @ 2.50% (60/2401)` |
| Four of a Kind | `5x @ 1.93% (25/1296)` | `5x @ 1.25% (30/2401)` |
| Five of a Kind | `50x @ 0.08% (1/1296)` | `50x @ 0.04% (1/2401)` |

## Sources

1. [docs/verification/MONKEY_MATCH_CONTRACT.md](../verification/MONKEY_MATCH_CONTRACT.md) — verified five-draw model, live mode constants, and exact combinatorial counts.
2. [lib/rtp.js](../../lib/rtp.js) — exact Monkey Match mode constants used by the CLI.
