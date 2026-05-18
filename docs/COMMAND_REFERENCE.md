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

## Environment Variables

| Variable | Default | Scope |
|----------|---------|-------|
| `APECHURCH_CLI_CONFIG_DIR` | `~/.apechurch-cli` | Root local config/data directory |
| `APECHURCH_CLI_BOTS_DIR` | `$APECHURCH_CLI_CONFIG_DIR/bots` | External bots root containing bot folders with `bot.json` |
| `APECHURCH_CLI_LOG_DIR` | `$APECHURCH_CLI_CONFIG_DIR/log` | Bot log directory exposed to bot runtime contexts |
| `APECHURCH_CLI_PK` | none | Optional fallback for non-interactive fresh install/reinstall |
| `APECHURCH_CLI_PASS` | none | Wallet password for non-interactive install/signing |
| `APECHURCH_CLI_PROFILE_URL` | `https://www.ape.church/api/profile` | Username/profile API endpoint override |
| `APECHAIN_RPC_URL` | `https://rpc.apechain.com/http` | Custom ApeChain RPC URL(s); the default RPC remains appended as a fallback |
| `NO_COLOR` | unset | Disable ANSI color output |
| `APECHURCH_CLI_FORCE_CHIME` | unset | Force win chimes in JSON/nested bot flows when set to `1` |
| `APECHURCH_CLI_SUPPRESS_VERSION_BANNER` | unset | Suppress the stderr version banner when set to `1`; nested bot CLI calls set this internally |

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
| `bet` | - | Place one manual stateless-game wager |
| `play` | - | Play a selected stateless or stateful game, or opt into random stateless-game selection with `--auto` |
| `contest [action]` | - | Contest info and registration |
| `history [address]` | - | Read, refresh, or list cached per-wallet history |
| `scoreboard [address]` | - | Read cached per-wallet leaderboards derived from history |
| `games` | - | List supported games |
| `game <name>` | - | Show metadata and grammar for one game |
| `commands` | - | Show the compact terminal command index |
| `help [topic]` | - | Show detailed topic help |
| `bot [name] [args...]` | - | Run an external bot discovered from the configured bots directory |
| `send <asset> <amount> <destination>` | - | Send `APE` or `GP` |
| `house [action] [amount]` | - | Show, deposit into, or withdraw from The House |
| `blackjack [action] [amount]` | `bj` | Interactive/stateful blackjack |
| `cash-dash [action] [amount]` | `cashdash`, `dash` | Interactive/stateful Cash Dash |
| `hi-lo-nebula [action] [amount]` | `hilonebula`, `hilo`, `nebula` | Interactive/stateful Hi-Lo Nebula |
| `video-poker [action] [amount]` | `vp` | Interactive/stateful video poker |

## Shared Grammar

```bnf
<address> ::= "0x" <hex40>
<uint256> ::= <integer> | "0x" <hex>             ; uint256 decimal or hex value
<bytes32> ::= "0x" <hex64>
<number> ::= ...                                  ; decimal number token accepted by the CLI
<integer> ::= ...                                 ; base-10 integer token accepted by the CLI
<token> ::= ...                                   ; one shell token
<ape> ::= <number>                                ; decimal APE amount; value > 0
<ape-nonnegative> ::= <number>                    ; decimal APE amount; value >= 0
<points> ::= <number>                             ; decimal GP per APE rate; value > 0
<block> ::= <integer>                             ; value >= 0
<count> ::= <integer>                             ; value > 0
<seconds> ::= <number>                            ; value > 0 in loop/card pacing options
<human-range> ::= <integer> "-" <integer>          ; inclusive seconds range, e.g. 2-17; each endpoint > 0
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
<multiplier> ::= <number> [ "x" ]                ; 1.01 <= value <= 10000 and at most 4 decimal places
<target-range> ::= <integer> [ "-" <integer> ]    ; each endpoint is within 1..100, each range is inclusive, total covered numbers across all ranges is within 1..95
<out-range> ::= <target-range>                    ; one excluded inclusive range for Gimboz Smash outside bets; excluded coverage is within 5..95
<simple-game-key> ::= "ape-strong"
                    | "roulette"
                    | "baccarat"
                    | "jungle-plinko"
                    | "cosmic-plinko"
                    | "gimboz-smash"
                    | "glyde-or-crash"
                    | "keno"
                    | "speed-keno"
                    | "dino-dough"
                    | "bubblegum-heist"
                    | "geez-diggerz"
                    | "monkey-match"
                    | "bear-dice"
                    | "primes"
                    | "reel-pirates"
                    | "sushi-showdown"
<simple-game-alias> ::= "apestrong"
                      | "strong"
                      | "jungleplinko"
                      | "jungle"
                      | "cosmic"
                      | "gimbozsmash"
                      | "smash"
                      | "glyde"
                      | "glyde-crash"
                      | "glydecrash"
                      | "speed-crash"
                      | "speedcrash"
                      | "crash"
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
                      | "reelpirates"
                      | "pirates"
                      | "reel"
                      | "sushishowdown"
                      | "sushi"
<simple-game> ::= <simple-game-key> | <simple-game-alias>
<stateless-game> ::= <simple-game>
<game-name> ::= <stateless-game>
              | "blackjack"
              | "bj"
              | "cash-dash"
              | "cashdash"
              | "dash"
              | "hi-lo-nebula"
              | "hilonebula"
              | "hilo"
              | "nebula"
              | "video-poker"
              | "vp"
<stateful-game> ::= "blackjack" | "bj"
                  | "cash-dash" | "cashdash" | "dash"
                  | "hi-lo-nebula" | "hilonebula" | "hilo" | "nebula"
                  | "video-poker" | "vp"
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
| `glyde-or-crash` | `glyde`, `glyde-crash`, `glydecrash`, `speed-crash`, `speedcrash`, `crash` |
| `jungle-plinko` | `jungleplinko`, `jungle` |
| `monkey-match` | `monkeymatch`, `monkey` |
| `reel-pirates` | `reelpirates`, `pirates`, `reel` |
| `speed-keno` | `speedkeno`, `skeno` |
| `sushi-showdown` | `sushishowdown`, `sushi` |
| `blackjack` | `bj` |
| `cash-dash` | `cashdash`, `dash` |
| `hi-lo-nebula` | `hilonebula`, `hilo`, `nebula` |
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
| `--from-block <n>` | Start block for history download/backfill; `download --from-block 0` rebuilds the history file | `download` |
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

## Stateless Gameplay

### `bet`

```bnf
<bet-command> ::= "bet"
                  "--game" <stateless-game>
                  "--amount" <ape>
                  <bet-option>*
<bet-option> ::= "--risk" <token>
               | "--balls" <integer>
               | "--spins" <integer>
               | "--bet" <token>
               | "--range" <range>
               | "--multiplier" <multiplier>
               | "--out-range" <out-range>
               | "--picks" <integer>
               | "--numbers" <token>
               | "--games" <count>
               | "--runs" <count>
               | "--rolls" <count>
               | "--timeout" <integer>
               | "--x-gameId" <uint256>
               | "--x-ref" <address>
               | "--x-userRandomWord" <bytes32>
               | "--gp-ape" <points>
```

| Option | Meaning |
|--------|---------|
| `--game <type>` | Stateless game key |
| `--amount <ape>` | Wager amount |
| `--risk <risk>` | Public risk level for Bear-A-Dice, Blocks, Plinko, Monkey Match, or Primes |
| `--balls <balls>` | Plinko ball count |
| `--spins <spins>` | Slot spin count |
| `--bet <bet>` | Roulette or baccarat bet payload |
| `--range <range>` | ApeStrong range, or Gimboz Smash one-or-two target intervals |
| `--multiplier <x>` | Glyde or Crash target multiplier |
| `--out-range <range>` | Gimboz Smash outside bet expressed as one excluded range |
| `--picks <picks>` | Keno pick count |
| `--numbers <numbers>` | Keno numbers as one token, for example `1,7,13,25,40` or `random` |
| `--games <games>` | Speed Keno batch count |
| `--runs <runs>` | Bear Dice, Primes, or Blocks run count |
| `--rolls <rolls>` | Bear-A-Dice roll count |
| `--timeout <ms>` | Wait time for a result; `0` means no wait limit |
| `--x-gameId <uint256>` | Expert override for the generated `gameId` in `gameData` |
| `--x-ref <address>` | Expert override for the referral address in `gameData` |
| `--x-userRandomWord <bytes32>` | Expert override for the generated `userRandomWord` in `gameData` |
| `--gp-ape <points>` | Override local GP estimation for this run |

### `play`

```bnf
<play-command> ::= "play" [ <play-positional> ] <play-option>*
<play-positional> ::= <stateless-game> [ <ape> <token>* ]
                    | <stateful-game> [ <stateful-head> ] [ <token> ]
<stateful-head> ::= <ape> | "resume" | "status" | "clear" | "payouts" | "table" | <token>
<play-option> ::= <play-stateless-option> | <play-stateful-option> | <play-shared-option>
<play-stateless-option> ::= "--auto"
                          | "--risk" <token>
                          | "--balls" <integer>
                          | "--spins" <integer>
                          | "--bet" <token>
                          | "--range" <range>
                          | "--multiplier" <multiplier>
                          | "--out-range" <out-range>
                          | "--picks" <integer>
                          | "--numbers" <token>
                          | "--games" <count>
                          | "--runs" <count>
                          | "--rolls" <count>
                          | "--timeout" <integer>
                          | "--x-gameId" <uint256>
                          | "--x-ref" <address>
                          | "--x-userRandomWord" <bytes32>
<play-stateful-option> ::= "--auto" [ <auto-mode> ]
                         | "--game-id" <game-id>
                         | "--display" <display>
                         | "--side" <ape>
                         | "--solver-max-states" <count>
                         | "--solver"
                         | "--tile" <token>
                         | "--cashout-after" <count>
<play-shared-option> ::= "--game" ( <stateless-game> | <stateful-game> )
                       | "--amount" <ape>
                       | "--strategy" <persona>
                       | "--loop"
                       | "--delay" <seconds>
                       | "--human" [ <human-range> ]
                       | "--max-games" <count>
                       | "--take-profit" <ape>
                       | "--min-profit" <ape>
                       | "--target-x" <number>
                       | "--target-profit" <ape>
                       | "--retrace" <ape>
                       | "--recover-loss" <ape>
                       | "--giveback-profit" <ape>
                       | "--stop-loss" <ape-nonnegative>
                       | "--max-loss" <ape>
                       | "--bankroll" <ape>
                       | "--bet-strategy" <bet-strategy>
                       | "--max-bet" <ape>
                       | "--gp-ape" <points>
                       | "-v"
                       | "--verbose"
                       | "--json"
```

The positional tail after `<ape>` is game-specific. See [GAMES_REFERENCE.md](./GAMES_REFERENCE.md) or `apechurch-cli game <name>` for the exact grammar per stateless game.

Stateful games can also be routed through `play`, for example `apechurch-cli play blackjack 10 --auto`, `apechurch-cli play cash-dash 10 --tile 3`, or `apechurch-cli play video-poker 10 --auto best`. Direct commands such as `apechurch-cli blackjack 10` remain supported. When a stateful action needs an unfinished-game id through `play`, prefer `--game-id <id>` because `--game <name>` is already used for selecting the target game.

Bare `apechurch-cli play` no longer auto-runs a random game. Use `apechurch-cli play --auto` for the old automatic random-selection behavior, or pass an explicit game/amount.

#### Stateless Game Options

These options apply only to fire-and-forget games handled by the stateless game router.

| Option | Meaning |
|--------|---------|
| `--auto` | Opt into automatic random stateless game/config selection when no game is specified |
| `--risk <risk>` | Public risk level for Bear-A-Dice, Blocks, Plinko, Monkey Match, or Primes |
| `--balls <balls>` | Plinko ball count |
| `--spins <spins>` | Slot spin count |
| `--bet <bet>` | Roulette or baccarat bet payload |
| `--range <range>` | ApeStrong range, or Gimboz Smash one-or-two target intervals |
| `--multiplier <x>` | Glyde or Crash target multiplier |
| `--out-range <range>` | Gimboz Smash outside bet expressed as one excluded range |
| `--picks <picks>` | Keno pick count |
| `--numbers <numbers>` | Keno numbers as one token |
| `--games <games>` | Speed Keno batch count |
| `--runs <runs>` | Bear Dice, Primes, or Blocks run count |
| `--rolls <rolls>` | Bear-A-Dice roll count |
| `--timeout <ms>` | Wait time for a stateless result; `0` returns the pending play response |
| `--x-gameId <uint256>` | Expert override for the generated `gameId` in `gameData` |
| `--x-ref <address>` | Expert override for the referral address in `gameData` |
| `--x-userRandomWord <bytes32>` | Expert override for the generated `userRandomWord` in `gameData` |

#### Stateful Game Options

These options apply only to `blackjack`, `cash-dash`, `hi-lo-nebula`, and `video-poker` when routed through `play`.

| Option | Meaning |
|--------|---------|
| `--auto [mode]` | Stateful auto-play mode where supported (`simple` or `best`) |
| `--game-id <id>` | Stateful unfinished-game id for resume/action when using `play <stateful-game>` |
| `--display <mode>` | Stateful display mode |
| `--side <ape>` | Blackjack player side bet |
| `--solver-max-states <n>` | Blackjack `--auto best` recursive search state cap; default `50000`, used to prevent long CPU stalls while allowing larger caps for complex hands |
| `--solver` | Show solver suggestions in supported stateful games |
| `--tile <tile>` | Cash Dash opening tile |
| `--cashout-after <rows>` | Cash Dash auto-play cashout depth |

#### Shared Play And Loop Options

These options are accepted by the `play` command for both stateless and stateful gameplay, subject to each game's normal behavior.

| Option | Meaning |
|--------|---------|
| `--game <name>` | Stateless or stateful game key |
| `--amount <ape>` | Wager amount |
| `--strategy <name>` | Persona used when the CLI chooses a game/config |
| `--loop` | Keep playing until a stop condition is hit |
| `--delay <seconds>` | Delay between looped games |
| `--human [range]` | Add humanized loop pacing. Bare `--human` uses weighted 3-9s; a range such as `2-17` overrides the random seconds window |
| `--max-games <count>` | Stop loop after N games |
| `--take-profit <ape>` | Stop loop when balance reaches the target |
| `--min-profit <ape>` | Stop loop when session P&L reaches the target profit |
| `--target-x <x>` | Stop loop when one game pays at least the target multiplier |
| `--target-profit <ape>` | Stop loop when one game pays at least the target payout |
| `--retrace <ape>` | Stop loop when one game loses at least this amount |
| `--recover-loss <ape>` | Stop loop when session P&L returns to break-even/profit after a drawdown of at least this size |
| `--giveback-profit <ape>` | Stop loop when session P&L returns to break-even/loss after a run-up of at least this size |
| `--stop-loss <ape>` | Stop before a play/loop iteration when wallet balance is at or below the threshold |
| `--max-loss <ape>`, `--bankroll <ape>` | Stop loop when session P&L reaches the loss limit |
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
- Per-run override: `bet`, `play`, `blackjack`, `cash-dash`, `hi-lo-nebula`, `video-poker`
- Wallet-specific current override: `profile set --gp-ape <points>`
- Wallet-specific reset to base default: `profile set --no-gp-ape`
- On-chain GP precedence: when a settled game includes on-chain GP, reports use that value instead of a local estimate

### `bot [name] [args...]`

```bnf
<bot-command> ::= "bot" [ <bot-name> ] [ <token>* ] [ "-h" | "--help" ] [ "--json" ] [ "--fallback-loss" <ape> "--fallback-bot" <bot-name> ] [ "--list" ]
<bot-name> ::= <token>
```

`bot` discovers external bot folders from `$APECHURCH_CLI_CONFIG_DIR/bots` by default, where `APECHURCH_CLI_CONFIG_DIR` defaults to `~/.apechurch-cli`. Set `APECHURCH_CLI_BOTS_DIR` when the bot root lives elsewhere; its value must be the actual bots root that contains bot folders with `bot.json`, not a parent directory. Bot logs belong under `APECHURCH_CLI_LOG_DIR`, which defaults to `$APECHURCH_CLI_CONFIG_DIR/log`. Each bot is defined by `bot.json` plus an entry module. Use `bot --list` to inspect discovery, `bot --help` for the shared loader help, then `bot <name> ...` to execute one bot. Use `bot <name> -h` or `bot <name> --help` for bot-specific help.

The CLI is agnostic about bot strategy and implementation details: it discovers manifests, forwards tokens after the bot name, and exposes a narrow runtime helper surface. External bots should document their own flags and may follow the shared conventions for `-h, --help`, `--json`, `--fallback-loss <ape>`, `--fallback-bot <name>`, and standard loop controls. `--take-profit` and `--stop-loss` are absolute wallet thresholds that bots may forward unchanged to child plays and nested bots; `--min-profit` and `--max-loss` derive those absolute thresholds from the bot's starting balance. See [bots/README.md](../bots/README.md) for authoring guidelines, manifest rules, output conventions, and the security note.

The runtime surface is intentionally narrow: bots receive positional args plus gameplay helpers such as `play(tokens)`, `playJson(tokens)`, `botRun(name, tokens)`, `botJson(name, tokens)`, `session` helpers for output, command-line rendering, P&L accounting, fallback parsing, and colors, plus resolved `paths.configDir`, `paths.botsDir`, `paths.logDir`, and per-bot `bot.logDir`.

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
                   | "--leaderboard"
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
| `--ids` | Append local game IDs in history lines and scoreboard tables |
| `--stats` | Show stats only |
| `--breakdown [game]` | Show per-game stats, optionally filtered to one game |
| `--leaderboard` | Show global and weekly wAPE wagered, grouped from Monday 00:00 UTC |
| `--scoreboard` | Append the cached Highest Multipliers and Biggest Payouts tables |
| `--url` | Show game URLs in terminal scoreboard tables |
| `--refresh` | Download/refresh the history before rendering |
| `--from-block <n>` | Start block for `--refresh` |
| `--to-block <n>` | End block for `--refresh` |
| `--chunk-size <n>` | Block span per log query during refresh |
| `--json` | Emit JSON output |

`history --refresh` merges newly fetched records into the existing cache. Use `wallet download --from-block 0` when you want to rewrite the history file from genesis.

`--url` and `--ids` only affect terminal scoreboard tables. `--url` shows `game_url`, `--ids` shows `game_id`, and if both are passed the last option wins. JSON output keeps both fields.

### `scoreboard [address]`

```bnf
<scoreboard-command> ::= "scoreboard" [ <address> ] <scoreboard-option>*
<scoreboard-option> ::= "--list"
                      | "--ids"
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
| `--ids` | Show game IDs in terminal scoreboard tables |
| `--url` | Show game URLs in terminal scoreboard tables |
| `--refresh` | Download/refresh the history before rebuilding the scoreboard |
| `--from-block <n>` | Start block for `--refresh` |
| `--to-block <n>` | End block for `--refresh` |
| `--chunk-size <n>` | Block span per log query during refresh |
| `--json` | Emit JSON output |

This command renders the same two cached Top 20 leaderboards used by `history --scoreboard`:

- `Highest Multipliers`: descending by total realized payout multiplier
- `Biggest Payouts`: descending by total realized payout

Reference columns stay hidden in terminal tables unless `--url` or `--ids` is passed. If both are passed, the last option wins. JSON output keeps `game_url` and `game_id`.

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
                     | "--solver-max-states" <count>
                     | "--delay" <seconds>
                     | "--human" [ <human-range> ]
                     | "--loop"
                     | "--max-games" <count>
                     | "--take-profit" <ape>
                     | "--min-profit" <ape>
                     | "--target-x" <number>
                     | "--target-profit" <ape>
                     | "--retrace" <ape>
                     | "--recover-loss" <ape>
                     | "--giveback-profit" <ape>
                     | "--stop-loss" <ape-nonnegative>
                     | "--max-loss" <ape>
                     | "--bankroll" <ape>
                     | "--bet-strategy" <bet-strategy>
                     | "--max-bet" <ape>
                     | "--gp-ape" <points>
```

If the first positional token is numeric, the command starts a new hand with that amount. Blackjack uses the live H17 rule surface: the dealer hits soft 17, and `--auto simple` / `--auto best` model that rule. `--solver-max-states <n>` applies to `--auto best`; its default is `50000` recursive player states, which keeps exact-EV search from stalling the CLI, and it can be raised for unusually complex hands that otherwise fall back to simple mode. `--human [range]` is a supported advanced option but intentionally hidden from standard `--help`.

### `cash-dash [action] [amount]`

Aliases: `cashdash`, `dash`

```bnf
<cash-dash-command> ::= ( "cash-dash" | "cashdash" | "dash" ) [ <cash-dash-head> ] [ <cash-dash-tile> ] <cash-dash-option>*
<cash-dash-head> ::= <ape>
                   | "resume"
                   | "status"
                   | "payouts"
                   | "table"
                   | "clear"
                   | "guess"
                   | "tile"
                   | "pick"
                   | "random"
                   | "r"
                   | "cashout"
                   | "cash"
                   | "c"
<cash-dash-tile> ::= "random" | "r" | <integer>
<cash-dash-option> ::= "--game" <game-id>
                     | "--display" <display>
                     | "--json"
                     | "-v"
                     | "--verbose"
                     | "--auto" [ <auto-mode> ]
                     | "--solver"
                     | "--tile" <cash-dash-tile>
                     | "--cashout-after" <count>
                     | "--delay" <seconds>
                     | "--human" [ <human-range> ]
                     | "--loop"
                     | "--max-games" <count>
                     | "--take-profit" <ape>
                     | "--min-profit" <ape>
                     | "--target-x" <number>
                     | "--target-profit" <ape>
                     | "--retrace" <ape>
                     | "--recover-loss" <ape>
                     | "--giveback-profit" <ape>
                     | "--stop-loss" <ape-nonnegative>
                     | "--max-loss" <ape>
                     | "--bankroll" <ape>
                     | "--bet-strategy" <bet-strategy>
                     | "--max-bet" <ape>
                     | "--gp-ape" <points>
```

If the first positional token is numeric, the command starts a new run. During an active run, use `guess <tile>` / `tile <tile>` / `pick <tile>` for the next row, or `cashout` / `c` to settle. `--tile` chooses the opening tile (`1-7` or `random`); when omitted in manual mode, the CLI renders the opening row and prompts before sending `play`. Auto/JSON starts use tile `1` unless `--tile` is supplied. `--cashout-after` controls how many safe rows auto-play targets before cashing out. `--human [range]` is supported but hidden from standard `--help`.

### `hi-lo-nebula [action] [amount]`

Aliases: `hilonebula`, `hilo`, `nebula`

```bnf
<hi-lo-nebula-command> ::= ( "hi-lo-nebula" | "hilonebula" | "hilo" | "nebula" ) [ <hi-lo-nebula-head> ] [ <ape> ] <hi-lo-nebula-option>*
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
                        | "--human" [ <human-range> ]
                        | "--loop"
                        | "--max-games" <count>
                        | "--take-profit" <ape>
                        | "--min-profit" <ape>
                        | "--target-x" <number>
                        | "--target-profit" <ape>
                        | "--retrace" <ape>
                        | "--recover-loss" <ape>
                        | "--giveback-profit" <ape>
                        | "--stop-loss" <ape-nonnegative>
                        | "--max-loss" <ape>
                        | "--bankroll" <ape>
                        | "--bet-strategy" <bet-strategy>
                        | "--max-bet" <ape>
                        | "--gp-ape" <points>
```

If the first positional token is numeric, the command starts a new run. `--solver` shows the manual `Suggested action` line using the same `best` engine. `--auto best` is a VRF-aware net-EV continuation solver over the verified rank-only branch table, using the live jackpot snapshot as the terminal bonus reference. `--human [range]` is supported but hidden from standard `--help`.

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
                       | "--human" [ <human-range> ]
                       | "--loop"
                       | "--max-games" <count>
                       | "--take-profit" <ape>
                       | "--min-profit" <ape>
                       | "--target-x" <number>
                       | "--target-profit" <ape>
                       | "--retrace" <ape>
                       | "--recover-loss" <ape>
                       | "--giveback-profit" <ape>
                       | "--stop-loss" <ape-nonnegative>
                       | "--max-loss" <ape>
                       | "--bankroll" <ape>
                       | "--bet-strategy" <bet-strategy>
                       | "--max-bet" <ape>
                       | "--gp-ape" <points>
```

If the first positional token is numeric, the command starts a new hand. Valid opening wagers are fixed to `1`, `5`, `10`, `25`, `50`, or `100` APE. `--human [range]` is supported but hidden from standard `--help`.
