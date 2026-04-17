# Blocks Contract Verification Notes

> Summary: Verified tuple layout, batched-run fee path, and exact mode RTP notes used to promote Blocks to `ABI verified` on 2026-04-10.

## Public Source Trail

- Verified ApeScan contract page:
  - `https://apescan.io/address/0xA59CF828222EcD8aCe4b6195764d11F5Ea7f62A6#code`
- Live game page:
  - `https://www.ape.church/games/blocks`
- Official original-games docs:
  - `https://docs.ape.church/games/player-vs-house/original-games.md`
- Live frontend bundle used to confirm mode naming and fee wiring:
  - `https://www.ape.church/_next/static/chunks/app/games/blocks/page-6ff774f0056513dd.js`

## Contract Identity

- Game name in the verified source: `Blocks`
- Contract used by the CLI: `0xA59CF828222EcD8aCe4b6195764d11F5Ea7f62A6`
- Repo constant: `BLOCKS_CONTRACT`
- Supported risk modes in the CLI:
  - `0` = `Easy` / public UI `LOW`
  - `1` = `Hard` / public UI `HIGH`
- Supported run counts: `1..5`

## Verified Write Path

The verified contract exposes:

- `function play(address player, bytes calldata gameData) external payable`
- `function getVRFFee(uint32 customGasLimit) public view returns (uint256)`

Its `_playGame(...)` flow decodes:

```text
(uint8 riskMode, uint8 numRuns, uint256 gameId, address ref, bytes32 userRandomWord)
```

Verified runtime behavior:

- `numRuns` must be in `1..5`
- the wager is split across runs on-chain via `floor(totalBetAmount / numRuns)`
- `customGasLimit = BASE_GAS + (numRuns * GAS_PER_RUN)`
- `BASE_GAS = 600000`
- `GAS_PER_RUN = 200000`
- the contract requests `numRuns * BOARD_SIZE` random words for settlement

The live frontend bundle matches that tuple order and fee path exactly, which is the shape now encoded by `lib/games/blocks.js`.

## Fee Notes

- The documented contract fee surface here is the dynamic `getVRFFee(customGasLimit)` path.
- Fee overhead scales with `numRuns`, not with the stake size itself.
- Any remaining house edge used by the repo's RTP references is already in the published payout table rather than modeled as a second explicit percentage fee here.

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
- `maxCounts` stores the largest connected cluster for each run
- `riskMode` and `numRuns` are persisted directly, so history and replay tooling can reconstruct the exact CLI variant

## Published Cluster Table

The public docs and transparency material agree on the core gameplay surface:

- 3x3 grid
- 9 total blocks
- 6 possible colors
- payout depends only on the largest color cluster

Published payout and probability table:

| Largest Cluster | Easy | Probability | Hard | Probability |
|-----------------|------|-------------|------|-------------|
| `3` blocks | `1.01x` | `55.8461%` | `0x` | `55.8461%` |
| `4` blocks | `1.2x` | `23.0303%` | `2.25x` | `23.0303%` |
| `5` blocks | `2x` | `4.6886%` | `6.6x` | `4.6886%` |
| `6` blocks | `5x` | `0.6251%` | `15x` | `0.6251%` |
| `7` blocks | `20x` | `0.0536%` | `80x` | `0.0536%` |
| `8` blocks | `200x` | `0.0027%` | `600x` | `0.0027%` |
| `9` blocks | `2500x` | `0.0001%` | `5000x` | `0.0001%` |

Easy pays nothing below a `3`-block cluster. Hard additionally zeroes the `3`-block case and concentrates the EV into the fatter tail.

## Exact RTP Model

For mode `m`:

```text
RTP_run(m) = Σ_cluster P(cluster) * payout(m, cluster)
RTP_game(m, B, N) = RTP_run(m) * floor(B / N) * N / B
```

Implications:

- mode controls the actual EV surface
- run count changes only batching variance and floor-division dust

Exact references used by the repo:

| Mode | Exact RTP | Max Payout |
|------|-----------|------------|
| Easy | `98.405621%` | `2500x` |
| Hard | `98.547435%` | `5000x` |

## Transparency Snapshot

- House Profit: `13,910 APE`
- Running RTP: `93.92%`
- Total Wagered: `228,655 APE`
- Total Games Played: `9,782`

As with the other docs in this repo, the running RTP snapshot is descriptive only. It is not the contract-backed long-run expectation.

## Promotion Outcome

Blocks now qualifies for `ABI verified` because:

- the live contract address is explorer-verified
- the CLI tuple layout, fee path, and history getter surface match the verified source
- the public docs and transparency material preserve the exact mode payout surface used by the repo's RTP references
- the repo now stores dedicated verification and odds notes instead of leaving Blocks in the unsupported appendix
