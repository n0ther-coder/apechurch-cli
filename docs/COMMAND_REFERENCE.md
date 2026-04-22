# Command Reference

> Summary: Current Ape Church CLI command surface. Lists every top-level command, subaction, parser-visible option, and supported alias with generic BNF for the accepted syntax.

This file is the canonical command reference for the repo. `apechurch-cli commands` remains a compact terminal index; use this file when you need the full command surface, exact option names, or the shared BNF tokens accepted by the parser.

For per-game argument grammar such as roulette bets, baccarat combined bets, and `--numbers` payloads, see [GAMES_REFERENCE.md](./GAMES_REFERENCE.md). For deeper mechanics and ABI-backed behavior notes, see `docs/verification/`.

## Conventions

- The binary name is `apechurch-cli`.
- Options are order-insensitive in practice. The BNF groups them for readability, not to force a left-to-right order.
- `--json` is documented only on commands that actually register it.
- `--gp-ape <points>` is a per-run local override.
- `profile set --gp-ape <points>` persists a wallet-specific current local override.
- When a report includes on-chain GP for a settled game, that on-chain value overrides any locally estimated GP.

## Top-Level Commands

| Command | Aliases | Purpose |
|---------|---------|---------|
| `install` | - | Install or reinstall the local encrypted wallet bundle |
| `uninstall` | - | Remove local CLI data |
| `wallet [action] [address]` | - | Wallet management, local wallet listing, and history download |
| `status` | - | Show current wallet, balance, local state, and game stats |
| `pause` | - | Pause autonomous play |
| `continue` | - | Resume autonomous play |
| `register` | - | Register or update the username/persona |
| `profile <action>` | - | Show or update local profile preferences |
| `bet` | - | Place one manual simple-game wager |
| `play` | - | Play a selected simple game, or opt into random selection with `--auto` |
| `contest [action]` | - | Contest info and registration |
| `history [address]` | - | Read, refresh, or list cached per-wallet history |
| `scoreboard [address]` | - | Read cached per-wallet leaderboards derived from history |
| `games` | - | List supported games |
| `game <name>` | - | Show metadata and grammar for one game |
| `commands` | - | Show the compact terminal command index |
| `help [topic]` | - | Show detailed topic help |
| `send <asset> <amount> <destination>` | - | Send `APE` or `GP` |
| `house [action] [amount]` | - | Show, deposit into, or withdraw from The House |
| `blackjack [action] [amount]` | `bj` | Interactive/stateful blackjack |
| `hi-lo-nebula [action] [amount]` | `hilonebula`, `hilo` | Interactive/stateful Hi-Lo Nebula |
| `video-poker [action] [amount]` | `vp` | Interactive/stateful video poker |

## Shared Grammar

```bnf
<address> ::= "0x" <hex40>
<number> ::= ...                                  ; decimal number token accepted by the CLI
<integer> ::= ...                                 ; base-10 integer token accepted by the CLI
<token> ::= ...                                   ; one shell token
<ape> ::= <number>                                ; decimal APE amount; value > 0
<ape-nonnegative> ::= <number>                    ; decimal APE amount; value >= 0
<points> ::= <number>                             ; decimal GP per APE rate; value > 0
<block> ::= <integer>                             ; value >= 0
<count> ::= <integer>                             ; value > 0
<seconds> ::= <number>                            ; value > 0 in loop/card pacing options
<username> ::= <token>                            ; normalized username; letters, numbers, underscores; max 32 chars
<persona> ::= "conservative" | "balanced" | "aggressive" | "degen"
<card-display> ::= "full" | "simple" | "json"
<display> ::= "full" | "simple" | "json"
<bet-strategy> ::= "flat" | "martingale" | "reverse-martingale" | "fibonacci" | "dalembert"
<help-topic> ::= "loop" | "strategies" | "auto" | "wallet" | "history" | "house"
<asset> ::= "APE" | "GP"
<game-id> ::= <token>                             ; local unfinished-game identifier
<range> ::= <integer> | <target-range> | <target-range> "," <target-range>
                                                ; ApeStrong uses 5..95, Gimboz Smash uses one or two inclusive target ranges on 1..100
<target-range> ::= <integer> [ "-" <integer> ]    ; each endpoint is within 1..100, each range is inclusive, total covered numbers across all ranges is within 1..95
<out-range> ::= <target-range>                    ; one excluded inclusive range for Gimboz Smash outside bets; excluded coverage is within 5..95
<simple-game-key> ::= "ape-strong"
                    | "roulette"
                    | "baccarat"
                    | "jungle-plinko"
                    | "cosmic-plinko"
                    | "gimboz-smash"
                    | "keno"
                    | "speed-keno"
                    | "dino-dough"
                    | "bubblegum-heist"
                    | "geez-diggerz"
                    | "monkey-match"
                    | "bear-dice"
                    | "primes"
                    | "sushi-showdown"
<simple-game-alias> ::= "apestrong"
                      | "strong"
                      | "jungleplinko"
                      | "jungle"
                      | "cosmic"
                      | "gimbozsmash"
                      | "smash"
                      | "speedkeno"
                      | "skeno"
                      | "dinodough"
                      | "dino"
                      | "bubblegumheist"
                      | "bubblegum"
                      | "heist"
                      | "geezdiggerz"
                      | "geez"
                      | "monkeymatch"
                      | "monkey"
                      | "bear"
                      | "dice"
                      | "sushishowdown"
                      | "sushi"
<simple-game> ::= <simple-game-key> | <simple-game-alias>
<game-name> ::= <simple-game>
              | "blackjack"
              | "bj"
              | "hi-lo-nebula"
              | "hilonebula"
              | "hilo"
              | "video-poker"
              | "vp"
<video-poker-bet> ::= "1" | "5" | "10" | "25" | "50" | "100"
<auto-mode> ::= "simple" | "best"
```

## Game Aliases

| Canonical | Supported Aliases |
|-----------|-------------------|
| `ape-strong` | `apestrong`, `strong` |
| `bear-dice` | `bear`, `dice` |
| `bubblegum-heist` | `bubblegumheist`, `bubblegum`, `heist` |
| `cosmic-plinko` | `cosmic` |
| `dino-dough` | `dinodough`, `dino` |
| `geez-diggerz` | `geezdiggerz`, `geez` |
| `gimboz-smash` | `gimbozsmash`, `smash` |
| `jungle-plinko` | `jungleplinko`, `jungle` |
| `monkey-match` | `monkeymatch`, `monkey` |
| `speed-keno` | `speedkeno`, `skeno` |
| `sushi-showdown` | `sushishowdown`, `sushi` |
| `blackjack` | `bj` |
| `hi-lo-nebula` | `hilonebula`, `hilo` |
| `video-poker` | `vp` |

## Setup And Wallet

### `install`

```bnf
<install-command> ::= "install" <install-option>*
<install-option> ::= "--username" <username>
                   | "--persona" <persona>
                   | "-y"
                   | "--quick"
```

| Option | Meaning |
|--------|---------|
| `--username <name>` | Set the initial username |
| `--persona <name>` | Set the initial persona |
| `-y`, `--quick` | Skip optional interactive prompts and use defaults |

### `uninstall`

```bnf
<uninstall-command> ::= "uninstall" [ "-y" | "--yes" ]
```

| Option | Meaning |
|--------|---------|
| `-y`, `--yes` | Skip the confirmation prompt |

### `wallet [action] [address]`

```bnf
<wallet-command> ::= "wallet" [ <wallet-action> [ <address> ] ] <wallet-option>*
<wallet-action> ::= "status"
                  | "new"
                  | "select"
                  | "download"
                  | "new-password"
                  | "hints"
                  | "reset"
<wallet-option> ::= "-y"
                  | "--yes"
                  | "--list"
                  | "--json"
                  | "--from-block" <block>
                  | "--to-block" <block>
                  | "--chunk-size" <count>
```

`[address]` is used by `wallet select [address]` and `wallet download [address]`.

| Option | Meaning | Applies To |
|--------|---------|------------|
| `-y`, `--yes` | Skip confirmation prompts | mainly `reset` |
| `--list` | List locally available wallet addresses | command-level |
| `--json` | Emit JSON output | `status`, `download`, `select`, `new`, `new-password` |
| `--from-block <n>` | Start block for history download/backfill | `download` |
| `--to-block <n>` | End block for history download | `download` |
| `--chunk-size <n>` | Block span per log query | `download` |

## Profile And Identity

### `status`

```bnf
<status-command> ::= "status" [ "--json" ]
```

### `pause`

```bnf
<pause-command> ::= "pause"
```

### `continue`

```bnf
<continue-command> ::= "continue"
```

### `register`

```bnf
<register-command> ::= "register" <register-option>*
<register-option> ::= "--username" <username>
                    | "--persona" <persona>
```

| Option | Meaning |
|--------|---------|
| `--username <name>` | New username |
| `--persona <name>` | New persona |

### `profile [action]`

```bnf
<profile-command> ::= "profile" [ <profile-action> ] <profile-option>*
<profile-action> ::= "show" | "set"
<profile-option> ::= "--username" <username>
                   | "--persona" <persona>
                   | "--referral" <address>
                   | "--card-display" <card-display>
                   | "--gp-ape" <points>
                   | "--no-gp-ape"
                   | "--json"
```

| Option | Meaning | Applies To |
|--------|---------|------------|
| `--username <name>` | Register or change the username for the selected wallet | `set` |
| `--persona <name>` | Update the local persona | `set` |
| `--referral <address>` | Update the local referral address used on future game transactions | `set` |
| `--card-display <mode>` | Set card display mode | `set` |
| `--gp-ape <points>` | Persist a wallet-specific current GP/APE override | `set` |
| `--no-gp-ape` | Remove the wallet-specific current GP/APE override | `set` |
| `--json` | Emit JSON output | `show`, `set`, omitted action |

Examples:

- `apechurch-cli profile`
- `apechurch-cli profile show`
- `apechurch-cli profile set --username smith`
- `apechurch-cli profile set --persona aggressive`
- `apechurch-cli profile set --card-display simple --referral 0x1234...abcd`
- `apechurch-cli profile set --gp-ape 7.5`
- `apechurch-cli profile set --no-gp-ape`

Notes:

- Mutating flags require the explicit `profile set` action.
- `--referral` is local-only. It is attached to future game transactions, not to SIWE username registration, and it does not affect past plays.

## Simple-Game Gameplay

### `bet`

```bnf
<bet-command> ::= "bet"
                  "--game" <simple-game>
                  "--amount" <ape>
                  <bet-option>*
<bet-option> ::= "--risk" <token>
               | "--balls" <integer>
               | "--spins" <integer>
               | "--bet" <token>
               | "--range" <range>
               | "--out-range" <out-range>
               | "--picks" <integer>
               | "--numbers" <token>
               | "--games" <count>
               | "--runs" <count>
               | "--rolls" <count>
               | "--timeout" <integer>
               | "--gp-ape" <points>
```

| Option | Meaning |
|--------|---------|
| `--game <type>` | Simple-game key |
| `--amount <ape>` | Wager amount |
| `--risk <risk>` | Public risk level for Bear-A-Dice, Blocks, Plinko, Monkey Match, or Primes |
| `--balls <balls>` | Plinko ball count |
| `--spins <spins>` | Slot spin count |
| `--bet <bet>` | Roulette or baccarat bet payload |
| `--range <range>` | ApeStrong range, or Gimboz Smash one-or-two target intervals |
| `--out-range <range>` | Gimboz Smash outside bet expressed as one excluded range |
| `--picks <picks>` | Keno pick count |
| `--numbers <numbers>` | Keno numbers as one token, for example `1,7,13,25,40` or `random` |
| `--games <games>` | Speed Keno batch count |
| `--runs <runs>` | Primes or Blocks run count |
| `--rolls <rolls>` | Bear-A-Dice roll count |
| `--timeout <ms>` | Wait time for a result; `0` means no wait limit |
| `--gp-ape <points>` | Override local GP estimation for this run |

### `play`

```bnf
<play-command> ::= "play" [ <play-positional> ] <play-option>*
<play-positional> ::= <simple-game> [ <ape> <token>* ]
<play-option> ::= "--auto"
                | "--game" <simple-game>
                | "--amount" <ape>
                | "--risk" <token>
                | "--balls" <integer>
                | "--spins" <integer>
                | "--bet" <token>
                | "--range" <range>
                | "--out-range" <out-range>
                | "--picks" <integer>
                | "--numbers" <token>
                | "--games" <count>
                | "--runs" <count>
                | "--rolls" <count>
                | "--strategy" <persona>
                | "--loop"
                | "--delay" <seconds>
                | "--max-games" <count>
                | "--take-profit" <ape>
                | "--target-x" <number>
                | "--target-profit" <ape>
                | "--retrace" <ape>
                | "--recover-loss" <ape>
                | "--giveback-profit" <ape>
                | "--stop-loss" <ape-nonnegative>
                | "--bet-strategy" <bet-strategy>
                | "--max-bet" <ape>
                | "--gp-ape" <points>
                | "-v"
                | "--verbose"
                | "--json"
```

The positional tail after `<ape>` is game-specific. See [GAMES_REFERENCE.md](./GAMES_REFERENCE.md) or `apechurch-cli game <name>` for the exact grammar per simple game.

Bare `apechurch-cli play` no longer auto-runs a random game. Use `apechurch-cli play --auto` for the old automatic random-selection behavior, or pass an explicit game/amount.

| Option | Meaning |
|--------|---------|
| `--auto` | Opt into automatic random game/config selection when no game is specified |
| `--game <name>` | Simple-game key |
| `--amount <ape>` | Wager amount |
| `--risk <risk>` | Public risk level for Bear-A-Dice, Blocks, Plinko, Monkey Match, or Primes |
| `--balls <balls>` | Plinko ball count |
| `--spins <spins>` | Slot spin count |
| `--bet <bet>` | Roulette or baccarat bet payload |
| `--range <range>` | ApeStrong range, or Gimboz Smash one-or-two target intervals |
| `--out-range <range>` | Gimboz Smash outside bet expressed as one excluded range |
| `--picks <picks>` | Keno pick count |
| `--numbers <numbers>` | Keno numbers as one token |
| `--games <games>` | Speed Keno batch count |
| `--runs <runs>` | Primes or Blocks run count |
| `--rolls <rolls>` | Bear-A-Dice roll count |
| `--strategy <name>` | Persona used when the CLI chooses a game/config |
| `--loop` | Keep playing until a stop condition is hit |
| `--delay <seconds>` | Delay between looped games |
| `--max-games <count>` | Stop loop after N games |
| `--take-profit <ape>` | Stop loop when balance reaches the target |
| `--target-x <x>` | Stop loop when one game pays at least the target multiplier |
| `--target-profit <ape>` | Stop loop when one game pays at least the target payout |
| `--retrace <ape>` | Stop loop when one game loses at least this amount |
| `--recover-loss <ape>` | Stop loop when session P&L returns to break-even/profit after a drawdown of at least this size |
| `--giveback-profit <ape>` | Stop loop when session P&L returns to break-even/loss after a run-up of at least this size |
| `--stop-loss <ape>` | Stop loop when balance drops to the threshold |
| `--bet-strategy <name>` | Loop bet progression |
| `--max-bet <ape>` | Loop safety cap for progressive strategies |
| `--gp-ape <points>` | Override local GP estimation for this run |
| `-v`, `--verbose` | Show technical logs |
| `--json` | Emit JSON output only |

### GP Rate Controls

```bnf
<gp-rate-override> ::= "--gp-ape" <points>
<gp-rate-current-set> ::= "profile" "set" "--gp-ape" <points>
<gp-rate-current-clear> ::= "profile" "set" "--no-gp-ape"
```

- Base local rate: `5 GP/APE`
- Per-run override: `bet`, `play`, `blackjack`, `hi-lo-nebula`, `video-poker`
- Wallet-specific current override: `profile set --gp-ape <points>`
- Wallet-specific reset to base default: `profile set --no-gp-ape`
- On-chain GP precedence: when a settled game includes on-chain GP, reports use that value instead of a local estimate

## History, Catalog, And Help

### `contest [action]`

```bnf
<contest-command> ::= "contest" [ "register" ] [ "--json" ]
```

### `history [address]`

```bnf
<history-command> ::= "history" [ <address> ] <history-option>*
<history-option> ::= "--list"
                   | "--limit" <count>
                   | "--all"
                   | "--ids"
                   | "--stats"
                   | "--breakdown" [ <token> ]
                   | "--scoreboard"
                   | "--url"
                   | "--refresh"
                   | "--from-block" <block>
                   | "--to-block" <block>
                   | "--chunk-size" <count>
                   | "--json"
```

| Option | Meaning |
|--------|---------|
| `--list` | Show wallet addresses with local cached history files |
| `--limit <n>` | Show at most N recent cached games |
| `--all` | Show the full cached history instead of the recent slice |
| `--ids` | Append local game IDs in the terminal renderer |
| `--stats` | Show stats only |
| `--breakdown [game]` | Show per-game stats, optionally filtered to one game |
| `--scoreboard` | Append the cached Highest Multipliers and Biggest Payouts tables |
| `--url` | Show game URLs in terminal scoreboard tables |
| `--refresh` | Download/refresh the history before rendering |
| `--from-block <n>` | Start block for `--refresh` |
| `--to-block <n>` | End block for `--refresh` |
| `--chunk-size <n>` | Block span per log query during refresh |
| `--json` | Emit JSON output |

`--url` only affects terminal scoreboard tables. JSON output keeps the `game_url` field.

### `scoreboard [address]`

```bnf
<scoreboard-command> ::= "scoreboard" [ <address> ] <scoreboard-option>*
<scoreboard-option> ::= "--list"
                      | "--url"
                      | "--refresh"
                      | "--from-block" <block>
                      | "--to-block" <block>
                      | "--chunk-size" <count>
                      | "--json"
```

| Option | Meaning |
|--------|---------|
| `--list` | Show wallet addresses with local cached scoreboards or history |
| `--url` | Show game URLs in terminal scoreboard tables |
| `--refresh` | Download/refresh the history before rebuilding the scoreboard |
| `--from-block <n>` | Start block for `--refresh` |
| `--to-block <n>` | End block for `--refresh` |
| `--chunk-size <n>` | Block span per log query during refresh |
| `--json` | Emit JSON output |

This command renders the same two cached Top 20 leaderboards used by `history --scoreboard`:

- `Highest Multipliers`: descending by total realized payout multiplier
- `Biggest Payouts`: descending by total realized payout

URLs stay hidden in terminal tables unless `--url` is passed. JSON output keeps `game_url`.

### `games`

```bnf
<games-command> ::= "games" <games-option>*
<games-option> ::= "--stats" | "--json"
```

### `game <name>`

```bnf
<game-command> ::= "game" <game-name> [ "--json" ]
```

`<name>` accepts supported canonical game keys and the alias set listed in [Game Aliases](#game-aliases).

### `commands`

```bnf
<commands-command> ::= "commands"
```

This command is intentionally compact in the terminal. The canonical reference set is this file plus [GAMES_REFERENCE.md](./GAMES_REFERENCE.md), with `docs/verification/` holding the deep per-game mechanics notes.

### `help [topic]`

```bnf
<help-command> ::= "help" [ <help-topic> ] [ "--json" ]
```

## Transfers And House

### `send <asset> <amount> <destination>`

```bnf
<send-command> ::= "send" <asset> <token> <address> [ "--json" ]
```

`APE` amounts are decimal APE. `GP` amounts must be whole-number tokens because the token uses `0` decimals. `wAPE` is not a transferable asset in this CLI.

### `house [action] [amount]`

```bnf
<house-command> ::= "house" [ <house-action> [ <ape> ] ] [ "--json" ]
<house-action> ::= "status" | "info" | "deposit" | "withdraw"
```

If no action is supplied, `house` shows status.

The status view's `house_yield` field is the current HOUSE price multiplier `since launch`, not an annualized APY. For The House mechanics plus the repo's planning-grade APY model and sensitivity bounds, see [HOUSE_REFERENCE.md](./HOUSE_REFERENCE.md).

## Stateful Card Games

### `blackjack [action] [amount]`

Alias: `bj`

```bnf
<blackjack-command> ::= ( "blackjack" | "bj" ) [ <blackjack-head> ] [ <ape> ] <blackjack-option>*
<blackjack-head> ::= <ape>
                   | "resume"
                   | "status"
                   | "hit"
                   | "stand"
                   | "double"
                   | "split"
                   | "insurance"
                   | "surrender"
                   | "clear"
<blackjack-option> ::= "--game" <game-id>
                     | "--display" <display>
                     | "--json"
                     | "-v"
                     | "--verbose"
                     | "--auto" [ <auto-mode> ]
                     | "--side" <ape-nonnegative>
                     | "--delay" <seconds>
                     | "--human"
                     | "--loop"
                     | "--max-games" <count>
                     | "--take-profit" <ape>
                     | "--target-x" <number>
                     | "--target-profit" <ape>
                     | "--retrace" <ape>
                     | "--recover-loss" <ape>
                     | "--giveback-profit" <ape>
                     | "--stop-loss" <ape-nonnegative>
                     | "--bet-strategy" <bet-strategy>
                     | "--max-bet" <ape>
                     | "--gp-ape" <points>
```

If the first positional token is numeric, the command starts a new hand with that amount. `--human` is a supported advanced option but intentionally hidden from standard `--help`.

### `hi-lo-nebula [action] [amount]`

Aliases: `hilonebula`, `hilo`

```bnf
<hi-lo-nebula-command> ::= ( "hi-lo-nebula" | "hilonebula" | "hilo" ) [ <hi-lo-nebula-head> ] [ <ape> ] <hi-lo-nebula-option>*
<hi-lo-nebula-head> ::= <ape>
                       | "resume"
                       | "status"
                       | "payouts"
                       | "table"
                       | "clear"
                       | "higher"
                       | "high"
                       | "h"
                       | "lower"
                       | "low"
                       | "l"
                       | "same"
                       | "push"
                       | "s"
                       | "cashout"
                       | "cash"
                       | "c"
<hi-lo-nebula-option> ::= "--game" <game-id>
                        | "--display" <display>
                        | "--json"
                        | "-v"
                        | "--verbose"
                        | "--auto" [ <auto-mode> ]
                        | "--solver"
                        | "--delay" <seconds>
                        | "--human"
                        | "--loop"
                        | "--max-games" <count>
                        | "--take-profit" <ape>
                        | "--target-x" <number>
                        | "--target-profit" <ape>
                        | "--retrace" <ape>
                        | "--recover-loss" <ape>
                        | "--giveback-profit" <ape>
                        | "--stop-loss" <ape-nonnegative>
                        | "--bet-strategy" <bet-strategy>
                        | "--max-bet" <ape>
                        | "--gp-ape" <points>
```

If the first positional token is numeric, the command starts a new run. `--solver` shows the manual `Suggested action` line using the same `best` engine. `--auto best` is a VRF-aware net-EV continuation solver over the verified rank-only branch table, using the live jackpot snapshot as the terminal bonus reference. `--human` is supported but hidden from standard `--help`.

### `video-poker [action] [amount]`

Alias: `vp`

```bnf
<video-poker-command> ::= ( "video-poker" | "vp" ) [ <video-poker-head> ] [ <video-poker-bet> ] <video-poker-option>*
<video-poker-head> ::= <video-poker-bet>
                     | "resume"
                     | "status"
                     | "payouts"
                     | "table"
                     | "clear"
<video-poker-option> ::= "--game" <game-id>
                       | "--display" <display>
                       | "--json"
                       | "-v"
                       | "--verbose"
                       | "--auto" [ <auto-mode> ]
                       | "--solver"
                       | "--delay" <seconds>
                       | "--human"
                       | "--loop"
                       | "--max-games" <count>
                       | "--take-profit" <ape>
                       | "--target-x" <number>
                       | "--target-profit" <ape>
                       | "--retrace" <ape>
                       | "--recover-loss" <ape>
                       | "--giveback-profit" <ape>
                       | "--stop-loss" <ape-nonnegative>
                       | "--bet-strategy" <bet-strategy>
                       | "--max-bet" <ape>
                       | "--gp-ape" <points>
```

If the first positional token is numeric, the command starts a new hand. Valid opening wagers are fixed to `1`, `5`, `10`, `25`, `50`, or `100` APE. `--human` is supported but hidden from standard `--help`.
