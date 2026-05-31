# Blackjack Contract Verification Notes

> Summary: Public ABI, runtime evidence, and maintainer-facing integration notes used to promote Blackjack to `ABI verified` on 2026-04-09.

## Public Source Trail

- Official Ape Church game page: `https://ape.church/games/blackjack`
- Official public route bundle used for this note, fetched on **2026-04-09**:
  - `https://ape.church/_next/static/chunks/app/games/blackjack/page-213bdee3d58ec65d.js`
- Live ApeScan contract page:
  - `https://apescan.io/address/0x03AC9d823cCc27df9F0981FD3975Ca6F13067Ed7`
- Supplemental blackjack rules / outcome-accounting reference used for the **2026-05-31** maintainer note:
  - Cross-check references: `https://wizardofodds.com/games/blackjack/basics/`, `https://wizardofodds.com/games/blackjack/calculator/`, `https://wizardofodds.com/games/blackjack/rule-variations/`

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

## Fee Notes

- The true fee surface here is the live `vrfFee()` charged on start and on most resolving actions.
- `double`, `split`, and `insurance` send extra stake in addition to any VRF amount; those stake increases are not protocol fees.
- One split-hand `stand` transition can be free (`0`) when simply handing control to the second split hand, so action cost is state-dependent rather than proportional to the opening bet.

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

## Outcome Accounting Notes

Use `A` for the opening main bet and express rows below as **net P&L relative to `A`**, not gross amount returned. This matches the local solver's `evUnits` convention and avoids confusing stake return with profit:

| Result | Gross returned | Net P&L |
|--------|---------------:|--------:|
| Normal loss | `0` | `-A` |
| Normal push | `A` | `0` |
| Normal win | `2A` | `+A` |
| Natural blackjack | `2.5A` | `+1.5A` |
| Surrender | `0.5A` | `-0.5A` |
| Double loss | `0` | `-2A` |
| Double push | `2A` | `0` |
| Double win | `4A` | `+2A` |

Generic blackjack references often discuss split / re-split up to four hands, but the verified Ape Church rule surface is `maxHands: 2`. The repo therefore models no re-split. Once split, each final hand contributes one of:

```text
-2A  doubled loss
-1A  normal loss
 0    push
+1A  normal win
+2A  doubled win
```

With exactly two split hands, the split main-game range is therefore the integer interval:

```text
-4A, -3A, -2A, -1A, 0, +1A, +2A, +3A, +4A
```

An `Ace + 10` after split is treated as a normal `21`, not a natural blackjack, so it pays as a normal win rather than `3:2`. This matches the public blackjack rule reference and the local solver state: split hands are built with `isNaturalBlackjack: false`.

Insurance is a separate side wager offered when the dealer shows an Ace. For a generic insurance stake `I` where `0 <= I <= A/2`:

```text
dealer blackjack:     main-hand P&L + 2I
dealer no blackjack:  main-hand P&L - I
```

At full insurance (`I = A/2`), a dealer blackjack against a non-blackjack player hand offsets the main loss to `0`; a player blackjack plus dealer blackjack produces `+A` net. If the dealer does not have blackjack, every continuing main-hand outcome is reduced by `0.5A`.

These accounting notes describe mechanically possible outcomes only. They are not a compact full-game probability distribution; probabilities still depend on the exact live deck state, available actions, and policy.

## Auto-Best Solver State-Cap Notes

`blackjack --auto best` and `blackjack --auto max` use `lib/stateful/blackjack/solver.js`, an exact live-state EV search over the remaining single deck. The CLI runs that search through a worker wrapper so timeout / memory failures do not block the main gameplay process. Its EV is expressed in units of the opening bet and intentionally excludes chain / VRF fees; fees gate action affordability elsewhere.

`--solver-max-states` caps recursive player-state memoization. `--solver-timeout-ms` caps worker wall-clock latency. `--auto best` defaults to `50000` states and `5000` ms. `--auto max` is the same exact solver with larger defaults: `150000` states and `30000` ms. These are operational guards, not contract rules and not mathematically derived precision parameters. The state cap was introduced after split-heavy spots such as `3,3` vs dealer `3` exhausted Node heap / CPU. When either guard trips, the CLI terminates or exits the worker path and falls back to `simple` basic strategy for that decision.

Increasing the cap does not make an incomplete search "more accurate"; it only gives the exact solver more time to finish. If the solver still exceeds the cap, the decision is exactly the simple-strategy fallback after spending more CPU. The complexity is driven by:

- `hit` / `double` branching over up to ten card ranks in the remaining deck
- `split` branching over first-card and second-card draw combinations before solving both hands
- dealer-resolution distributions memoized under many remaining-deck compositions

Local benchmark notes from **2026-05-31** on this repo and workstation:

| Spot | Cap | Result | Approx. latency |
|------|----:|--------|----------------:|
| hard `11` vs `6` | `100` | exact decision completed | `38 ms` |
| hard `16` vs `A` | `100` | exact decision completed | `11 ms` |
| `8,8` vs `6` | `50000` | budget exceeded -> simple fallback | `7.3 s` |
| `8,8` vs `6` | `100000` | budget exceeded -> simple fallback | `14.9 s` |
| `8,8` vs `6` | `150000` | budget exceeded -> simple fallback | `26.0 s` |
| `3,3` vs `3` | `50000` | budget exceeded -> simple fallback | `14.9 s` |

A separate enumeration of the `450` two-card, non-pair initial states completed under the default `50000` cap; `49` choices differed from the simple strategy and none were worse than simple under the same gross EV model. Pair / split-heavy states are the practical failure surface.

Operational guidance:

- keep `50000` for loop / bot runs where latency control matters
- `75000` to `100000` is a reasonable manual troubleshooting range when a valuable hand hits the fallback warning
- use `--auto max` when you explicitly want the larger `150000` / `30000` budget
- `150000+` can produce long worker runtimes and should not be used in unattended loops without a tight `--solver-timeout-ms`

## On-Chain H17 Evidence

The `dealerHitsSoft17: true` bundle rule is also observable on-chain. The following recent completed games were read through `getGameInfo(gameId)` on the live Blackjack contract. In each case the dealer reached `6 + A = soft 17` and then drew another card. Use [ApeScan readContract](https://apescan.io/address/0x03AC9d823cCc27df9F0981FD3975Ca6F13067Ed7#readContract) with the listed game id to reproduce the state.

| Game ID | Completed At (CEST) | Dealer Cards | Evidence |
|---------|---------------------|--------------|----------|
| [99510688323277774808189985470574577974425351704928502458537662926535820065335](https://apescan.io/address/0x03AC9d823cCc27df9F0981FD3975Ca6F13067Ed7#readContract) | `2026-05-12 16:16:24` | `6s, As, 3d` | `6 + A` soft 17, then hit `3` for soft 20 |
| [77812801484122263968586016604514782848730548159477039383535570773428865502168](https://apescan.io/address/0x03AC9d823cCc27df9F0981FD3975Ca6F13067Ed7#readContract) | `2026-05-12 05:56:56` | `6c, Ac, Ad` | `6 + A` soft 17, then hit `A` for soft 18 |
| [3684004821532526616751431729648887116381896381839973536604235964900052479437](https://apescan.io/address/0x03AC9d823cCc27df9F0981FD3975Ca6F13067Ed7#readContract) | `2026-05-12 05:55:31` | `6d, Ac, 3s` | `6 + A` soft 17, then hit `3` for soft 20 |

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
