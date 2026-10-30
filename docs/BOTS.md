# Personal Bot Development

CLI 30 changes accounting and breaks compatibility with earlier scripts.
See the [migration comparison](migrations/v30.md) before updating integrations.

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

Remote R2 mirroring is optional and best-effort. Configure it with `apechurch-cli bucket:log install <bucket>`; credentials are encrypted locally under `$APECHURCH_CLI_CONFIG_DIR/r2/<bucket>.json` using the same password source as the wallet (`APECHURCH_CLI_PASS` for non-interactive runs). Install/reinstall auto-enable the installed bucket. `apechurch-cli bucket:log enable <bucket>` enables a stored encrypted entry for future bot runs, and `apechurch-cli bucket:log disable` clears the selection for future operations/new bot processes while preserving encrypted entries. Already-running bots keep their loaded mirror configuration. Create the remote bucket first; see the [setup and credential security guide](BUCKETS.md). When enabled, the remote object key is `<prefix>/<same relative path under APECHURCH_CLI_LOG_DIR>`, so a local `log/example-bot/example-bot.<timestamp>.json` mirrors to `<prefix>/example-bot/example-bot.<timestamp>.json`. Local logs remain authoritative if R2 upload is unavailable.

Use `apechurch-cli bucket:log sync [path] [-r]` to reconcile local logs with the enabled R2 bucket after the fact. Without `-r`, it includes direct files only; use `bucket:log sync -r` for every bot folder. It preserves relative paths and reconciles timestamped JSON logs without deleting either side. Use `apechurch-cli bucket:log presign [path/file] [-t <timeout>]` to print a cached or newly signed URL for a mirrored JSON log; `-o <file> --force` fetches that JSON into a local file or directory.

For an independent command-script bucket, use `apechurch-cli bucket:script`. See the [R2 bucket reference](COMMAND_REFERENCE.md#r2-buckets) for configuration, script maintenance, remote-only `empty`, and presign examples. `empty` does not remove local logs; a later sync can upload them again.

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

## Offline argument validation

`apechurch-cli bot <name> ... --validate-only` imports the entry module without
calling its gameplay handler or creating a runtime context. Export
`parseArgs(args, session)` for a bot with no configurable children. A bot that
composes other commands must export
`async validateArgs(args, session, validationContext)` instead, reuse its parser,
and await validation of every configured child that can be checked at startup.
The loader prefers `validateArgs` over `parseArgs`.

The validation context exposes only `session`, `resolveGame(name)`,
`resolveBot(name)`, `validatePlayArgs(tokens)`, and
`validateBotArgs(name, tokens)`. Resolvers use the CLI's game catalog and bot
registry. Play validation invokes only `play --validate-only`; bot validation
recursively invokes the child's exported validator. Repeated calls in separate
branches are allowed; recursive call cycles and nesting beyond 32 validators
are rejected. It does not expose wallet access, gameplay, waits or log writers.
Validators themselves are trusted module code and must remain free of these
side effects, including during module import.

```js
export async function validateArgs(args, session, validation) {
  const options = parseArgs(args, session);
  await validation.validatePlayArgs(options.playTokens);
  if (options.childBot) {
    await validation.validateBotArgs(options.childBot, options.childArgs);
  }
  return options;
}
```

Validate known fixed child amounts as well as their options. Explain in the
bot's own documentation which result-dependent amounts cannot be determined
offline, and validate those again immediately before execution. A `valid`
response confirms the checks implemented by the bot's validation export; it
does not establish wallet availability, future outcomes, fees or affordability.

## Runtime Context

The bot handler receives one context object:

- `args`: tokens passed after the bot name.
- `resumeRequested`: `true` only when `script watch` is relaunching a run whose previous summary remained `pending`.
- `resumeSummary`: the newest local `pending` summary for the same bot and matching invocation arguments (precision is restored and validated separately), or `null`. Use it only to reconcile the already-submitted play; do not start a replacement wager.
- `binaryName`: CLI binary name, normally `apechurch-cli`.
- `bot`: manifest metadata and resolved filesystem paths. `bot.logDir` is the current bot subdirectory under `APECHURCH_CLI_LOG_DIR`.
- `paths`: resolved shared paths: `configDir`, `botsDir`, and `logDir`.
- `play(tokens)`: run `apechurch-cli play ...` with inherited terminal output.
- `playJson(tokens)`: run `apechurch-cli play ... --json` and return the parsed payload.
- `reconcilePendingPlay(payload, options)`: read an existing stateless play by its returned `contract` and `gameId`. It never submits a transaction; `timeoutMs` and `pollIntervalMs` control settlement polling.
- `gamePaytable(name, tokens)`: run `apechurch-cli game <name> --paytable ... --json` and return the parsed paytable description without starting a game. The payload includes all resolved paytable parameters and overall multiplier bounds. Pass `--amount` in `tokens` for Roulette, Baccarat, and split games whose bounds depend on wager rounding. Multipliers are decimal strings; repeating ratios use up to 18 fractional digits. A dynamic jackpot bound is a formula string and an unknown public bound is `null`.
- `resolveGame(command)`: resolve a game key or alias through the same playable-game catalog used by `apechurch-cli play`; returns the canonical descriptor or `null`.
- `resolveBot(command)`: resolve a bot command through the discovered-bot registry; returns its descriptor or `null`.
- `validatePlayArgs(tokens)`: validate `apechurch-cli play ...` target tokens without starting a game.
- `botRun(name, tokens)`: run another bot with inherited terminal output.
- `botJson(name, tokens, options)`: run another bot with `--json` and return the parsed payload. Resume markers are not inherited by fresh child commands; pass `{ resumeRequested: true }` only for the specific nested bot whose own pending summary must be continued.
- `validateBotArgs(name, tokens)`: validate another bot's startup arguments without running that bot.
- `statusJson()`: run `apechurch-cli status --json`.
- `balanceJson()`: read the local wallet balance through the CLI wallet runtime.
- `captureBalanceSnapshot(details)`: read the wallet balance and record a structured snapshot for the final bot JSON.
- `updateRunSummary(summary)`: atomically rewrite the current run JSON log with a partial summary.
- `estimatePlayCosts(name, {config, amountApe, gasUnits, additionalReserveApe})`: read-only planning estimate in wei, using current fees, RPC gas estimation and recent receipt calibration. See [cost planning](#cost-planning).
- `strategyPrecision`: effective decision precision, restored from saved state when resuming.
- `session`: shared bot helpers for parsing, formatting, colors, P&L, and fallback behavior.

Route gameplay through `play` or `playJson`. Bots should not depend on hidden contract APIs or on unrelated top-level CLI commands such as `wallet`, `send`, `house`, or `profile`.

## Strategy precision

`--strategy-precision <0..18|none>` defaults to `none`. It truncates the signed
APE difference between observed and required amounts toward zero for strategy
decisions. A shortfall strictly smaller than 0.01 APE is equivalent to zero at
precision `2`; exactly 0.01 APE is not. Negative values are symmetric.
Strict `<` and `>` comparisons treat the equivalence band as equality.

Convert multiplier and percentage thresholds to currency amounts, then truncate
toward zero to whole wei before comparison. Never quantize a payout ratio: the
absolute tolerance must not grow with the wager. Calculated monetary amounts,
including analysis, coverage sizing and logged shortfalls, have at most 18 APE
decimal places. `none` and `18` distinguish every whole wei in the shared comparator.
Coverage sizing can fall short after truncation; minimum and affordability
guards must still be enforced. Dimensionless ratios retain their own precision.

Use the precision only for strategy gates, repeats, targets, recovery decisions
and ladder progression. Keep affordability, wallet floors, capital/loss limits,
contract minimums, stake sizing, integrity checks, accounting, and statistical
classification exact. The option does not affect standalone game loops.

`ctx.session.parseStandardBotArgs` returns `loopControls.strategyPrecision` and
`strategyPrecisionExplicit`. For custom parsers, `extractStrategyPrecisionArgs`
returns `remainingArgs`, `precision`, and `explicit`. Scoped session parsers use
the effective inherited/restored value; an explicit child value wins, including
`none`, and a default never replaces an inherited value.

Use `createStrategyComparison(loopControls)` to obtain a comparator returning
-1, 0, or 1. Call `compare(observedWei, requiredNumeratorWei, denominator)` for
an exact rational threshold. Example: `compare(payoutWei, wagerWei * 103n, 100n)`
compares against 1.03 times the wager with an absolute APE tolerance.

The runtime inherits the effective option through `botRun`, `botJson`, and
`validateBotArgs`. A child resumed with `resumeRequested: true` restores its own
saved setting; an explicit override must match that setting. It does not forward the option to game transactions. For an
in-process child, pass `inheritStrategyPrecisionArgs(childArgs, precision)` or
an equivalent explicit inherited setting, respecting any child override.

Logs record the effective setting in invocation arguments. Pending summaries and
existing resume state are enriched with `strategy_precision`; implementations must also preserve
the setting with their controls before replaying decisions. Resume restores the
saved setting and rejects explicit changes before starting a new log or wager.
Legacy pending summaries without the setting resume with `none`.

Do not log each comparison. Where an evaluation already records `passed` or
`missed`, `strategyShortfall` supplies a nonzero `shortfall_ape` at full precision;
otherwise it returns no extra fields. Do not duplicate derivable exact/tolerated
flags. All amounts and PnL fields retain their original precision.

## Cost planning

`ctx.estimatePlayCosts(name, options)` keeps contract fees, gas and the explicit
additional reserve in integer wei. The returned `total_wei` is a planning
estimate; actual receipt costs remain authoritative for accounting and PnL.

Pass `config` and `amountApe` for the planned stateless game. The runtime reads
the selected wallet's public address and reuses the game encoder to prepare the
`play` request, then calls `estimateContractGas`. Preparation creates no signer,
transaction, game history entry or pending game. Invalid configurations still
raise errors; a failed RPC gas estimate falls back to calibrated/base gas.
When the amount or wallet address is unavailable, the helper still reads the
configured contract fee and current gas price without requesting a signature.

```js
const costs = await ctx.estimatePlayCosts('ape-strong', {
  config: { range: 70 }, amountApe: '20', additionalReserveApe: '0.02',
});
const reservedWei = BigInt(costs.total_wei);
```

The gas baseline is the larger of the RPC estimate and recent successful
receipt consumption for the same chain, contract and gas-relevant mode.
Without RPC, at least five recent samples are required to lower the initial
400,000-unit baseline. An expensive sample raises the baseline immediately.
A 15% buffer is applied, rounded upward. Explicit `gasUnits` provides a minimum
for the resulting reserve; `additionalReserveApe` is added afterward, once.
`gas_units` and `gas_source` identify the estimate's basis without adding
per-comparison or per-sample log events.

Successful stateless-game receipts feed a local cache automatically, including
receipts recovered during reconciliation. Pending/reverted attempts do not
train successful-play gas; their actual costs remain in the accounting ledger.
The cache at `$APECHURCH_CLI_CONFIG_DIR/cache/play-gas.json` retains at most 32
unique transaction samples per mode, 128 modes, for seven days. It stores gas
units and transaction identities for deduplication, without duplicating PnL,
fees, derived statistics or full payloads. Atomic writes and a short-lived lock
coordinate subprocesses; unavailable or malformed cache data falls back safely.
A file-signature cache avoids repeated JSON parsing and observes child updates.
Older history is not scanned or downloaded to seed the cache.

Re-estimate after choosing the final configuration/stake and recompute the plan
if costs rise. Configurations that generate random selections are representative
simulations unless their payload overrides are pinned. Estimates cover one
submission; future retries and later fee/gas-price changes remain uncertain.
Stake affordability, contract preflight, capital limits and recorded monetary
results retain their existing exact checks. A target shortfall allowance is
independent of cost estimation and is not introduced by this API.

## Standard Arguments

Every bot should support:

- `-h, --help`: print the bot's own usage, options, purpose, and operating model. `apechurch-cli bot --help` is reserved for the shared loader.
- `--json`: print one final parseable JSON payload on stdout.
- `--strategy-precision <0..18|none>`: strategic currency comparisons; default `none`.
- `--color`: force ANSI-colored plain output even when stdout is not detected as an interactive TTY. JSON stdout remains parseable; any plain progress emitted during JSON runs goes to stderr through the shared runtime.
- `--fallback-loss <ape|n%>` and `--fallback-bot <name>`: specify both together. If the current bot finishes below break-even and `abs(P&L) >= <ape>`, call the fallback bot with `<ape>` as its first argument.

Unless a bot has more specific implementation instructions, and documents those instructions in both its README and inline help, every bot should also accept the standard loop controls below:

- `--max-balance <ape>` and `--min-balance <ape>`: absolute wallet balance thresholds for the complete bot run. Bots should forward these exact absolute values to every CLI play and nested bot call so execution can stop inside a child ladder as soon as the wallet crosses either boundary.
- `--min-profit <ape|n%>` / `--take-profit` and `--max-loss <ape|n%>` / `--stop-loss`: net PnL Profit guards for the complete run. Percentages use its actual cumulative wager. They do not derive wallet thresholds.
- `--bankroll <ape>`: alias for `--max-loss`, used by bots or strategies that express their loss budget as bankroll instead of max loss.
- `--bankroll-stop <ape>`: shared residual-capital stop, available in every cap-capable context, with or without a cap. It accepts exact nonnegative APE, stops at equality, and does not reduce the sizing basis.
- `--bankroll-cap <ape>`: shared allocation cap and net-capital profit exit. It is available wherever `--bankroll` is supported. It may be used alone, with a wallet floor, or with an independent loss budget. See the runtime contract below.
- `--recover-loss <ape|n%>` and `--giveback-profit <ape|n%>`: net result PnL controls for the complete bot run. `--recover-loss` arms after P&L reaches `-<ape>` or worse and stops at break-even/profit; `--giveback-profit` arms after P&L reaches `+<ape>` or better and stops at break-even/loss.
- `--max-routines <count>`: limits routines of the main bot only. Do not forward this option to games, nested bots, or child games.
- `--gp-ape <points>`: forwarded to each CLI play launched by the bot.
- `--human [range]`: bots propagate this to every child CLI play and nested bot. Bare `--human` uses the weighted 3-9s profile; `weighted:3-9` is the explicit serialized form of that profile, while ranges such as `2-17` use a uniform random seconds window. Bots that manage child run loops may also apply it internally between child runs.
- `--delay <seconds>`: fixed pacing between one bot routine and the next. It is added on top of `--human` at that routine boundary and is never forwarded to child CLI plays or nested bots.
- `--preflight <seconds>`: delayed start before the bot begins its first routine. On an interactive terminal, Enter skips the current wait and Ctrl+C aborts. It is never forwarded to child CLI plays or nested bots.

Other options are invalid unless the bot explicitly defines them.

Use `ctx.session.parseStandardBotArgs(ctx.args)` first, then parse the returned `remainingArgs` for bot-specific arguments. Use the returned `loopControls` with the shared session helpers so standard guard behavior stays consistent.

### Interactive preflight wait

Implement the startup delay with the shared wait helper:

```js
await ctx.session.waitForStandardBotPreflight(loopControls, {
  defaultSeconds: 0,
  sleep: ctx.sleep,
});
```

`waitForStandardBotPreflight` retains the duration parsing of
`getStandardBotPreflightDelayMs` and returns `disabled`, `elapsed` or `skipped`.
For a positive delay with interactive stdin and stderr, it prints a hint on
stderr and accepts Enter to skip that wait. It preserves Ctrl+C interruption,
restores terminal mode and removes keyboard listeners before returning.
Other keys do not start the bot. JSON stdout remains unchanged.

Without an interactive terminal, it performs the configured timed wait through
the supplied `sleep` function or a normal timer. Zero delay does not attach
listeners or print a hint. Closing stdin disables the shortcut and leaves the
remaining timer running. Skipping changes neither configured controls nor
validation, and does not skip future preflights or ordinary pacing delays.
Do not call it during dry-run validation or pending resumption. No keystroke
forwarding to nested processes is provided.

### Capped allocation runtime contract

`--bankroll-cap K` allocates at most K APE at each fresh start. Let C be the
starting wallet balance, L the configured minimum balance (zero if omitted),
and A any absolute `--bankroll` / `--max-loss` amount:

```text
H = max(0, min(K, C − L, A if specified))
F = max(L, C − H + S)  # S = --bankroll-stop, zero if absent
remaining capital = H + cumulative actual net PnL
sizing capital = min(K, max(0, remaining capital))
```

With an explicit residual stop S, require 0 ≤ S < H and, if set, S < K.
At every standard control checkpoint, H + actual cumulative net PnL ≤ S
returns `bankroll_stop`, independently from raw wallet changes. The exact
net economics include costs of failed attempts. The stop works without a cap;
in that case omit K from the allocation and sizing minima.

The fixed effective wallet floor F applies to every child. A percentage loss
guard stays a net-PnL percentage guard and does not define initial capital.
Existing profit/loss, wallet, game-count and result controls remain independent.
When a completed control unit leaves remaining capital **strictly greater**
than K, return a normal `bankroll_cap` stop. Equality must allow play; a new
invocation with H = K must not immediately exit. No `--min-profit` is required.
The cap limits allocation and capital-based sizing, not cumulative wager,
fixed wagers, split/double exposure or strategy-specific boosts.

`prepareStandardBotLoopRuntime` resolves this allocation and keeps its exact
APE values in `runtime.state.bankrollCap`. Custom runtimes must set
`runtime.state.startingBalanceWei` and call
`configureStandardBotBankrollCap(loopControls, runtime)` before forwarding or
checking controls. `getStandardBotLoopCondition` uses matching net PnL, including
actual additional costs, and checks the cap after explicit standard guards.
For a control unit spanning multiple child calls, use
`includeBankrollCap: false` between calls and enable it at the completed unit
boundary; wallet and other safety controls remain active throughout.

Both forwarding helpers pass F as `--min-balance`. They do **not** forward the
parent cap, residual stop or its profit objective, which would create a different child
baseline. Keep the original configured options separate from the derived floor.
Pending resume must preserve the original allocation, floor and loop state,
and call `validateStandardBotBankrollCapResume` before restoring saved controls.
A fresh invocation recalculates them; there is no persistent reserve, automatic
relaunch or change to script-watch scheduling. Simulations must supply a known
starting wallet balance; the opening wager cannot stand in for that balance.

Regression coverage must include equality and one-wei surplus, costs offsetting
gross profit, explicit budgets smaller than the cap, wallet-floor forwarding,
completed versus unfinished control units, and pending resume without rebasing.

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

- If neither `--min-balance` nor `--max-loss` is provided, ask for confirmation before proceeding and warn that the bot could drain all available funds.
- A wallet floor may define initial strategy capital for sizing; it does not create an implicit net-PnL guard.
- If neither `--max-balance` nor `--min-profit` is provided, ask for confirmation before proceeding and warn that the bot theoretically terminates only in loss.

## Output Contract

Human-readable output should use this shape for each game:

```text
# <YYYY-MMM-DD HH:mm:ss±ZZZZ> | balance: <balance>, payout_ape: <total payouts>, wager_ape: <total wagered>, PnL Profit: <payouts-wagers-costs>
apechurch-cli play <game> ...  # bet: <bet>, payout: <payout> (PnL Profit: <payout-bet-costs> APE)
# routine: <n>, wagered: <routine wager>, PnL Profit: <payouts-wagers-costs>, multiplier: <payout/wager with two decimals>×
```

After the final game, print the balance line one more time. Prefer the session formatters instead of hand-building this output:

- `session.formatBeforeGameLine(...)`
- `session.formatCommandLine(tokens, { binaryName, colorOutput })`
- `session.formatPlayCommandSuffix(payload, { colorOutput })`
- `session.formatCommandEconomicsSuffix(economics, { colorOutput })`
- `session.colorPnl(...)`
- `session.colorCommand(...)`

`formatBeforeGameLine` and `formatIterationSummaryLine` always label the supplied result `net PnL`. Pass recorded net `totalPnlWei`, subtracting additional costs once. Wallet movement is a separate reconciliation value, not a substitute for game accounting. `formatCommandEconomicsSuffix` requires a known net `pnlWei`; when it is absent, the label is unavailable rather than an inferred gross result. Command suffixes use one `net PnL: <value>` field, without parentheses or a duplicate `net:` value; simulated costs must also be included before formatting.

For JSON mode, return exactly one final summary object. The loader enriches returned summaries with `run_id`, `root_run_id`, parent call metadata, timestamps, raw `args`, `balance_snapshots`, and `nested_bot_calls`. Include each nested `playJson` payload under the matching game entry. During long runs, also pass the same summary shape to `ctx.updateRunSummary({ ...summary, status: "running" })` after each completed iteration so the JSON log remains reconstructable if the process is interrupted.

When calling another bot, call it with `botJson` and embed that payload under `fallback` or another explicit field; the loader also links the separate child JSON log back to the parent through `parent_run_id` and `parent_call_id`.

## P&L And Safety

Use integer wei math for wager sizing and P&L accounting. Avoid floating-point math for values that will be submitted as wagers.

Use `session.getSettledPlayEconomics(payload, gameNumber, botName)` to extract settled wager, payout, and P&L from `playJson` results. If `playJson` returns a known `pending` play, preserve that payload under `pending_play` in the run summary and call `reconcilePendingPlay` on it. If it remains unresolved, return a summary whose top-level `status` is `pending`; only a checkpoint containing a valid transaction hash, contract, and game ID maps to the reserved resumable process exit. `script watch` then relaunches with `resumeRequested`, bypassing balance gates only for that checkpointed continuation. A later run with the same argv receives the prior record in `resumeSummary`. Other unsettled or malformed results remain fatal; never guess their economics.

Do not add a second bot-level retry loop around `playJson`. Pass `--resilient` and let the public transaction layer retain the original game/action payload and apply its centralized schedules. Bot-level `--resilient` is inherited by direct `play`/`playJson` calls unless the child argv explicitly contains `--no-resilient`. Once a transaction hash exists, confirmation failures are returned as pending instead of being resent; only `reconcilePendingPlay` may retry the settlement read. Re-running `playJson` for the same logical step can duplicate an action when transaction state is unknown.

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

- Stateless game options configure one-shot contract games, for example `--risk`, `--split`, `--survive`, `--spin`, `--cover`, `--range`, `--numbers`, and expert `--x-*` payload overrides.
- Stateful game options configure multi-step games, for example `--game-id`, `--display`, `--side`, `--solver`, `--tile`, and `--cashout-after`.
- Bot-level loop controls are parsed by the bot and forwarded only where the standard bot contract says to forward them. Do not pass unrelated CLI loop controls such as `--loop` or `--bet-strategy` unless the bot specifically supports and documents them.

## Implementation Checklist

Follow the [accounting contract](ACCOUNTING.md) for game and nested bot results.
Wager and payout are gross; multiplier is payout divided by matching actual
wager. PnL Profit is net of additional child costs. Preserve cost components for
callers and count each child transaction once. Keep historical planning estimates
distinct from actual exported execution costs.

Before considering a bot ready:

- The bot directory includes a bot-specific `README.md` with the recommended structure above.
- `apechurch-cli bot --list` discovers it without manifest errors.
- `apechurch-cli bot <name> -h` prints bot-specific help.
- `apechurch-cli bot <name> --json ...` prints exactly one JSON payload.
- Dry-run or mock mode covers branch logic without live wagers.
- Live execution stops on unsettled or indeterminate play results.
- Fallback options are parsed through `session.parseStandardBotArgs`.
- Standard loop controls are parsed through `session.parseStandardBotArgs`, enforced against actual net bot PnL, and forwarded according to the standard bot contract.
- Human-readable output uses the shared session formatters.
- Wager sizing and P&L use integer wei math.

## Result accounting checklist

Follow [ACCOUNTING.md](ACCOUNTING.md). `getSettledPlayEconomics` and
`getNestedBotEconomics` return gross wager/payout and net `pnlWei`; never
reconstruct payout from net PnL. Supply actual `totalWagerWei` and
`routineWagerWei` to standard guards so result percentages use matching scopes.
`getBotEconomicsFields` exports aggregate costs and deduplicates child receipt
hashes. Include fallback children as well as direct games.

Test positive payout ratios with negative net PnL, repeated calls with matching
cumulative W/P, changing cost estimates, and failed/resumed transactions.
Options called payout must represent payout multipliers; options called profit
or loss represent net results. Document any fixed opening-bet percentage budget
explicitly. Estimates must never be exported as actual transaction costs.

## Terminal failures and partial results

Call `ctx.updateRunSummary` after each settled child and before unrelated I/O.
Do not replace accumulated economic fields or child arrays with a minimal error
object. The runtime preserves the last progress snapshot when a handler throws,
returns a nonzero exit code or returns a minimal failed summary. Plain output
includes `# partial:` and an error diagnostic; JSON retains the partial state.
Pending results remain resumable and are not reported as completed failures.

`session.formatPartialRunSummary(summary)` formats accounted totals without
inventing a completed routine. A handler that already prints its terminal
failure may return `terminalOutputHandled: true` to avoid duplicate output;
this affects display only and never suppresses error logging or exit status.
Thrown errors may carry the same flag. Keep actual additional costs and
unresolved exposure separate, and never turn a failed submission into a game.

A new implementation must test residual-stop equality and one-wei boundaries,
cost-inclusive net PnL, unchanged full-capital sizing, multiple starting wallet
balances, fixed child-floor forwarding, and preservation/rejection of unchanged/
changed controls during pending resume. See [CLI 33 migration](migrations/v33.md)
and the [migration index](migrations/README.md).

## Configuration errors

A bot can identify invalid invocation/configuration errors by setting
`error.code = 'BOT_USAGE_ERROR'` or `error.botUsageError = true` before throwing.
The runtime maps these errors to `CONFIGURATION_ERROR_EXIT_CODE` (78).
Startup validation failures also use exit code 78. Unhandled nested CLI errors
retain this classification. When wrapping an error, preserve its configuration
marker so parent handlers can stop instead of retrying. Runtime/transaction
failures retain their existing behavior.

`script watch` stops after a child exits with code 78, clears its process state,
releases its lock, records `stop_reason: configuration_error`, and returns 78.
Correct the configuration before restarting the watcher. Pending exit code 75
continues to request reconciliation rather than a new wager.
