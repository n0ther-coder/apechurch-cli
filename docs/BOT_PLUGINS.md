# Bot Plugins

> Summary: Design boundary for private Ape Church CLI bot plugins. This repo uses `bots` for external gameplay algorithms to avoid overloading the existing betting-strategy terminology.

## Naming

Use `bots` for private gameplay algorithms.

`strategies` is already meaningful in this codebase: it refers to public bet-sizing progressions such as `flat`, `martingale`, `fibonacci`, and `dalembert`, plus persona-based stateless-game selection. Calling external loop-and-branching programs "strategies" would blur that existing API. `bots` is more accurate for metaprograms that run multiple `play` calls with conditionals, loops, and recovery logic.

## Directory

The default bot directory is:

```txt
~/.apechurch-cli/bots
```

The `APECHURCH_CLI_PLUGINS` environment variable is reserved as a base-directory override. It changes the parent directory, not the bot directory name.

```bash
APECHURCH_CLI_PLUGINS=/path/to/private-plugin
```

With that override, the effective bot directory is:

```txt
/path/to/private-plugin/bots
```

## Layout

Each bot lives in its own directory under the effective `bots` directory:

```txt
~/.apechurch-cli/bots/my-bot/
  bot.json
  index.js
```

Minimal manifest:

```json
{
  "name": "My Bot",
  "command": "my-bot",
  "description": "Private recovery bot",
  "entry": "./index.js"
}
```

Minimal entry module:

```js
export default async function ({ args, play, bot }) {
  if (args[0] === 'dry-run') {
    console.log(`loaded ${bot.command}`);
    return 0;
  }

  return play(['blackjack', '10', '--auto']);
}
```

Run it with:

```bash
apechurch-cli bot my-bot
apechurch-cli bot my-bot dry-run
apechurch-cli bot --list
apechurch-cli bot my-bot -h
```

## Standard Bot Output

Bot implementations are private. This repository contains only the loader and shared helper surface. Bots that make one or more `apechurch-cli play ...` calls should use the `session` helper object passed in the bot runtime context, or the equivalent helpers exported from `lib/bots/session.js` when developing inside this repo.

Every bot should accept:

- `-h, --help`: print the bot's own usage, options, purpose, and operating model. `apechurch-cli bot --help` is reserved for the shared bot loader; `apechurch-cli bot <name> -h` and `apechurch-cli bot <name> --help` are the standard forms for bot-specific help.
- `--json`: print one parseable JSON payload on stdout. Include each nested `play --json` payload under the corresponding game entry. When calling another bot, call it with `--json` and embed that payload under a `fallback` or similarly named object.
- `--fallback-loss <ape>` and `--fallback-bot <name>`: these must be specified together. If the current bot's total P&L is negative and `abs(P&L) >= <ape>`, call `<name>` with initial amount `<ape>`.

Human-readable bot output should use this four-line per-game shape:

```text
# balance: <balance>, win_rate: <won>/<tot>, payout_ape: <total payouts>, wager_ape: <total wagered>, pnl: <pnl>
apechurch-cli play <game> ...
# game_n: <n>, status: <status>, bet: <bet>, payout: <payout>, multiply: <payout/bet>

```

After the final game, print the balance line one more time. Use dim white keys, yellow commands, bright green positive P&L, bright red negative P&L, and magenta bet values. The shared formatter functions already implement those colors.

Use `session.formatCommandLine(tokens)` for the command line and `playJson(tokens)` for individual gameplay calls so the bot can parse the exact payload that `apechurch-cli play ... --json` would return. The bot runtime forces win chimes for nested JSON gameplay calls, so wins still make the same sound a direct human command would make.

Do not commit private bot strategy, wager-sizing logic, or bot-specific tests to this repository. Keep private bot implementations in the external bots directory and test them in their private workspace.

## Execution Boundary

Bot plugins should be routed through the `play` surface only. The public CLI now supports the stateful games through `play` as well as their direct commands:

```bash
apechurch-cli play blackjack 10 --auto
apechurch-cli play cash-dash 10 --tile 3
apechurch-cli play hi-lo-nebula 10 --auto best
apechurch-cli play video-poker 10 --auto best
```

That keeps private automation code on one gameplay-only interface instead of requiring access to top-level commands such as `wallet`, `send`, `house`, or `profile`.

When authoring bot docs or command wrappers, keep the two play surfaces separate:

- Stateless options configure one-shot contract games, for example `--risk`, `--balls`, `--spins`, `--range`, `--numbers`, `--runs`, and expert `--x-*` payload overrides.
- Stateful options configure multi-step games, for example `--game-id`, `--display`, `--side`, `--solver`, `--tile`, and `--cashout-after`.

Shared loop controls such as `--loop`, `--max-games`, `--take-profit`, `--max-loss`, `--bet-strategy`, and `--gp-ape` sit outside that split.

The runtime context passed to a bot is intentionally narrow:

- `args`: positional arguments passed after the bot name
- `play(tokens)`: reruns the public `apechurch-cli play ...` surface
- `playJson(tokens)`: reruns `apechurch-cli play ... --json` and returns the parsed response
- `botRun(name, tokens)`: reruns another bot with human-readable output
- `botJson(name, tokens)`: reruns another bot with `--json` and returns the parsed response
- `session`: shared output, command-line rendering, parsing, P&L, color, and fallback helpers for private bots
- `bot`: manifest metadata such as `command`, `name`, and filesystem paths

## Important Security Note

> Bot plugins are a code-organization and distribution boundary, not a security sandbox.
>
> Any Node.js module loaded into the CLI process can execute local code with the same permissions as the CLI process. A plugin can read local files, access environment variables, import modules, and interact with the wallet APIs available to that process if those APIs are exposed to it.
>
> Only load bot plugins you trust. The intended safety control is to expose a narrow gameplay API to trusted private bot code, not to safely run untrusted third-party plugins.
