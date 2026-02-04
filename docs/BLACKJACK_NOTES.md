# Blackjack Contract Integration Notes

> Complete working document for blackjack CLI integration.
> Source: Mark's contract + BLACKJACK_CONTRACT.md

---

## Contract Info

- **Contract:** `0x03AC9d823cCc27df9F0981FD3975Ca6F13067Ed7`
- **Slug:** blackjack
- **VRF Fee:** `vrfFee()` — simple view function

---

## Starting a Game

**Function:** `playGame(address player, bytes gameData)` on game contract

**gameData encoding:**
```javascript
abi.encode(
  uint256[] sideBets,    // [0n, 0n] for no side bets
  uint256 gameId,        // client-generated randomUint256()
  address ref,           // referral address or zero
  bytes32 userRandomWord // client-generated randomBytes32()
)
```

**Value:** `msg.value` = bet amount + vrfFee

### Game Start Flow
1. Call `playGame()` with bet + vrfFee
2. VRF callback deals first 3 cards (2 to player, 1 to dealer)
3. **If player has natural blackjack:**
   - Dealer draws second card in same block
   - Game resolves immediately (one-step win/push)
   - `gameState = HAND_COMPLETE`
4. **If player doesn't have blackjack:**
   - `gameState = PLAYER_ACTION`
   - Player has 2 cards, dealer has 1
   - `awaitingRandomNumber = false` → player's turn

### Polling Strategy
```javascript
// After playGame tx confirms:
while (true) {
  const state = await getGameInfo(gameId);
  if (!state.awaitingRandomNumber) {
    // Our turn (or game complete)
    break;
  }
  await sleep(2000); // Poll every 2s
}
```

---

## State Reading

### `getGameInfo(uint256 gameId)` → GameInfoReturnType

```solidity
struct GameInfoReturnType {
    address user;              // player address
    GameState gameState;       // current game state
    uint8 activeHandIndex;     // 0 or 1 (which hand is active)
    Hand[2] playerHands;       // player's hands (2nd used if split)
    Hand dealerHand;           // dealer's hand
    SideBet[2] sideBets;       // side bets (handle later)
    SideBet insuranceBet;      // insurance bet info
    bool awaitingRandomNumber; // TRUE = waiting for VRF, FALSE = our turn
    uint256 initialBet;        // original bet
    uint256 totalBet;          // total wagered (including splits/doubles)
    uint256 totalPayout;       // total won (when complete)
    bool surrendered;          // did player surrender?
    uint256 timestamp;         // game start time
}
```

### Key Flag: `awaitingRandomNumber`
- **true** → VRF pending, wait/poll
- **false** → Our turn to act (if game not complete)

---

## Enums

### GameState
| Value | Name | Description |
|-------|------|-------------|
| 0 | READY | Waiting for initial deal |
| 1 | PLAYER_ACTION | Main hand active |
| 2 | SPLIT_ACTION_1 | Acting on first split hand |
| 3 | SPLIT_ACTION_2 | Acting on second split hand |
| 4 | DEALER_TURN | Dealer drawing |
| 5 | HAND_COMPLETE | Game over, payouts done |

### HandStatus
| Value | Name | Description |
|-------|------|-------------|
| 0 | ACTIVE | Hand in play |
| 1 | STOOD | Player stood |
| 2 | BUSTED | Over 21 |
| 3 | BLACKJACK | Natural 21 |

### RNGStatus
| Value | Name |
|-------|------|
| 0 | INITIAL_DEAL |
| 1 | DOUBLE_DOWN |
| 2 | SPLIT |
| 3 | HIT |
| 4 | DEALER |
| 5 | NONE |

---

## Structs

### Card
```solidity
struct Card {
    uint8 value;    // 2-9, 10 (T/J/Q/K), 11 (Ace)
    uint8 rawCard;  // Original card encoding (for suit/rank display)
}
```

### Card Encoding (rawCard → Display)
```javascript
// rawCard is 0-51 (standard 52-card deck)
const rank = rawCard % 13;      // 0=Ace, 1=2, ..., 9=10, 10=J, 11=Q, 12=K
const suit = Math.floor(rawCard / 13);  // 0=♠, 1=♥, 2=♦, 3=♣

// Rank display mapping
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

// Card value logic (from contract):
// cardNumber = (rawCard % 13) + 1  → 1-13 where 1=Ace, 13=King
// value: Ace=11, 10/J/Q/K=10, 2-9=face value
```

### Hand Calculation (from contract)
```javascript
function calculateHand(cards) {
  let value = 0;
  let aceCount = 0;
  
  for (const card of cards) {
    if (card.value === 11) aceCount++;
    value += card.value;
  }
  
  // Adjust aces from 11 to 1 if over 21
  while (value > 21 && aceCount > 0) {
    value -= 10;
    aceCount--;
  }
  
  return {
    value,
    isSoft: aceCount > 0,
    busted: value > 21
  };
}
```

### Hand
```solidity
struct Hand {
    Card[] cards;       // Cards in hand
    uint8 handValue;    // Calculated total
    bool isSoft;        // Has Ace counted as 11
    HandStatus status;  // ACTIVE/STOOD/BUSTED/BLACKJACK
    uint256 bet;        // Wager on this hand
}
```

### SideBet
```solidity
struct SideBet {
    uint256 bet;
    uint256 amountForHouse;
    uint256 payout;
}
```

---

## Action Functions

### `playerHit(uint256 gameId)` — payable
- **Value:** vrfFee
- **When:** Hand is ACTIVE

### `playerStand(uint256 gameId)` — payable
- **When:** Hand is ACTIVE
- **Value Logic (from contract):**
```javascript
if (gameState === GameState.SPLIT_ACTION_1) {
  // After stand, moves to SPLIT_ACTION_2
  if (playerHands[1].status !== HandStatus.ACTIVE) {
    // Hand 2 not playable (split Aces, bust, or 21)
    // Need VRF to start dealer turn
    value = vrfFee;
  } else {
    // Hand 2 is playable, player continues there
    value = 0;  // NO VRF needed
  }
} else {
  // Normal stand (PLAYER_ACTION or SPLIT_ACTION_2)
  // Need VRF for dealer turn
  value = vrfFee;
}
```

### `playerDoubleDown(uint256 gameId)` — payable
- **Value:** current hand bet + vrfFee
- **When:** Active hand has exactly 2 cards

### `playerSplit(uint256 gameId)` — payable
- **Value:** current hand bet + vrfFee
- **When:** First 2 cards have same value (including all 10-value cards)
- **Effect:** Creates two hands, adds 1 card to each
- **Special:** Split Aces → 1 card each, then auto-dealer turn

### `playerInsurance(uint256 gameId)` — payable
- **Value:** 1/2 of initial bet
- **When:** Dealer's first card is Ace AND first action of game
- **Mutex:** Cannot do if surrendered
- **Payout:** 3x insurance wager if dealer has natural BJ

### `playerSurrender(uint256 gameId)` — payable
- **Value:** Always 0 (payable but no value needed)
- **When:** First action only
- **Mutex:** Cannot do if took insurance
- **Effect:** Ends game immediately, returns 50% of bet

---

## VRF Optimizations

### Auto-Dealer Triggers
When player **busts** or **hits 21** (BJ or 3+ cards):
- Dealer turn starts automatically (no stand tx needed)
- OR switches to second split hand if applicable

### Bust Optimization
When player busts (one or both hands):
- Dealer only draws 1 extra card (for insurance check)
- Saves RNG gas since outcome is determined

---

## Action Availability Logic

### Insurance Requirements (from contract require statements)
```javascript
canInsure = 
  insuranceBet.bet === 0n &&
  awaitingRandomNumber === false &&
  gameState === GameState.PLAYER_ACTION &&
  playerHands[0].status === HandStatus.ACTIVE &&
  playerHands[0].cards.length === 2 &&
  dealerHand.cards.length === 1 &&
  dealerHand.cards[0].value === 11 &&  // Dealer shows Ace
  surrendered === false;
// Cost: initialBet / 2
```

### Surrender Requirements (inferred - similar to insurance)
```javascript
canSurrender = 
  insuranceBet.bet === 0n &&           // No insurance taken
  awaitingRandomNumber === false &&
  gameState === GameState.PLAYER_ACTION &&
  playerHands[0].status === HandStatus.ACTIVE &&
  playerHands[0].cards.length === 2 &&
  dealerHand.cards.length === 1 &&
  surrendered === false;
// Note: Mutually exclusive with insurance
```

### Standard Actions
```javascript
canHit = 
  gameState in [PLAYER_ACTION, SPLIT_ACTION_1, SPLIT_ACTION_2] &&
  playerHands[activeHandIndex].status === HandStatus.ACTIVE &&
  awaitingRandomNumber === false;

canStand = canHit;  // Same conditions

canDouble = 
  canHit &&
  playerHands[activeHandIndex].cards.length === 2;
// Cost: current hand bet + vrfFee

canSplit = 
  gameState === GameState.PLAYER_ACTION &&  // Not already split
  playerHands[0].cards.length === 2 &&
  playerHands[0].cards[0].value === playerHands[0].cards[1].value &&
  awaitingRandomNumber === false;
// Cost: current hand bet + vrfFee
```

---

## Questions for Mark — ALL ANSWERED ✅

1. ✅ **rawCard encoding** — `rank = rawCard % 13`, `suit = floor(rawCard / 13)`
2. ✅ **Game start flow** — playGame deals 3 cards, if player BJ → instant resolve, else PLAYER_ACTION
3. ✅ **READY state** — between playGame and VRF callback (transient)
4. ✅ **First action detection** — check `cards.length === 2`, `dealerHand.cards.length === 1`, `insuranceBet.bet === 0`
5. ✅ **Stand VRF logic** — if SPLIT_ACTION_1 && playerHands[1].status === ACTIVE → value=0, else vrfFee
6. ✅ **Surrender value** — always 0 (payable but no value)

---

## Implementation Plan

### Phase 1: Constants & ABI ✅
- [x] Contract address
- [ ] Build ABI for all functions
- [ ] Add to constants.js

### Phase 2: State Parsing
- [ ] Parse GameInfoReturnType
- [ ] Map enums to JS constants
- [ ] Card display from rawCard

### Phase 3: Display
- [ ] Render game state
- [ ] Show available actions
- [ ] Handle awaitingRandomNumber (spinner?)

### Phase 4: Start Game
- [ ] Encode gameData
- [ ] Track in active_games.json
- [ ] Poll for initial deal

### Phase 5: Actions
- [ ] Hit
- [ ] Stand (with VRF logic)
- [ ] Double
- [ ] Split
- [ ] Insurance
- [ ] Surrender

### Phase 6: Game Loop
- [ ] Interactive REPL
- [ ] JSON/flag mode for agents
- [ ] Resume unfinished games

---

*Last updated: 2026-02-04*
