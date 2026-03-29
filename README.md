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
- **History Download:** Build and cache per-wallet on-chain history with local stats and per-game breakdowns

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

# Download on-chain history for the local wallet
apechurch-cli wallet download

# Read the downloaded history and stats
apechurch-cli history --stats

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

## History Download & Stats

Download supported gaming history from ApeChain into a per-wallet local file, then read it back without reconstructing the chain every time:

```bash
# Download history for the local wallet address
apechurch-cli wallet download

# Download history for any wallet
apechurch-cli wallet download 0x1234...abcd

# Narrow the sync to a recent block range
apechurch-cli wallet download 0x1234...abcd --from-block 35000000 --to-block 35300000

# Read saved history plus history stats
apechurch-cli history 0x1234...abcd

# Show only history stats
apechurch-cli history 0x1234...abcd --stats

# Show history stats split by game
apechurch-cli history 0x1234...abcd --breakdown

# Refresh from chain before showing
apechurch-cli history 0x1234...abcd --refresh

# Machine-readable output
apechurch-cli history 0x1234...abcd --json
```

`history --refresh` runs the same on-chain sync as `wallet download` before reading the local file. `history --breakdown` appends the aggregate stats split by game.

Text output includes:

- `🎰 Games`: synced games included in the economic stats
- `💸 Contract fees paid`: contract-side fees actually paid by the wallet
- `⛽️ Gas paid`: network gas actually paid by the wallet
- `Net result`: `payout - wager - contract fees - gas`
- `✌️ Win rate`: wins divided by synced games
- `🎲 RTP`: `total payout / total wagered`
- `🎟️ wAPE`: current on-chain balance / total wAPE received from synced games
- `🧮 GP`: current on-chain balance / total GP received from synced games

Options:

| Option | Description |
|--------|-------------|
| `wallet download --from-block <n>` | Start block for the sync |
| `wallet download --to-block <n>` | End block for the sync (default: latest block) |
| `wallet download --chunk-size <n>` | Block span per log query (default: `50000`) |
| `history --stats` | Show only history stats |
| `history --breakdown` | Show history stats split by game |
| `history --refresh` | Refresh from chain before rendering |
| `history --json` | Emit the machine-readable local report |

Coverage and limits:

- Downloaded histories live under `~/.apechurch-cli/history/church_<wallet>.json`.
- The downloader enumerates supported single-transaction games in the local registry via indexed `GameEnded(user, ...)` logs.
- `Blackjack` and `Video Poker` cannot yet be generically enumerated from raw RPC, so locally-known entries remain minimal until a reliable fetch path is implemented.
- Sponsored transactions contribute `0` contract fees and `0` gas for the analyzed wallet.

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
| Blackjack | `blackjack 25 --side 1 --auto` | Card game with auto-play and optional player side bet |
| Video Poker | `video-poker 10 --auto best` | Jacks or Better with advanced auto-play |

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
apechurch-cli blackjack 25 --side 1 --auto
apechurch-cli video-poker 10 --auto --loop
apechurch-cli video-poker 10 --auto best
apechurch-cli video-poker 10 --solver    # Interactive hold suggestion (best EV)

# Humanized pacing adds 3-9s on top of the fixed delay
apechurch-cli video-poker 10 --auto best --loop --delay 5 --human
apechurch-cli video-poker --auto best --loop --human --delay 3 --target 2000 --max-games 50 25

# Interactive mode
apechurch-cli blackjack 10

# Full local history
apechurch-cli history --all
```

- `--auto` without a mode means `simple`
- `blackjack --side <ape>` adds a player side bet to the opening deal without changing the in-hand EV solver
- `video-poker --solver` shows the same best-EV hold suggestion in interactive mode
- `video-poker --display full` now uses the boxed ASCII table layout; `simple` keeps the compact text layout
- `blackjack` and `video-poker` use `--delay 5` by default in loop mode
- where loop game estimates are supported, startup prints a pre-loop estimate before asking `Proceed? (Y/n)`; games with a Monte Carlo model show the typical run plus lucky-day / bad-run bounds, while the others keep the EV-based estimate

## Commands

```bash
apechurch-cli play [game] [amount] [config...]  # Play games
apechurch-cli blackjack <amount> [--auto] [--side <ape>]  # Blackjack
apechurch-cli video-poker <amount> [--auto]     # Video Poker
apechurch-cli status                            # Check balance
apechurch-cli wallet download [address]         # Download supported on-chain history into local cache
apechurch-cli games                             # List all games
apechurch-cli game <name>                       # Game details
apechurch-cli pause                             # Stop autonomous play
apechurch-cli continue                          # Continue play
apechurch-cli history [address] [--stats] [--breakdown] [--refresh]  # Read downloaded history
apechurch-cli commands                          # Full reference
```

## For AI Agents

All commands support `--json` for machine-readable output:

```bash
apechurch-cli status --json
apechurch-cli play --json
apechurch-cli play --loop --json
apechurch-cli wallet download 0x1234...abcd --json
apechurch-cli history 0x1234...abcd --breakdown --json
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
