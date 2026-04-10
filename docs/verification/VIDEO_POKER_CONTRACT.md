# Video Poker Contract Verification Notes

> Summary: Stateful ABI surface, redraw flow, paytable, and jackpot-aware RTP notes used to keep Video Poker marked `ABI verified`.

## Source Basis

- Contract used by the CLI: `0x4f7D016704bC9A1d373E512e10CF86A0E7015D1D`
- Explorer address page: `https://apescan.io/address/0x4f7D016704bC9A1d373E512e10CF86A0E7015D1D#code`
- Local ABI/state reference: `lib/stateful/video-poker/constants.js`
- Local action flow: `lib/stateful/video-poker/actions.js`
- Local solver/RTP model: `lib/stateful/video-poker/strategy.js`, `lib/rtp.js`

This note consolidates the contract-facing behavior that was previously embedded inline in `docs/GAMES_REFERENCE.md`.

## Contract Identity

- Display name in the repo: `Video Poker`
- Ape Church naming: `Gimboz Poker`
- Aliases: `vp`, `gimboz-poker`
- Game family: stateful Jacks or Better with one optional redraw

## Verified Write and Action Surface

The CLI starts a game by encoding:

```text
(uint8 betAmountIndex, uint256 gameId, address ref, bytes32 userRandomWord)
```

and calling:

```text
play(address player, bytes gameData)
```

Verified write behavior:

- `betAmountIndex` selects one of the fixed bet denominations
- total start value is `betAmount + vrfFeeInitial()`
- the game is tracked locally as a stateful active session after submission

Redraws use:

```text
playerRedraw(uint256 gameId, bool[] cardsToRedraw)
```

with:

- `value = vrfFeeRedraw()` if at least one card is redrawn
- `value = 0` if the player stands pat and redraws nothing

## Verified Read Surface

The contract-backed ABI used by the repo exposes:

- `vrfFeeInitial()`
- `vrfFeeRedraw()`
- `getBetAmounts()`
- `getGameInfo(gameId)`
- `jackpotTotal()`
- `determinePayout(hand, betAmount)`
- `determinePayoutFromRawNumbers(rawNumbers, betAmount)`

`getGameInfo(gameId)` returns:

```text
(
  address player,
  uint256 betAmount,
  uint256 totalPayout,
  Card[5] initialCards,
  Card[5] finalCards,
  uint8 gameState,
  uint8 handStatus,
  bool awaitingRNG,
  uint256 timestamp
)
```

Documented state enum values used by the repo:

| Value | Name |
|-------|------|
| `0` | `INITIAL_DEAL` |
| `1` | `PLAYER_DECISION` |
| `2` | `AWAITING_REDRAW` |
| `3` | `HAND_COMPLETE` |

## Verified Bet Surface and Jackpot Rule

The verified on-chain bet denominations from `getBetAmounts()` are:

- `1`
- `5`
- `10`
- `25`
- `50`
- `100 APE`

Important consequences:

- loop mode rounds strategy output to the nearest affordable valid denomination
- `100 APE` is the maximum fixed bet
- only the `100 APE` denomination is jackpot-eligible
- a Royal Flush always pays the visible `250x` base paytable, and at `100 APE` it also wins the full current `jackpotTotal` pool

## Verified Final-Hand Paytable

| Final Hand | Payout | Probability |
|------------|--------|-------------|
| Royal Flush | `250x` | `0.0025%` |
| Straight Flush | `50x` | `0.0108%` |
| Four of a Kind | `25x` | `0.2363%` |
| Full House | `9x` | `1.1512%` |
| Flush | `6x` | `1.0995%` |
| Straight | `4x` | `1.1214%` |
| Three of a Kind | `3x` | `7.4449%` |
| Two Pair | `2x` | `12.9279%` |
| Jacks or Better | `1x` | `21.4585%` |

The repo's `--auto best` path is an exact EV solver over all `32` hold patterns and every redraw completion from the remaining `47` cards. Jackpot uplift is only included for the `100 APE` bet.

## Exact RTP

| Mode | Exact RTP | Basis |
|------|-----------|-------|
| Base paytable at any fixed bet (`1/5/10/25/50/100 APE`) | `98.1649%` | Exact weighted sum over the verified on-chain paytable and final-hand odds |
| `100 APE` bet with known jackpot pool | `98.1649% + jackpot_ape / 40,000` | Exact base RTP plus the max-bet Royal Flush jackpot uplift from `jackpotTotal` |

## Transparency Snapshot

- House Profit: `29,557 APE`
- Running RTP: `89.53%`
- Total Wagered: `282,230 APE`
- Total Games Played: `12,866`

## Promotion Outcome

Video Poker qualifies for `ABI verified` in this repo because:

- the local stateful ABI covers the real start-game, redraw, read-state, paytable, and jackpot getters used by the CLI
- the exact RTP references are derived from the verified paytable and jackpot rule rather than only the public transparency headline
- the docs now preserve the redraw-fee edge case and the max-bet jackpot dependency explicitly
