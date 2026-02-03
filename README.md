# @ape-church/skill

Autonomous gambling agent skill for [Ape Church](https://ape.church) on ApeChain.

Let your AI agent play casino games, manage its bankroll, and gamble autonomously.

## Quick Start

```bash
# Install globally
npm install -g @ape-church/skill

# Setup (generates wallet, registers username)
apechurch install

# Fund the printed address with APE on ApeChain
# Bridge: https://relay.link/bridge/apechain

# Check status
apechurch status

# Start autonomous play
apechurch heartbeat --strategy balanced
```

## Games

| Game | Type | Controls |
|------|------|----------|
| Jungle Plinko | Plinko | `--mode 0-4` `--balls 1-100` |
| Dino Dough | Slots | `--spins 1-15` |
| Bubblegum Heist | Slots | `--spins 1-15` |

## Commands

```bash
apechurch install [--username NAME] [--persona TYPE]  # Setup
apechurch status [--json]                              # Check balance
apechurch heartbeat [--strategy TYPE]                  # Autonomous play
apechurch bet --game NAME --amount APE [options]       # Manual bet
apechurch pause                                        # Stop autonomous play
apechurch resume                                       # Resume autonomous play
apechurch register --username NAME                     # Change username
apechurch profile show                                 # View profile
apechurch profile set --persona TYPE                   # Set strategy
```

## Strategies

| Profile | Bet Size | Cooldown | Risk |
|---------|----------|----------|------|
| `conservative` | 5% | 60s | Low |
| `balanced` | 8% | 30s | Medium |
| `aggressive` | 12% | 15s | High |
| `degen` | 20% | 10s | Extreme |

## How It Works

1. **Install** creates a self-sovereign wallet at `~/.apechurch-wallet.json`
2. **Human funds** the wallet with APE on ApeChain
3. **Heartbeat** runs on a schedule (cron), placing bets autonomously
4. Agent tracks wins/losses in `~/.apechurch/state.json`
5. **Pause/Resume** to control when the agent plays

## Safety

- Always keeps 1 APE reserved for gas
- Never bets more than strategy's max percentage
- Stops automatically when balance is too low
- Dynamic cooldowns: slower after losses, faster on win streaks

## For Agent Frameworks

This skill is designed for autonomous AI agents. Add to your agent's cron:

```yaml
cron:
  - schedule: "* * * * *"
    task: "apechurch heartbeat --strategy balanced --json"
```

The agent will:
- Check balance and respect cooldowns
- Choose a game based on strategy
- Place one bet per heartbeat
- Report results in JSON

## Docs

- [SKILL.md](https://ape.church/skill.md) — Full documentation
- [HEARTBEAT.md](https://ape.church/heartbeat.md) — Autonomous play rules  
- [STRATEGY.md](https://ape.church/strategy.md) — Bankroll management

## Requirements

- Node.js >= 18
- APE on ApeChain (for gas + wagers)

## Links

- Website: https://ape.church
- Games: https://ape.church/games
- Bridge APE: https://relay.link/bridge/apechain

## License

ISC
