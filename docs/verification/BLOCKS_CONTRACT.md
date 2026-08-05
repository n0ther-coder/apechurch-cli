# Blocks Contract Verification Notes

> Summary: Verification of the current Blocks address, selectable-grid tuple, compounding switch, grid-scaled VRF gas, read surface, and all six payout tables used by the CLI.

## Source trail and identity

- Current verified ApeScan contract: [`0x74D430c8e705eBB8EF0BA05bfDe54E901410a288`](https://apescan.io/address/0x74D430c8e705eBB8EF0BA05bfDe54E901410a288#code)
- Previous contract retained only for wallet-history decoding: `0xA59CF828222EcD8aCe4b6195764d11F5Ea7f62A6`
- Repo constants: `BLOCKS_CONTRACT` and `LEGACY_BLOCKS_CONTRACT`
- Risk modes: `0 = Low`, `1 = High`
- Roll count: `1..5`

The contract grid mapping is not ordered by board size:

| CLI `--grid` | Contract `gameMode` | Tiles |
|-------------|--------------------:|------:|
| `2x2` | `2` | `4` |
| `3x3` | `0` | `9` |
| `4x4` | `1` | `16` |

The CLI exposes only the unambiguous dimension strings. It rejects `--grid 0`, `--grid 1`, and `--grid 2`; omitting the option maps to `gameMode = 0` (`3x3`) for backward compatibility.

## Verified write path

The current contract exposes:

- `function play(address player, bytes calldata gameData) external payable`
- `function getVRFFee(uint32 customGasLimit) public view returns (uint256)`

`play` decodes `gameData` in this order:

```text
(
  uint8 gameMode,
  uint8 riskMode,
  uint8 numRuns,
  bool compounding,
  uint256 gameId,
  address ref,
  bytes32 userRandomWord
)
```

Verified validation and gas constants:

```text
gameMode ∈ {0, 1, 2}
riskMode ∈ {0, 1}
numRuns ∈ [1, 5]
BASE_GAS = 600000
GAS_PER_TILE = 25000
customGasLimit = BASE_GAS + numRuns * boardSize(gameMode) * GAS_PER_TILE
```

The CLI maps `--split 1-5` to `compounding = false` and `--survive 1-5` to `compounding = true`. The two flags are mutually exclusive. If neither is provided, the CLI sends one compounding roll, preserving the previous Blocks behavior.

## Verified read path

`getGameInfo(uint256 gameId)` now returns:

```text
(
  address player,
  uint256 betAmount,
  uint8 numRuns,
  uint8 gameMode,
  uint8 riskMode,
  bool compounding,
  uint8[] boards,
  uint8[] maxCounts,
  uint256 totalPayout,
  bool hasEnded,
  uint256 timestamp
)
```

The wallet-history decoder selects this ABI for the current address and the older tuple for the previous address. Legacy records are normalized to `grid = 3x3`, `gameMode = 0`, and `compounding = true` before RTP variant resolution.

## Settlement rule

For each roll, the callback assigns every tile one of six colors, counts each color, and uses the largest color frequency (`maxCount`) as the payout key. It is a max-of-a-kind calculation, not a connected-component search.

With `compounding = true`, the verified behavior is:

```text
payout = wager
for every roll:
  multiplier = payouts[gameMode][riskMode][maxCount]
  if multiplier == 0: payout = 0 and stop
  otherwise: payout = payout * multiplier
```

With `compounding = false`, the verified behavior is:

```text
payout = 0
for every roll:
  multiplier = payouts[gameMode][riskMode][maxCount]
  payout += wager * multiplier / numRuns
```

Each independent roll therefore risks only its share of the wager; a zero multiplier does not stop later rolls. The contract performs integer division in payout-denominator units, so tiny rounding losses are possible at wei precision.

## Verified payout tables

### 2x2 (`gameMode = 2`)

| Max count | Low | High |
|----------:|----:|-----:|
| `2` | `1.2x` | `0x` |
| `3` | `1.85x` | `8x` |
| `4` | `12x` | `51x` |

### 3x3 (`gameMode = 0`, CLI default)

| Max count | Low | High |
|----------:|----:|-----:|
| `3` | `1.01x` | `0x` |
| `4` | `1.2x` | `2.25x` |
| `5` | `2x` | `6.5x` |
| `6` | `4.25x` | `15x` |
| `7` | `20x` | `80x` |
| `8` | `250x` | `600x` |
| `9` | `2500x` | `5000x` |

### 4x4 (`gameMode = 1`)

| Max count | Low | High |
|----------:|----:|-----:|
| `5` | `1.2x` | `0x` |
| `6` | `1.75x` | `2.6x` |
| `7` | `3x` | `6.6x` |
| `8` | `5x` | `15x` |
| `9` | `12x` | `30x` |
| `10` | `30x` | `60x` |
| `11` | `100x` | `150x` |
| `12` | `500x` | `700x` |
| `13` | `10000x` | `10000x` |
| `14` | `25000x` | `25000x` |
| `15` | `25000x` | `25000x` |
| `16` | `25000x` | `25000x` |

The exact board distributions plus independent and compounded RTP tables are maintained in [BLOCKS_ANALYTICS.md](../analytics/BLOCKS_ANALYTICS.md).

## Promotion outcome

Blocks remains `ABI verified` because the current address is explorer-verified and the CLI now matches its payload order, grid mapping, independent/compounding behavior, gas formula, getter tuple, and payout tables. The legacy address is separate and read-only from the CLI's perspective; it remains supported solely so existing wallet history is not lost or misdecoded.
