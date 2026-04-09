# @n0ther/apechurch-cli

> Summary: Hardened, fully AI agents playable Ape Church fork for GitHub and npm readers. Highlights encrypted-only wallet handling, stronger auto gameplay, expanded game support, on-chain history reporting, and operator-focused CLI tooling.

Encrypted-only, fully AI agents playable gambling CLI for [Ape Church](https://ape.church) on ApeChain.

Private keys stay local, are stored on disk only in encrypted form in this hardened build, and are never sent by the CLI to Ape Church services in plaintext. The fork also expands game coverage, improves auto gameplay for stateful card games, and adds deeper on-chain reporting and machine-friendly flows for AI agents and terminal-first users.

## Features

### Supported Games

- **14 supported games:** `ApeStrong`, `Roulette ✔︎`, `Baccarat`, `Jungle Plinko ✔︎`, `Cosmic Plinko ✔︎`, `Keno ✔︎`, `Speed Keno ✔︎`, `Dino Dough`, `Bubblegum Heist`, `Monkey Match ✔︎`, `Bear-A-Dice`, `Primes ✔︎`, `Blackjack`, and `Video Poker ✔︎ / Gimboz Poker`
- **Fully AI agents playable:** browserless CLI flows, local signing, JSON output, formal command grammar, and self-describing game metadata make it straightforward for coding agents and automations to use directly
- **Improved auto gameplay:** `Blackjack` and `Video Poker ✔︎ / Gimboz Poker` include interactive flows, better auto-play, solver-backed decisions, and loop-friendly automation controls
- **Fully on-chain settlement:** every wager is placed on ApeChain and resolved by the live contracts with their on-chain RNG integrations, including Chainlink VRF and Pyth V2 where applicable

### What This Fork Adds

- **Encrypted-only local signer:** private keys stay encrypted on disk, plaintext wallet export is disabled, and signing happens locally without transmitting the key to Ape Church services
- **AI-agent-first operator UX:** fully AI agents playable command surface with structured outputs, stable aliases, local history caches, and no browser dependency
- **Better stateful automation:** stronger blackjack and video-poker auto gameplay, side-bet support, unfinished-game recovery, and EV / Monte Carlo helpers for loop planning
- **Expanded Ape Church coverage:** explicit support for both `jungle` and `cosmic` Plinko instead of a single generic Plinko entry, plus supported `Primes ✔︎` gameplay and a broader maintained game registry
- **ABI-verified game metadata:** verified contracts are marked with `✔︎` in CLI output, help, JSON payloads, and docs; Roulette ✔︎, Jungle Plinko ✔︎, Cosmic Plinko ✔︎, Keno ✔︎, Speed Keno ✔︎, Monkey Match ✔︎, Primes ✔︎, and Video Poker ✔︎ use verified on-chain contract data
- **RTP and payout modeling overhaul:** expected RTP, reported RTP, current RTP, and max-payout references across the game catalog, with exact/formula/statistical provenance markers where available
- **Exact Plinko modeling:** Jungle and Cosmic Plinko mode RTP and top payouts are derived from the live on-chain bucket tables, and Plinko stats are grouped by risk level rather than by ball count
- **Per-wallet history cache:** `wallet download` reconstructs supported on-chain history into a local cache, with incremental backfills and offline `history` reads
- **Richer reporting:** `Recent Games`, compact `Game Status`, and full `Game Stats` views show net profit, win rate, RTP, unfinished local games, and per-game breakdowns
- **Better automation tooling:** loop mode supports `target`, `stop-loss`, `max-games`, machine-readable JSON output, and strategy-driven game/config selection
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

If `~/.apechurch-cli/wallet.json` already exists, `apechurch-cli install` reuses the encrypted wallet and does not ask for the private key again.

## Environment Variables

- `APECHURCH_CLI_PK`: optional fallback for non-interactive fresh install/reinstall
- `APECHURCH_CLI_PASS`: required for non-interactive install/signing; optional otherwise
- `APECHURCH_CLI_PROFILE_URL`: optional override for the username/profile API endpoint

## Reference Docs

- Full CLI command, option, alias, and shared BNF reference: [docs/COMMAND_REFERENCE.md](./docs/COMMAND_REFERENCE.md)
- Per-game syntax and game-specific grammar: [docs/GAMES_REFERENCE.md](./docs/GAMES_REFERENCE.md)

## Profile

`profile show` prints the local profile for the selected wallet. `profile set` updates one or more local fields in place.

```bash
# Show the selected wallet profile
apechurch-cli profile show

# Set persona and card rendering
apechurch-cli profile set --persona aggressive --card-display simple

# Set or clear the wallet-specific current GP/APE rate
apechurch-cli profile set --gp-ape 7.5
apechurch-cli profile set --no-gp-ape
```

`profile set` values:

- `--persona <name>`: `conservative | balanced | aggressive | degen`
- `--card-display <mode>`: `full | simple | json`
- `--referral <address>`: `0x`-prefixed wallet address
- `--gp-ape <points>`: positive decimal GP/APE override for the selected wallet
- `--no-gp-ape`: clear the wallet-specific GP/APE override and fall back to the base default

## History Download & Reporting

Use `wallet download` to reconstruct supported gaming history from ApeChain into a per-wallet local file, then read that cache with `history` without rebuilding the chain view every time.

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

# Refresh from chain before showing
apechurch-cli history 0x1234...abcd --refresh

# Full backfill before showing
apechurch-cli history 0x1234...abcd --refresh --from-block 0

# Machine-readable output
apechurch-cli history 0x1234...abcd --json
```

Sync and cache behavior:

- `wallet download` is incremental by default. Without `--from-block`, it resumes from `last_synced_block + 1`.
- Use `--from-block 0` for a full backfill, or pass an explicit historical range to fill older blocks.
- Explicit backfills are merged into the local file and deduplicated by `contract + gameId`.
- `history --refresh` runs the same on-chain sync path as `wallet download` before reading the local file.
- `history` shows `👀 Recent Games` plus `📜 History Stats` by default. `--stats` suppresses the game list, while `--breakdown` appends the same stats split by game.
- Standard `history` output also includes a compact `🎮 Game Status` section with per-game `played`, `net`, `win rate`, `RTP`, and local `unfinished` counts when available.

Text output includes:

- `🎰 Games`: economically synced games included in totals
- `💸 Contract fees paid`: contract-side fees actually paid by the wallet
- `⛽️ Gas paid`: network gas actually paid by the wallet
- `Net result`: `payout - wager - contract fees - gas`
- `✌️ Win rate`: wins divided by economically synced games
- `🎲 RTP`: `total payout / total wagered`
- `🎟️  APE Wagered (wAPE)`: current on-chain balance / total wAPE received from synced games
- `🧮 Gimbo Points (GP)`: current on-chain balance / total GP received from synced games; every `10,000 GP` equals `1 Level`

`wallet download` options:

| Option | Description |
|--------|-------------|
| `--list` | List locally available wallet addresses |
| `--from-block <n>` | Start block for the sync or explicit backfill |
| `--to-block <n>` | End block for the sync (default: latest block) |
| `--chunk-size <n>` | Block span per log query (default: `50000`) |
| `--json` | Emit the machine-readable download report |

`history` options:

| Option | Description |
|--------|-------------|
| `--list` | Show wallet addresses with local cached history files |
| `--limit <n>` | Number of recent cached games to show (default: `10`) |
| `--all` | Show all cached games instead of the recent slice |
| `--stats` | Show only history stats |
| `--breakdown` | Append the same stats split by game |
| `--refresh` | Run `wallet download` before rendering |
| `--from-block <n>` | Start block for `--refresh` |
| `--to-block <n>` | End block for `--refresh` (default: latest block) |
| `--chunk-size <n>` | Block span per log query for `--refresh` |
| `--json` | Emit the machine-readable cached report |

`games` options:

| Option | Description |
|--------|-------------|
| `--stats` | Append the full `Game Stats` catalog after the game summary, using local history when available |
| `--json` | Emit the game registry as JSON |

Coverage and limits:

- Downloaded histories live under `~/.apechurch-cli/history/<wallet>_history.json`.
- Economic totals only include games whose wager, payout, fees, gas, GP, and wAPE can be reconstructed exactly from on-chain data.
- The downloader enumerates supported single-transaction games in the local registry via indexed `GameEnded(user, ...)` logs.
- `Blackjack` and `Video Poker` (`Gimboz Poker` in Ape Church naming) cannot yet be generically enumerated from raw RPC, so locally-known entries remain minimal until a reliable fetch path is implemented.
- Sponsored transactions contribute `0` contract fees and `0` gas for the analyzed wallet.

## Games

| Game | Command | Description |
|------|---------|-------------|
| ApeStrong | `play ape-strong 10 50` | Pick-your-odds dice |
| Roulette ✔︎ | `play roulette 10 RED` | American roulette |
| Baccarat | `play baccarat 10 BANKER` | Classic baccarat |
| Jungle Plinko ✔︎ | `play jungle 10 2 50` | Drop balls for multipliers |
| Cosmic Plinko ✔︎ | `play cosmic 10 1 10` | Asymmetric plinko with higher top-end payouts |
| Keno ✔︎ | `play keno 10` | Pick numbers 1-40 |
| Speed Keno ✔︎ | `play speed-keno 10` | Fast batched keno |
| Dino Dough | `play dino-dough 10 10` | Slot machine |
| Bubblegum Heist | `play bubblegum-heist 10 10` | Slot machine |
| Monkey Match ✔︎ | `play monkey-match 10` | Poker hands from barrels |
| Bear-A-Dice | `play bear-dice 10` | Avoid unlucky numbers |
| Primes ✔︎ | `play primes 10 0 20` | Prime-or-zero number draws with batched runs |
| Blackjack | `blackjack 25 --side 1 --auto` | Card game with auto-play and optional player side bet |
| Video Poker ✔︎ / Gimboz Poker | `video-poker 10 --auto` | Jacks or Better with auto-play and solver tools |

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
| `--gp-ape <points>` | Override the loop points conversion for this run |

Loop summaries now assume a base rate of `5 GP/APE`. Use `--gp-ape <points>` for a one-off override, or persist a wallet-specific current rate with `apechurch-cli profile set --gp-ape <points>`.

## GP Rate Controls

Local loop summaries and local-only GP estimates use a base rate of `5 GP/APE`.

- One-off override for a single run: `--gp-ape <points>` on `bet`, `play`, `blackjack`, and `video-poker`
- Wallet-specific current override: `apechurch-cli profile set --gp-ape <points>`
- Clear the wallet-specific current override: `apechurch-cli profile set --no-gp-ape`

When on-chain GP is available for a settled game, reporting uses that on-chain value instead of any local estimate.

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

`blackjack` is also available through the alias `bj`.
`video-poker` is the CLI command for Ape Church's `Gimboz Poker`.

Interactive card games with auto-play support:

```bash
# Auto-play
apechurch-cli blackjack 10 --auto --loop
apechurch-cli blackjack 25 --side 1 --auto
apechurch-cli bj 10 --auto --loop          # Using alias
apechurch-cli video-poker 10 --auto --loop
apechurch-cli video-poker 10 --solver    # Interactive hold suggestion (best EV)

# Interactive mode
apechurch-cli blackjack 10
```

- `--auto` enables automatic play for stateful card games
- `blackjack --side <ape>` adds a player side bet to the opening deal without changing the in-hand EV solver
- `blackjack` is also available through the alias `bj`
- `video-poker` is also available through the alias `gimboz-poker`
- `video-poker --solver` shows the same best-EV hold suggestion in interactive mode
- `video-poker --display full` now uses the boxed ASCII table layout; `simple` keeps the compact text layout
- `blackjack` and `video-poker` use `--delay 5` by default in loop mode
- where loop game estimates are supported, startup prints a pre-loop estimate before asking `Proceed? (Y/n)`; games with a Monte Carlo model show the typical run plus lucky-day / bad-run bounds, while the others keep the EV-based estimate
- use `apechurch-cli help auto` for advanced stateful auto-play modes and pacing controls

## Commands

```bash
apechurch-cli play --auto                        # Auto-select random game/config
apechurch-cli play [game] [amount] [config...]  # Play a specific simple game
apechurch-cli blackjack|bj <amount> [--auto] [--side <ape>]  # Blackjack
apechurch-cli video-poker <amount> [--auto]     # Video Poker / Gimboz Poker
apechurch-cli status                            # Check balance
apechurch-cli wallet --list                     # List locally available wallet addresses
apechurch-cli wallet download [address]         # Download supported on-chain history into local cache
apechurch-cli games                             # List all games
apechurch-cli game <name>                       # Game details
apechurch-cli pause                             # Stop autonomous play
apechurch-cli continue                          # Continue play
apechurch-cli history --list                    # List wallets with local cached history files
apechurch-cli history [address] [--stats] [--breakdown] [--refresh]  # Read cached history and reporting
apechurch-cli commands                          # Full reference
```

## For AI Agents

All commands support `--json` for machine-readable output:

```bash
apechurch-cli status --json
apechurch-cli play --auto --json
apechurch-cli play --loop --json
apechurch-cli wallet download 0x1234...abcd --json
apechurch-cli history 0x1234...abcd --breakdown --json
```

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
