# Command Reference

> Summary: Current Ape Church CLI command surface. Lists every top-level command, subaction, parser-visible option, and supported alias with generic BNF for the accepted syntax.

This file is the canonical command reference for the repo. `apechurch-cli commands` remains a compact terminal index; use this file when you need the full command surface, exact option names, or the shared BNF tokens accepted by the parser.

For per-game argument grammar such as roulette bets, baccarat combined bets, and `--numbers` payloads, see [GAMES_REFERENCE.md](./GAMES_REFERENCE.md). For deeper mechanics and ABI-backed behavior notes, see `docs/verification/`.

## Conventions

- The binary name is `apechurch-cli`.
- Options are order-insensitive in practice. The BNF groups them for readability, not to force a left-to-right order.
- `--json` is documented only on commands that actually register it.
- `--color` is a global plain-output option; JSON output remains uncolored.
- `--gp-ape <points>` is a per-run local override.
- `profile set --gp-ape <points>` persists a wallet-specific current local override.
- When a report includes on-chain GP for a settled game, that on-chain value overrides any locally estimated GP.

## Environment Variables

| Variable | Default | Scope |
|----------|---------|-------|
| `APECHURCH_CLI_CONFIG_DIR` | `~/.apechurch-cli` | Root local config/data directory |
| `APECHURCH_CLI_BOTS_DIR` | `$APECHURCH_CLI_CONFIG_DIR/bots` | Personal local bot root containing bot folders with `bot.json` |
| `APECHURCH_CLI_LOG_DIR` | `$APECHURCH_CLI_CONFIG_DIR/log` | Bot log directory exposed to bot runtime contexts |
| `APECHURCH_CLI_SCR_DIR` | `$APECHURCH_CLI_CONFIG_DIR/scripts` | Custom script directory for JSON command scripts used by `script` |
| `APECHURCH_CLI_R2_PREFIX` | unset | Optional object-key prefix for best-effort R2 mirrors of bot JSON logs |
| `APECHURCH_CLI_R2_NAME` | none | Optional bucket-name fallback for `bucket:log install <bucket>` / `bucket:script install <bucket>` |
| `APECHURCH_CLI_R2_ACCOUNT_ID` | none | Shared account-ID install value (skips its interactive question) for `bucket:log install <bucket>` / `bucket:script install <bucket>` |
| `APECHURCH_CLI_R2_TOKEN` | none | Shared API-token install value (skips its interactive question) for `bucket:log install <bucket>` / `bucket:script install <bucket>` |
| `APECHURCH_CLI_R2_KEY` | none | Shared access-key install value (skips its interactive question) for `bucket:log install <bucket>` / `bucket:script install <bucket>` |
| `APECHURCH_CLI_R2_SECRET` | none | Shared secret-access-key install value (skips its interactive question) for `bucket:log install <bucket>` / `bucket:script install <bucket>` |
| `APECHURCH_CLI_PK` | none | Optional fallback for non-interactive fresh install/reinstall |
| `APECHURCH_CLI_PASS` | none | Wallet password for non-interactive install/signing |
| `APECHURCH_CLI_PROFILE_URL` | `https://www.ape.church/api/profile` | Username/profile API endpoint override |
| `APECHAIN_RPC_URL` | `https://rpc.apechain.com/http` | Custom ApeChain RPC URL(s); the default RPC remains appended as a fallback |
| `APECHURCH_CLI_FORCE_COLOR` | unset | Force ANSI color in plain output when set to `1`; equivalent to `--color` |
| `NO_COLOR` | unset | Disable ANSI color output |
| `APECHURCH_CLI_FORCE_CHIME` | unset | Force win chimes in JSON/nested bot flows when set to `1` |
| `APECHURCH_CLI_SUPPRESS_CHIME` | unset | Disable win chimes entirely when set to `1` |
| `APECHURCH_CLI_SUPPRESS_VERSION_BANNER` | unset | Suppress the stderr version banner when set to `1`; nested bot CLI calls set this internally |

## Top-Level Commands

| Command | Aliases | Purpose |
|---------|---------|---------|
| `install` | - | Install or reinstall the local encrypted wallet bundle |
| `uninstall` | - | Remove local CLI data |
| `wallet [action] [address]` | - | Wallet management, local wallet listing, and history download |
| `bucket [action] [value]` | - | Encrypted Cloudflare R2 bot log mirror config, log sync, and presigned log URLs |
| `status` | - | Show current wallet, balance, and local state |
| `script <action> <nome_script>` | - | Write, read, or watch JSON command scripts |
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
| `game <name>` | - | Show metadata, grammar, or resolved payouts for one game |
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
<human-weighted-default> ::= "weighted:3-9"        ; explicit bare --human weighted profile
<username> ::= <token>                            ; normalized username; letters, numbers, underscores; max 32 chars
<persona> ::= "conservative" | "balanced" | "aggressive" | "degen"
<card-display> ::= "full" | "simple" | "json"
<display> ::= "full" | "simple" | "json"
<bet-strategy> ::= "flat" | "martingale" | "reverse-martingale" | "fibonacci" | "dalembert" | "bankroll-fraction=" <fraction>
<fraction> ::= <number>                            ; decimal strictly between 0 and 1
<help-topic> ::= "loop" | "strategies" | "auto" | "wallet" | "history" | "house"
<asset> ::= "APE" | "GP"
<game-id> ::= <token>                             ; local unfinished-game identifier
<cover> ::= <integer>                           ; ApeStrong uses 5..95; Gimboz Smash randomizes a 1..95 inside/outside cover
<range> ::= <target-range> | <target-range> "," <target-range>
                                                ; Gimboz Smash uses one or two inclusive target ranges on 1..100
<multiplier> ::= <number> [ "x" ]                ; 1.01 <= value <= 10000 and at most 4 decimal places
<target-range> ::= <integer> "-" <integer>      ; each endpoint is within 1..100, each range is inclusive, total covered numbers across all ranges is within 1..95
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
                      | "speed"
                      | "dinodough"
                      | "dino"
                      | "bubblegumheist"
                      | "bubblegum"
                      | "heist"
                      | "geezdiggerz"
                      | "geez"
                      | "diggerz"
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
<video-poker-bet> ::= "10" | "25" | "50" | "100" | "250" | "400"
<auto-mode> ::= "simple" | "best"
<blackjack-auto-mode> ::= "simple" | "best" | "max"
<hi-lo-auto-mode> ::= "simple" | "best" | "winston-ladder"
```

## Game Aliases

| Canonical | Supported Aliases |
|-----------|-------------------|
| `ape-strong` | `apestrong`, `strong` |
| `bear-dice` | `bear`, `dice` |
| `bubblegum-heist` | `bubblegumheist`, `bubblegum`, `heist` |
| `cosmic-plinko` | `cosmic` |
| `dino-dough` | `dinodough`, `dino` |
| `geez-diggerz` | `geezdiggerz`, `geez`, `diggerz` |
| `gimboz-smash` | `gimbozsmash`, `smash` |
| `glyde-or-crash` | `glyde`, `glyde-crash`, `glydecrash`, `speed-crash`, `speedcrash`, `crash` |
| `jungle-plinko` | `jungleplinko`, `jungle` |
| `monkey-match` | `monkeymatch`, `monkey` |
| `reel-pirates` | `reelpirates`, `pirates`, `reel` |
| `speed-keno` | `speedkeno`, `skeno`, `speed` |
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
                  | "password"
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
The selected wallet is tracked by `wallets/current.json`, which points to `wallets/<address>.json`. Encrypted wallet material lives only in the address-specific entry; if that entry is a symlink, normal filesystem resolution applies.

| Option | Meaning | Applies To |
|--------|---------|------------|
| `-y`, `--yes` | Skip confirmation prompts | mainly `reset` |
| `--list` | List locally available wallet addresses | command-level |
| `--json` | Emit JSON output | `status`, `download`, `select`, `new`, `password` |
| `--from-block <n>` | Start block for history download/backfill; `download --from-block 0` rebuilds the history file | `download` |
| `--to-block <n>` | End block for history download | `download` |
| `--chunk-size <n>` | Initial maximum block span; oversized or timed-out RPC ranges shrink automatically (default `50000`) | `download` |

### R2 buckets

**`bucket sync` means log sync only**, exactly like `bucket:log sync`. Use `bucket:script sync` separately for scripts. Only unqualified `bucket status` aggregates both types. `bucket --help`, `bucket:log --help`, and `bucket:script --help` all describe both types.

#### Paths and recursion (identical for logs and scripts)

`sync [path]` synchronizes only the files directly at that path. Add `-r` / `--recursive` to include every subfolder. An omitted path or `.` selects the configured local root. Paths are relative to `APECHURCH_CLI_LOG_DIR` or `APECHURCH_CLI_SCR_DIR`; the same relative paths are retained on R2, under the optional log prefix for logs.

```bash
apechurch-cli bucket:log sync -r                 # Every log folder
apechurch-cli bucket:script sync -r              # Every script folder
apechurch-cli bucket:log sync archive/            # Direct files in archive only
apechurch-cli bucket:log sync archive/ -r         # Archive and all descendants
apechurch-cli bucket:script sync routines/        # Direct scripts in routines only
apechurch-cli bucket:script sync routines/ -r
apechurch-cli bucket:script sync routines/report-v2.json
apechurch-cli bucket sync -r                     # Logs ONLY
```

Use a trailing slash to select a directory explicitly and `.json` for an exact file. A bare script name selects a matching local/remote directory if present, otherwise the script with an optional `.json` suffix; with `-r`, a bare path selects a directory. Absolute paths and traversal are rejected; symlinks and unsafe local ancestors are skipped. Empty directories are not created remotely: R2 stores objects and their paths.

Subfolders excluded without `-r` appear as `recursive-required` under `Inconsistencies:`, followed by a suggestion to use `-r / --recursive`. JSON results expose the same suggestion in `hint`. Invalid JSON and unsafe paths are not fixed by recursive mode. No sync propagates deletions.

Start with the [bucket setup and credential security guide](BUCKETS.md) for Cloudflare creation, token permissions, independent credentials, first sync, and automation.

**Prefer `bucket:log` for bot logs and `bucket:script` for JSON command scripts.** Each command has its own active bucket. Configure separate existing Cloudflare R2 buckets, such as `example-logs` and `example-scripts`; `install` saves credentials locally and selects a bucket, rather than creating it on R2.

| Command | Local source | Remote layout | Transfer behavior |
|---------|--------------|---------------|-------------------|
| `bucket:log` | `APECHURCH_CLI_LOG_DIR` | `[prefix/]<relative-path>/<bot>.<timestamp>[.<sequence>].json` | Best-effort uploads during bot runs; explicit two-way `sync` |
| `bucket:script` | `APECHURCH_CLI_SCR_DIR` | `<relative-path>/<script>.json` | Explicit two-way `sync`; filenames are assigned manually |

```bnf
<bucket-command> ::= ( "bucket:log" | "bucket:script" ) [ <bucket-action> [ <value> ] ] <bucket-option>*
<bucket-action> ::= "install" | "reinstall" | "status" | "list" | "enable" | "disable" | "sync" | "empty" | "presign"
<value> ::= <bucket-name> | <relative-path> | <script-name> | <object-path> | <empty-target>
<empty-target> ::= <relative-folder-or-file>
<bucket-option> ::= "-r" | "--recursive" | "--json" | "-v" | "--verbose" | "-t" <timeout> | "--timeout" <timeout> | "-o" <file> | "--output" <file> | "-f" | "--force"
<timeout> ::= <integer>  ; 1..604800 seconds, default 604800
```

#### Configure and select buckets

```bash
# Store credentials and select one bucket for each purpose.
apechurch-cli bucket:log install example-logs
apechurch-cli bucket:script install example-scripts

# Show every stored entry, including inactive ones, and both selections.
apechurch-cli bucket status
apechurch-cli bucket status --json

# Inspect the active selection for each purpose.
apechurch-cli bucket:log status
apechurch-cli bucket:script status --json
apechurch-cli bucket:log list
apechurch-cli bucket:script list --json

# Replace credentials for an existing entry and select it again.
apechurch-cli bucket:script reinstall example-scripts

# Disable script sync, then re-enable its stored entry.
# The log selection is independent.
apechurch-cli bucket:script disable
apechurch-cli bucket:script enable example-scripts

# Disable log selection for future operations/new bot processes; retain credentials.
apechurch-cli bucket:log disable
apechurch-cli bucket:log enable example-logs
```

`bucket status` (or `bucket` alone) shows both local selections and all stored entries. JSON returns `log` and `script` metadata plus `buckets`, with `log_enabled` and `script_enabled` flags on each entry. Unselected entries remain visible; their original purpose is not inferred. `bucket:log status` and `bucket:script status` report only their respective selection. Other unqualified `bucket` actions default to logs, except `empty`, which always requires `bucket:log` or `bucket:script`. Status does not contact R2 or verify connectivity.

Omitting the action displays `status`. `install` and `reinstall` enable the supplied bucket for the chosen command type. `enable` selects a stored entry, and `disable` removes only that type's selection. `list` shows all stored credential entries; its enabled marker is relative to the chosen command type. Neither enable nor disable transfers files, starts a service, revokes remote access, or reconfigures an already-running process. `empty` requires an enabled selection for its command type; disabling it prevents subsequent empty operations until a bucket is enabled again.

Credentials are shared by bucket name under `$APECHURCH_CLI_CONFIG_DIR/r2/<bucket>.json`. Log and script selections are stored independently in `r2/current.json` and `r2/script/current.json`. Using separate bucket names also keeps their credential entries separate.

Install/reinstall obtains the encryption password, account ID, API token, access key ID, and secret access key from the environment or asks interactively for missing values. Password, token, and secret-key input is hidden. The same install variables apply to both types. An explicit bucket argument takes precedence over `APECHURCH_CLI_R2_NAME`, with a notice when that variable is set and no confirmation. Nonempty environment credentials supply their fields without asking the corresponding interactive questions; they do not replace an answer entered at a prompt. Source notices go to stderr without showing values, including the encryption password, so `--json` stdout remains structured. Different bucket names can store distinct tokens, keys, and account IDs. Later operations decrypt the saved entry rather than reading the install variables again. For non-interactive setup, use `APECHURCH_CLI_PASS` plus `APECHURCH_CLI_R2_ACCOUNT_ID`, `APECHURCH_CLI_R2_TOKEN`, `APECHURCH_CLI_R2_KEY`, and `APECHURCH_CLI_R2_SECRET`. `APECHURCH_CLI_R2_NAME` supplies a bucket name when omitted from install/reinstall. `APECHURCH_CLI_PASS` also unlocks credentials for non-interactive transfers and automatic log uploads.

Normal status/list output omits credential values. `bucket:log status -v` or `bucket:script list -v` explicitly decrypts and prints endpoints and credential environment values, including secrets. Aggregate `bucket status -v` decrypts all stored entries, including inactive ones, using the supplied password.

#### Sync logs: all bots or one bot

```bash
# Reconcile the whole local log tree with the selected log bucket.
apechurch-cli bucket:log sync -r

# Reconcile only one bot's log folder.
apechurch-cli bucket:log sync example-bot
apechurch-cli bucket:log sync example-bot --json

# Optionally place log objects under a remote prefix.
APECHURCH_CLI_R2_PREFIX=archive apechurch-cli bucket:log sync example-bot
```

Log sync uploads local-only/newer files and downloads remote-only/newer objects. It never deletes either side. It accepts `<bot>.<timestamp>[.<sequence>].json` filenames in the selected directory and, with `-r`, its descendants and reports invalid filenames or JSON bodies as skipped inconsistencies. Automatic uploads during bot runs remain best-effort: local logs are retained if R2 is unavailable.

The prefix applies to log mirroring and log sync. For example, `example-bot/example-bot.20260101120000.json` becomes `archive/example-bot/example-bot.20260101120000.json` when the prefix is `archive`. Script paths are relative to the script bucket root and do not use the log prefix.

#### Sync scripts and maintain named versions

```bash
# Get the current shared scripts before editing.
apechurch-cli bucket:script sync

# Choose a new name yourself. This saves a JSON script; it does not execute it.
apechurch-cli script write report-v2 games

# Upload the new file and reconcile the other scripts.
apechurch-cli bucket:script sync

# Limit sync to one script; the .json suffix is optional.
apechurch-cli bucket:script sync report-v2
apechurch-cli bucket:script sync report-v2.json --json

# On another workstation, configure the same bucket and download its scripts.
apechurch-cli bucket:script install example-scripts
apechurch-cli bucket:script sync
apechurch-cli script read report-v2
```

Use **sync → save the revised script with a new name → sync**. Version suffixes such as `-v2` are manual; the CLI does not rename files, increment versions, or infer which version should run. Previous versions remain until explicitly removed. Sync neither executes scripts nor reloads a running `script watch` process.

Script sync accepts valid command-script JSON in the selected directory and, with `-r`, all descendants. It reports invalid bodies, unsafe paths, and local symlinks. For matching filenames, newer local modification time or remote upload time wins, with a one-second tolerance. Within that tolerance, identical contents are skipped and differing contents are reported without overwrite. Downloads replace local files atomically and preserve the remote upload timestamp; no original-edit timestamp metadata is added. Sync does not propagate deletions.

#### Empty a remote bucket, folder, or file

`empty [path]` requires **`bucket:log empty` or `bucket:script empty`** and uses that type's **selected bucket**. Unqualified `bucket empty` is rejected before reading credentials or contacting R2, even when a log bucket is enabled. Omit the path to empty the entire selected bucket. Supply a folder or file path relative to the bucket root, **without the bucket name**. A supplied first component is always part of the object path, even if it matches another configured bucket. It does not apply `APECHURCH_CLI_R2_PREFIX`: include any log prefix explicitly. All object types are included, and folders are emptied recursively without `-r`.

```bash
# List every remote object in this bucket, then confirm deletion of all of them.
apechurch-cli bucket:script empty

# List and delete a folder's contents recursively, after confirmation.
apechurch-cli bucket:log empty archive/

# Delete exactly one remote file, after confirmation.
apechurch-cli bucket:script empty report-v1.json
apechurch-cli bucket:log empty archive/example-bot/example-bot.20260101120000.json
```

Every nonempty selection is displayed before asking you to type `EMPTY`. A different answer cancels. All object types are included, and only the displayed keys are deleted. The bucket itself, local files, stored credentials, and active selections remain intact. A later sync can upload deleted remote files again if their local copies still exist.

A trailing slash explicitly selects a folder. Without it, an exact existing object takes precedence; otherwise the path is treated as a folder. Folder selection respects slash boundaries: `archive/` does not select `archive-old/`. With `--json`, the list and confirmation go to stderr and the result goes to stdout. An interactive terminal is still required; `--force` does not bypass confirmation. Partial failures report deleted and failed keys and return a nonzero exit status.

#### Presign a file or download a copy

`presign` uses the **selected bucket**: supply an object path or script name, without a bucket-name prefix. It creates a temporary GET link that can read that object without the recipient's own R2 credentials. Anyone holding the link can use it while valid.

```bash
# Latest timestamped log across the selected log bucket.
apechurch-cli bucket:log presign

# Latest log within a bot folder, with a requested lifetime of one hour.
apechurch-cli bucket:log presign example-bot -t 3600

# Exact remote log, or latest log within an explicit prefixed folder.
apechurch-cli bucket:log presign example-bot/example-bot.20260101120000.json
apechurch-cli bucket:log presign archive/example-bot

# Most recently uploaded root-level script, or a particular named script.
apechurch-cli bucket:script presign
apechurch-cli bucket:script presign report-v2.json -t 900

# Download the selected JSON as a local file (.json is added if omitted).
apechurch-cli bucket:log presign example-bot -o latest-log
apechurch-cli bucket:script presign report-v2 -o downloaded-report.json

# A directory target preserves the remote filename; --force overwrites locally.
apechurch-cli bucket:log presign archive/example-bot -o ./downloads/ --force

# Inspect the object key, URL, cache status, and expiry as JSON.
apechurch-cli bucket:script presign report-v2 --json
```

Log selection uses the timestamp in the filename; script selection without a name uses the remote upload time, not a version suffix. An explicit log `.json` key or script name is signed without listing the bucket. Include any log prefix yourself in presign paths.

Latest-file requests always refresh the remote listing first. An unexpired cached URL is reused only if it refers to the selected object; otherwise a new URL is signed and cached. An empty listing or listing failure is reported instead of returning an older link. The default and maximum lifetime for a new link is 604800 seconds (7 days). Reusing a cached link preserves its original expiry, even if a different `-t` is requested.

`-o` downloads JSON locally; it does not execute it. An existing output file requires confirmation unless `--force` is supplied. A directory or path ending in `/` uses the remote filename inside that directory.

| Option | Applies to | Meaning |
|--------|------------|---------|
| `-r`, `--recursive` | `sync` | Include every subfolder below the selected relative path |
| `--json` | All actions | Structured result; `empty` still requires interactive confirmation |
| `-v`, `--verbose` | `status`, `list` | Decrypt and print endpoints and credential environment values |
| `-t`, `--timeout <seconds>` | `presign` | Lifetime of a newly generated URL, 1–604800 seconds |
| `-o`, `--output <file>` | `presign` | Download JSON to a local file or directory |
| `-f`, `--force` | `presign -o` | Overwrite the local output without prompting |


## Profile And Identity

### `status`

```bnf
<status-command> ::= "status" [ "--json" ]
```

### `script <action> <nome_script>`

```bnf
<script-command> ::= "script" ( <script-write> | <script-watch> | <script-read> )
<script-write> ::= "write" <nome_script> <command-token>+
<script-watch> ::= "watch" <nome_script> <script-watch-option>*
<script-read> ::= "read" <nome_script>
<script-watch-option> ::= "--every" <seconds>
                        | "--if-balance-over" <ape-nonnegative>
                        | "--if-balance-under" <ape-nonnegative>
<nome_script> ::= <file-stem> [ ".json" ]      ; no path separators; suffix is appended when omitted
<command-token> ::= <token>                    ; stored in JSON by write
<json-command> ::= '{' '"command"' ':' '[' ( <command-map> | <flag-token> )+ ']' '}'
<command-map> ::= '{' <token-key> ':' <command-value> ( ',' <token-key> ':' <command-value> )* '}'
<command-value> ::= <token> | true | false | <structured-arg>
<structured-arg> ::= '{' '"arg"' ':' <token-key> ',' '"value"' ':' '[' <token>+ ']' '}'
<script-default> ::= "--auto" "simple" | "--solver" "best" | "--human" <human-weighted-default> ; only where supported
<seconds> ::= <positive-integer>               ; default 60
<ape-nonnegative> ::= <number>                 ; decimal APE amount; value >= 0
```

`script` requires exactly one action: `write`, `watch`, or `read`; there is no implicit default action. Scripts are JSON command files under `APECHURCH_CLI_SCR_DIR`, which defaults to `$APECHURCH_CLI_CONFIG_DIR/scripts`. The `.json` suffix is appended to `<nome_script>` when omitted, so `custom_script` and `custom_script.json` address the same file.

`script write <nome_script> <command-token>+` converts the remaining command tokens into JSON and writes `$APECHURCH_CLI_SCR_DIR/<nome_script>.json` when the suffix is omitted. JSON command objects store `option: value` pairs; standalone strings store flags without parameters. Values shaped as `{ "arg": "name", "value": [...] }` render as editable `name=value` payloads. Known bare optional-value defaults are normalized to explicit values where supported: `--auto simple`, `--solver best` for Blackjack/Hi-Lo Nebula, and `--human weighted:3-9` for the current weighted bare-human timing profile. The `weighted:3-9` value preserves bare `--human`; plain `3-9` remains the uniform range form.

Example `$APECHURCH_CLI_CONFIG_DIR/scripts/custom_script.json`:

```json
{
  "command": [
    {
      "bot": "example-bot",
      "profile": {
        "arg": "profile",
        "value": [
          "conservative --limit 3"
        ]
      }
    },
    "--json"
  ]
}
```

`script read <nome_script>` reads the JSON file and prints a copy-pasteable plain shell command. It does not execute the command.

`script watch <nome_script>` reads the JSON file and executes it through `apechurch-cli`. `--every <seconds>` controls the poll/retry cadence and defaults to `60`. `--if-balance-over <APE>` gates launches on the selected wallet balance being strictly greater than the amount. `--if-balance-under <APE>` gates launches on the balance being strictly lower than the amount. When both balance conditions are supplied, both must be true.

The watcher records local state per script and does not launch another copy while the previous `custom_script` process group recorded for that script is still alive. This means a plain `apechurch-cli script watch custom_script` relaunches only after the previous script run terminates. A bot summary with top-level `status: "pending"` and a validated transaction hash, contract, and game ID uses a reserved resumable exit: the watcher relaunches the same argv and bypasses balance gates only for that checkpointed continuation. Ambiguous pending summaries fail normally; fresh runs remain gated, and normal completions and fatal failures clear resume mode. The state also records the next expected attempt and any wake delay, and each watch attempt/status line, including condition failures, launches, and delays of at least five seconds, starts with a cyan local timestamp formatted like `2026-JUL-08 14:05:09+0200`.

```bash
apechurch-cli script write custom_script bot example-bot "profile=conservative --limit 3" --json
apechurch-cli script read custom_script
apechurch-cli script watch custom_script
apechurch-cli script watch custom_script --every 60
apechurch-cli script watch custom_script --if-balance-over 500
apechurch-cli script watch custom_script --every 30 --if-balance-over 500 --if-balance-under 1500
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
               | "--grid" <grid>
               | "--split" <integer>
               | "--survive" <integer>
               | "--spins" <integer>
               | "--bet" <token>
               | "--cover" <cover>
               | "--range" <range>
               | "--multiplier" <multiplier>
               | "--out-range" <out-range>
               | "--picks" <integer>
               | "--numbers" <token>
               | "--timeout" <integer>
               | "--x-gameId" <uint256>
               | "--x-ref" <address>
               | "--x-userRandomWord" <bytes32>
               | "--gp-ape" <points>
```

```bnf
<grid> ::= "2x2" | "3x3" | "4x4"  ; Blocks only; omitted means "3x3"
```

| Option | Meaning |
|--------|---------|
| `--game <type>` | Stateless game key |
| `--amount <ape>` | Wager amount |
| `--risk <risk>` | Public risk level for Bear-A-Dice, Blocks, Plinko, Monkey Match, or Primes |
| `--grid <grid>` | Blocks board dimensions: exactly `2x2`, `3x3`, or `4x4`; default `3x3` |
| `--split <count>` | Independent attempts for Blocks (`1-5`), Plinko, Primes, Speed Keno, and slots |
| `--survive <count>` | All-or-nothing survival attempts for Bear-A-Dice and Blocks |
| `--spins <count>` | Slots-only alias for `--split` |
| `--bet <bet>` | Roulette or baccarat bet payload |
| `--cover <cover>` | ApeStrong cover, or a randomized Gimboz Smash cover |
| `--range <range>` | Gimboz Smash one-or-two target intervals |
| `--multiplier <x>` | Glyde or Crash target multiplier |
| `--out-range <range>` | Gimboz Smash outside bet expressed as one excluded range |
| `--picks <picks>` | Keno pick count |
| `--numbers <numbers>` | Keno numbers as one token, for example `1,7,13,25,40` or `random` |
| `--timeout <ms>` | Wait time for a result; `0` means no wait limit |
| `--x-gameId <uint256>` | Expert override for the generated `gameId` in `gameData` |
| `--x-ref <address>` | Expert override for the referral address in `gameData` |
| `--x-userRandomWord <bytes32>` | Expert override for the generated `userRandomWord` in `gameData` |
| `--gp-ape <points>` | Override local GP estimation for this run |

For Blocks, `--split 1-5` divides the wager across independent rolls and sums their payouts, while `--survive 1-5` compounds the full payout across rolls. The two options are mutually exclusive; omitting both uses `--survive 1`.

### `play`

```bnf
<play-command> ::= "play" [ <play-positional> ] <play-option>*
<play-positional> ::= <stateless-game> [ <ape> <token>* ]
                    | <stateful-game> [ <stateful-head> ] [ <token> ]
<stateful-head> ::= <ape> | "resume" | "status" | "clear" | "payouts" | "table" | <token>
<play-option> ::= <play-stateless-option> | <play-stateful-option> | <play-shared-option>
<play-stateless-option> ::= "--auto"
                          | "--risk" <token>
                          | "--grid" <grid>
                          | "--split" <integer>
                          | "--survive" <integer>
                          | "--spins" <integer>
                          | "--bet" <token>
                          | "--cover" <cover>
                          | "--range" <range>
                          | "--multiplier" <multiplier>
                          | "--out-range" <out-range>
                          | "--picks" <integer>
                          | "--numbers" <token>
                          | "--timeout" <integer>
                          | "--x-gameId" <uint256>
                          | "--x-ref" <address>
                          | "--x-userRandomWord" <bytes32>
<play-stateful-option> ::= "--auto" [ <auto-mode> ]
                         | "--game-id" <game-id>
                         | "--display" <display>
                         | "--side" <ape>
                         | "--solver-max-states" <count>
                         | "--solver-timeout-ms" <count>
                         | "--solver" [ <auto-mode> | "winston-ladder" ]
                         | "--tile" <token>
                         | "--cashout-after" <count>
<play-shared-option> ::= "--game" ( <stateless-game> | <stateful-game> )
                       | "--amount" <ape>
                       | "--strategy" <persona>
                       | "--loop"
                       | "--resilient"
                       | "--no-resilient"
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
                       | "--min-bet" <ape>
                       | "--gp-ape" <points>
                       | "-v"
                       | "--verbose"
                       | "--color"
                       | "--json"
```

The positional tail after `<ape>` is game-specific. See [GAMES_REFERENCE.md](./GAMES_REFERENCE.md) or `apechurch-cli game <name>` for the exact grammar per stateless game.

When using `--bet-strategy bankroll-fraction=<fraction>`, omit the positional wager amount. Prefer named game-configuration flags such as `--bet RED`, `--cover 50`, or `--survive 5` so numeric config values are not mistaken for an explicit wager amount.

Stateful games can also be routed through `play`, for example `apechurch-cli play blackjack 10 --auto`, `apechurch-cli play cash-dash 10 --tile 3`, or `apechurch-cli play video-poker 10 --auto best`. Direct commands such as `apechurch-cli blackjack 10` remain supported. When a stateful action needs an unfinished-game id through `play`, prefer `--game-id <id>` because `--game <name>` is already used for selecting the target game.

Bare `apechurch-cli play` no longer auto-runs a random game. Use `apechurch-cli play --auto` for the old automatic random-selection behavior, or pass an explicit game/amount.

#### Stateless Game Options

These options apply only to fire-and-forget games handled by the stateless game router.

| Option | Meaning |
|--------|---------|
| `--auto` | Opt into automatic random stateless game/config selection when no game is specified |
| `--risk <risk>` | Public risk level for Bear-A-Dice, Blocks, Plinko, Monkey Match, or Primes |
| `--grid <grid>` | Blocks board dimensions: exactly `2x2`, `3x3`, or `4x4`; default `3x3` |
| `--split <count>` | Independent attempts for Blocks (`1-5`), Plinko, Primes, Speed Keno, and slots |
| `--survive <count>` | All-or-nothing survival attempts for Bear-A-Dice and Blocks |
| `--spins <count>` | Slots-only alias for `--split` |
| `--bet <bet>` | Roulette or baccarat bet payload |
| `--cover <cover>` | ApeStrong cover, or a randomized Gimboz Smash cover |
| `--range <range>` | Gimboz Smash one-or-two target intervals |
| `--multiplier <x>` | Glyde or Crash target multiplier |
| `--out-range <range>` | Gimboz Smash outside bet expressed as one excluded range |
| `--picks <picks>` | Keno pick count |
| `--numbers <numbers>` | Keno numbers as one token |
| `--timeout <ms>` | Wait time for a stateless result; `0` returns the pending play response |
| `--x-gameId <uint256>` | Expert override for the generated `gameId` in `gameData` |
| `--x-ref <address>` | Expert override for the referral address in `gameData` |
| `--x-userRandomWord <bytes32>` | Expert override for the generated `userRandomWord` in `gameData` |

For Blocks, choose either `--split 1-5` (independent rolls) or `--survive 1-5` (compounding rolls). Supplying both is an error; supplying neither keeps the implicit `--survive 1` default.

#### Stateful Game Options

These options apply only to `blackjack`, `cash-dash`, `hi-lo-nebula`, and `video-poker` when routed through `play`.

| Option | Meaning |
|--------|---------|
| `--auto [mode]` | Stateful auto-play mode where supported (`simple` or `best`; Blackjack also supports `max`; Hi-Lo Nebula also supports `winston-ladder`) |
| `--game-id <id>` | Stateful unfinished-game id for resume/action when using `play <stateful-game>` |
| `--display <mode>` | Stateful display mode |
| `--side <ape>` | Blackjack player side bet |
| `--solver-max-states <n>` | Blackjack exact-EV recursive search state cap; default `50000` in `best` and `150000` in `max` for `--auto` or `--solver` |
| `--solver-timeout-ms <ms>` | Blackjack exact-EV worker timeout; default `5000` in `best` and `30000` in `max` for `--auto` or `--solver`, falls back to simple mode when exceeded |
| `--solver [mode]` | Show solver suggestions in supported stateful games; default mode is `best` |
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
| `--resilient` | Enable the hard-coded retry policies for transient transaction errors, reverted receipts, allowlisted contract guards, RNG/VRF errors, out-of-gas failures, network/DNS outages, and RPC-node errors |
| `--no-resilient` | Disable inherited resilient mode |
| `--delay <seconds>` | Delay between looped games |
| `--human [range]` | Add humanized loop pacing. Bare `--human` uses weighted 3-9s; `weighted:3-9` is the explicit form of that profile, while a range such as `2-17` uses a uniform random seconds window |
| `--max-games <count>` | Stop loop after N games |
| `--take-profit <ape>` | Stop loop when balance reaches the target |
| `--min-profit <ape>` | Stop loop when session P&L reaches the target profit |
| `--target-x <x>` | Stop loop when one game pays at least the target multiplier |
| `--target-profit <ape>` | Stop loop when one game pays at least the target payout |
| `--retrace <ape>` | Stop loop when one game loses at least this amount |
| `--recover-loss <ape>` | Stop loop when net session P&L returns to break-even/profit after a drawdown of at least this size |
| `--giveback-profit <ape>` | Stop loop when net session P&L returns to break-even/loss after a run-up of at least this size |
| `--stop-loss <ape>` | Stop before a play/loop iteration when wallet balance is at or below the threshold. If set without `--max-loss`/`--bankroll`, the session bankroll is derived as `starting balance - stop-loss` |
| `--max-loss <ape>`, `--bankroll <ape>` | Stop loop when session P&L reaches the loss limit. If set without `--stop-loss`, the wallet stop-loss is derived as `starting balance - bankroll` |
| `--bet-strategy <name>` | Loop bet progression, including `bankroll-fraction=<0..1>` |
| `--max-bet <ape>` | Loop safety cap for progressive strategies |
| `--min-bet <ape>` | Loop minimum bet floor for dynamic strategies |
| `--gp-ape <points>` | Override local GP estimation for this run |
| `-v`, `--verbose` | Show technical logs |
| `--color` | Force ANSI color in plain output; JSON output stays uncolored |
| `--json` | Emit JSON output only |

The resilient schedules are fixed, not configurable. Generic transient errors and reverted receipts use `30s`, `1m`, `2m`, `5m`, `10m × 6`, and `1h × 7` (17 retries over `8h08m30s`). Network/DNS outages, `PRICE TOO LOW, PvH GAMES PAUSED`, `All Games Paused`, `Paused`, propagated RNG/VRF errors, out-of-gas failures, and RPC-node errors use `3m`, `7m`, `10m × 5`, `30m × 10`, and `1h × 18` (35 retries over 24 hours). Retry notices include the next local attempt timestamp in `YYYY-MMM-DD HH:mm:ss±ZZZZ` form.

`bankroll-fraction=<fraction>` requires `--bankroll`/`--max-loss` or `--stop-loss`, and it conflicts with an explicit wager amount (`<amount>` or `--amount`). Each loop iteration bets `fraction * remaining bankroll`; `--max-bet` caps that dynamic wager and `--min-bet` floors it.

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
<bot-command> ::= "bot" [ <bot-name> ] [ <token>* ] [ "-h" | "--help" ] [ "--color" ] [ "--json" ] [ "--fallback-loss" <ape> "--fallback-bot" <bot-name> ] [ "--list" ]
<bot-name> ::= <token>
```

`bot` discovers personal local bot folders from `$APECHURCH_CLI_CONFIG_DIR/bots` by default, where `APECHURCH_CLI_CONFIG_DIR` defaults to `~/.apechurch-cli`. Set `APECHURCH_CLI_BOTS_DIR` when the bot root lives elsewhere, including a separate private or public Git repository; its value must be the actual local bot root that contains bot folders with `bot.json`, not a parent directory. Bot logs belong under `APECHURCH_CLI_LOG_DIR`, which defaults to `$APECHURCH_CLI_CONFIG_DIR/log`. Each bot is defined by `bot.json` plus an entry module. Use `bot --list` to inspect discovery, `bot --help` for the shared loader help, then `bot <name> ...` to execute one bot. Use `bot <name> -h` or `bot <name> --help` for bot-specific help.

The CLI is agnostic about bot strategy and implementation details: it discovers manifests, forwards tokens after the bot name, and exposes a narrow runtime helper surface. Local bots should document their own flags and may follow the shared conventions for `-h, --help`, `--color`, `--json`, `--fallback-loss <ape>`, `--fallback-bot <name>`, and standard loop controls. `--take-profit` and `--stop-loss` are absolute wallet thresholds that bots may forward unchanged to child plays and nested bots; `--min-profit` and `--max-loss` derive absolute thresholds from the bot's starting balance, while a lone `--stop-loss` derives the bot's relative bankroll as `starting balance - stop-loss`. `--max-routines` limits the main bot's own routines and is not forwarded; `--preflight` delays the main bot before balance reads and is not forwarded; `--max-games` remains a game loop option and is invalid when passed to a bot. Bot code is trusted local code, so only run bots from directories you control. See [BOTS.md](./BOTS.md) for the public bot development guide.

The runtime surface is intentionally narrow: bots receive positional args, command-registry helpers `resolveGame(command)` and `resolveBot(command)`, gameplay helpers `play(tokens)`, `playJson(tokens)`, `gamePaytable(name, tokens)`, `reconcilePendingPlay(payload, options)`, `validatePlayArgs(tokens)`, `botRun(name, tokens)`, `botJson(name, tokens)`, and `validateBotArgs(name, tokens)`, resume fields `resumeRequested` and `resumeSummary`, `session` helpers for output, command-line rendering, P&L accounting, fallback parsing, and colors, plus resolved `paths.configDir`, `paths.botsDir`, `paths.logDir`, and bot-specific `bot.logDir`. The resolvers use the same game catalog and bot registry as the CLI and return a descriptor or `null`; they do not execute or validate a wager. `gamePaytable` reads payout metadata without starting a game. Reconciliation reads only an already-submitted stateless game identified by `contract` and `gameId`; it never sends a replacement transaction. Bot summary logs are written under `paths.logDir/<bot-name>/` with a `.json` extension when the summary contains a full transaction hash, a positive recorded wager, or a resumable top-level `pending` status. Runs that fail, exit, or are interrupted before material gameplay still return or print their summary without creating empty local or mirrored log files.

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
                   | "--offline"
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
| `--leaderboard` | Show global and weekly wAPE wagered plus weekly play breakdowns, grouped from Sunday 00:00 UTC |
| `--scoreboard` | Append the cached Highest Multipliers and Biggest Payouts tables |
| `--url` | Show game URLs in terminal scoreboard tables |
| `--offline` | Read cached history without current GP or wAPE balance reads |
| `--refresh` | Download/refresh the history before rendering |
| `--from-block <n>` | Start block for `--refresh` |
| `--to-block <n>` | End block for `--refresh` |
| `--chunk-size <n>` | Initial maximum block span; oversized or timed-out RPC ranges shrink automatically |
| `--json` | Emit JSON output |

`history --refresh` merges newly fetched records into the existing cache. The initial `--chunk-size` maximum shrinks automatically when an RPC response is too large or times out, and the learned size is reused for later ranges in the same run. Completed initial ranges are checkpointed. Use `wallet download --from-block 0` when you want to rewrite the history file from genesis.

Cached metadata normalization is local. Plain `history` only adds current balance reads, while `--offline` performs no RPC calls. Missing metadata and incomplete stateful entries that require transaction or contract lookups are processed only during refresh/download, using bounded legacy backlogs.

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
| `--chunk-size <n>` | Initial maximum block span; oversized or timed-out RPC ranges shrink automatically |
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
<game-command> ::= "game" <game-name> [ "--paytable" <game-paytable-option>* ] [ "--json" ]
<game-paytable-option> ::= "--risk" <token>
                       | "--grid" <grid>
                       | "--split" <integer>
                       | "--survive" <integer>
                       | "--spins" <integer>
                       | "--picks" <integer>
                       | "--bet" <token>
                       | "--cover" <integer>
                       | "--range" <range>
                       | "--out-range" <range>
                       | "--multiplier" <multiplier>
                       | "--amount" <ape>
                       | "--side" <ape>
```

`<name>` accepts supported canonical game keys and the alias set listed in [Game Aliases](#game-aliases).

With `--paytable`, the command does not create a game or transaction. Plain output uses tables; `--json` emits a bot-ready object. Both formats always include every parameter that can change the selected paytable, with the value used for the calculation, and the overall gross `min_multiplier` and `max_multiplier` before transaction fees.

JSON multipliers are decimal strings; repeating ratios use up to 18 fractional digits. `multiplier_basis` is `gross_payout_over_wager_before_fees`. A dynamic jackpot bound is an explicit formula string, and a bound that cannot be established from public data is `null`. The payout portion of a three-pick, single-play Speed Keno result is:

```json
{
  "game": "speed-keno",
  "parameters": { "picks": 3, "split": 1 },
  "multiplier_basis": "gross_payout_over_wager_before_fees",
  "min_multiplier": "0.5",
  "max_multiplier": "25",
  "payouts_enumerated": true,
  "payout_count": 4,
  "payouts": [
    { "condition": "0 hits", "multiplier": "0.5" },
    { "condition": "1 hit", "multiplier": "0.5" },
    { "condition": "2 hits", "multiplier": "2.5" },
    { "condition": "3 hits", "multiplier": "25" }
  ]
}
```

Fixed `play` defaults are reused. If a required paytable parameter has no fixed default, the command fails and names the missing option. Roulette and Baccarat require `--bet` and `--amount`: the wager determines exact wei-level payouts, including Roulette bet splitting and Baccarat's Banker rounding. Video Poker requires `--amount` because the maximum bet enables its progressive jackpot. A split greater than one suppresses payout enumeration and reports only the overall bounds. Where wager rounding affects those bounds, `--amount` is required and included among the resolved parameters. A static single-attempt paytable is listed when the repository can enumerate it, including for stateful games with fixed payouts. The `400 APE` Video Poker jackpot is dynamic, so that configuration reports bounds only. Dynamic or insufficiently verified outcome spaces also report bounds only, and an unknowable public bound is represented by `null` rather than an invented value.

The public source and coverage for every game's payout values are listed in [PAYTABLE_SOURCES.md](./PAYTABLE_SOURCES.md).

Examples:

```bash
apechurch-cli game keno --paytable
apechurch-cli game speed-keno --paytable --picks 3 --split 1
apechurch-cli game speed-keno --paytable --picks 3 --split 3 --amount 1
apechurch-cli game jungle-plinko --paytable --risk 4 --split 1 --json
apechurch-cli game roulette --paytable --bet RED --amount 1
apechurch-cli game video-poker --paytable --amount 25 --json
```

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
                     | "--auto" [ <blackjack-auto-mode> ]
                     | "--solver" [ <blackjack-auto-mode> ]
                     | "--side" <ape-nonnegative>
                     | "--solver-max-states" <count>
                     | "--solver-timeout-ms" <count>
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
                     | "--min-bet" <ape>
                     | "--gp-ape" <points>
```

If the first positional token is numeric, the command starts a new hand with that amount. Blackjack uses the live H17 rule surface: the dealer hits soft 17, and `--auto simple` / `--auto best` / `--auto max` model that rule. `--auto best` and `--solver best` run the exact-EV search in a worker. `--solver-max-states <n>` defaults to `50000` recursive player states and `--solver-timeout-ms <ms>` defaults to `5000`; either guard falls back to simple mode. `--auto max` and `--solver max` use the same exact-EV worker with `150000` default states and a `30000` ms default timeout. In manual mode, `--solver [simple|best|max]` shows suggested actions without executing them; `best` and `max` show both the worker choice and the simple-strategy choice. `--human [range]` is a supported advanced option but intentionally hidden from standard `--help`.

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
                     | "--min-bet" <ape>
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
                        | "--auto" [ <hi-lo-auto-mode> ]
                        | "--solver" [ <hi-lo-auto-mode> ]
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
                        | "--min-bet" <ape>
                        | "--gp-ape" <points>
```

If the first positional token is numeric, the command starts a new run. `--solver` shows the manual `Suggested action` line and defaults to `best`; `--solver simple`, `--solver best`, and `--solver winston-ladder` select the same decision engines exposed by `--auto`. `--auto best` is a VRF-aware net-EV continuation solver over the verified rank-only branch table, using the live jackpot snapshot as the terminal bonus reference. `--auto winston-ladder` can play up to two on-chain games with the same initial bet, up to seven guesses per game, targeting a first-game 1.5x cashout or a 2.5x total ladder payout; VRF fees are ignored by that ladder target. `--human [range]` is supported but hidden from standard `--help`.

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
                       | "--min-bet" <ape>
                       | "--gp-ape" <points>
```

If the first positional token is numeric, the command starts a new hand. Valid opening wagers are fixed to `10`, `25`, `50`, `100`, `250`, or `400` APE. `--human [range]` is supported but hidden from standard `--help`.
