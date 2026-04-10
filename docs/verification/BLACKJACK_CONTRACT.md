# Blackjack Contract Verification Notes

> Summary: Public ABI, runtime evidence, and maintainer-facing integration notes used to promote Blackjack to `ABI verified` on 2026-04-09.

## Public Source Trail

- Official Ape Church game page: `https://ape.church/games/blackjack`
- Official public route bundle used for this note, fetched on **2026-04-09**:
  - `https://ape.church/_next/static/chunks/app/games/blackjack/page-213bdee3d58ec65d.js`
- Live ApeScan contract page:
  - `https://apescan.io/address/0x03AC9d823cCc27df9F0981FD3975Ca6F13067Ed7`

As of **2026-04-09**, ApeScan still labels the contract source as `Unverified`. This promotion therefore relies on the public production ABI reference exposed by Ape Church's frontend bundle, cross-checked against the live ApeScan method surface and the repo's solver/runtime behavior, rather than explorer-published Solidity source.

## Contract Identity

- Game title on the public route: `Blackjack+`
- Slug: `blackjack`
- Contract: `0x03AC9d823cCc27df9F0981FD3975Ca6F13067Ed7`
- The route SSR payload and the leaderboard/history widgets on the same page all point to that exact address.

## Public ABI Reference

The public Blackjack route bundle exposes these exact signatures:

- `function vrfFee() external view returns (uint256)`
- `function getGameInfo(uint256 gameId) external view returns ((address user, uint8 gameState, uint8 activeHandIndex, ((uint8 value, uint8 rawCard)[] cards, uint8 handValue, bool isSoft, uint8 status, uint256 bet)[2] playerHands, ((uint8 value, uint8 rawCard)[] cards, uint8 handValue, bool isSoft, uint8 status, uint256 bet) dealerHand, (uint256 bet, uint256 amountForHouse, uint256 payout)[2] sideBets, (uint256 bet, uint256 amountForHouse, uint256 payout) insuranceBet, bool awaitingRandomNumber, uint256 initialBet, uint256 totalBet, uint256 totalPayout, bool surrendered, uint256 timestamp))`
- `function play(address player, bytes gameData) payable`
- `function playerHit(uint256 gameId) external payable`
- `function playerStand(uint256 gameId) external payable`
- `function playerDoubleDown(uint256 gameId) external payable`
- `function playerSplit(uint256 gameId) external payable`
- `function playerInsurance(uint256 gameId) external payable`
- `function playerSurrender(uint256 gameId) external payable`
- `function paused() external view returns (bool)`
- `function numUsedGameIDs() external view returns (uint256)`
- `function paginateUsedGameIDs(uint256 start, uint256 end) external view returns (uint256[] memory)`
- `function getEssentialGameInfo(uint256[] calldata gameIds) external view returns (address[] memory,uint256[] memory,uint256[] memory,uint256[] memory,bool[] memory)`
- `function maxPayout() external view returns (uint256)`

## Verified Write Path

The production frontend encodes `gameData` as:

```text
(uint256[] sideBets, uint256 gameId, address ref, bytes32 randomWord)
```

Observed public behavior from the official bundle:

- `sideBets` contains two lanes: player-side and dealer-side
- `play(...)` sends `mainBet + sideBet0 + sideBet1 + vrfFee()`
- `playerHit(...)` sends exactly `vrfFee()`
- `playerStand(...)` sends `0` only when moving from split hand 1 to an active second split hand; otherwise it sends `vrfFee()`
- `playerDoubleDown(...)` sends `initialBet + vrfFee()`
- `playerSplit(...)` sends `initialBet + vrfFee()`
- `playerInsurance(...)` sends `initialBet / 2`
- `playerSurrender(...)` sends `0`

Those value rules match the repo's implementation in `lib/stateful/blackjack/actions.js` and `lib/stateful/blackjack/state.js`.

## Verified Read Path

The same public ABI reference exposes:

- `gameState`, `activeHandIndex`, `playerHands`, `dealerHand`
- `sideBets`, `insuranceBet`, `awaitingRandomNumber`
- `initialBet`, `totalBet`, `totalPayout`, `surrendered`, `timestamp`

The public frontend also uses:

- `numUsedGameIDs()`
- `paginateUsedGameIDs(start, end)`
- `getEssentialGameInfo(gameIds)`

for replay and history surfaces. That matches the repo's expectation that Blackjack history can be reconstructed from contract-backed getters.

## Verified Start Flow

The local integration and the public ABI surface together imply this runtime sequence:

1. `play(address player, bytes gameData)` starts the session with `mainBet + sideBet0 + sideBet1 + vrfFee()`.
2. The initial VRF callback deals the player's first two cards and the dealer upcard.
3. If the player has a natural blackjack, the dealer resolves immediately and the game may complete in the same callback.
4. Otherwise the game moves into a player-action state with `awaitingRandomNumber = false`.

Operational consequence:

- polling should wait until `awaitingRandomNumber` becomes `false`; only then is it the player's turn again or the game is complete

## Verified State Layout

The public ABI reference exposes the full `GameInfoReturnType`, including:

- `gameState`
- `activeHandIndex`
- `playerHands[2]`
- `dealerHand`
- `sideBets[2]`
- `insuranceBet`
- `awaitingRandomNumber`
- `initialBet`
- `totalBet`
- `totalPayout`
- `surrendered`
- `timestamp`

The repo's maintainer-facing enum layout is:

### GameState

| Value | Name | Meaning |
|-------|------|---------|
| `0` | `READY` | Before the initial deal completes |
| `1` | `PLAYER_ACTION` | Main hand active |
| `2` | `SPLIT_ACTION_1` | First split hand active |
| `3` | `SPLIT_ACTION_2` | Second split hand active |
| `4` | `DEALER_TURN` | Dealer resolving |
| `5` | `HAND_COMPLETE` | Game settled |

### HandStatus

| Value | Name |
|-------|------|
| `0` | `ACTIVE` |
| `1` | `STOOD` |
| `2` | `BUSTED` |
| `3` | `BLACKJACK` |

### Card Display Mapping

The public frontend and the repo agree on:

```text
rank = rawCard % 13 + 1
suit = floor(rawCard / 13)
```

with suits ordered as `diamonds`, `hearts`, `clubs`, `spades`.

## Verified Action Preconditions

These action rules are part of the contract-facing behavior the repo relies on:

- `playerHit(gameId)`
  - requires an active player-action state
  - sends exactly `vrfFee()`
- `playerStand(gameId)`
  - sends `0` only when standing from split hand 1 into an already-active second split hand
  - otherwise sends `vrfFee()`
- `playerDoubleDown(gameId)`
  - requires exactly two cards on the active hand
  - sends `initialBet + vrfFee()`
- `playerSplit(gameId)`
  - is only available from the main hand
  - cannot be used after a prior split
  - requires two equal-value opening cards
  - sends `initialBet + vrfFee()`
- `playerInsurance(gameId)`
  - only on the first action
  - requires dealer upcard Ace
  - sends `initialBet / 2`
- `playerSurrender(gameId)`
  - only on the first action
  - is mutually exclusive with insurance
  - sends `0`

Important implementation detail:

- split checks card value, not face label, so `10`, `J`, `Q`, and `K` all count as splittable equals

## Verified Turn Optimizations

The repo's blackjack flow also relies on these contract-backed runtime shortcuts:

- if a player busts or reaches a terminal total that immediately hands control away, the contract can move directly into dealer resolution without an extra manual stand action
- after a bust, dealer draw behavior is minimized because the main outcome is already determined except for any insurance-related settlement path

## Verified Public Rules and Solver Assumptions

The public Blackjack bundle embeds the following rule config:

- `dealerHitsSoft17: true`
- `surrender: "early"`
- `doubleAfterSplitAllowed: true`
- `maxHands: 2`

It also publishes the public side-bet tables used by the site:

- Player side:
  - `Diamond Sevens` -> `500x`
  - `Perfect Pair` -> `20x`
  - `Natural Blackjack` -> `5x`
- Dealer side:
  - `Match Dealer` -> `2x`
  - `Dealer Ten` -> `2x`

And it maps raw cards as:

- `rank = rawCard % 13 + 1`
- `suit = floor(rawCard / 13)`
- suits ordered as `diamonds`, `hearts`, `clubs`, `spades`

That public rule surface matches the repo's local assumptions in:

- `lib/stateful/blackjack/solver.js`
- `lib/stateful/blackjack/strategy.js`
- `lib/stateful/blackjack/monte-carlo.js`
- `lib/stateful/blackjack/state.js`

## RTP and Modeling Notes

- The main-hand RTP in this repo remains a Monte Carlo estimate, not a closed-form proof
- The player-side and dealer-side RTP lanes are exact relative to the published public side-bet tables
- Promotion to `ABI verified` is justified because the public ABI, runtime tuple shapes, action costs, state layout, and solver-rule surface are now source-backed and reproducible from public production artifacts
