# Reel Pirates Contract Verification Notes

> Summary: Publicly observable Reel Pirates interface and mechanics, with the limits of its unverified contract source.

## Public Source Trail

- ApeScan contract page for the live Reel Pirates address:
  - `https://apescan.io/address/0x5e405198b349d6522bbb614e7391bdc4f4f6f681#code`
- ApeScan status on **2026-04-23**:
  - `Contract: Unverified`
- Official Ape Church slots docs:
  - `https://docs.ape.church/games/player-vs-house/slots-games`
- Public Reel Pirates game page:
  - `https://www.ape.church/games/reel-pirates`
Because the live contract source is unverified, Reel Pirates is intentionally **not** marked with the `✔︎` ABI-verified symbol in the CLI registry.

## Contract Identity

- Contract used by the CLI: `0x5E405198B349d6522BbB614E7391bDC4F4F6f681`
- ApeScan page status: unverified contract
- CLI key: `reel-pirates`
- CLI aliases: `reelpirates`, `pirates`, `reel`

## CLI Write Path

The CLI calls:

```text
play(address player, bytes gameData)
```

It encodes `gameData` as:

```text
(
  uint256 numSpins,
  uint256 gameId,
  address ref,
  bytes32 userRandomWord
)
```

The CLI implements this **spins-first** layout in [slots.js](../../lib/games/slots.js) via `config.gameDataOrder = "spins-first"`. The source is unverified, so this describes the CLI's operational encoding rather than a source-backed ABI verification.

## CLI Fee Path

The zero-argument slot fee getter:

```text
getVRFFee()
```

reverts on the live contract. The callable fee path is:

```text
getVRFFee(uint32 customGasLimit)
```

The CLI quotes `getVRFFee(uint32)` with:

```text
customGasLimit = 550000 + numSpins * 200000
```

The CLI also adds:

```text
EXECUTOR_FEE() * numSpins
```

The amount sent for a play is therefore:

```text
wager + getVRFFee(550000 + numSpins * 200000) + EXECUTOR_FEE() * numSpins
```

The CLI enforces a minimum total wager of `2.5 APE * numSpins`; for example, `10` spins requires at least `25 APE`.

## Public Mechanics

The official slots docs describe Reel Pirates as a pirate-themed slot where:

- matching `8-9`, `10-11`, or `12+` identical symbols anywhere on the board can pay
- `4` scatter symbols trigger a bonus round with `5` free spins
- bonus multipliers can reach `100x`

These are match-anywhere outcomes, not left-to-right paylines or ordered triples.

## Public UI Paytable Snapshot

The in-game paytable is normalized to a `1 APE` bet:

| Symbol | 8-9 match | 10-11 match | 12+ match |
|---|---:|---:|---:|
| Coral | `0.25x` | `0.75x` | `2x` |
| Fish bones / skeleton | `0.40x` | `1x` | `4x` |
| Shell | `0.50x` | `1.10x` | `5x` |
| Purple fish / anglerfish | `0.80x` | `1.25x` | `8x` |
| Gold coins | `1x` | `1.50x` | `10x` |
| Hook | `1.50x` | `2x` | `12x` |
| Anchor | `2x` | `5x` | `15x` |
| Treasure map | `2.50x` | `10x` | `25x` |
| Pirate hat | `10x` | `25x` | `50x` |

Scatter symbol: treasure chest.

Bonus multipliers shown by the UI evidence: `2x`, `3x`, `5x`, `10x`, `25x`, `50x`, `100x`.

## Verification Limits

The current evidence is enough to support the CLI write payload, but not enough to claim an exact RTP model.

Still missing:

- verified Solidity source
- exact board dimensions from source or getters
- exact symbol weights / random mapping
- exact symbol refill behavior
- exact scatter and retrigger probabilities
- exact bonus multiplier distribution
- exact maximum mathematical payout

Until those are available, Reel Pirates should remain playable but not `ABI verified`.
