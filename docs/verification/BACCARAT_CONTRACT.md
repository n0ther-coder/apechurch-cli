# Baccarat Contract Verification Notes

> Summary: Contract-backed tuple layout, draw-tree rules, and exact RTP notes used to keep Baccarat marked `ABI verified`.

## Source Basis

- Contract used by the CLI: `0xB08C669dc0419151bA4e4920E80128802dB5497b`
- Explorer address page: `https://apescan.io/address/0xB08C669dc0419151bA4e4920E80128802dB5497b#code`
- Local write-path reference: `lib/games/baccarat.js`
- Local RTP/reference model: `lib/rtp.js`

This note consolidates the contract-facing behavior that was previously embedded inline in `docs/GAMES_REFERENCE.md`.

## Contract Identity

- Game name in the repo: `Baccarat`
- Supported contract-side betting lanes:
  - one main side: `PLAYER` or `BANKER`
  - optional `TIE`
- The CLI does not support `PLAYER` and `BANKER` together because the contract does not support that combination

## Verified Write Path

The CLI encodes `gameData` as:

```text
(uint256 gameId, uint256 playerBankerBet, uint256 tieBet, bool isBanker, address ref, bytes32 userRandomWord)
```

Verified behavior:

- `play(...)` requires `msg.value >= getVRFFee()`
- the post-fee buy-in must exactly equal `playerBankerBet + tieBet`
- a pure `PLAYER` or `BANKER` bet is represented by `tieBet = 0`
- a pure `TIE` bet is represented by `playerBankerBet = 0`
- combined bets are real contract behavior, not a CLI convenience layer

The CLI accepts numbered weights and resolves the encoded legs in wei so their
sum equals the post-fee wager. When the amount is omitted, the weights sum to
the implicit amount in APE. The CLI rejects selected legs below 1 wei.

Baccarat requires a positive post-fee total. Its `_registerBet` call also
passes the total and `GAME_ID()` to the governance manager's
`userInfoTracker()`. The tracker enforces
`getMinBetAmountForGame(gameId)` on the total. At block 54,428,687, Baccarat
game ID 6 had a tracker minimum of 0.5 APE. Read-only simulations at that
block rejected 0.5 APE minus 1 wei and accepted 0.5 APE with either lane
as small as 1 wei.

Use `apechurch-cli game baccarat --limits --json` to query the current value.
It returns `minWagerWei`, `minWagerApe`, the contract's positive-total
floor `contractMinWagerWei`, and the CLI's `minSelectedLegWei` as strings.
The play handler reads the live minimum before transaction submission.

## Verified Draw and Settlement Surface

The verified contract requests exactly `6` VRF words and maps each to a rank in `1..13` via:

```text
(randomWord % 13) + 1
```

Settlement then applies the contract's third-card rules in `determineWinner(...)`.

Verified read behavior:

- `getGameInfo(gameId)` returns `playerBankerBet`, `tieBet`, `payout`, `user`, `betOnBanker`, `playerCards`, `bankerCards`, `hasEnded`, and `timestamp`
- `getVRFFee()` is the fee path used by the repo
- the contract stores platform-side commission constants as:
  - `playerBankerFee = 100`
  - `tieFee = 300`
  - denominator `10_000`

Important consequence:

- on a tie, the contract refunds the `PLAYER` or `BANKER` lane in full; it is not scored as a total loss on the main lane

## Fee Notes

- The only extra tx amount the CLI adds is the live static `getVRFFee()`.
- The encoded `playerBankerBet + tieBet` must match the post-VRF buy-in, so the VRF fee sits outside the wagered lanes.
- `BANKER`'s reduced `1.95x` payout is the player-facing commission surface; it is not a second standalone surcharge sent on top of the wager.

## Verified Payout Constants

| Bet class | Multiplier | Verified constant |
|-----------|------------|-------------------|
| PLAYER | `2.0x` | `PLAYER_PAYOUT = 200 / 100` |
| BANKER | `1.95x` | `BANKER_PAYOUT = 195 / 100` |
| TIE | `9.0x` | `TIE_PAYOUT = 900 / 100` |

## Exact RTP by Bet Class

The exact probabilities below come from exhaustively enumerating all `13^6 = 4,826,809` equally likely rank tuples implied by the verified draw mapping and applying the contract-backed draw logic.

| Verified bet class | Exact RTP | Basis |
|--------------------|-----------|-------|
| PLAYER | `98.77%` | Exact weighted sum over the verified draw tree, including push-on-tie refunds |
| BANKER | `98.94%` | Exact weighted sum over the verified draw tree, including push-on-tie refunds |
| TIE | `85.88%` | Exact weighted sum over the verified draw tree |

For combined bets, the exact RTP is the wager-weighted average of the chosen main-lane RTP and the `TIE` RTP. Example:

```text
(140 x 98.9360009895% + 10 x 85.8830129802%) / 150 = 98.07%
```

## Transparency Snapshot

- House Profit: `9,888 APE`
- Running RTP: `98.12%`
- Total Wagered: `525,991 APE`
- Total Games Played: `13,183`

## Promotion Outcome

Baccarat qualifies for `ABI verified` in this repo because:

- the encoded tuple and bet-splitting rules are documented and enforced locally
- the exact read surface used by the CLI matches the contract-backed state shape
- the repo's RTP references use the verified payout constants and the actual six-rank draw tree rather than only transparency rounding
