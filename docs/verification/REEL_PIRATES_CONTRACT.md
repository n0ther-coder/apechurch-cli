# Reel Pirates Contract Verification Notes

> Summary: Evidence used to add playable CLI support for Reel Pirates, plus the explicit reason it is not marked `ABI verified`.

## Public Source Trail

- ApeScan contract page for the live Reel Pirates address:
  - `https://apescan.io/address/0x5e405198b349d6522bbb614e7391bdc4f4f6f681#code`
- ApeScan status on **2026-04-23**:
  - `Contract: Unverified`
- Official Ape Church slots docs:
  - `https://docs.ape.church/games/player-vs-house/slots-games`
- Supplied gameplay transaction:
  - `https://apescan.io/tx/0x99e80b8f0cdcc7535efd583edcd001fe3b741227094c8a619e05879f533255f2`

Because the live contract source is unverified, Reel Pirates is intentionally **not** marked with the `✔︎` ABI-verified symbol in the CLI registry.

## Contract Identity

- Contract used by the CLI: `0x5E405198B349d6522BbB614E7391bDC4F4F6f681`
- ApeScan page status: unverified contract
- CLI key: `reel-pirates`
- CLI aliases: `reelpirates`, `pirates`, `reel`

## Observed Write Path

The supplied gameplay transaction calls:

```text
play(address player, bytes gameData)
```

The outer selector is:

```text
0xc811ad71
```

The decoded outer arguments are:

```text
player = 0xb1A27C7Eb5FD767D1F814Fcf7d9BD97B5D7A9876
gameData length = 128 bytes
```

The `gameData` payload decodes as:

```text
(
  uint256 numSpins,
  uint256 gameId,
  address ref,
  bytes32 userRandomWord
)
```

For the supplied transaction:

```text
numSpins = 15
gameId = 44866780173023645644633793867176620171112861344857785148614495998657763724062
ref = 0x358635772fa78ee388b249cab567a9a35f1d3a28
userRandomWord = 0xef10eb50b1b6b9dcbe0a789b168abb074387847e767bc2a2226b7610f85b60ae
```

The same transaction emitted:

```text
RandomnessRequested(uint256 gameId)
```

with the same `gameId`, confirming that Reel Pirates uses a **spins-first** internal payload, unlike the older verified three-reel slot-family contracts.

The CLI implements this in [slots.js](/Users/fluoro/Downloads/Clones/n0ther-coder/apechurch-cli/lib/games/slots.js) via `config.gameDataOrder = "spins-first"`.

## Observed Fee Path

Reel Pirates does not use the older static slot getter:

```text
getVRFFee()
```

That zero-argument call reverts on the live contract. The observed callable fee path is:

```text
getVRFFee(uint32 customGasLimit)
```

The supplied `15`-spin transaction sent:

```text
msg.value = 61.1398022819 APE
total bet = 60 APE
observed total fee = 1.1398022819 APE
```

The current UI calls `getVRFFee(uint32)` with:

```text
customGasLimit = 550000 + numSpins * 200000
```

For example, `15` spins gives `3,550,000`, and `getVRFFee(3_550_000)` returns `0.5398022819 APE`.

The UI also adds:

```text
EXECUTOR_FEE() * numSpins
```

At the observed live value, `EXECUTOR_FEE() = 0.04 APE`; for `15` spins that adds `0.6 APE`. The transaction value therefore reconciles as:

```text
60 APE wager + 0.5398022819 APE VRF + 0.6 APE executor fee = 61.1398022819 APE
```

The UI enforces a minimum total wager of `2.5 APE * numSpins`; for example, `10` spins requires at least `25 APE`.

## Public Mechanics

The official slots docs describe Reel Pirates as a pirate-themed slot where:

- matching `8-9`, `10-11`, or `12+` identical symbols anywhere on the board can pay
- `4` scatter symbols trigger a bonus round with `5` free spins
- bonus multipliers can reach `100x`

The supplied game description and gameplay evidence further identify it as a match-anywhere cascade slot rather than a left-to-right payline or ordered-triple slot.

## Known Paytable From UI Evidence

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
- exact cascade refill behavior
- exact scatter and retrigger probabilities
- exact bonus multiplier distribution
- exact maximum mathematical payout

Until those are available, Reel Pirates should remain playable but not `ABI verified`.
