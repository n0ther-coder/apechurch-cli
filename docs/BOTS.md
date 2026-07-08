# Personal Bot Development

> Summary: Public guide for building personal Ape Church CLI bots against the `apechurch-cli bot` loader and runtime helpers.

`apechurch-cli` supports personal local bots as trusted extensions. This public repository contains the bot loader, runtime helpers, and implementation contract; personal bot implementations live in a separate local directory or Git repository chosen by the operator. A bot is an external gameplay automation module that runs public `apechurch-cli play ...` commands through the CLI bot loader. Bots can be written for human operators, AI agents, or both.

Bot code is trusted local code, not sandboxed code. Only run bots from directories you control.

Use bots for loop-and-branching gameplay algorithms. The CLI's built-in `strategies` are public bet-sizing progressions such as `flat`, `martingale`, `fibonacci`, and `dalembert`; personal bots are a separate layer for custom workflows that compose CLI plays, nested bots, guard rails, and reporting.

## Repository Model

A bot root is any directory that contains one folder per bot. That directory can be a private Git repository, a public Git repository, a local working directory, or the default `$APECHURCH_CLI_CONFIG_DIR/bots` directory. The CLI treats all of these the same way and does not require bot code to be part of the `apechurch-cli` repository.

Typical separate-repository setup:

```bash
git clone <your-bot-repository-url> /path/to/local-bots
export APECHURCH_CLI_BOTS_DIR=/path/to/local-bots
apechurch-cli bot --list
```

You can also keep a local checkout at `./bots` inside an `apechurch-cli` working tree if that is convenient:

```bash
git clone <your-bot-repository-url> ./bots
export APECHURCH_CLI_BOTS_DIR="$PWD/bots"
apechurch-cli bot --list
```

The public repository ignores `./bots`, so a local bot checkout there remains local to that machine. Switching between bot sets is just a matter of pointing `APECHURCH_CLI_BOTS_DIR` at a different bot root.

## Discovery

`apechurch-cli bot` discovers bot folders from:

```text
$APECHURCH_CLI_CONFIG_DIR/bots
```

`APECHURCH_CLI_CONFIG_DIR` defaults to `~/.apechurch-cli` and is the root for local CLI config/data. Set `APECHURCH_CLI_BOTS_DIR` when the bot root lives elsewhere, including when the bot root is a separate repository. `APECHURCH_CLI_BOTS_DIR` must point directly at the actual bots root that contains bot folders with `bot.json`; it is not interpreted as a parent directory.

Bot logs belong under `APECHURCH_CLI_LOG_DIR`, which defaults to `$APECHURCH_CLI_CONFIG_DIR/log`. The runtime exposes the root as `ctx.paths.logDir` and the current bot subdirectory as `ctx.bot.logDir`; log files are stored under `APECHURCH_CLI_LOG_DIR/<bot-name>/`.

The CLI creates a valid JSON run log as soon as a bot starts, lets bots update it while they run, and closes the same file with the final status. If a bot throws or receives `SIGINT`/`SIGTERM`, the CLI preserves the latest partial summary and writes `status: "error"` or `status: "interrupted"` before returning control. Hard kills such as `SIGKILL` cannot be logged.

Remote R2 mirroring is optional and best-effort. Configure it with `apechurch-cli bucket install <bucket>`; credentials are encrypted locally under `$APECHURCH_CLI_CONFIG_DIR/r2/<bucket>.json` using the same password source as the wallet (`APECHURCH_CLI_PASS` for non-interactive runs). Install/reinstall auto-enable the installed bucket. `apechurch-cli bucket enable <bucket>` enables a stored encrypted entry for future bot runs, and `apechurch-cli bucket disable` stops remote mirroring by removing only the current selector while preserving encrypted entries. When enabled, the remote object key is `<prefix>/<same relative path under APECHURCH_CLI_LOG_DIR>`, so a local `log/bob/bob.<timestamp>.json` mirrors to `<prefix>/bob/bob.<timestamp>.json`. Local logs remain authoritative if R2 upload is unavailable.

```bash
export APECHURCH_CLI_CONFIG_DIR=/path/to/local-config
# Effective bot directory: /path/to/local-config/bots
# Effective bot log directory: /path/to/local-config/log

export APECHURCH_CLI_BOTS_DIR=/path/to/local-bots
export APECHURCH_CLI_LOG_DIR=/path/to/local-bot-logs
# Effective bot directory: /path/to/local-bots
# Effective bot log directory: /path/to/local-bot-logs
```

Run a bot with:

```bash
apechurch-cli bot --list
apechurch-cli bot <bot-command> [args...]
apechurch-cli bot <bot-command> -h
apechurch-cli bot <bot-command> --help
```

## Directory Layout

Each bot lives in its own directory under the configured bot root:

```text
local-bots/
  my-bot/
    README.md
    bot.json
    index.js
    package.json
```

`README.md` is strongly recommended for every bot. `package.json` is optional inside a bot directory unless the bot needs local package metadata. Keep bot-specific strategy, usage, live-execution, and output documentation in that bot's own `README.md`. Bot entry modules use ESM.

## Bot README

Every bot-specific README should explain the bot well enough for an operator or maintainer to understand what it will do before running it. Use this structure:

```markdown
# <Bot Name>

## What It Is

## What It Does

## Strategy Question

## Possible Outcomes

## Usage

## Live Execution

## Output
```

Write those sections as follows:

- `What It Is`: identify the bot, the game or games it targets, and whether it is recovery, farming, exploration, routing, or another kind of automation.
- `What It Does`: describe the operational behavior: what commands it submits, when it loops, when it stops, and what inputs scale or configure it.
- `Strategy Question`: state the exact question the strategy is trying to answer, including target, loss cap, bankroll assumptions, minimum wager rules, or other constraints. If the bot is not strategy-driven, state the decision rule it follows instead.
- `Possible Outcomes`: list every final status the bot can return, including success, normal stop/loss-cap conditions, fallback conditions, dry-run/mock statuses, and error or indeterminate-live-play conditions.
- `Usage`: show the CLI syntax, required positional arguments, bot-specific options, standard bot options, and at least one dry-run or mock example when available.
- `Live Execution`: describe the exact `apechurch-cli play ...` surface used, how wagers or selections are built, how settled results are read, and how the bot handles timeout, rate-limit, nonce, RPC, or other uncertain transaction states.
- `Output`: document human-readable output and the JSON payload shape, including important fields, per-game entries, final status fields, and fallback payloads if supported.

## Manifest

Every bot directory must contain `bot.json`.

```json
{
  "name": "My Bot",
  "command": "my-bot",
  "description": "Personal recovery bot",
  "entry": "./index.js"
}
```

Fields:

- `name`: human-readable name shown by `apechurch-cli bot --list`.
- `command`: lowercase command token used as `apechurch-cli bot <command>`. Use lowercase letters, numbers, and hyphens.
- `description`: short one-line description.
- `entry`: module path relative to the bot directory. Defaults to `./index.js` when omitted.

## Minimal Bot

```js
export default async function ({ args, play, bot }) {
  if (args[0] === 'dry-run') {
    console.log(`loaded ${bot.command}`);
    return 0;
  }

  return play(['blackjack', '10', '--auto']);
}
```

The entry module must export a default function or a named `run` function. Return an integer process code; omitted or non-integer returns are treated as `0`.

## Runtime Context

The bot handler receives one context object:

- `args`: tokens passed after the bot name.
- `binaryName`: CLI binary name, normally `apechurch-cli`.
- `bot`: manifest metadata and resolved filesystem paths. `bot.logDir` is the current bot subdirectory under `APECHURCH_CLI_LOG_DIR`.
- `paths`: resolved shared paths: `configDir`, `botsDir`, and `logDir`.
- `play(tokens)`: run `apechurch-cli play ...` with inherited terminal output.
- `playJson(tokens)`: run `apechurch-cli play ... --json` and return the parsed payload.
- `validatePlayArgs(tokens)`: validate `apechurch-cli play ...` target tokens without starting a game.
- `botRun(name, tokens)`: run another bot with inherited terminal output.
- `botJson(name, tokens)`: run another bot with `--json` and return the parsed payload.
- `validateBotArgs(name, tokens)`: validate another bot's startup arguments without running that bot.
- `statusJson()`: run `apechurch-cli status --json`.
- `balanceJson()`: read the local wallet balance through the CLI wallet runtime.
- `captureBalanceSnapshot(details)`: read the wallet balance and record a structured snapshot for the final bot JSON.
- `updateRunSummary(summary)`: atomically rewrite the current run JSON log with a partial summary.
- `session`: shared bot helpers for parsing, formatting, colors, P&L, and fallback behavior.

Route gameplay through `play` or `playJson`. Bots should not depend on hidden contract APIs or on unrelated top-level CLI commands such as `wallet`, `send`, `house`, or `profile`.

## Standard Arguments

Every bot should support:

- `-h, --help`: print the bot's own usage, options, purpose, and operating model. `apechurch-cli bot --help` is reserved for the shared loader.
- `--json`: print one final parseable JSON payload on stdout.
- `--color`: force ANSI-colored plain output even when stdout is not detected as an interactive TTY. JSON stdout remains parseable; any plain progress emitted during JSON runs goes to stderr through the shared runtime.
- `--fallback-loss <ape>` and `--fallback-bot <name>`: specify both together. If the current bot finishes below break-even and `abs(P&L) >= <ape>`, call the fallback bot with `<ape>` as its first argument.

Unless a bot has more specific implementation instructions, and documents those instructions in both its README and inline help, every bot should also accept the standard loop controls below:

- `--take-profit <ape>` and `--stop-loss <ape>`: absolute wallet balance thresholds for the complete bot run. Bots should forward these exact absolute values to every CLI play and nested bot call so execution can stop inside a child ladder as soon as the wallet crosses either boundary.
- `--min-profit <ape>` and `--max-loss <ape>`: relative gross P&L shortcuts for the complete bot run. At startup, derive absolute wallet `--take-profit` and `--stop-loss` thresholds from the current wallet balance and forward those derived absolute values to every CLI play and nested bot call.
- `--bankroll <ape>`: alias for `--max-loss`, used by bots or strategies that express their loss budget as bankroll instead of max loss.
- `--recover-loss <ape>` and `--giveback-profit <ape>`: net wallet P&L controls for the complete bot run. `--recover-loss` arms after P&L reaches `-<ape>` or worse and stops at break-even/profit; `--giveback-profit` arms after P&L reaches `+<ape>` or better and stops at break-even/loss.
- `--max-routines <count>`: limits routines of the main bot only. Do not forward this option to games, nested bots, or child games.
- `--gp-ape <points>`: forwarded to each CLI play launched by the bot.
- `--human [range]`: bots propagate this to every child CLI play and nested bot. Bare `--human` uses the weighted 3-9s profile; `weighted:3-9` is the explicit serialized form of that profile, while ranges such as `2-17` use a uniform random seconds window. Bots that manage child run loops may also apply it internally between child runs.
- `--delay <seconds>`: fixed pacing between one bot routine and the next. It is added on top of `--human` at that routine boundary and is never forwarded to child CLI plays or nested bots.
- `--preflight <seconds>`: delayed start before the bot begins its first routine. It is never forwarded to child CLI plays or nested bots.

Other options are invalid unless the bot explicitly defines them.

Use `ctx.session.parseStandardBotArgs(ctx.args)` first, then parse the returned `remainingArgs` for bot-specific arguments. Use the returned `loopControls` with the shared session helpers so standard guard behavior stays consistent.

```js
export default async function run(ctx) {
  const standard = ctx.session.parseStandardBotArgs(ctx.args);
  const options = {
    json: standard.json,
    fallbackLoss: standard.fallbackLoss,
    fallbackBot: standard.fallbackBot,
    loopControls: standard.loopControls,
  };

  // Parse standard.remainingArgs here.
  return 0;
}
```

## Guard Handling

Before a live run, a bot should confirm unsafe missing guards:

- If neither `--stop-loss` nor `--max-loss` is provided, ask for confirmation before proceeding and warn that the bot could drain all available funds.
- If `--max-loss` is provided without `--stop-loss`, calculate an absolute wallet `--stop-loss` from the current balance and pass that same absolute threshold to every CLI play or nested bot call.
- If `--stop-loss` is provided without `--max-loss`, calculate the bot's relative bankroll as `starting balance - stop-loss` for gross P&L checks.
- If neither `--take-profit` nor `--min-profit` is provided, ask for confirmation before proceeding and warn that the bot theoretically terminates only in loss.
- If `--min-profit` is provided without `--take-profit`, calculate an absolute wallet `--take-profit` from the current balance and pass that same absolute threshold to every CLI play or nested bot call.

## Output Contract

Human-readable output should use this shape for each game:

```text
# balance: <balance>, win_rate: <won>/<total>, payout_ape: <total payouts>, wager_ape: <total wagered>, pnl: <pnl>
apechurch-cli play <game> ...  # bet: <bet>, payout: <payout> (<payout-bet>)
```

After the final game, print the balance line one more time. Prefer the session formatters instead of hand-building this output:

- `session.formatBeforeGameLine(...)`
- `session.formatCommandLine(tokens, { binaryName, colorOutput })`
- `session.formatPlayCommandSuffix(payload, { colorOutput })`
- `session.formatCommandEconomicsSuffix(economics, { colorOutput })`
- `session.colorPnl(...)`
- `session.colorCommand(...)`

For JSON mode, return exactly one final summary object. The loader enriches returned summaries with `run_id`, `root_run_id`, parent call metadata, timestamps, raw `args`, `balance_snapshots`, and `nested_bot_calls`. Include each nested `playJson` payload under the matching game entry. During long runs, also pass the same summary shape to `ctx.updateRunSummary({ ...summary, status: "running" })` after each completed iteration so the JSON log remains reconstructable if the process is interrupted.

When calling another bot, call it with `botJson` and embed that payload under `fallback` or another explicit field; the loader also links the separate child JSON log back to the parent through `parent_run_id` and `parent_call_id`.

## P&L And Safety

Use integer wei math for wager sizing and P&L accounting. Avoid floating-point math for values that will be submitted as wagers.

Use `session.getSettledPlayEconomics(payload, gameNumber, botName)` to extract settled wager, payout, and P&L from `playJson` results. If a result is not settled, stop or surface the error instead of guessing.

Do not blindly retry live plays after an indeterminate RPC state such as timeout, rate limit, connection failure, or nonce trouble. A retry can duplicate a wager when the transaction state is unknown. Check wallet history or status before rerunning.

## Play Surface

Bots use the public `play` surface for both stateless and stateful games.

Examples:

```bash
apechurch-cli play blackjack 10 --auto
apechurch-cli play cash-dash 10 --tile 3
apechurch-cli play hi-lo-nebula 10 --auto best
apechurch-cli play video-poker 10 --auto best
```

Keep option families separate when building command tokens:

- Stateless game options configure one-shot contract games, for example `--risk`, `--split`, `--survive`, slots-only `--spins`, `--cover`, `--range`, `--numbers`, and expert `--x-*` payload overrides.
- Stateful game options configure multi-step games, for example `--game-id`, `--display`, `--side`, `--solver`, `--tile`, and `--cashout-after`.
- Bot-level loop controls are parsed by the bot and forwarded only where the standard bot contract says to forward them. Do not pass unrelated CLI loop controls such as `--loop` or `--bet-strategy` unless the bot specifically supports and documents them.

## Implementation Checklist

Before considering a bot ready:

- The bot directory includes a bot-specific `README.md` with the recommended structure above.
- `apechurch-cli bot --list` discovers it without manifest errors.
- `apechurch-cli bot <name> -h` prints bot-specific help.
- `apechurch-cli bot <name> --json ...` prints exactly one JSON payload.
- Dry-run or mock mode covers branch logic without live wagers.
- Live execution stops on unsettled or indeterminate play results.
- Fallback options are parsed through `session.parseStandardBotArgs`.
- Standard loop controls are parsed through `session.parseStandardBotArgs`, enforced against gross bot P&L, and forwarded according to the standard bot contract.
- Human-readable output uses the shared session formatters.
- Wager sizing and P&L use integer wei math.
