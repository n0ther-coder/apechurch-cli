# Cosmic Plinko Contract Verification Notes

> Summary: Contract-backed ball encoding, weighted-bucket model, and exact mode RTP notes used to keep Cosmic Plinko marked `ABI verified`.

## Source Basis

- Contract used by the CLI: `0x674Bd91adb41897fA780386E610168afBB05e694`
- Explorer address page: `https://apescan.io/address/0x674Bd91adb41897fA780386E610168afBB05e694#code`
- Local write-path reference: `lib/games/plinko.js`
- Local registry/VRF config: `registry.js`
- Local RTP/reference model: `lib/rtp.js`

This note consolidates the verified contract-facing behavior that was previously embedded inline in `docs/GAMES_REFERENCE.md`.

## Contract Identity

- Game name in the repo: `Cosmic Plinko`
- Supported modes: `0..2`
- Supported ball counts: `1..30`

## Verified Write Path

The CLI encodes the same tuple shape used by Jungle Plinko:

```text
(uint8 gameMode, uint8 numBalls, uint256 gameId, address ref, bytes32 userRandomWord)
```

Verified runtime constraints used by the repo:

- `gameMode` must be in `0..2`
- `numBalls` must be in `1..30`
- the total wager is split across balls on-chain with Solidity floor division

Unlike Jungle, Cosmic uses a static fee path in the repo: `getVRFFee()` with no custom gas argument.

## Fee Notes

- Cosmic's documented fee path is one static `getVRFFee()` charged per session.
- That overhead is fixed with respect to both stake size and ball count in the current repo integration.
- Ball count still affects floor-division dust when splitting the wager, but that is distinct from the VRF fee itself.

## Verified Weighted-Bucket Model

Cosmic is also settled as a weighted bucket draw rather than a peg-by-peg simulation:

```text
r ~ Uniform(0, totalWeight(mode) - 1)
bucket = first cumulative bucket where r < cumulativeWeight
```

The verified contract-backed getter surface exposes:

- `getBucketWeights(mode)`
- `getPayout(mode, index)`

Because the settlement is bucket-based, exact RTP depends on mode, not ball count, except for Solidity dust from `floor(totalBetAmount / numBalls)`.

## Exact RTP by Mode

Let:

```text
deltaWeight_i(mode) = cumulativeWeight_i - cumulativeWeight_(i-1)
P(bucket_i | mode) = deltaWeight_i(mode) / totalWeight(mode)
multiplier_i(mode) = payout_i(mode) / 10_000
RTP_ball(mode) = sum_i(P(bucket_i | mode) * multiplier_i(mode))
RTP_game(mode, B, N) = RTP_ball(mode) * floor(B / N) * N / B
```

Verified exact mode references:

| Mode | Label | Exact RTP | Top Multiplier |
|------|-------|-----------|----------------|
| `0` | Low | `97.73%` | `50x` |
| `1` | Modest | `97.76%` | `100x` |
| `2` | High | `97.80%` | `250x` |

Implications:

- if `B % N == 0`, exact RTP is independent of ball count
- if `B % N != 0`, only the floor-division dust changes the session RTP

## Transparency Snapshot

- Running RTP: `97.32%`
- The public transparency surface exposes aggregate metrics plus the payout idea, but the repo's exact RTP references are based on the verified bucket getters rather than only transparency rounding

## Promotion Outcome

Cosmic Plinko qualifies for `ABI verified` in this repo because:

- the encoded tuple, mode limits, and fee path are documented in the local integration
- the exact mode RTP references in `lib/rtp.js` come from the contract-backed bucket tables rather than the UI animation
- the docs now preserve the correct weighted-draw interpretation for future maintainers
