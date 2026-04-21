# Jungle Plinko Contract Verification Notes

> Summary: Contract-backed ball encoding, weighted-bucket model, and exact risk RTP notes used to keep Jungle Plinko marked `ABI verified`.

## Source Basis

- Contract used by the CLI: `0x88683B2F9E765E5b1eC2745178354C70A03531Ce`
- Explorer address page: `https://apescan.io/address/0x88683B2F9E765E5b1eC2745178354C70A03531Ce#code`
- Local write-path reference: `lib/games/plinko.js`
- Local registry/VRF config: `registry.js`
- Local RTP/reference model: `lib/rtp.js`

This note consolidates the verified contract-facing behavior that was previously embedded inline in `docs/GAMES_REFERENCE.md`.

## Contract Identity

- Game name in the repo: `Jungle Plinko`
- Supported public risk levels: `0..4`
- Supported ball counts: `1..100`

## Verified Write Path

The CLI encodes `gameData` as:

```text
(uint8 gameMode, uint8 numBalls, uint256 gameId, address ref, bytes32 userRandomWord)
```

Verified runtime constraints used by the repo:

- `gameMode` must be in `0..4`
- `numBalls` must be in `1..100`
- the total wager is split across balls on-chain with Solidity floor division

Jungle does not use a static RNG fee. The repo calculates a custom gas limit and reads the fee through the plinko-style getter path:

```text
customGasLimit = 289000 + 11000 * numBalls
```

That fee model is part of the documented ABI-facing behavior for this game.

## Fee Notes

- Jungle's VRF fee is dynamic and follows `customGasLimit = 289000 + 11000 * numBalls`.
- That means fee overhead scales with ball count, not with stake size itself.
- Ball count can also create floor-division dust in the wager split, but that dust is separate from the VRF fee path.

## Verified Weighted-Bucket Model

The contract-backed mechanic is not a peg-by-peg left/right simulation. Each ball resolves as one weighted bucket draw:

```text
r ~ Uniform(0, totalWeight(mode) - 1)
bucket = first cumulative bucket where r < cumulativeWeight
```

The verified contract exposes the bucket surface via:

- `getBucketWeights(mode)`
- `getPayouts(mode)`

Because settlement is bucket-based, exact RTP is risk-specific and ball-count invariant except for Solidity dust from `floor(totalBetAmount / numBalls)`.

## Exact RTP by Mode

Let:

```text
deltaWeight_i(mode) = cumulativeWeight_i - cumulativeWeight_(i-1)
P(bucket_i | mode) = deltaWeight_i(mode) / totalWeight(mode)
multiplier_i(mode) = payout_i(mode) / 10_000
RTP_ball(mode) = sum_i(P(bucket_i | mode) * multiplier_i(mode))
RTP_game(mode, B, N) = RTP_ball(mode) * floor(B / N) * N / B
```

Verified exact risk references:

| Mode | Label | Exact RTP | Top Multiplier |
|------|-------|-----------|----------------|
| `0` | Low | `98.00%` | `2.2x` |
| `1` | Moderate | `97.97%` | `5x` |
| `2` | High | `97.97%` | `15x` |
| `3` | Degen | `97.94%` | `100x` |
| `4` | Ultra Degen | `97.99%` | `1000x` |

Implications:

- if `B % N == 0`, exact RTP is independent of ball count
- if `B % N != 0`, only the floor-division dust changes the session RTP; the bucket table does not

## Transparency Snapshot

- House Profit: `31,743 APE`
- Running RTP: `98.42%`
- Total Wagered: `2,008,923 APE`
- Total Games Played: `41,638`

## Promotion Outcome

Jungle Plinko qualifies for `ABI verified` in this repo because:

- the encoded tuple, parameter limits, and VRF gas formula are documented in the local integration path
- the exact RTP table in `lib/rtp.js` is derived from the verified on-chain bucket model rather than a visual plinko simulation
- the public docs now record the difference between the visual presentation and the actual contract-backed settlement model
