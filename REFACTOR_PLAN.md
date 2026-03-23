# Ape Church CLI Refactor Plan

## Goals
1. Split 3000+ line cli.js into logical modules
2. Make adding new single-tx games trivial (data-only in most cases)
3. Prepare architecture for multi-step games (Blackjack)
4. Keep backward compatibility (all commands work identically)

## Current Pain Points
- All logic in one file (cli.js)
- Adding a game requires edits in 8+ places
- Game-specific logic scattered across multiple functions
- No separation between game types
- Hard to test individual pieces

---

## New Directory Structure

```
@apechurch-hf/apechurch-cli-gx54/
├── bin/
│   └── cli.js              # Entry point only - imports commands, calls program.parse()
├── lib/
│   ├── constants.js        # Chain config, ABIs, URLs, magic numbers
│   ├── wallet.js           # Wallet loading, client creation, transport
│   ├── profile.js          # Profile CRUD, state CRUD, history CRUD
│   ├── strategy.js         # Strategy configs, calculateWager, selectGameAndConfig
│   ├── utils.js            # Shared helpers (sanitizeError, formatApe, randomBytes, etc.)
│   ├── games/
│   │   ├── index.js        # Exports playGame() - routes to correct handler
│   │   ├── base.js         # Shared game logic (VRF fee, tx sending, event watching)
│   │   ├── plinko.js       # Plinko encoding + config
│   │   ├── slots.js        # Slots encoding + config
│   │   ├── roulette.js     # Roulette encoding + bet parsing
│   │   ├── baccarat.js     # Baccarat encoding + bet parsing
│   │   ├── apestrong.js    # ApeStrong encoding + config
│   │   └── blackjack.js    # (Future) Multi-step game handler
│   └── commands/
│       ├── install.js      # Install command
│       ├── status.js       # Status command
│       ├── play.js         # Play command (biggest one)
│       ├── bet.js          # Bet command
│       ├── heartbeat.js    # Heartbeat command
│       ├── profile.js      # Profile commands
│       ├── games.js        # Games list + game detail commands
│       ├── history.js      # History command
│       └── helpers.js      # Pause, resume, register, wallet, uninstall
├── registry.js             # Game definitions (already exists, enhance)
├── package.json
├── README.md
├── SKILL.md
├── ADDING_GAMES.md         # Update with new process
└── ...
```

---

## Module Responsibilities

### `bin/cli.js` (~50 lines)
```js
#!/usr/bin/env node
import { program } from 'commander';
import { registerCommands } from '../lib/commands/index.js';

program.name('apechurch-cli-gx54').version(VERSION);
registerCommands(program);
program.parse(process.argv);
```

### `lib/constants.js`
- Chain definition (apechain)
- Contract ABIs (GAME_CONTRACT_ABI, PLINKO_VRF_ABI, SLOTS_VRF_ABI)
- API URLs (PROFILE_API_URL)
- Magic numbers (GAS_RESERVE_APE, DEFAULT_COOLDOWN_MS)
- File paths (APECHURCH_DIR, WALLET_FILE, etc.)

### `lib/wallet.js`
- `getWallet()` - load wallet from file
- `createClients(account)` - create public/wallet clients
- `getTransport()` - HTTP transport

### `lib/profile.js`
- `loadProfile()` / `saveProfile()`
- `loadState()` / `saveState()`
- `loadHistory()` / `saveHistory()` / `saveGameToHistory()`
- `generateUsername()` / `normalizeUsername()`
- `registerUsername()` - SIWE registration

### `lib/strategy.js`
- `getStrategyConfig(strategy)` - returns config object
- `normalizeStrategy(value)` - normalize strategy name
- `applyProfileOverrides(config, overrides)`
- `calculateWager(availableApe, config)`
- `selectGameAndConfig(strategyConfig)` - picks game + params
- `computeCooldownMs(config, state)`

### `lib/utils.js`
- `sanitizeError(error)`
- `formatApeAmount(value)`
- `randomBytes32()` / `randomUint256()`
- `parsePositiveInt()` / `parseNonNegativeInt()` / `ensureIntRange()`
- `clampRange()`
- `addBigIntStrings()`
- `getValidRefAddress()`
- `ensureDir()`

### `lib/games/index.js`
```js
import { playPlinko } from './plinko.js';
import { playSlots } from './slots.js';
// ...

const handlers = {
  plinko: playPlinko,
  slots: playSlots,
  roulette: playRoulette,
  baccarat: playBaccarat,
  apestrong: playApestrong,
};

export async function playGame({ account, game, ...opts }) {
  const gameEntry = resolveGame(game);
  const handler = handlers[gameEntry.type];
  if (!handler) throw new Error(`Unsupported game type: ${gameEntry.type}`);
  return handler({ account, gameEntry, ...opts });
}
```

### `lib/games/base.js`
- `sendGameTransaction({ publicClient, walletClient, contract, encodedData, value })`
- `watchGameEnded({ publicClient, contract, account, gameId, timeoutMs })`
- `getVrfFee({ publicClient, contract, abi, args })`
- Shared logic all games use

### `lib/games/plinko.js` (example)
```js
import { encodeAbiParameters } from 'viem';
import { getVrfFee, sendGameTransaction, watchGameEnded } from './base.js';

export async function playPlinko({ account, gameEntry, wager, mode, balls, gameId, refAddress, userRandomWord, publicClient, walletClient, timeoutMs }) {
  // Plinko-specific encoding
  const customGasLimit = gameEntry.vrf.baseGas + (balls * gameEntry.vrf.perUnitGas);
  const vrfFee = await getVrfFee({ publicClient, contract: gameEntry.contract, abi: PLINKO_VRF_ABI, args: [customGasLimit] });
  
  const encodedData = encodeAbiParameters([...], [mode, balls, gameId, refAddress, userRandomWord]);
  
  // Use shared transaction logic
  return sendAndWatch({ ... });
}

export function getPlinkoConfig(opts, gameEntry, strategyConfig) {
  // Returns { mode, balls } based on opts/strategy
}
```

### `lib/commands/play.js`
- The `play` command logic
- Imports game handlers, strategy, profile
- Handles loop mode, positional parsing, etc.

---

## Registry Enhancement

Add encoding schema to registry so games are more self-describing:

```js
{
  key: 'ape-strong',
  type: 'apestrong',
  contract: '0x...',
  // NEW: encoding schema
  encoding: {
    params: [
      { name: 'edgeFlipRange', type: 'uint8', source: 'range' },
      { name: 'gameId', type: 'uint256', source: 'gameId' },
      { name: 'ref', type: 'address', source: 'refAddress' },
      { name: 'userRandomWord', type: 'bytes32', source: 'userRandomWord' },
    ],
  },
  // NEW: strategy config
  strategyConfig: {
    conservative: { range: [60, 80] },
    balanced: { range: [40, 60] },
    aggressive: { range: [25, 50] },
    degen: { range: [5, 30] },
  },
  // ... existing config
}
```

This could allow generic encoding for simple games (future optimization).

---

## Adding a New Single-TX Game (Post-Refactor)

1. **registry.js** - Add game definition
2. **lib/games/<game>.js** - Create handler (encoding + config logic)
3. **lib/games/index.js** - Import and register handler
4. **lib/strategy.js** - Add strategy defaults (or put in registry)
5. **lib/commands/play.js** - Add CLI option if new param needed

That's it. 5 files max, usually just 3.

---

## Multi-Step Games (Blackjack)

Different interface entirely:

```js
// lib/games/blackjack.js
export async function startBlackjack({ account, wager }) {
  // Initial deal transaction
  // Returns { gameId, playerCards, dealerUpCard, canHit, canDouble, canSplit, canInsurance }
}

export async function blackjackAction({ account, gameId, action }) {
  // action: 'hit' | 'stand' | 'double' | 'split' | 'insurance' | 'surrender'
  // Returns updated game state or final result
}
```

New commands:
- `apechurch-cli-gx54 blackjack start 10` → starts game, shows state
- `apechurch-cli-gx54 blackjack hit <gameId>` → hit action
- `apechurch-cli-gx54 blackjack stand <gameId>` → stand action
- Or interactive mode: `apechurch-cli-gx54 blackjack play 10` → prompts for actions

---

## Execution Order

1. Create lib/ directory structure
2. Extract constants.js
3. Extract utils.js
4. Extract wallet.js
5. Extract profile.js
6. Extract strategy.js
7. Extract lib/games/base.js
8. Extract individual game handlers
9. Extract lib/games/index.js
10. Extract commands one by one
11. Slim down bin/cli.js to entry point
12. Test all commands
13. Update ADDING_GAMES.md
14. Commit

---

## Risk Mitigation

- Keep original cli.js as cli.js.backup until verified
- Test each command after refactor
- No functionality changes - pure restructure
- Git commit after each major extraction

---

## Success Criteria

- [ ] All existing commands work identically
- [ ] bin/cli.js < 100 lines
- [ ] No file > 400 lines
- [ ] Adding a new simple game touches ≤ 5 files
- [ ] Clear path for Blackjack implementation
