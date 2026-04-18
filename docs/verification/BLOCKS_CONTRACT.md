# Blocks Contract Verification Notes

> Summary: Verified tuple layout, read path, official `Low` / `High` wording, and the repo's exact consecutive-roll Blocks model.

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
- `maxCounts` stores the largest connected cluster for each roll
- the getter exposes only one `totalPayout` for the full game, not a per-roll payout array
- `riskMode` and `numRuns` are persisted directly, so history and replay tooling can reconstruct the exact CLI variant

## Gameplay Model Used By The Repo

The official docs describe Blocks as:

- a `3x3` tile game
- a multiplier game where each flip reveals a number tied to a multiplier
- a game with selectable `risk level`
- a game with selectable `number of consecutive rolls`

Combined with the verified getter shape above (`maxCounts` per roll, but a single `totalPayout` for the whole game), the repo now models Blocks as:

- one consecutive-roll game, not a sum of independent mini-bets
- each surviving roll compounding the current payout by that roll's cluster multiplier
- any dead cluster ending the whole game at `0x`
- no cash-out and no partial payout

This final settlement interpretation is an inference from the official docs wording plus the verified read/write surface; it is no longer modeled as a wager-splitting batch.

## Exact Single-Roll Cluster Distribution

The public transparency material rounds the cluster table to four decimals. The repo now uses the exact cluster distribution obtained by exhaustive enumeration of all `6^9 = 10,077,696` boards; percentages below are shown to `3` decimals and the parenthetical ratio is written as `a / b E-n`, where the exponent applies to the whole ratio and is omitted when it would be `E0`:

| Largest Cluster | Exact Boards | Probability | Low | High |
|-----------------|-------------:|------------:|----:|-----:|
| `1` | `1,166,910` | `11.579%` (`≈ 1.944 / 1.679 E-1`) | `0x` | `0x` |
| `2` | `5,094,600` | `50.553%` (`≈ 2.122 / 4.199`) | `0x` | `0x` |
| `3` | `2,760,840` | `27.396%` (`≈ 3.834 / 1.399 E-1`) | `1.01x` | `0x` |
| `4` | `814,920` | `8.086%` (`≈ 3.395 / 4.199 E-1`) | `1.2x` | `2.25x` |
| `5` | `198,750` | `1.972%` (`≈ 3.312 / 1.679 E-2`) | `2x` | `6.6x` |
| `6` | `36,600` | `0.363%` (`≈ 1.525 / 4.199 E-2`) | `5x` | `15x` |
| `7` | `4,800` | `0.048%` (`≈ 2.500 / 5.248 E-3`) | `20x` | `80x` |
| `8` | `270` | `0.003%` (`≈ 5.000 / 1.866 E-5`) | `200x` | `600x` |
| `9` | `6` | `0.000%` (`≈ 1.000 / 1.679 E-6`) | `2500x` | `5000x` |

## Exact RTP Model

For mode `m` and roll count `N`:

```text
EV_roll(m) = Σ_cluster P(cluster) * multiplier(m, cluster)
RTP_game(m, N) = EV_roll(m)^N
```

Because dead clusters already carry multiplier `0x`, the fail-fast all-or-nothing rule changes the path semantics but not the expected-value formula: the full-game EV is still the product of identical per-roll expectations.

Exact per-roll expectations used by the repo:

- `Low`: `EV_roll = 3,759,877 / 8,398,080 ≈ 0.44770673773052`
- `High`: `EV_roll = 3,295 / 7,776 ≈ 0.42373971193415`

Exact RTP references:

| Mode | 1 roll | 2 rolls | 3 rolls | 4 rolls | 5 rolls |
|------|-------:|--------:|--------:|--------:|--------:|
| Low | `44.770674%` | `20.044132%` | `8.973893%` | `4.017672%` | `1.798739%` |
| High | `42.373971%` | `17.955534%` | `7.608473%` | `3.224012%` | `1.366142%` |

## Promotion Outcome

Blocks remains `ABI verified` because:

- the live contract address is explorer-verified
- the CLI tuple layout and fee path match the verified source
- the verified getter persists `riskMode`, `numRuns`, `boards`, `maxCounts`, and one final `totalPayout`
- the repo now uses the official `Low` / `High` wording and a consecutive-roll model consistent with the public docs and verified storage surface
