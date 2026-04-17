# Keno Contract Verification Notes

> Summary: Contract-backed tuple layout, draw model, payout matrix, and exact RTP notes used to keep Keno marked `ABI verified`.

## Source Basis

- Contract used by the CLI: `0xc936D6691737afe5240975622f0597fA2d122FAd`
- Explorer address page: `https://apescan.io/address/0xc936D6691737afe5240975622f0597fA2d122FAd#code`
- Local write-path reference: `lib/games/keno.js`
- Local RTP/reference model: `lib/rtp.js`

This note consolidates the verified contract-facing behavior that was previously embedded inline in `docs/GAMES_REFERENCE.md`.

## Contract Identity

- Game name in the repo: `Keno`
- Alias: `k`
- Supported picks: `1..10`
- Number pool: `1..40`

## Verified Write Path and Draw Model

The CLI encodes `gameData` as:

```text
(uint8[] gameNumbers, uint256 gameId, address ref, bytes32 userRandomWord)
```

Verified behavior:

- the contract validates `1..10` unique picks in `1..40`
- the repo generates random picks only as a convenience; specific chosen numbers are also valid
- `getVRFFee()` is used as the static fee path

Settlement uses exactly `10` VRF words and resolves `10` winning numbers without replacement through a partial Fisher-Yates shuffle over `[1..40]`.

Important consequence:

- the draw is symmetric, so exact RTP depends only on the pick count, not on which specific numbers the player selected

## Fee Notes

- Keno uses one live static `getVRFFee()` on top of the submitted wager.
- That documented fee overhead is fixed per session rather than proportional to pick count or stake size.
- There is no post-bet action tree, so there are no additional in-game action fees after the opening tx.

## Verified Read Surface

`getGameInfo(gameId)` returns:

```text
(betAmount, totalPayout, winningNumbers, gameNumbers, timestamp)
```

Verified runtime constants:

- `MAX_GUESSES = 10`
- `MIN_GUESSES = 1`
- `KENO_BOARD_SIZE = 40`

## Verified On-Chain Payout Matrix

| Picks | 0 matches | 1 match | 2 matches | 3 matches | 4 matches | 5 matches | 6 matches | 7 matches | 8 matches | 9 matches | 10 matches |
|-------|-----------|---------|-----------|-----------|-----------|-----------|-----------|-----------|-----------|-----------|------------|
| 1 | `0.5x` | `2.25x` | - | - | - | - | - | - | - | - | - |
| 2 | `0x` | `1.8x` | `4.25x` | - | - | - | - | - | - | - | - |
| 3 | `0x` | `0.8x` | `2.5x` | `20x` | - | - | - | - | - | - | - |
| 4 | `0x` | `0x` | `2x` | `7x` | `100x` | - | - | - | - | - | - |
| 5 | `1.25x` | `0x` | `1.1x` | `2.5x` | `10x` | `200x` | - | - | - | - | - |
| 6 | `1.5x` | `0x` | `0.5x` | `2x` | `7x` | `50x` | `500x` | - | - | - | - |
| 7 | `2x` | `0x` | `0x` | `1.25x` | `4x` | `37.5x` | `250x` | `2,500x` | - | - | - |
| 8 | `2x` | `0x` | `0.5x` | `1.1x` | `2x` | `10x` | `50x` | `500x` | `10,000x` | - | - |
| 9 | `3x` | `0x` | `0x` | `0.25x` | `1.5x` | `10x` | `50x` | `500x` | `5,000x` | `500,000x` | - |
| 10 | `4x` | `0x` | `0x` | `0.25x` | `1.2x` | `4x` | `25x` | `250x` | `2,000x` | `50,000x` | `1,000,000x` |

## Exact RTP by Pick Count

The exact RTP model is:

```text
H ~ Hypergeometric(N = 40, K = 10, n = picks)
RTP(picks) = sum_h(P(H = h) * payout(picks, h))
```

Verified exact references:

| Picks | Exact RTP |
|-------|-----------|
| 1 | `93.75%` |
| 2 | `93.75%` |
| 3 | `93.67%` |
| 4 | `93.39%` |
| 5 | `94.68%` |
| 6 | `93.90%` |
| 7 | `94.29%` |
| 8 | `94.19%` |
| 9 | `93.32%` |
| 10 | `93.83%` |

Best-EV pick count:

- `5 picks`: `94.6800798774%`
- there is no post-bet solver because no further player decision exists after the picks are submitted

## Transparency Snapshot

- House Profit: `16,821 APE`
- Running RTP: `86.35%`
- Total Wagered: `123,224 APE`
- Total Games Played: `25,673`

## Promotion Outcome

Keno qualifies for `ABI verified` in this repo because:

- the encoded tuple, pick constraints, and draw model are documented in the local integration
- the repo's exact RTP references use the verified payout matrix and the actual without-replacement draw process
- the docs now preserve the difference between the public transparency summary and the contract-backed exact EV
