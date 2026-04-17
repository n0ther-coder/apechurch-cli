# Hi-Lo Nebula Contract Verification Notes

> Summary: Stateful ABI surface, rank-only draw model, per-rank paytable, jackpot getter, and cash-out semantics used to keep Hi-Lo Nebula marked `ABI verified`.

## Source Basis

- Contract used by the CLI: `0xa67d5CD51028cAaa367eEFcE90a5eA0b71c6cBE2`
- Explorer address page: `https://apescan.io/address/0xa67d5CD51028cAaa367eEFcE90a5eA0b71c6cBE2#code`
- Public game page: `https://ape.church/games/hi-lo-nebula`
- Local ABI/state reference: `lib/stateful/hi-lo-nebula/constants.js`, `lib/stateful/hi-lo-nebula/state.js`
- Local action flow: `lib/stateful/hi-lo-nebula/actions.js`
- Local display / auto-play flow: `lib/stateful/hi-lo-nebula/display.js`, `lib/stateful/hi-lo-nebula/strategy.js`

Example transactions checked during verification:

- `play(...)`: `0xa283eb7f46022bdce85191eb2d650437b97e6df2c2175842a68aac8ae245d5cc`
- `makeGuess(...)`: `0x6afe72387550341d7bfebcf335d57dcc48bc6498992158cb1b464999b38b1bd9`
- `makeGuess(...)`: `0x33bb0c015fdef3c7749b828ba5d748d3e70a3d0fb8766a46694450ea4e4c7b44` (final failing guess)

## Contract Identity

- Display name in the repo: `Hi-Lo Nebula`
- Game family: stateful sequential card-prediction / cash-out streak game
- Aliases in the CLI: `hi-lo`, `hilo-nebula`, `nebula`

## Verified Write Surface

The CLI starts a game by encoding:

```text
(uint256 gameId, address ref, bytes32 userRandomWord)
```

and calling:

```text
play(address player, bytes gameData)
```

Verified start behavior:

- the initial wager is `msg.value - getVRFFee()`
- the start transaction must include the live `getVRFFee()` value
- the repo generates and tracks the random `gameId` locally as the stateful active session key

Verified action calls:

```text
makeGuess(uint256 gameId, uint8 direction, bytes32 userRandomWord)
cashOut(uint256 gameId)
```

Action rules confirmed from the verified source:

- every `makeGuess(...)` call must pay the same live `getVRFFee()`
- `cashOut(...)` is non-payable
- guess enum ordinals are `0=None`, `1=Lower`, `2=Higher`, `3=Push/Same`
- `Lower` is disallowed on `2`
- `Higher` is disallowed on `A`

## Verified Read Surface

The contract-backed ABI used by the repo exposes:

- `getVRFFee()`
- `platformFee()`
- `jackpotFee()`
- `roundsForJackpot()`
- `jackpotTotal()`
- `getJackpotAmount(betAmount)`
- `getGameInfo(gameId)`

`getGameInfo(gameId)` returns:

```text
(
  uint256 initialBetAmount,
  uint256 payout,
  address user,
  bool hasEnded,
  uint256 timestamp,
  RoundInfo[] rounds
)
```

with:

```text
RoundInfo(
  uint8 startingCard,
  uint8 nextCard,
  uint8 DIRECTION,
  uint256 betAmount,
  uint256 payout
)
```

The repo's local parser depends on these facts:

- `startingCard == 0` on the very first unresolved round before the initial reveal
- a pending guess has `startingCard > 0`, `DIRECTION != None`, and `nextCard == 0`
- a resolved guess has `nextCard > 0`
- a cash-out game may still end with an unresolved placeholder round at the tail

## Verified Runtime Constants

Live getter snapshot taken on **2026-04-13**:

- `platformFee() = 250` basis points (`2.5%`)
- `jackpotFee() = 50` basis points (`0.5%`)
- combined protocol fee surface seen by the player-facing docs: `3.0%`
- `roundsForJackpot() = 15`
- `getVRFFee() = 0.093211589 APE`
- `jackpotTotal() = 2839.087826980625521051 APE`

The jackpot getter was also checked live on **2026-04-13**:

- `getJackpotAmount(1 APE) = 0.026822328547314793 APE`
- `getJackpotAmount(25 APE) = 0.670558213682869838 APE`
- `getJackpotAmount(44.6425 APE) = 1.19741580217350067 APE`

That confirms the repo can treat the current jackpot share as a live getter-backed value, not only a transparency screenshot field.

## Fee Notes

- Starting a run pays the live `getVRFFee()` once, and every `makeGuess(...)` call pays that same VRF fee again.
- `cashOut(...)` is non-payable, so closing a winning streak does not add another RNG fee.
- Live getters currently expose `platformFee() = 2.5%` and `jackpotFee() = 0.5%`, so the player-facing fee surface mixes per-action fixed VRF overhead with proportional protocol fees.

## Verified Draw Model

The verified source resolves the next card as:

```text
uint8((randomWords[0] % 13) + 2)
```

Consequences:

- the contract samples only **ranks**, not suits
- the rank support is `2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A`
- each new rank is uniform over `13` outcomes
- draws are **with replacement**
- there is no finite `52`-card deck and no deck-depletion effect

That point closes the main ambiguity that remained in the earlier repo notes and screenshots.

## Verified Paytable

The contract hard-codes the Higher / Lower table by current rank and uses a separate constant for `Same`:

- `PUSH_PAYOUT = 125_000` => `12.5x`

| Current Rank | Higher | Lower | Same |
|-------------|--------|-------|------|
| `2` | `1.0600x` | N/A | `12.5000x` |
| `3` | `1.1363x` | `12.5000x` | `12.5000x` |
| `4` | `1.2500x` | `6.2500x` | `12.5000x` |
| `5` | `1.3888x` | `4.1666x` | `12.5000x` |
| `6` | `1.5625x` | `3.1250x` | `12.5000x` |
| `7` | `1.7857x` | `2.5000x` | `12.5000x` |
| `8` | `2.0833x` | `2.0833x` | `12.5000x` |
| `9` | `2.5000x` | `1.7857x` | `12.5000x` |
| `10` | `3.1250x` | `1.5625x` | `12.5000x` |
| `J` | `4.1666x` | `1.3888x` | `12.5000x` |
| `Q` | `6.2500x` | `1.2500x` | `12.5000x` |
| `K` | `12.5000x` | `1.1363x` | `12.5000x` |
| `A` | N/A | `1.0600x` | `12.5000x` |

The gameplay cross-check also matches the gross-return interpretation: a `25 APE` bet on `9 -> LOWER` displayed `44.64 APE`, which matches `25 x 1.7857`.

## Verified Cash-Out And Jackpot Path

Important stateful behavior from the verified source:

- after each correct guess, the contract pushes a new placeholder round whose `startingCard` becomes the revealed `nextCard`
- `cashOut(gameId)` pays the previous winning round's `payout`
- a wrong guess ends the game with `payout = 0`
- the jackpot resolves automatically on the `15th` correct guess
- `getJackpotAmount(betAmount)` scales the jackpot share from the bet amount used for that jackpot step

This is why the repo now displays a live "current jackpot amount" derived from the current cash-out basis, not only the total pool headline.

## Promotion Outcome

Hi-Lo Nebula qualifies for `ABI verified` in this repo because:

- the local write path matches the verified contract for `play`, `makeGuess`, and `cashOut`
- the local read path matches the verified `getGameInfo` struct and live jackpot getters
- the exact rank-only draw model is now anchored to verified source code rather than gameplay inference
- the repo documents the hard-coded paytable and the live fee / jackpot getters explicitly
