# Adding Games to Ape Church CLI

CLI 30 changes accounting and breaks compatibility with earlier scripts.
See the [migration comparison](MIGRATION_30.md) before updating integrations.

> Summary: Maintainer guide for adding or changing supported games. Points to the registry, CLI wiring, encoding patterns, validation steps, and release checklist updates tied to new game support.

This guide documents everything needed to add or modify games in the `apechurch-cli` CLI.

## Quick Reference

| File | What to Change |
|------|----------------|
| `registry.js` | Game definition (contract, type, config, and docs-facing metadata) |
| `bin/cli.js` | Game type handler (encoding logic, VRF fee, strategy) |

## Files Overview

### `registry.js` - Game Definitions

This is the source of truth for all games. Each game entry contains:

```js
{
  key: 'game-key',           // Unique identifier, used in CLI
  name: 'Display Name',      // Human-readable name
  aliases: ['gamealias'],    // Optional extra accepted lookup names; keep this list explicit
  slug: 'url-slug',          // URL path on ape.church
  type: 'plinko|slots|roulette|...', // Game type (determines encoding logic)
  description: 'Description for help text',
  contract: '0x...',         // Contract address on ApeChain
  abiVerified: false,        // Only set true after docs/ABI_VERIFICATION.md is complete
  config: { ... },           // Game-specific parameters (shown in help)
  vrf: { ... },              // VRF fee configuration
  // Game-specific extras (e.g., betTypes for roulette)
}
```

### `bin/cli.js` - Game Logic

Contains:
1. **Strategy configs** - `getStrategyConfig()` - default behavior per strategy
2. **Game selection** - `selectGameAndConfig()` - picks game + config for auto-play
3. **Play logic** - `playGame()` - encodes data + sends transaction
4. **CLI parsing** - `play` command - parses positional args per game type

---

## Required documentation for every new game

Provide all appropriate options for the game category, strict validation before
wallet access, exhaustive help and BNF, and examples for every supported mode.
Check `play`, `bet`, `game --paytable`, exact-stake/count options, loops, stop
conditions, retries, fees, settlement, pending recovery and wallet history.
Make unsupported category/mode combinations explicit errors.

Update these documents together, even when only a limitation can be established:

- `docs/ABI_VERIFICATION.md`
- `docs/analytics/<GAME>_ANALYTICS.md` and its folder index
- `docs/GAMES_COMPARE.md`
- `docs/GAMES_PAYOUTS_VS_ODDS.md`
- `docs/GAMES_REFERENCE.md`
- `docs/PAYTABLE_SOURCES.md`
- `docs/verification/<GAME>_CONTRACT.md`

Record public source links, snapshot blocks/dates, interface/fee evidence and
unresolved questions. Distinguish component awards, total gross payout caps,
exact probabilities, empirical running returns and net PnL after costs. Missing
exact data must be documented as unknown rather than filled with an estimate.
Use synthetic examples and relative repository links. Reconcile README,
SKILL, command reference, features and catalog counts with the registry.

## Step-by-Step: Adding a New Game

### 1. Add to Registry (`registry.js`)

Add a new entry to `GAME_REGISTRY`:

```js
{
  key: 'new-game',
  name: 'New Game',
  aliases: ['newgame'], // Optional; add only the aliases you want to support
  slug: 'new-game',
  type: 'new-type',  // or existing type if encoding matches
  description: 'Description here',
  contract: '0x...',
  abiVerified: false, // Promote only after completing the ABI verification checklist
  config: {
    // Parameters shown in CLI help
    param1: {
      min: 1,
      max: 10,
      default: 5,
      description: 'What this param does',
    },
    // Or for non-numeric params:
    bet: {
      description: 'What to bet on',
      examples: ['option1', 'option2'],
    },
  },
  vrf: {
    type: 'static',  // 'static' = getVRFFee(), 'plinko' = getVRFFee(gasLimit)
    // For plinko-style:
    // baseGas: 289000,
    // perUnitGas: 11000,
  },
}
```

Do not mark a new or changed game as ABI verified during the first implementation pass unless you also complete the full promotion checklist in [docs/ABI_VERIFICATION.md](./ABI_VERIFICATION.md).

### 2. Add Strategy Config (`bin/cli.js`)

In `getStrategyConfig()`, add defaults for your game type:

```js
const configs = {
  conservative: {
    // ... existing ...
    newType: { param1: [lowMin, lowMax] },  // Conservative ranges
  },
  balanced: {
    newType: { param1: [midMin, midMax] },
  },
  aggressive: {
    newType: { param1: [highMin, highMax] },
  },
  degen: {
    newType: { param1: [extremeMin, extremeMax] },
  },
};
```

### 3. Add Game Selection (`bin/cli.js`)

In `selectGameAndConfig()`, add handling for your type:

```js
if (gameEntry.type === 'new-type') {
  const [param1Min, param1Max] = strategyConfig.newType?.param1 || [1, 10];
  const param1 = randomIntInclusive(param1Min, param1Max);
  return { game: gameEntry.key, param1 };
}
```

### 4. Add Encoding Logic (`bin/cli.js`)

In `playGame()`, add a new `else if` block:

```js
} else if (gameEntry.type === 'new-type') {
  // Get VRF fee
  try {
    vrfFee = await publicClient.readContract({
      address: gameEntry.contract,
      abi: SLOTS_VRF_ABI,  // or appropriate ABI
      functionName: 'getVRFFee',
    });
  } catch (error) {
    throw new Error(`Failed to read VRF fee: ${sanitizeError(error)}`);
  }

  // Encode game data - MUST MATCH CONTRACT EXACTLY
  encodedData = encodeAbiParameters(
    [
      { name: 'param1', type: 'uint8' },
      { name: 'gameId', type: 'uint256' },
      { name: 'ref', type: 'address' },
      { name: 'userRandomWord', type: 'bytes32' },
    ],
    [param1Value, gameId, refAddress, userRandomWord]
  );

  contractAddress = gameEntry.contract;
  gameName = gameEntry.key;
  gameUrl = `https://www.ape.church/games/${gameEntry.slug}?id=${gameId.toString()}`;
  config = { param1: param1Value };
}
```

### 5. Update CLI Parsing (`bin/cli.js`)

In the `play` command, update positional arg parsing:

```js
// In the positional config parsing section:
} else if (fixedGame.type === 'new-type') {
  if (configArgs[0]) positionalConfig.param1 = parseInt(configArgs[0]);
}
```

And in `playOnce()`:

```js
} else if (gameEntry.type === 'new-type') {
  if (opts.param1 !== undefined) {
    gameConfig.param1 = parseInt(opts.param1);
  } else if (positionalConfig.param1 !== undefined) {
    gameConfig.param1 = positionalConfig.param1;
  } else if (!gameConfig.param1) {
    // Strategy default
    const [min, max] = strategyConfig.newType?.param1 || [1, 10];
    gameConfig.param1 = randomIntInclusive(min, max);
  }
}
```

### 6. Add CLI Option (if needed)

If your game has unique parameters, add an option to the `play` command:

```js
.option('--param1 <value>', 'Description for new game param')
```

### 7. Update Help Text

Update the `commands` help and `games` command output to include examples.

---

## Encoding Reference

### Common Patterns

All games share these in `gameData`:
- `gameId: uint256` - Random unique ID
- `ref: address` - Referral address (or zero address)
- `userRandomWord: bytes32` - User-provided randomness

### Existing Game Encodings

**Plinko:**
```solidity
(uint8 gameMode, uint8 numBalls, uint256 gameId, address ref, bytes32 userRandomWord)
```

**Slots:**
```solidity
(uint256 gameId, uint8 numSpins, address ref, bytes32 userRandomWord)
```

**Roulette:**
```solidity
(uint8[] gameNumbers, uint256[] amounts, uint256 gameId, address ref, bytes32 userRandomWord)
```
- `gameNumbers[i]` must match `amounts[i]` in length
- Single bet requires subtracting 1 wei from amount (contract quirk)

---

## VRF Fee Patterns

### Static (most games)
```js
vrfFee = await publicClient.readContract({
  address: contract,
  abi: SLOTS_VRF_ABI,  // getVRFFee() with no args
  functionName: 'getVRFFee',
});
```

### Dynamic (plinko)
```js
const customGasLimit = baseGas + (units * perUnitGas);
vrfFee = await publicClient.readContract({
  address: contract,
  abi: PLINKO_VRF_ABI,  // getVRFFee(uint32)
  functionName: 'getVRFFee',
  args: [customGasLimit],
});
```

---

## Checklist

Implement the [game accounting contract](ACCOUNTING.md): gross wager and payout,
their matching multiplier, actual additional costs and net PnL Profit. Preserve
transaction cost components across failed attempts, pending results and resume.

- [ ] Added game to `GAME_REGISTRY` in `registry.js`
- [ ] Exported gross returns, additional cost components and net PnL Profit
- [ ] Verified retry and resume do not duplicate transactions or their costs
- [ ] Exported exhausted-retry costs without creating a game outcome
- [ ] Kept input/condition precision separate from display rounding
- [ ] Verified loop totals use matching wager/payout scopes and count costs once
- [ ] Added or updated the allowed alias list for the game, if needed
- [ ] Left `abiVerified` unset/false unless the verification guide is complete
- [ ] Added strategy config in `getStrategyConfig()`
- [ ] Added game selection in `selectGameAndConfig()`
- [ ] Added encoding logic in `playGame()`
- [ ] Added playGame parameter (e.g., `bet` for roulette)
- [ ] Updated CLI positional parsing
- [ ] Updated `playOnce()` game-specific params
- [ ] Added CLI option if needed (e.g., `--bet`)
- [ ] Updated `bet` command if it has unique params
- [ ] Updated `heartbeat` command playGame call
- [ ] Updated help text, examples, and alias tables
- [ ] Tested with `apechurch-cli games` and `apechurch-cli game <name>`
- [ ] Tested actual gameplay
- [ ] If promoting to `ABI verified`, completed [docs/ABI_VERIFICATION.md](./ABI_VERIFICATION.md)

---

## Testing

```bash
# List all games (verify new game appears)
apechurch-cli games

# Show game details
apechurch-cli game new-game

# Test positional syntax
apechurch-cli play new-game 10 <config>

# Test flag syntax
apechurch-cli play --game new-game --amount 10 --param1 5

# Test loop mode
apechurch-cli play new-game 10 <config> --loop

# Test JSON output
apechurch-cli play new-game 10 <config> --json
```

---

## Contract Requirements

All Ape Church games must:
1. Have `play(address player, bytes gameData)` function
2. Emit `GameEnded(address indexed user, uint256 gameId, uint256 buyIn, uint256 payout)` event
3. Have `getVRFFee()` or `getVRFFee(uint32)` for VRF cost
4. Have `getEssentialGameInfo(uint256[] gameIds)` for history lookup

These are defined in the `GameMasterClass` base contract.

---

## ABI Verification

Shipping support for a game and promoting it to `ABI verified` are separate steps.

- Support means the CLI can encode, submit, and read the game successfully.
- `ABI verified` means the local ABI, config limits, read/write paths, and payout or solver logic have been checked against verified on-chain contract data.

Before adding the `✔︎` marker or setting `abiVerified: true`, complete the checklist in [docs/ABI_VERIFICATION.md](./ABI_VERIFICATION.md).

## Interrupted loops

Record a successful settlement before fetching the final wallet balance or
performing unrelated RPC reads. If a later step fails, retain the completed
games and receipt economics and report a partial terminal result with a nonzero
exit status. Failed-only transaction costs reduce net PnL without increasing
wager, payout or game count. An unresolved wager is not a settled loss.
Stateful JSON errors expose `partial_summary` alongside the original error;
plain output uses `# partial:`. Do not emit two final JSON documents for one
stateful command. Loop and bot failure helpers live in `lib/terminal-summary.js`.
