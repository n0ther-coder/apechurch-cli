# @n0ther/apechurch-cli

> Summary: Hardened, fully AI agents playable Ape Church CLI for GitHub and npm readers. Highlights encrypted-only wallet handling, stronger auto gameplay, expanded game support, on-chain history reporting, and operator-focused CLI tooling.

Encrypted-only, fully AI agents playable gambling CLI for [Ape Church](https://ape.church) on ApeChain.

Private keys stay local, are stored on disk only in encrypted form in this hardened build, and are never sent by the CLI to Ape Church services in plaintext. This standalone project also expands game coverage, improves auto gameplay for stateful games, and adds deeper on-chain reporting and machine-friendly flows for AI agents and terminal-first users.

## Standalone Project Status

This package started from the original Ape Church CLI codebase, but it has been reshaped deeply enough that it should now be treated as its own project rather than a simple downstream patch set. The goal is still the same ecosystem and the same live ApeChain games, but the implementation has moved toward a hardened, automation-ready operator CLI.

Concrete examples from this repository:

- **Safer local custody:** `bin/cli.js` and `lib/wallet.js` enforce encrypted wallet storage, local password prompts, multi-wallet selection, password rotation, and local signing paths instead of treating private-key handling as a disposable setup step.
- **A maintained game registry:** `registry.js` centralizes supported games, aliases, verified ABI metadata, RTP references, VRF fee behavior, and display names, so the CLI can expose consistent help, JSON, docs, and automation behavior across the catalog.
- **Verified, richer game coverage:** `docs/verification/` and `lib/games/` back the ABI-verified labels used by the CLI, while the supported game list now covers 22 implemented games and 26 tracked history contracts.
- **Stateful game engines:** `lib/stateful/blackjack/`, `lib/stateful/video-poker/`, `lib/stateful/hi-lo-nebula/`, and `lib/stateful/cash-dash/` include resumable local state, command-specific actions, display layers, auto-play, and solver/strategy code rather than simple one-shot contract calls.
- **Operator-grade history and reporting:** `lib/wallet-analysis.js`, `lib/history.js`, `lib/scores.js`, and the `history`, `scoreboard`, and `fees` commands build local per-wallet caches, reconstruct game variants, report real wallet economics, and keep offline reads fast.
- **AI-agent and bot runtime:** `lib/bots.js` exposes `ctx.playJson(...)`, `ctx.botJson(...)`, session helpers, nested bot chime propagation, logs, and machine-readable command output so external agents can run the CLI without a browser.
- **Formal command surface:** `docs/COMMAND_REFERENCE.md`, `docs/GAMES_REFERENCE.md`, and the generated CLI help document the grammar, aliases, JSON modes, and loop controls expected by users and automation.

In short: the original repository is the historical base; this package is now a hardened local signer, game automation layer, analytics cache, and bot-oriented command surface for Ape Church.

## Personal Bots For Humans And AI Agents

`apechurch-cli` treats personal bots as a first-class local extension point. This repository contains the bot loader, runtime helpers, and public contract; personal bot implementations live in a separate local directory or Git repository that you control. A bot is trusted code discovered by the CLI, run through the same encrypted local wallet, and constrained by the same command grammar, wallet guards, and JSON reporting surfaces as manual play.

For human operators, this means private routines can be packaged as named commands instead of fragile shell scripts: recovery play, bankroll routing, game-specific experiments, scheduled loop variants, or multi-step strategies can live under a bot directory with its own `README.md`, `bot.json`, usage help, and run logs. Operators can list available bots, inspect their help, pass standard stop-loss/take-profit controls, and review JSON summaries after each run:

```bash
apechurch-cli bot --list
apechurch-cli bot <bot-command> --help
apechurch-cli bot <bot-command> 10 --take-profit 25 --stop-loss 5
```

For AI agents, the same surface is intentionally machine-friendly. `lib/bots.js` exposes a narrow runtime context with helpers such as `ctx.play(...)`, `ctx.playJson(...)`, `ctx.botRun(...)`, `ctx.botJson(...)`, `ctx.validatePlayArgs(...)`, and `ctx.validateBotArgs(...)`, so an agent can compose live CLI plays, call nested bots, validate arguments before execution, and consume structured results without scraping terminal output. The bot runtime also tracks nested calls, forwards chimes through parent/child bot chains, and writes per-bot JSON logs under `APECHURCH_CLI_LOG_DIR`.

Bot discovery is local and explicit:

```bash
# Default personal bot root:
~/.apechurch-cli/bots

# Or point at any local bot repository or directory you control:
export APECHURCH_CLI_BOTS_DIR=/path/to/local-bots
export APECHURCH_CLI_LOG_DIR=/path/to/local-bot-logs
apechurch-cli bot --list
```

This design keeps bot strategy private while still giving both humans and AI agents a stable execution contract. The CLI does not need to know whether a bot was written by a person, generated by an agent, or maintained collaboratively; it only requires a manifest, a documented entry point, and well-formed calls back into the public `apechurch-cli` surface. Keep bot repositories private or public as needed, install or clone them wherever convenient, and switch between them by changing `APECHURCH_CLI_BOTS_DIR`. Use [docs/BOTS.md](./docs/BOTS.md) plus `apechurch-cli bot --help` for the public loader contract.

## Features

### Supported Games

- **22 implemented games:** `ApeStrong ✔︎`, `Roulette ✔︎`, `Baccarat ✔︎`, `Jungle Plinko ✔︎`, `Cosmic Plinko ✔︎`, `Keno ✔︎`, `Speed Keno ✔︎`, `Dino Dough ✔︎`, `Bubblegum Heist ✔︎`, `Geez Diggerz ✔︎`, `Gimboz Smash ✔︎`, `Glyde or Crash ✔︎`, `Reel Pirates`, `Cash Dash ✔︎`, `Hi-Lo Nebula ✔︎`, `Sushi Showdown ✔︎`, `Monkey Match ✔︎`, `Bear-A-Dice ✔︎`, `Blocks ✔︎`, `Primes ✔︎`, `Blackjack ✔︎`, and `Video Poker ✔︎ / Gimboz Poker`. Of these, 21 are ABI-verified; `Reel Pirates` is playable but not ABI-verified.
- **Personal bot support:** humans and AI agents can package private routines as local bots with manifests, help text, nested calls, JSON summaries, and standard wallet guards
- **Fully AI agents playable:** browserless CLI flows, local signing, JSON output, formal command grammar, and self-describing game metadata make it straightforward for coding agents and automations to use directly
- **Improved auto gameplay:** `Blackjack ✔︎`, `Cash Dash ✔︎`, `Hi-Lo Nebula ✔︎`, and `Video Poker ✔︎ / Gimboz Poker` include interactive flows, better auto-play, solver-backed decisions, and loop-friendly automation controls
- **Fully on-chain settlement:** every wager is placed on ApeChain and resolved by the live contracts with their on-chain RNG integrations, including Chainlink VRF and Pyth V2 where applicable

### What This Project Adds

- **Encrypted-only local signer:** private keys stay encrypted on disk, plaintext wallet export is disabled, and signing happens locally without transmitting the key to Ape Church services
- **AI-agent-first operator UX:** fully AI agents playable command surface with structured outputs, local history caches, and no browser dependency
- **Better stateful automation:** stronger blackjack, cash-dash, hi-lo-nebula, and video-poker auto gameplay, side-bet support, unfinished-game recovery, and EV / Monte Carlo helpers for loop planning
- **Expanded Ape Church coverage:** explicit support for both Jungle Plinko and Cosmic Plinko instead of a single generic Plinko entry, plus supported `Blocks ✔︎`, `Primes ✔︎`, and `Glyde or Crash ✔︎` gameplay and a broader maintained game registry
- **ABI-verified game metadata:** verified contracts are marked with `✔︎` in CLI output, help, JSON payloads, and docs; ApeStrong ✔︎, Roulette ✔︎, Baccarat ✔︎, Jungle Plinko ✔︎, Cosmic Plinko ✔︎, Keno ✔︎, Speed Keno ✔︎, Dino Dough ✔︎, Bubblegum Heist ✔︎, Geez Diggerz ✔︎, Gimboz Smash ✔︎, Glyde or Crash ✔︎, Cash Dash ✔︎, Hi-Lo Nebula ✔︎, Sushi Showdown ✔︎, Monkey Match ✔︎, Bear-A-Dice ✔︎, Blocks ✔︎, Primes ✔︎, Blackjack ✔︎, and Video Poker ✔︎ use verified on-chain contract data
- **RTP and payout modeling overhaul:** expected RTP, reported RTP, current RTP, and max-payout references across the game catalog, with exact/formula/statistical provenance markers where available
- **Exact Plinko modeling:** Jungle and Cosmic Plinko mode RTP and top payouts are derived from the live on-chain bucket tables, and Plinko stats are grouped by risk level rather than by ball count
- **Per-wallet history cache:** `wallet download` reconstructs supported on-chain history into a local cache, with incremental backfills and offline `history` reads across 26 tracked public game contracts
- **Richer reporting:** `Recent Games`, compact `Game Status`, and full `Game Stats` views show net profit, win rate, RTP, unfinished local games, and per-game breakdowns
- **Better automation tooling:** loop mode supports `take-profit`, `retrace`, `stop-loss`, `max-games`, machine-readable JSON output, and strategy-driven game/config selection
- **Stateful UX improvements:** unfinished-game recovery, blackjack side bets, solver-backed auto decisions, and EV / Monte Carlo helpers for loop planning
- **Documentation overhaul:** formal BNF argument grammar in CLI help, a bundled games reference, clearer examples, and explicit coverage / limitations for on-chain reporting

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

# Read cached history and stats
apechurch-cli history --stats

# Play one random game/config automatically
apechurch-cli play --auto

# Play continuously
apechurch-cli play --loop
```

The selected wallet is tracked by `~/.apechurch-cli/wallets/current.json`, which points to `wallets/<address>.json`. Encrypted wallet material lives only in address-specific entries under `~/.apechurch-cli/wallets/`; if an entry is a symlink, normal filesystem resolution applies.

## Native Win Chimes

By default, `apechurch-cli` installs the optional native `speaker` package and uses it to play short slot-like win chimes locally. If the native audio backend is missing or cannot start, gameplay continues and the CLI falls back to terminal BEL where the terminal supports it.

`npm audit` currently reports `speaker@0.5.5` for [GHSA-w5fc-gj3h-26rx](https://github.com/advisories/GHSA-w5fc-gj3h-26rx), a denial-of-service advisory with no upstream package fix. For normal `apechurch-cli` use the practical impact should be very low: this CLI is meant to run locally, the worker synthesizes a small PCM buffer in memory, and it does not decode remote audio, process wallet secrets, or expose a network listener. It is still not literally zero risk, because `speaker` is native code and a DoS can still crash or hang the local chime process.

Default install with native chimes:

```bash
npm install -g @n0ther/apechurch-cli
```

Security-first install without the native chime backend:

```bash
npm install -g @n0ther/apechurch-cli --omit=optional
```

For a local checkout, use the same choice:

```bash
# Default: native chimes enabled
npm install

# Security-first: skip optional native dependencies
npm install --omit=optional
```

If you already installed the package globally and want to switch to the no-native-chime install, reinstall it explicitly:

```bash
npm uninstall -g @n0ther/apechurch-cli
npm install -g @n0ther/apechurch-cli --omit=optional
```

To keep the package installed normally but silence all chimes for one command:

```bash
APECHURCH_CLI_SUPPRESS_CHIME=1 apechurch-cli play --auto
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APECHURCH_CLI_CONFIG_DIR` | `~/.apechurch-cli` | Root directory for local CLI config and data, including wallet, profiles, history, state, scores, default bots, and default bot logs |
| `APECHURCH_CLI_BOTS_DIR` | `$APECHURCH_CLI_CONFIG_DIR/bots` | Personal local bot root; set this to the directory that contains bot folders with `bot.json` |
| `APECHURCH_CLI_LOG_DIR` | `$APECHURCH_CLI_CONFIG_DIR/log` | Bot log root; run logs are written under per-bot subdirectories such as `log/<bot-name>` |
| `APECHURCH_CLI_PK` | none | Optional fallback for non-interactive fresh install/reinstall only |
| `APECHURCH_CLI_PASS` | none | Wallet password for non-interactive install/signing; otherwise the CLI prompts locally when needed |
| `APECHURCH_CLI_PROFILE_URL` | `https://www.ape.church/api/profile` | Username/profile API endpoint override |
| `APECHAIN_RPC_URL` | `https://rpc.apechain.com/http` | Optional custom ApeChain RPC URL or comma/whitespace-separated URLs; the default RPC remains appended as a fallback |
| `APECHURCH_CLI_FORCE_COLOR` | unset | Force ANSI color in plain output when set to `1`; equivalent to `--color` |
| `NO_COLOR` | unset | Disable ANSI color output when set |
| `APECHURCH_CLI_FORCE_CHIME` | unset | Force win chimes in JSON/nested bot flows when set to `1` |
| `APECHURCH_CLI_SUPPRESS_CHIME` | unset | Disable win chimes entirely when set to `1` |
| `APECHURCH_CLI_SUPPRESS_VERSION_BANNER` | unset | Suppress the stderr version banner when set to `1`; nested bot CLI calls set this internally |

## Reference Docs

- Full CLI command, option, alias, and shared BNF reference: [docs/COMMAND_REFERENCE.md](./docs/COMMAND_REFERENCE.md)
- Per-game syntax and game-specific grammar: [docs/GAMES_REFERENCE.md](./docs/GAMES_REFERENCE.md)
- Personal bot development guide: [docs/BOTS.md](./docs/BOTS.md)
- Personal bot command syntax and runtime helper reference: [docs/COMMAND_REFERENCE.md](./docs/COMMAND_REFERENCE.md#bot-name-args)
- The House mechanics, current `House Yield` semantics, and planning-grade APY model: [docs/HOUSE_REFERENCE.md](./docs/HOUSE_REFERENCE.md)

## Profile

`profile` defaults to `show`. Mutating flags require `profile set`. `profile set --username <name>` registers or changes the username via the same SIWE flow as `register`.

```bash
# Show the selected wallet profile
apechurch-cli profile
apechurch-cli profile show

# Register or change the username from profile
apechurch-cli profile set --username smith

# Set persona and card rendering
apechurch-cli profile set --persona aggressive --card-display simple

# Set or clear the wallet-specific current GP/APE rate
apechurch-cli profile set --gp-ape 7.5
apechurch-cli profile set --no-gp-ape
```

Profile flags:

- `--username <name>`: register or change the username for the selected wallet
- `--persona <name>`: `conservative | balanced | aggressive | degen`
- `--card-display <mode>`: `full | simple | json`
- `--referral <address>`: local-only `0x`-prefixed wallet address used on future game transactions
- `--gp-ape <points>`: positive decimal GP/APE override for the selected wallet
- `--no-gp-ape`: clear the wallet-specific GP/APE override and fall back to the base default

`--referral` does not change the SIWE username registration payload and does not retroactively affect old plays.

## History Download & Reporting

Use `wallet download` to reconstruct supported gaming history from ApeChain into a per-wallet local file, then read that cache with `history` without rebuilding the chain view every time.

The CLI currently implements 22 playable games, 21 of which are ABI-verified. Wallet history tracks 26 distinct Ape Church games: the 22 implemented games plus history-only support for `Blizzard Blitz`, `Gimboz of the Galaxy`, `Rico's Revenge`, and `Cult Quest`. Locally started Cash Dash runs are tracked through the same unfinished-game and local-history flow as the other stateful commands.

If `[address]` is omitted, both commands use the local wallet address.

```bash
# Download history for the local wallet address
apechurch-cli wallet download

# List wallets with local cached history files
apechurch-cli history --list

# Download history for any wallet
apechurch-cli wallet download 0x1234...abcd

# Narrow the sync to a recent block range
apechurch-cli wallet download 0x1234...abcd --from-block 35000000 --to-block 35300000

# Rebuild the local history file from genesis
apechurch-cli wallet download 0x1234...abcd --from-block 0

# Read saved history plus history stats
apechurch-cli history 0x1234...abcd

# Show more than the default 10 recent cached games
apechurch-cli history 0x1234...abcd --limit 25

# Show every cached game
apechurch-cli history 0x1234...abcd --all

# Show only history stats
apechurch-cli history 0x1234...abcd --stats

# Show history stats split by game
apechurch-cli history 0x1234...abcd --breakdown

# Show weekly wAPE wagered totals with play breakdowns
apechurch-cli history 0x1234...abcd --leaderboard

# Append the cached wallet leaderboard to the history report
apechurch-cli history 0x1234...abcd --scoreboard

# Include game IDs in the terminal leaderboard tables
apechurch-cli history 0x1234...abcd --scoreboard --ids

# Include game URLs in the terminal leaderboard tables
apechurch-cli history 0x1234...abcd --scoreboard --url

# Read the cached leaderboard on its own
apechurch-cli scoreboard 0x1234...abcd

# Show game IDs in the standalone terminal leaderboard
apechurch-cli scoreboard 0x1234...abcd --ids

# Show URLs in the standalone terminal leaderboard
apechurch-cli scoreboard 0x1234...abcd --url

# Refresh from chain before showing
apechurch-cli history 0x1234...abcd --refresh

# Merge a full-range refresh before showing
apechurch-cli history 0x1234...abcd --refresh --from-block 0

# Machine-readable output
apechurch-cli history 0x1234...abcd --json
```

Sync and cache behavior:

- `wallet download` is incremental by default. Without `--from-block`, it resumes from `last_synced_block + 1`.
- Use `wallet download --from-block 0` to rebuild the local history file from scratch, or pass an explicit historical range to fill older blocks.
- Explicit backfills and `history --refresh` are merged into the local file and deduplicated by `contract + game_id`.
- `history --refresh` runs the same on-chain sync path before reading the local file, but it does not clear cached records first.
- `history` shows `👀 Recent Games` plus `📜 History Stats` by default. `--stats` suppresses the game list, while `--breakdown` appends the same stats split by game.
- `history --leaderboard` shows global and weekly wAPE wagered, grouped from Sunday 00:00 UTC and listed newest first, with each week's games sorted by play count. Terminal amounts are rounded to 2 decimals; JSON keeps exact cached values.
- `history --scoreboard` appends two cached Top 20 tables: `Highest Multipliers` and `Biggest Payouts`.
- Scoreboard terminal tables hide the reference column by default; pass `--url` to show `game_url` or `--ids` to show `game_id`. If both are passed, the last option wins. JSON output keeps both fields.
- Standard `history` output also includes a compact `🎮 Game Status` section with per-game `played`, `net`, `win rate`, `RTP`, and local `unfinished` counts when available.

Text output includes:

- `🎰 Games`: economically synced games included in totals
- `💸 Contract fees paid`: contract-side fees actually paid by the wallet
- `⛽️ Gas paid`: network gas actually paid by the wallet
- `Net result`: `payout - wager - contract fees - gas`
- `✌️ Win rate`: wins divided by economically synced games
- `🎲 RTP`: `total payout / total wagered`
- `🎟️  APE Wagered (wAPE)`: current on-chain balance / total APE wagered by synced games
- `🧮 Gimbo Points (GP)`: current on-chain balance / total GP received from synced games; every `10,000 GP` equals `1 Level`

`wallet download` options:

| Option | Description |
|--------|-------------|
| `--list` | List locally available wallet addresses |
| `--from-block <n>` | Start block for the sync; `wallet download --from-block 0` rebuilds the history file |
| `--to-block <n>` | End block for the sync (default: latest block) |
| `--chunk-size <n>` | Block span per log query (default: `50000`) |
| `--json` | Emit the machine-readable download report |

`history` options:

| Option | Description |
|--------|-------------|
| `--list` | Show wallet addresses with local cached history files |
| `--limit <n>` | Number of recent cached games to show (default: `10`) |
| `--all` | Show all cached games instead of the recent slice |
| `--ids` | Show game IDs in history lines and scoreboard tables |
| `--stats` | Show only history stats |
| `--breakdown` | Append the same stats split by game |
| `--leaderboard` | Show weekly wAPE wagered totals grouped from Sunday 00:00 UTC |
| `--scoreboard` | Append the cached wallet leaderboard derived from history |
| `--url` | Show game URLs in terminal scoreboard tables |
| `--refresh` | Merge an on-chain sync before rendering |
| `--from-block <n>` | Start block for `--refresh` |
| `--to-block <n>` | End block for `--refresh` (default: latest block) |
| `--chunk-size <n>` | Block span per log query for `--refresh` |
| `--json` | Emit the machine-readable cached report |

`games` options:

| Option | Description |
|--------|-------------|
| `-l`, `--list` | Print only plain `[play] <game> <parameters>` lines |
| `--stats` | Append the full `Game Stats` catalog after the game summary, using local history when available |
| `--json` | Emit the game registry as JSON |

Coverage and limits:

- Downloaded histories live under `~/.apechurch-cli/history/<wallet>_history.json`.
- Economic totals only include games whose wager, payout, fees, gas, and GP can be reconstructed exactly from on-chain data. Total wAPE wagered uses canonical `wager_wei`.
- The downloader tracks 26 distinct public games. Stateless implemented and history-only contracts are reconstructed from settlement logs, fallback play logs, and `getEssentialGameInfo`; locally-known stateful entries are refreshed through their game-specific getters.
- `Blackjack` and `Video Poker` (`Gimboz Poker` in Ape Church naming) cannot yet be generically enumerated from raw RPC, so locally-known entries remain minimal until a reliable fetch path is implemented.
- Sponsored transactions contribute `0` contract fees and `0` gas for the analyzed wallet.

## Games

| Game | Command | Aliases | Description |
|------|---------|---------|-------------|
| ApeStrong ✔︎ | `play ape-strong 10 --cover 50` | `apestrong`, `strong` | Pick-your-odds dice |
| Roulette ✔︎ | `play roulette 10 RED` | - | American roulette |
| Baccarat ✔︎ | `play baccarat 10 BANKER` | - | Classic baccarat |
| Jungle Plinko ✔︎ | `play jungle-plinko 10 --risk 0 --split 100` | `jungleplinko`, `jungle` | Drop balls for multipliers |
| Cosmic Plinko ✔︎ | `play cosmic-plinko 10 --risk 0 --split 30` | `cosmic` | Asymmetric plinko with higher top-end payouts |
| Keno ✔︎ | `play keno 10` | - | Pick numbers 1-40 |
| Speed Keno ✔︎ | `play speed-keno 10 --split 20` | `speedkeno`, `skeno`, `speed` | Fast batched keno |
| Dino Dough ✔︎ | `play dino-dough 10 --split 15` | `dinodough`, `dino` | Slot machine |
| Bubblegum Heist ✔︎ | `play bubblegum-heist 10 --split 15` | `bubblegumheist`, `bubblegum`, `heist` | Slot machine |
| Cash Dash ✔︎ | `cash-dash 10 --auto` | `cashdash`, `dash` | Stateful death-tile ladder game with cash-out |
| Geez Diggerz ✔︎ | `play geez-diggerz 10 --split 15` | `geezdiggerz`, `geez`, `diggerz` | Slot machine |
| Gimboz Smash ✔︎ | `play gimboz-smash 10 1-50`, `play gimboz-smash 10 --cover 50`, or `play gimboz-smash 10 --out-range 45-50` | `gimbozsmash`, `smash` | One-or-two interval target game on a 1-100 board |
| Glyde or Crash ✔︎ | `play glyde-or-crash 10 2x` | `glyde`, `glyde-crash`, `glydecrash`, `speed-crash`, `speedcrash`, `crash` | Target a crash multiplier |
| Reel Pirates | `play reel-pirates 40 --split 15` | `reelpirates`, `pirates`, `reel` | Match-anywhere cascade slot |
| Hi-Lo Nebula ✔︎ | `hi-lo-nebula 10 --auto winston-ladder` | `hilonebula`, `hilo`, `nebula` | Stateful higher/lower/same card streak game with cash-out and ladder auto-play |
| Sushi Showdown ✔︎ | `play sushi-showdown 10 --split 15` | `sushishowdown`, `sushi` | Slot machine |
| Monkey Match ✔︎ | `play monkey-match 10` | `monkeymatch`, `monkey` | Poker hands from barrels |
| Bear-A-Dice ✔︎ | `play bear-dice 10` | `bear`, `dice` | Avoid unlucky numbers |
| Blocks ✔︎ | `play blocks 10 --risk 0 --survive 1` | - | 3x3 max-of-a-kind board with consecutive all-or-nothing survival attempts |
| Primes ✔︎ | `play primes 10 --risk 0 --split 20` | - | Prime-or-zero number draws with split-bet runs |
| Blackjack ✔︎ | `blackjack 25 --side 1 --auto` | `bj` | H17 card game with auto-play and optional player side bet |
| Video Poker ✔︎ / Gimboz Poker | `video-poker 10 --auto` | `vp` | Jacks or Better with auto-play and solver tools |

## Argument Grammar (BNF)

The CLI help now exposes formal argument grammar in `apechurch-cli play --help`, `apechurch-cli bet --help`, and `apechurch-cli game <name>`.

```bnf
<points> ::= <number>                        ; decimal GP per APE rate; value > 0
<keno-numbers> ::= "random" | <keno-number> ( "," <keno-number> )*
<keno-number> ::= <integer>                  ; 1 <= value <= 40
<speed-keno-numbers> ::= "random" | <speed-keno-number> ( "," <speed-keno-number> )*
<speed-keno-number> ::= <integer>            ; 1 <= value <= 20
<roulette-bets> ::= <roulette-bet> ( "," <roulette-bet> )*
<baccarat-bet> ::= "PLAYER" | "BANKER" | "TIE" | <combo-baccarat-bet>
<combo-baccarat-bet> ::= <ape> <baccarat-side> <ape> "TIE"
<baccarat-side> ::= "PLAYER" | "BANKER"
```

`--numbers` must be passed as one CLI token, for example `--numbers 1,7,13,25,40`.

The full command surface lives in [docs/COMMAND_REFERENCE.md](./docs/COMMAND_REFERENCE.md). The full per-game grammar lives in [docs/GAMES_REFERENCE.md](./docs/GAMES_REFERENCE.md).

## Loop Mode

Play continuously with safety controls:

```bash
# Basic loop
apechurch-cli play --loop

# With safety limits
apechurch-cli play --loop --take-profit 200 --stop-loss 50 --max-games 100

# Stop on session P&L thresholds
apechurch-cli play roulette 10 RED --loop --min-profit 25
apechurch-cli play roulette 10 RED --loop --max-loss 20

# Stop after any big hit
apechurch-cli play ape-strong 10 --cover 50 --loop --target-x 3.9
apechurch-cli play ape-strong 10 --cover 50 --loop --target-profit 39
apechurch-cli play roulette 10 RED --loop --retrace 10

# Stop after net P&L arms at a drawdown/run-up, then returns to break-even
apechurch-cli play roulette 10 RED --loop --recover-loss 25
apechurch-cli play roulette 10 RED --loop --giveback-profit 40

# Specific game
apechurch-cli play ape-strong 10 --cover 50 --loop --take-profit 150
```

| Option | Description |
|--------|-------------|
| `--take-profit <ape>` | Stop when balance reaches target |
| `--min-profit <ape>` | Stop when session P&L reaches the target profit |
| `--target-x <x>` | Stop when one game pays at least this multiplier |
| `--target-profit <ape>` | Stop when one game pays at least this payout |
| `--retrace <ape>` | Stop when one game loses at least this amount |
| `--recover-loss <ape>` | Arm when net session P&L reaches `-<ape>` or worse; stop when it returns to break-even/profit |
| `--giveback-profit <ape>` | Arm when net session P&L reaches `+<ape>` or better; stop when it returns to break-even/loss |
| `--stop-loss <ape>` | Stop when balance drops to limit; if used without `--bankroll`/`--max-loss`, the session bankroll is derived as `starting balance - stop-loss` |
| `--max-loss <ape>`, `--bankroll <ape>` | Stop when session P&L reaches the loss limit; if used without `--stop-loss`, the wallet stop-loss is derived as `starting balance - bankroll` |
| `--max-games <n>` | Stop after N games |
| `--delay <sec>` | Seconds between games (default: 3) |
| `--gp-ape <points>` | Override the loop points conversion for this run |

Loop summaries now assume a base rate of `5 GP/APE`. Use `--gp-ape <points>` for a one-off override, or persist a wallet-specific current rate with `apechurch-cli profile set --gp-ape <points>`.

## GP Rate Controls

Local loop summaries and local-only GP estimates use a base rate of `5 GP/APE`.

- One-off override for a single run: `--gp-ape <points>` on `bet`, `play`, `blackjack`, `cash-dash`, `hi-lo-nebula`, and `video-poker`
- Wallet-specific current override: `apechurch-cli profile set --gp-ape <points>`
- Clear the wallet-specific current override: `apechurch-cli profile set --no-gp-ape`

When on-chain GP is available for a settled game, reporting uses that on-chain value instead of any local estimate.

## Betting Strategies

```bash
# Martingale: double on loss, reset on win
apechurch-cli play roulette 10 RED --loop --bet-strategy martingale --max-bet 100

# Fibonacci: sequence on losses
apechurch-cli play --loop --bet-strategy fibonacci

# Bankroll fraction: bet 9% of remaining bankroll, capped/floored
apechurch-cli play roulette --bet RED --loop --bankroll 500 --bet-strategy bankroll-fraction=0.09 --max-bet 100 --min-bet 5
```

| Strategy | Behavior |
|----------|----------|
| `flat` | Same bet every time (default) |
| `martingale` | Double on loss, reset on win |
| `reverse-martingale` | Double on win, reset on loss |
| `fibonacci` | Fibonacci sequence on losses |
| `dalembert` | +1 unit on loss, -1 on win |
| `bankroll-fraction=<n>` | Bet fraction `n` of remaining bankroll each game; requires `--bankroll`/`--max-loss` or `--stop-loss`, and conflicts with an explicit wager amount |

`bankroll-fraction=<n>` uses remaining bankroll as `--bankroll + session P&L`; when only `--stop-loss` is supplied, the bankroll is derived from `starting balance - stop-loss`. `--max-bet` caps the dynamic wager and `--min-bet` floors it.
When using bankroll-fraction, omit the wager amount and use named game configuration flags such as `--bet RED` or `--cover 50`.

## Stateful Games

`video-poker` is the CLI command for Ape Church's `Gimboz Poker`.

Interactive multi-transaction games with auto-play support:

```bash
# Auto-play
apechurch-cli blackjack 10 --auto --loop
apechurch-cli play blackjack 10 --auto --loop
apechurch-cli cash-dash 10 --auto --cashout-after 1
apechurch-cli play cash-dash 10 --auto --cashout-after 1
apechurch-cli blackjack 25 --side 1 --auto
apechurch-cli cash-dash 10 --solver     # Interactive tile suggestion (best EV)
apechurch-cli hi-lo-nebula 10 --auto winston-ladder
apechurch-cli hi-lo-nebula 10 --solver winston-ladder
apechurch-cli video-poker 10 --auto --loop
apechurch-cli video-poker 10 --solver    # Interactive hold suggestion (best EV)

# Interactive mode
apechurch-cli blackjack 10
apechurch-cli cash-dash 10              # Prompts for the opening tile
```

- `--auto` enables automatic play for stateful games
- stateful games can be routed through `play`, which is the intended surface for personal bot automation
- blackjack follows the live H17 rule surface: the dealer hits soft 17, and auto-play / estimates model that rule
- `blackjack --side <ape>` adds a player side bet to the opening deal without changing the in-hand EV solver
- `blackjack --auto best --solver-max-states <n> --solver-timeout-ms <ms>` controls the exact-EV worker; defaults are `50000` states and `5000` ms, with fallback to simple mode when either guard trips
- `blackjack --auto max` is the same exact-EV worker with larger defaults: `150000` states and `30000` ms
- `blackjack --solver [simple|best|max]` shows manual suggestions; `best` and `max` print both the worker choice and the simple-strategy choice
- `cash-dash` shows the opening row and prompts for the first tile when `--tile` is omitted in manual mode
- `cash-dash --cashout-after <rows>` lets auto-play target deeper rows before cashing out
- `hi-lo-nebula --auto winston-ladder` plays up to two on-chain games with the same initial bet, up to seven guesses each, targeting a 1.5x first-game cashout or a 2.5x total ladder payout before fees
- `hi-lo-nebula --solver [mode]` defaults to `best` and can show manual hints for `simple`, `best`, or `winston-ladder`
- `video-poker --solver` shows the same best-EV hold suggestion in interactive mode
- `video-poker --display full` now uses the boxed ASCII table layout; `simple` keeps the compact text layout
- `blackjack` and `video-poker` use `--delay 5` by default in loop mode
- where loop game estimates are supported, startup prints a pre-loop estimate before asking `Proceed? (Y/n)`; games with a Monte Carlo model show the typical run plus lucky-day / bad-run bounds, while the others keep the EV-based estimate
- use `apechurch-cli help auto` for advanced stateful auto-play modes and pacing controls

## Commands

```bash
# Stateless games
apechurch-cli play --auto                        # Auto-select random stateless game/config
apechurch-cli play [game] [amount] [config...]  # Play a specific stateless game
apechurch-cli games --list                       # Plain play-line catalog

# Stateful games
apechurch-cli play blackjack <amount> [--auto [simple|best|max]] [--solver [simple|best|max]] [--solver-max-states <n>] [--solver-timeout-ms <ms>]
apechurch-cli play cash-dash <amount> [--auto [simple|best]]
apechurch-cli play hi-lo-nebula <amount> [--auto [simple|best|winston-ladder]]
apechurch-cli cash-dash <amount> [--auto [simple|best]]  # Cash Dash (aliases: cashdash, dash)
apechurch-cli hi-lo-nebula <amount> [--auto [simple|best|winston-ladder]]  # Hi-Lo Nebula
apechurch-cli blackjack <amount> [--auto [simple|best|max]] [--solver [simple|best|max]] [--side <ape>] [--solver-max-states <n>] [--solver-timeout-ms <ms>]  # Blackjack (alias: bj)
apechurch-cli video-poker <amount> [--auto]     # Video Poker / Gimboz Poker (alias: vp)

# Shared helpers
apechurch-cli status                            # Check balance
apechurch-cli wallet --list                     # List locally available wallet addresses
apechurch-cli wallet download [address]         # Download supported on-chain history into local cache
apechurch-cli bot [name] [args...]             # Run a personal local bot or list discovered bots
apechurch-cli games                             # List all games
apechurch-cli game <name>                       # Game details
apechurch-cli pause                             # Stop autonomous play
apechurch-cli continue                          # Continue play
apechurch-cli history --list                    # List wallets with local cached history files
apechurch-cli history [address] [--stats] [--breakdown] [--leaderboard] [--scoreboard] [--ids] [--url] [--refresh]  # Read cached history and reporting
apechurch-cli scoreboard [address] [--ids] [--url]     # Read cached leaderboard tables
apechurch-cli commands                          # Full reference
```

Use `apechurch-cli games` or `apechurch-cli game <name>` to see the current alias set in the terminal.

## For AI Agents

All commands support `--json` for machine-readable output:

```bash
apechurch-cli status --json
apechurch-cli play --auto --json
apechurch-cli play --loop --json
apechurch-cli wallet download 0x1234...abcd --json
apechurch-cli history 0x1234...abcd --breakdown --json
apechurch-cli scoreboard 0x1234...abcd --json
```

Use `--color` to force ANSI color in plain output when piping or redirecting. JSON output remains uncolored.

See [SKILL.md](./SKILL.md) for complete agent documentation.
Maintainer and deep-dive docs live under `docs/README.md` in the repo.

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
