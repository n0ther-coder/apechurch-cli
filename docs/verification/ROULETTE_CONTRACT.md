# Roulette Contract Verification Notes

> Summary: Contract-backed bet encoding, settlement rules, and exact RTP notes used to keep Roulette marked `ABI verified`.

## Source Basis

- Contract used by the CLI: `0x1f48A104C1808eb4107f3999999D36aeafEC56d5`
- Explorer address page: `https://apescan.io/address/0x1f48A104C1808eb4107f3999999D36aeafEC56d5#code`
- Local write-path reference: `lib/games/roulette.js`
- Local RTP/reference model: `lib/rtp.js`

This note consolidates the verified contract-facing behavior that was previously embedded inline in `docs/GAMES_REFERENCE.md`.

## Contract Identity

- Game name in the repo: `Roulette`
- Game type: American roulette with `0`, `00`, and `1-36`
- CLI contract entry and the docs point to the same deployed address

## Verified Write Path

The CLI encodes `gameData` as:

```text
(uint8[] gameNumbers, uint256[] amounts, uint256 gameId, address ref, bytes32 userRandomWord)
```

Key verified behavior:

- `MAX_GUESSES` controls the live distinct-entry limit (`50` at ApeChain block `52833196`); the owner can change it
- the contract uses numeric bet codes rather than string labels
- numbers are encoded as `0 -> 1`, `1..36 -> 2..37`, `00 -> 38`
- outside bets are encoded as:
  - `FIRST_THIRD=39`
  - `SECOND_THIRD=40`
  - `THIRD_THIRD=41`
  - `FIRST_COL=42`
  - `SECOND_COL=43`
  - `THIRD_COL=44`
  - `FIRST_HALF=45`
  - `SECOND_HALF=46`
  - `EVEN=47`
  - `ODD=48`
  - `BLACK=49`
  - `RED=50`

The wager allocation is not a UI-only convention. The contract expects a positive `amounts[]` component per distinct bet, each strictly below `totalBetAmount`, and requires `sum(amounts) <= totalBetAmount`. The CLI parses `BET:CHIPS` counts and derives the purchased chip count from their sum unless `--chips` supplies it explicitly. It computes the chip's wei value with integer division of the total wager by purchased chips and multiplies by each component count. A higher explicit purchased count warns and continues; a lower count fails before any transaction. Division dust and unallocated chips stay in the wager without covering another outcome. A sole component equal to the total is reduced by one wei to satisfy the strict per-component limit. Plain lists assign one chip per entry and retain equal splitting.

`getVRFFee()` exists as the repo's fee path, but the contract-side getter forwards the live RNG fee rather than exposing a hardcoded constant.

## Fee Notes

- Roulette adds one live `getVRFFee()` per opening tx; the getter forwards current RNG pricing rather than a hardcoded constant.
- The published payout multipliers already include the house edge, so this note does not model a second explicit stake-proportional platform fee on top.
- The one-leg `-1 wei` encoding rule is a contract constraint, not a hidden fee.

## Verified Settlement Surface

The contract settles against a `38`-pocket wheel where `0` and `00` are green. Important verified consequences:

- outside bets only win on `1..36`
- `0` and `00` do not satisfy color, parity, dozen, or half bets
- duplicate bet entries revert
- each encoded leg must be positive

`getGameInfo(gameId)` returns:

```text
(
  address player,
  uint256 betAmount,
  uint256 totalPayout,
  bool hasEnded,
  uint8 chosenNumber,
  uint8[] gameNumbers,
  uint256[] betsPerNumbers,
  uint256 timestamp
)
```

That surface is what the repo uses to reconstruct roulette outcomes and history.

## Verified Payout Constants

| Bet class | Multiplier | Verified constant |
|-----------|------------|-------------------|
| Single Number | `36.9x` | `number_payout = 369_000 / 10_000` |
| Red / Black | `2.05x` | `color_payout = 20_500 / 10_000` |
| Even / Odd | `2.05x` | `even_odd_payout = 20_500 / 10_000` |
| Halves | `2.05x` | `half_payout = 20_500 / 10_000` |
| Thirds / Dozens | `3.075x` | `third_payout = 30_750 / 10_000` |
| Columns | `3.075x` | `third_payout = 30_750 / 10_000` |

## Exact RTP

For fully allocated stakes before integer rounding, every supported bet class resolves on the same `38`-pocket wheel and the multipliers above already include the house edge; the class-level RTP is the same across the verified supported surface:

| Verified bet class | Exact RTP | Basis |
|--------------------|-----------|-------|
| Single Number | `97.11%` | Exact weighted sum on the 38-pocket wheel |
| Red / Black | `97.11%` | Exact weighted sum on the 38-pocket wheel |
| Even / Odd | `97.11%` | Exact weighted sum on the 38-pocket wheel |
| Halves | `97.11%` | Exact weighted sum on the 38-pocket wheel |
| Thirds / Dozens | `97.11%` | Exact weighted sum on the 38-pocket wheel |
| Columns | `97.11%` | Exact weighted sum on the 38-pocket wheel |

Wager-level RTP additionally accounts for unallocated amounts and per-component integer payout rounding. Custom allocations are enumerated over all 38 pockets by the shared allocation/payout helpers.

Operationally useful consequence:

- `RED,BLACK` is still a hedge bet, but it only loses to `0` and `00`; its effective top line is therefore a low-volatility `1.025x` session outcome on non-green pockets, not a true arbitrage

## Transparency Snapshot

- House Profit: `192,637 APE`
- Running RTP: `97.05%`
- Total Wagered: `6,529,689 APE`
- Total Games Played: `90,386`

## Promotion Outcome

Roulette qualifies for `ABI verified` in this repo because:

- the contract address used by the CLI is fixed and documented
- the encoded bet tuple, numeric bet mapping, and fee path are documented and implemented consistently
- the repo's wager-splitting edge case for one-leg bets is contract-backed rather than guessed
- the exact RTP references in `lib/rtp.js` match the verified 38-pocket payout surface
