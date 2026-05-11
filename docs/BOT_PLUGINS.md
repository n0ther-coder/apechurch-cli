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
```

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
- `bot`: manifest metadata such as `command`, `name`, and filesystem paths

## Important Security Note

> Bot plugins are a code-organization and distribution boundary, not a security sandbox.
>
> Any Node.js module loaded into the CLI process can execute local code with the same permissions as the CLI process. A plugin can read local files, access environment variables, import modules, and interact with the wallet APIs available to that process if those APIs are exposed to it.
>
> Only load bot plugins you trust. The intended safety control is to expose a narrow gameplay API to trusted private bot code, not to safely run untrusted third-party plugins.
