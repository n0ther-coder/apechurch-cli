# Roulette Odds and Payouts

> Summary: Exact payout distributions for every verified Roulette bet class, derived from the contract-backed American-wheel surface.

This note summarizes the exact **single-leg payout distributions** for the verified Roulette bet classes supported by the CLI.

## Paytable source and change controls

- **Source:** The verified American-wheel pocket mapping and bet-class multipliers are in [payout-tables.js](../../lib/payout-tables.js); [rtp.js](../../lib/rtp.js) derives class probabilities and RTP.
- **Contract control:** The verified ABI has no `oddsLocked` or payout-multiplier setter. An owner `setMaxGuesses` changes the allowed bet-count limit, not the 38-pocket wheel or per-leg gross multipliers; platform fees affect net returns.
- **Play settings:** Bet class and chosen pocket set change coverage and payout. `BET=CHIPS` assigns chip counts, and the chip value is total wager divided by the purchased count (`--chips`, defaulting to the sum in the bet list), rounded down to wei. Plain lists allocate one chip per entry. A sole component equal to the total subtracts one wei. Custom mixes change the distribution. The configured RTP and maximum payout use the actual wei amounts across all 38 pockets, including unallocated wager and per-leg payout rounding.

## How Roulette works

The contract settles against an American wheel with `38` pockets: `0`, `00`, and `1-36`.

For this document, each column represents the full class distribution of any one literal bet in that class:

- any single number behaves like any other single number;
- any color, parity, or half bet behaves like its peers;
- any dozen or column behaves like its peers.

SPLIT, STREET, SQUARE and LINE are CLI compositions of 2, 3, 4 or 6 native straight selections on the 1–36 grid. Their nominal gross returns are 18.45×, 12.3×, 9.225× and 6.15×, with win probabilities 2/38, 3/38, 4/38 and 6/38. The CLI floors each equal share to wei and merges overlapping straight allocations before computing payouts. These are not additional native contract codes.

`--shuffle` preserves all indexed joint win probabilities and verifies the exact actual payout histogram, including 0, 00, merged amounts, and rounding. The configured RTP is therefore unchanged. See [the full rules](../GAMES_REFERENCE.md#roulette-).

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

## Variance

Variance is computed over `X = payout / stake` for a single roulette leg. With `c` covered pockets on the `38`-pocket wheel and gross multiplier `m`:

```text
P(win) = c / 38
Var(X) = P(win) * m^2 - (P(win) * m)^2
```

| Bet class | Win states | Multiplier | RTP | Variance | Std. Dev. |
|-----------|-----------:|-----------:|----:|---------:|----------:|
| Single Number | `1/38` | `36.9x` | `97.1053%` | `34.888899` | `5.906683` |
| Red / Black | `18/38` | `2.05x` | `97.1053%` | `1.047715` | `1.023579` |
| Even / Odd | `18/38` | `2.05x` | `97.1053%` | `1.047715` | `1.023579` |
| Halves | `18/38` | `2.05x` | `97.1053%` | `1.047715` | `1.023579` |
| Thirds / Dozens | `12/38` | `3.075x` | `97.1053%` | `2.043044` | `1.429351` |
| Columns | `12/38` | `3.075x` | `97.1053%` | `2.043044` | `1.429351` |

## Sources

1. [docs/verification/ROULETTE_CONTRACT.md](../verification/ROULETTE_CONTRACT.md) — verified pocket mapping, payout constants, and exact RTP basis.
2. [lib/payout-tables.js](../../lib/payout-tables.js) — pocket classes and payout rules used by the CLI.
3. [lib/rtp.js](../../lib/rtp.js) — exact Roulette RTP constants used by the CLI.
