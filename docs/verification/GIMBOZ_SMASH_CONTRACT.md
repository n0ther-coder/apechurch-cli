# Gimboz Smash Contract Verification Notes

> Summary: One-or-two interval ABI surface, live cover-count getters, 0-based on-chain interval storage, and exact payout / RTP formula used to keep Gimboz Smash marked `ABI verified`.

## Source Basis

- Contract used by the CLI: `0x17e219844F25F3FED6E422DdaFfD2E6557eBCEd3`
- Explorer address page: `https://apescan.io/address/0x17e219844f25f3fed6e422ddaffd2e6557ebced3#code`
- Public game page: `https://ape.church/games/gimboz-smash`
- Verified source hash shown on ApeScan: `ipfs://d58dc309c2052d56eccea44dc6d8959ae1e64a797e1481f5f240eef42c75325e`
- Local handler / parser reference: `lib/games/gimbozsmash.js`
- Local RTP model reference: `lib/rtp.js`
- Local history / stateless reconstruction reference: `lib/wallet-analysis.js`

Example transactions checked during verification:

- `play(...)`: `0x810020226abf68733f6f87d293a368000acbc6d863bfc77e85160361a29356eb`
- `play(...)`: `0x0a895ea2fc210eb29c03a3265883c892a11b0c03f38ebf863f15dbdf0a92b0b5`

## Contract Identity

- Display name in the repo: `Gimboz Smash`
- Game family: instant range / target PvH game
- Public board: inclusive `1..100`
- Observed on-chain coordinate system: inclusive `0..99`

The public board and the stored coordinates differ by exactly `-1` on each endpoint. The CLI therefore accepts human-facing `1..100` targets and converts them to the contract-facing interval slots during encoding.

## Verified Write Surface

The CLI encodes:

```text
(uint8 numWinIntervals, uint8[2] winStarts, uint8[2] winEnds, uint256 gameId, address ref, bytes32 userRandomWord)
```

and calls:

```text
play(address player, bytes gameData)
```

The tuple shape above was checked against decoded live calldata from the transactions listed in the source basis.

Verified write-path facts:

- the contract supports exactly `1` or `2` winning intervals through the fixed `uint8[2]` arrays plus `numWinIntervals`
- each stored interval is inclusive on both ends
- the CLI accepts human-facing targets such as `20-80`, `100`, or `1-20,80-100`
- the CLI also accepts `--out-range 45-50` style input and rewrites it into the explicit winning intervals required by the contract
- the CLI merges touching / overlapping human ranges before encoding, so the on-chain interval count always matches the minimal winning-set representation
- there is no separate `outside` mode flag in the observed ABI surface; outside-style bets are encoded as explicit winning intervals, and the CLI's `--out-range` flag is only a convenience rewrite layer

## Verified Read Surface

The contract-backed ABI used by the repo exposes:

- `MIN_RANGE()`
- `MAX_RANGE()`
- `getVRFFee()`
- `getPayoutFromRange(uint8)`
- `getGameInfo(uint256)`
- `batchGameInfo(uint256[])`
- `getEssentialGameInfo(uint256[])`
- `numUsedGameIDs()`
- `paginateUsedGameIDs(uint256,uint256)`

`getGameInfo(gameId)` returns:

```text
(
  address player,
  uint256 betAmount,
  uint8 numWinIntervals,
  uint8[2] winStarts,
  uint8[2] winEnds,
  uint8 winCount,
  uint8 winningNumber,
  uint256 totalPayout,
  bool hasEnded,
  uint256 timestamp
)
```

Read-path facts confirmed during implementation:

- `winStarts`, `winEnds`, and `winningNumber` are observed in the same `0..99` coordinate system as the write path
- `winCount` is already returned by the contract, but it is also consistent with summing the inclusive stored interval lengths
- `batchGameInfo(...)` and `getEssentialGameInfo(...)` are sufficient to rebuild canonical history / RTP variants without a separate placement-aware variant taxonomy

## Live Getter Snapshot

Snapshot date: **2026-04-20**

- `MIN_RANGE() = 1`
- `MAX_RANGE() = 95`
- `getVRFFee() = 0.093211589 APE`
- `numUsedGameIDs() = 33,770`

Selected `getPayoutFromRange(winCount)` reads checked against the live contract:

| Covered numbers | Multiplier | Exact RTP |
|-----------------|------------|-----------|
| `1` | `97.5x` | `97.5000%` |
| `3` | `32.5x` | `97.5000%` |
| `21` | `4.6428x` | `97.4988%` |
| `34` | `2.8676x` | `97.4984%` |
| `41` | `2.378x` | `97.4980%` |
| `53` | `1.8396x` | `97.4988%` |
| `61` | `1.5983x` | `97.4963%` |
| `63` | `1.5476x` | `97.4988%` |
| `65` | `1.5x` | `97.5000%` |
| `75` | `1.3x` | `97.5000%` |
| `95` | `1.0263x` | `97.4985%` |

The getter name uses `range`, but the returned multiplier is placement-invariant and depends only on the total covered integers across the declared winning intervals.

## Verified Settlement Model

The verified settlement surface is the union of the stored winning intervals:

- `winCount = sum(end - start + 1)` across the active stored intervals
- the game wins when `winningNumber` falls inside that union
- `totalPayout` is the gross returned amount on win and `0` on loss

Checked live samples:

- Tx `0x810020226abf68733f6f87d293a368000acbc6d863bfc77e85160361a29356eb`
  - decoded write tuple: `numWinIntervals = 1`, `winStarts = [15, 0]`, `winEnds = [79, 0]`
  - `getGameInfo(...)` returned `winCount = 65`, `winningNumber = 88`, `totalPayout = 0`
- Tx `0x0a895ea2fc210eb29c03a3265883c892a11b0c03f38ebf863f15dbdf0a92b0b5`
  - decoded write tuple: `numWinIntervals = 1`, `winStarts = [0, 0]`, `winEnds = [74, 0]`
  - `getGameInfo(...)` returned `winCount = 75`, `winningNumber = 12`, `totalPayout = 65`

Those reads close two important ambiguities:

- the stored coordinates are 0-based, even though the public UI is 1-based
- `outside` is not a special settlement mode in the ABI; the contract stores the actual winning intervals
- because the live contract validates total winning coverage, CLI `--out-range` input must exclude at least `5` numbers and at most `95` numbers so the rewritten winning set stays within the supported surface

The live contract also caps total coverage at `95`, so older public snippets or videos that appear to show `1-100` coverage or `96-99` covered numbers should be treated as stale relative to the current verified contract surface.

## Exact Payout And RTP Rule

Across the checked live surface, the contract-backed payout getter matches:

```text
getPayoutFromRange(winCount) = floor(975000 / winCount)
```

with the displayed gross multiplier:

```text
multiplier(winCount) = floor(975000 / winCount) / 10000
```

That yields:

```text
P(win) = winCount / 100
RTP(winCount) = winCount * floor(975000 / winCount) / 10000
```

Consequences:

- placement does not affect EV; only total covered integers matter
- exact RTP is not perfectly flat because of floor division in the getter
- supported exact RTP ranges from `97.4918%` at `winCount = 83` up to `97.5000%`
- the maximum supported gross multiplier is `97.5x` at `winCount = 1`

The user-provided platform analytics screenshot captured on **2026-04-20** showed a public running RTP of `97.70%`. That figure is a realized sample statistic, not the theoretical contract constant above.

## Promotion Outcome

Gimboz Smash qualifies for `ABI verified` in this repo because:

- the local write path matches the verified production contract tuple and entrypoint
- the local read path matches the verified getter surface used for history and metadata reconstruction
- the exact payout formula is anchored to live getter reads, not only to public UI snippets
- the docs now record the 1-based public board, the 0-based stored intervals, and the cover-count RTP surface explicitly
