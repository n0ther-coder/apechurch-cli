# Blocks Odds and Payouts

> Summary: Exact `Low` / `High` analytics for every `2x2`, `3x3`, and `4x4` Blocks grid, covering independent `--split` rolls and legacy-compatible compounding `--survive` rolls.

## CLI behavior

```bash
apechurch-cli play blocks 10 --risk 0 --grid 2x2 --survive 1
apechurch-cli play blocks 10 --risk 0 --grid 3x3 --split 5
apechurch-cli play blocks 10 --risk 0 --grid 4x4 --survive 5
```

`--grid` accepts exactly `2x2`, `3x3`, or `4x4`. If it is omitted, the CLI sends the contract mode for `3x3`, preserving the behavior of the previous Blocks contract. Numeric internal modes (`0`, `1`, `2`) are intentionally not accepted as `--grid` values.

`--split 1-5` sends `compounding = false`: the wager is divided across independent rolls, their payouts are summed, and a dead roll loses only its share. `--survive 1-5` sends `compounding = true`: each winning roll multiplies the current payout and any dead roll zeroes the entire game. The flags are mutually exclusive. Omitting both preserves the old implicit `--survive 1` behavior.

## Mechanics

Each tile independently selects one of six colors. The contract counts the occurrences of every color and uses the largest count as the payout key; adjacency and connected components do not matter.

| Grid | Contract `gameMode` | Tiles | Possible boards | Low survives from | High survives from |
|------|--------------------:|------:|----------------:|------------------:|-------------------:|
| `2x2` | `2` | `4` | `6^4 = 1,296` | max count `2` | max count `3` |
| `3x3` | `0` | `9` | `6^9 = 10,077,696` | max count `3` | max count `4` |
| `4x4` | `1` | `16` | `6^16 = 2,821,109,907,456` | max count `5` | max count `6` |

## Exact single-roll distributions and payouts

### 2x2

| Max count | Exact boards | Probability | Low | High |
|----------:|-------------:|------------:|----:|-----:|
| `1` | `360` | `27.777778%` | `0x` | `0x` |
| `2` | `810` | `62.500000%` | `1.2x` | `0x` |
| `3` | `120` | `9.259259%` | `1.85x` | `8x` |
| `4` | `6` | `0.462963%` | `12x` | `51x` |

### 3x3 (implicit default)

| Max count | Exact boards | Probability | Low | High |
|----------:|-------------:|------------:|----:|-----:|
| `2` | `1,587,600` | `15.753601%` | `0x` | `0x` |
| `3` | `5,628,000` | `55.846098%` | `1.01x` | `0x` |
| `4` | `2,320,920` | `23.030264%` | `1.2x` | `2.25x` |
| `5` | `472,500` | `4.688572%` | `2x` | `6.5x` |
| `6` | `63,000` | `0.625143%` | `4.25x` | `15x` |
| `7` | `5,400` | `0.053584%` | `20x` | `80x` |
| `8` | `270` | `0.002679%` | `250x` | `600x` |
| `9` | `6` | `0.000060%` | `2500x` | `5000x` |

### 4x4

| Max count | Exact boards | Probability | Low | High |
|----------:|-------------:|------------:|----:|-----:|
| `3` | `76,684,608,000` | `2.718242%` | `0x` | `0x` |
| `4` | `1,031,395,365,000` | `36.559914%` | `0x` | `0x` |
| `5` | `1,081,979,458,560` | `38.352971%` | `1.2x` | `0x` |
| `6` | `460,733,232,960` | `16.331630%` | `1.75x` | `2.6x` |
| `7` | `133,950,960,000` | `4.748165%` | `3x` | `6.6x` |
| `8` | `30,163,869,450` | `1.069220%` | `5x` | `15x` |
| `9` | `5,362,500,000` | `0.190085%` | `12x` | `30x` |
| `10` | `750,750,000` | `0.026612%` | `30x` | `60x` |
| `11` | `81,900,000` | `0.002903%` | `100x` | `150x` |
| `12` | `6,825,000` | `0.000242%` | `500x` | `700x` |
| `13` | `420,000` | `0.0000149%` | `10000x` | `10000x` |
| `14` | `18,000` | `0.000000638%` | `25000x` | `25000x` |
| `15` | `480` | `0.0000000170%` | `25000x` | `25000x` |
| `16` | `6` | `0.000000000213%` | `25000x` | `25000x` |

## Exact independent RTP

For `--split N`, the contract evaluates `N` boards independently against `wager / N` and sums their payouts. The theoretical RTP and maximum payout multiplier relative to the total wager therefore equal the single-roll values for every split count; increasing `N` only smooths variance. Solidity integer division can reduce the realized payout by a negligible amount when the wager cannot be represented evenly at wei precision.

| Grid | Risk | RTP for any `--split 1-5` | Maximum total-wager multiplier |
|------|------|--------------------------:|--------------------------------:|
| `2x2` | Low | `97.685185%` | `12x` |
| `2x2` | High | `97.685185%` | `51x` |
| `3x3` | Low | `97.965190%` | `2500x` |
| `3x3` | High | `97.862845%` | `5000x` |
| `4x4` | Low | `97.850420%` | `25000x` |
| `4x4` | High | `97.907757%` | `25000x` |

## Exact compounded RTP

For a selected grid and risk mode:

```text
EV_roll = sum(P(maxCount) * payout(maxCount))
RTP(N rolls) = EV_roll ^ N
```

Dead counts already have multiplier `0`, so the formula includes the fail-fast loss. The exact references used by the CLI are:

| Grid | Risk | 1 roll | 2 rolls | 3 rolls | 4 rolls | 5 rolls |
|------|------|-------:|--------:|--------:|--------:|--------:|
| `2x2` | Low | `97.685185%` | `95.423954%` | `93.215066%` | `91.057310%` | `88.949502%` |
| `2x2` | High | `97.685185%` | `95.423954%` | `93.215066%` | `91.057310%` | `88.949502%` |
| `3x3` | Low | `97.965190%` | `95.971784%` | `94.018940%` | `92.105833%` | `90.231654%` |
| `3x3` | High | `97.862845%` | `95.771364%` | `93.724581%` | `91.721542%` | `89.761310%` |
| `4x4` | Low | `97.850420%` | `95.747046%` | `93.688887%` | `91.674969%` | `89.704342%` |
| `4x4` | High | `97.907757%` | `95.859289%` | `93.853680%` | `91.890033%` | `89.967470%` |

The maximum whole-game multiplier is the per-roll cap raised to the selected roll count. At five rolls this ranges from `248,832x` for `2x2 Low` to `9,765,625,000,000,000,000,000x` for either `4x4` risk mode.

## Sources

1. [Blocks contract verification notes](../verification/BLOCKS_CONTRACT.md) — current address, tuple layout, grid mapping, gas formula, read surface, and verified payout tables.
2. [lib/rtp.js](../../lib/rtp.js) — exact distributions and all `36` grid/risk/settlement variants used by the CLI.
3. [lib/games/blocks.js](../../lib/games/blocks.js) — strict grid/attempt parsing, backward-compatible defaults, payload encoding, and VRF gas calculation.
