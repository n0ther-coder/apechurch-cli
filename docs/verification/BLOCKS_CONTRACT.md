# Blocks Contract Verification Notes

> Summary: Verified tuple layout, read path, official `Low` / `High` wording, max-of-a-kind settlement rule, and the repo's exact consecutive-roll Blocks model.

## Public Source Trail

- Verified ApeScan contract page:
  - `https://apescan.io/address/0xA59CF828222EcD8aCe4b6195764d11F5Ea7f62A6#code`
- Official original-games docs:
  - `https://docs.ape.church/games/player-vs-house/original-games.md`
- Live game page:
  - `https://www.ape.church/games/blocks`

## Contract Identity

- Game name in the verified source: `Blocks`
- Contract used by the CLI: `0xA59CF828222EcD8aCe4b6195764d11F5Ea7f62A6`
- Repo constant: `BLOCKS_CONTRACT`
- Supported risk modes in the CLI:
  - `0` = `Low`
  - `1` = `High`
- Supported roll counts: `1..5`

## Verified Write Path

The verified contract exposes:

- `function play(address player, bytes calldata gameData) external payable`
- `function getVRFFee(uint32 customGasLimit) public view returns (uint256)`

Its write path decodes:

```text
(uint8 riskMode, uint8 numRuns, uint256 gameId, address ref, bytes32 userRandomWord)
```

Verified runtime facts used by the CLI:

- `numRuns` must be in `1..5`
- `customGasLimit = BASE_GAS + (numRuns * GAS_PER_RUN)`
- `BASE_GAS = 600000`
- `GAS_PER_RUN = 200000`
- settlement consumes `numRuns * BOARD_SIZE` random words
- `BOARD_SIZE = 9`
- `NUM_COLORS = 6`

The live CLI write path in [lib/games/blocks.js](../../lib/games/blocks.js) matches that tuple order and fee surface.

## Verified Read Path

The verified contract exposes:

- `function getGameInfo(uint256 gameId) public view returns (GameInfoReturnType memory)`

`getGameInfo(gameId)` returns:

```text
(
  address player,
  uint256 betAmount,
  uint8 numRuns,
  uint8 riskMode,
  uint8[] boards,
  uint8[] maxCounts,
  uint256 totalPayout,
  bool hasEnded,
  uint256 timestamp
)
```

Important implications:

- settlement stores every revealed board in `boards`
- `maxCounts` stores the largest same-color count for each roll, not the largest connected component
- the getter exposes only one `totalPayout` for the full game, not a per-roll payout array
- `riskMode` and `numRuns` are persisted directly, so history and replay tooling can reconstruct the exact CLI variant

## Verified Settlement Rule

The verified source comments and callback code describe Blocks as:

```text
Each run generates a fresh board, computes M = max-of-a-kind, and looks up the multiplier.
Final payout = wager * product of all run multipliers. Bust if any run's M is below threshold.
```

The callback implements that literally:

- it creates a `uint8[6] counts` array for the six colors
- each tile is assigned `color = (randomWord % NUM_COLORS) + 1`
- the contract increments `counts[color - 1]`
- `maxCount` is updated from the largest color frequency
- `multiplier = payouts[riskMode][maxCount]`
- if `multiplier > 0`, `totalToPayout = totalToPayout * multiplier / PAYOUT_DENOM`
- otherwise the whole game busts to `0`

So the implementation reality is **max-of-a-kind**, not a connected same-color cluster. This is the source of the old discrepancy: earlier repo docs and constants treated `maxCounts` as a connected cluster, while the public page and verified contract both use the largest color frequency on the board.

## Verified Payout Table

The constructor sets:

| Max Count | Low | High |
|---:|---:|---:|
| `3` | `1.01x` | `0x` |
| `4` | `1.2x` | `2.25x` |
| `5` | `2x` | `6.6x` |
| `6` | `5x` | `15x` |
| `7` | `20x` | `80x` |
| `8` | `200x` | `600x` |
| `9` | `2500x` | `5000x` |

## Exact Single-Roll Max-Count Distribution

The public Blocks page rounds this table to four decimals. The repo uses the exact distribution obtained by exhaustive enumeration of all `6^9 = 10,077,696` boards:

| Largest Same-Color Count | Exact Boards | Probability | Low | High |
|-------------------------:|-------------:|------------:|----:|-----:|
| `2` | `1,587,600` | `15.753601%` | `0x` | `0x` |
| `3` | `5,628,000` | `55.846098%` | `1.01x` | `0x` |
| `4` | `2,320,920` | `23.030264%` | `1.2x` | `2.25x` |
| `5` | `472,500` | `4.688572%` | `2x` | `6.6x` |
| `6` | `63,000` | `0.625143%` | `5x` | `15x` |
| `7` | `5,400` | `0.053584%` | `20x` | `80x` |
| `8` | `270` | `0.002679%` | `200x` | `600x` |
| `9` | `6` | `0.000060%` | `2500x` | `5000x` |

There is no largest count `1` on a `9`-tile board with `6` colors.

## Exact RTP Model

For mode `m` and roll count `N`:

```text
EV_roll(m) = Sum_maxCount P(maxCount) * multiplier(m, maxCount)
RTP_game(m, N) = EV_roll(m)^N
```

Because dead counts already carry multiplier `0x`, the fail-fast all-or-nothing rule changes the path semantics but not the expected-value formula: the full-game EV is still the product of identical per-roll expectations.

Exact per-roll expectations used by the repo:

- `Low`: `EV_roll = 0.98300087638673`
- `High`: `EV_roll = 0.98331702008141`

Exact RTP references:

| Mode | 1 roll | 2 rolls | 3 rolls | 4 rolls | 5 rolls |
|------|-------:|--------:|--------:|--------:|--------:|
| Low | `98.300088%` | `96.629072%` | `94.986463%` | `93.371776%` | `91.784538%` |
| High | `98.331702%` | `96.691236%` | `95.078138%` | `93.491952%` | `91.932227%` |

## Promotion Outcome

Blocks remains `ABI verified` because:

- the live contract address is explorer-verified
- the CLI tuple layout and fee path match the verified source
- the verified getter persists `riskMode`, `numRuns`, `boards`, `maxCounts`, and one final `totalPayout`
- the repo now uses the contract-backed max-of-a-kind distribution and a consecutive-roll model consistent with the public docs and verified storage surface
