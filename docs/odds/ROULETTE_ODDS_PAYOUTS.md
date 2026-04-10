# Roulette Odds and Payouts

> Summary: Exact payout distributions for every verified Roulette bet class, derived from the contract-backed American-wheel surface.

This note summarizes the exact **single-leg payout distributions** for the verified Roulette bet classes supported by the CLI.

## How Roulette works

The contract settles against an American wheel with `38` pockets: `0`, `00`, and `1-36`.

For this document, each column represents the full class distribution of any one literal bet in that class:

- any single number behaves like any other single number;
- any color, parity, or half bet behaves like its peers;
- any dozen or column behaves like its peers.

Multi-leg wagers are not expanded exhaustively here because their session distribution depends on the exact leg mix.

## How to read the table

- **Coverage** is how many pockets a representative bet in that class actually covers.
- **Win** is the exact probability of the class paying its listed multiplier.
- **Loss (0x)** is the exact probability of a full miss.
- There are no pushes and no partial returns in the verified supported surface.

| Row | Single Number | Red / Black | Even / Odd | Halves | Thirds / Dozens | Columns |
| --- | --- | --- | --- | --- | --- | --- |
| RTP | `97.11%` | `97.11%` | `97.11%` | `97.11%` | `97.11%` | `97.11%` |
| Coverage | `1 pocket` | `18 pockets` | `18 pockets` | `18 pockets` | `12 pockets` | `12 pockets` |
| Win | `2.63%` (1/38) | `47.37%` (9/19) | `47.37%` (9/19) | `47.37%` (9/19) | `31.58%` (6/19) | `31.58%` (6/19) |
| Loss | `0x` @ `97.37%` (37/38) | `0x` @ `52.63%` (10/19) | `0x` @ `52.63%` (10/19) | `0x` @ `52.63%` (10/19) | `0x` @ `68.42%` (13/19) | `0x` @ `68.42%` (13/19) |
| Positive Payout | `36.9x @ 2.63% (1/38)` | `2.05x @ 47.37% (9/19)` | `2.05x @ 47.37% (9/19)` | `2.05x @ 47.37% (9/19)` | `3.075x @ 31.58% (6/19)` | `3.075x @ 31.58% (6/19)` |

## Sources

1. [docs/verification/ROULETTE_CONTRACT.md](../verification/ROULETTE_CONTRACT.md) — verified pocket mapping, payout constants, and exact RTP basis.
2. [lib/rtp.js](../../lib/rtp.js) — exact Roulette RTP constants and pocket-class handling used by the CLI.
