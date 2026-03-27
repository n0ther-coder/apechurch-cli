# @n0ther/apechurch-cli

Autonomous gambling CLI for [Ape Church](https://ape.church) on ApeChain.

Play casino games from the command line. Perfect for AI agents, automation, and degens who prefer terminals.

## Features

- **12+ Games:** Roulette, Blackjack, Video Poker, Plinko, Slots, Keno, and more
- **Loop Mode:** Continuous play with safety controls (target, stop-loss, max-games)
- **Stateful Auto Modes:** `simple` by default, `best` EV solver for video poker
- **Betting Strategies:** Flat, Martingale, Fibonacci, D'Alembert, Reverse Martingale
- **AI Agent Ready:** JSON output, structured responses, self-documenting
- **Fully On-Chain:** Every bet settled on ApeChain with Chainlink VRF

## Quick Start

```bash
# Install
npm install -g @n0ther/apechurch-cli

# Optional for non-interactive local signing
export APECHURCH_CLI_PASS=your-local-password

# Optional to override the username/profile API
export APECHURCH_CLI_PROFILE_URL=https://www.ape.church/api/profile

# Fresh install/import prompts securely for the private key
apechurch-cli install

# Fund wallet with APE on ApeChain
# Bridge: https://relay.link/bridge/apechain

# Check status
apechurch-cli status

# Play one game
apechurch-cli play

# Play continuously
apechurch-cli play --loop
```

If `~/.apechurch-cli/wallet.json` already exists, `apechurch-cli install` reuses the encrypted wallet and does not ask for the private key again.

## Environment Variables

- `APECHURCH_CLI_PK`: optional fallback for non-interactive fresh install/reinstall
- `APECHURCH_CLI_PASS`: required for non-interactive install/signing; optional otherwise
- `APECHURCH_CLI_PROFILE_URL`: optional override for the username/profile API endpoint

## Games

| Game | Command | Description |
|------|---------|-------------|
| ApeStrong | `play ape-strong 10 50` | Pick-your-odds dice |
| Roulette | `play roulette 10 RED` | American roulette |
| Baccarat | `play baccarat 10 BANKER` | Classic baccarat |
| Jungle Plinko | `play jungle-plinko 10 2 50` | Drop balls for multipliers |
| Keno | `play keno 10` | Pick numbers 1-40 |
| Speed Keno | `play speed-keno 10` | Fast batched keno |
| Dino Dough | `play dino-dough 10 10` | Slot machine |
| Bubblegum Heist | `play bubblegum-heist 10 10` | Slot machine |
| Monkey Match | `play monkey-match 10` | Poker hands from barrels |
| Bear-A-Dice | `play bear-dice 10` | Avoid unlucky numbers |
| Blackjack | `blackjack 10 --auto` | Card game with simple auto-play strategy |
| Video Poker | `video-poker 10 --auto best` | Jacks or Better with exact EV mode |

## Loop Mode

Play continuously with safety controls:

```bash
# Basic loop
apechurch-cli play --loop

# With safety limits
apechurch-cli play --loop --target 200 --stop-loss 50 --max-games 100

# Specific game
apechurch-cli play ape-strong 10 50 --loop --target 150
```

| Option | Description |
|--------|-------------|
| `--target <ape>` | Stop when balance reaches target |
| `--stop-loss <ape>` | Stop when balance drops to limit |
| `--max-games <n>` | Stop after N games |
| `--delay <sec>` | Seconds between games (default: 3) |

## Betting Strategies

```bash
# Martingale: double on loss, reset on win
apechurch-cli play roulette 10 RED --loop --bet-strategy martingale --max-bet 100

# Fibonacci: sequence on losses
apechurch-cli play --loop --bet-strategy fibonacci
```

| Strategy | Behavior |
|----------|----------|
| `flat` | Same bet every time (default) |
| `martingale` | Double on loss, reset on win |
| `reverse-martingale` | Double on win, reset on loss |
| `fibonacci` | Fibonacci sequence on losses |
| `dalembert` | +1 unit on loss, -1 on win |

## Blackjack & Video Poker

Interactive card games with auto-play support:

```bash
# Auto-play modes
apechurch-cli blackjack 10 --auto --loop
apechurch-cli blackjack 10 --auto best   # Exact EV solver
apechurch-cli video-poker 10 --auto --loop
apechurch-cli video-poker 10 --auto best
apechurch-cli video-poker 10 --solver    # Interactive hold suggestion (best EV)

# Humanized pacing adds 3-9s on top of the fixed delay
apechurch-cli video-poker 10 --auto best --loop --delay 5 --human
apechurch-cli video-poker --auto best --loop --human --delay 3 --target 2000 --max-games 50 25

# Interactive mode
apechurch-cli blackjack 10
```

- `--auto` without a mode means `simple`
- `blackjack --auto best` computes exact EV on the live hand state, including early surrender, insurance, double, and split under the contract rules
- `video-poker --auto best` evaluates all 32 holds and maximizes EV using the live jackpot at max bet
- `video-poker --solver` shows the same best-EV hold suggestion in interactive mode
- `video-poker --display full` now uses the boxed ASCII table layout; `simple` keeps the compact text layout
- `blackjack` and `video-poker` use `--delay 5` by default in loop mode
- `--human` adds a weighted extra `3-9s` delay on top of the fixed delay

## Commands

```bash
apechurch-cli play [game] [amount] [config...]  # Play games
apechurch-cli blackjack <amount> [--auto [mode]]    # Blackjack
apechurch-cli video-poker <amount> [--auto [mode]]  # Video Poker
apechurch-cli status                            # Check balance
apechurch-cli games                             # List all games
apechurch-cli game <name>                       # Game details
apechurch-cli pause                             # Stop autonomous play
apechurch-cli resume                            # Resume play
apechurch-cli history                           # Recent games
apechurch-cli commands                          # Full reference
```

## For AI Agents

All commands support `--json` for machine-readable output:

```bash
apechurch-cli status --json
apechurch-cli play --json
apechurch-cli play --loop --json
```

See [SKILL.md](./SKILL.md) for complete agent documentation.

## Requirements

- Node.js >= 18
- APE on ApeChain (gas + wagers)

## Links

- **Website:** https://ape.church
- **Games:** https://ape.church/games
- **Bridge APE:** https://relay.link/bridge/apechain
- **GitHub:** https://github.com/ape-church/agent-skills

## License

ISC
