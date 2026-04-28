# Glyde or Crash Analytics

> Summary: Exact target-by-target EV for `Glyde or Crash`, derived from the verified `SpeedCrash` settlement rule and the live `houseEdge = 30000` checked on 2026-04-24.

This note keeps the game in its useful compact form: one target multiplier, one exact win probability, one exact payout multiplier, and one exact RTP.

## How the game works

`Glyde or Crash` is a fixed-target crash game:

- choose a wager;
- choose a target multiplier;
- win if the revealed crash multiplier reaches or exceeds the target;
- otherwise lose the full wager.

For the player, the gross win payout is always exactly the chosen target multiplier.

## Exact Formula

Let `T` be the chosen target in contract basis points (`2x = 20000`).

With the live verified `houseEdge = 30000`:

```text
P(win at T) = floor(9_700_000_000 / T) / 1_000_000
RTP(T) = floor(9_700_000_000 / T) * T / 100_000_000
```

Practical consequences:

- many clean preset targets hit exactly `97.00%` RTP;
- the full `1.01x .. 10000x` surface is not perfectly flat because of integer truncation;
- the lowest exact RTP on the supported surface is about `96.01020424%` at `9897.9592x`.

## Continuous Approximation

If we ignore the integer floor and treat the target as continuous, the exact formula simplifies to:

```text
P(win at T) ≈ 9_700_000_000 / (T * 1_000_000)
           = 9_700 / T

RTP(T) ≈ 100 * (T / 10_000) * (9_700 / T)
       = 97%
```

Here `T` is still the contract target in basis points, so `1.5x` means `T = 15000`, not `T = 1.5`.

Equivalently, if `m = T / 10_000` is the displayed multiplier:

```text
P(win at m) ≈ 0.97 / m
RTP(m) ≈ 100 * m * (0.97 / m) = 97%
```

For example, at `1.5x`:

```text
P(win at 1.5x) ≈ 0.97 / 1.5 = 0.646666...
```

This is the smooth curve underneath the game: before Solidity rounds down to integers, the design is essentially a flat `97%` RTP crash game. The exact on-chain surface can only sit at or slightly below that line, because the `floor(...)` step removes fractional win states rather than adding them back.

## Representative Target Table

The last column is the bankroll-side EV after the current live `2.8%` platform fee, expressed as a percent of wager:

```text
bankroll EV = 97.2% - exact RTP
```

| Target | Win rate | Loss rate | Gross payout | Exact RTP | Bankroll EV after 2.8% platform fee |
|---|---:|---:|---:|---:|---:|
| `1.01x` | `96.0396%` | `3.9604%` | `1.01x` | `96.999996%` | `0.200004%` |
| `1.5x` | `64.6666%` | `35.3334%` | `1.5x` | `96.9999%` | `0.2001%` |
| `2x` | `48.5%` | `51.5%` | `2x` | `97%` | `0.2%` |
| `3x` | `32.3333%` | `67.6667%` | `3x` | `96.9999%` | `0.2001%` |
| `5x` | `19.4%` | `80.6%` | `5x` | `97%` | `0.2%` |
| `10x` | `9.7%` | `90.3%` | `10x` | `97%` | `0.2%` |
| `25x` | `3.88%` | `96.12%` | `25x` | `97%` | `0.2%` |
| `50x` | `1.94%` | `98.06%` | `50x` | `97%` | `0.2%` |
| `100x` | `0.97%` | `99.03%` | `100x` | `97%` | `0.2%` |
| `250x` | `0.388%` | `99.612%` | `250x` | `97%` | `0.2%` |
| `500x` | `0.194%` | `99.806%` | `500x` | `97%` | `0.2%` |
| `1000x` | `0.097%` | `99.903%` | `1000x` | `97%` | `0.2%` |
| `9897.9592x` | `0.0097%` | `99.9903%` | `9897.9592x` | `96.01020424%` | `1.18979576%` |
| `10000x` | `0.0097%` | `99.9903%` | `10000x` | `97%` | `0.2%` |

## Key Takeaways

- Public running RTP snapshots above `100%` do not contradict the contract math; they only mean recent realized outcomes ran hot.
- The verified player EV is usually about `97%`, not `109%`.
- Round-number presets are unusually clean in this game: `2x`, `5x`, `10x`, `50x`, `100x`, `1000x`, and `10000x` all land at exactly `97%`.
- The non-flat part of the surface matters only near certain arbitrary targets, especially close to the `10000x` ceiling.
- The verified contract and current UI input surface allow `1.01x`, even though the public quick presets start at `1.5x`.
