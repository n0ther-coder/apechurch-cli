# Speed Keno Contract Verification Notes

> Summary: Contract-backed tuple layout, batched draw model, custom gas fee path, and exact RTP notes used to keep Speed Keno marked `ABI verified`.

## Source Basis

- Contract used by the CLI: `0x40EE3295035901e5Fd80703774E5A9FE7CE2B90C`
- Explorer address page: `https://apescan.io/address/0x40EE3295035901e5Fd80703774E5A9FE7CE2B90C#code`
- Local write-path reference: `lib/games/speedkeno.js`
- Local registry/VRF config: `registry.js`
- Local RTP/reference model: `lib/rtp.js`

This note consolidates the verified contract-facing behavior that was previously embedded inline in `docs/GAMES_REFERENCE.md`.

## Contract Identity

- Game name in the repo: `Speed Keno`
- Aliases: `sk`, `speedk`
- Supported picks: `1..5`
- Supported batch counts: `1..20`
- Number pool: `1..20`

## Verified Write Path and VRF Cost

The CLI encodes `gameData` as:

```text
(uint8 numGames, uint8[] gameNumbers, uint256 gameId, address ref, bytes32 userRandomWord)
```

Verified behavior:

- the contract validates `1..5` unique picks in `1..20`
- `numGames` is constrained to `1..20`
- the total wager is split across games on-chain via `betAmountPerGame = floor(totalBetAmount / numGames)`

Speed Keno uses a custom gas fee path through `getVRFFee(customGasLimit)` with:

```text
BASE_GAS = 325000
GAS_PER_GAME = 55000
customGasLimit = BASE_GAS + GAS_PER_GAME * numGames
```

## Fee Notes

- Speed Keno's VRF fee is dynamic and scales with `numGames` through `getVRFFee(customGasLimit)`.
- Pick count changes EV, but not the fee formula.
- Session results can also lose tiny floor-division dust from `floor(totalBetAmount / numGames)`, which is separate from the VRF fee itself.

## Verified Draw and Payout Model

Each batched mini-game:

- requests `5` winning numbers without replacement
- resolves them through a partial Fisher-Yates shuffle over `[1..20]`
- scores the resulting hit count against `payouts[picks][hits] / 10_000`

Important consequences:

- the specific chosen numbers do not change exact RTP because the draw is symmetric
- batch count changes fee overhead, variance, and floor-division dust, but not the underlying per-game EV

Verified runtime constants:

- `MAX_GUESSES = 5`
- `MIN_GUESSES = 1`
- `KENO_BOARD_SIZE = 20`
- `MAX_GAMES = 20`

## Verified On-Chain Payout Matrix

| Picks | 0 matches | 1 match | 2 matches | 3 matches | 4 matches | 5 matches |
|-------|-----------|---------|-----------|-----------|-----------|-----------|
| 1 | `0.5x` | `2.4x` | - | - | - | - |
| 2 | `0.25x` | `1.45x` | `5x` | - | - | - |
| 3 | `0.5x` | `0.5x` | `2.5x` | `25x` | - | - |
| 4 | `0.5x` | `0.5x` | `1.5x` | `5.5x` | `100x` | - |
| 5 | `1.25x` | `0.2x` | `0.5x` | `3x` | `35x` | `2,000x` |

## Exact RTP by Pick Count

The exact RTP model is:

```text
H ~ Hypergeometric(N = 20, K = 5, n = picks)
RTP_per_game(picks) = sum_h(P(H = h) * payout(picks, h))
RTP_session(picks, totalBetAmount, numGames) = RTP_per_game(picks) * floor(totalBetAmount / numGames) * numGames / totalBetAmount
```

Verified exact references:

| Picks | Exact RTP |
|-------|-----------|
| 1 | `97.50%` |
| 2 | `97.37%` |
| 3 | `97.81%` |
| 4 | `97.42%` |
| 5 | `97.84%` |

Best-EV pick count:

- `5 picks`: `97.8376547988%`
- there is no intra-game solver because no further player action exists after submission

## Transparency Snapshot

- House Profit: `15,083 APE`
- Running RTP: `93.36%`
- Total Wagered: `227,058 APE`
- Total Games Played: `6,938`

## Promotion Outcome

Speed Keno qualifies for `ABI verified` in this repo because:

- the encoded tuple, batch-size constraints, and dynamic fee formula are documented and implemented consistently
- the repo's exact RTP references use the verified payout matrix and the actual without-replacement draw process
- the docs now preserve the distinction between per-game EV and session EV after floor-division dust
