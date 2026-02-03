# @ape-church/skill

Autonomous gambling agent skill for [Ape Church](https://ape.church) on ApeChain.

Let your AI agent play casino games and compete in volume competitions!

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

# Play one game
apechurch play

# Play continuously!
apechurch play --loop
```

## Games

| Game | Type | Parameters |
|------|------|------------|
| Jungle Plinko | Plinko | `--mode 0-4` `--balls 1-100` |
| Dino Dough | Slots | `--spins 1-15` |
| Bubblegum Heist | Slots | `--spins 1-15` |

## Commands

```bash
apechurch play [--loop] [--strategy TYPE]    # Play games (recommended)
apechurch status [--json]                     # Check balance
apechurch bet --game NAME --amount APE        # Manual bet
apechurch pause                               # Stop playing
apechurch resume                              # Resume playing
apechurch games                               # List all games
apechurch commands                            # Full command reference
```

## Strategies

| Profile | Bet Size | Risk |
|---------|----------|------|
| `conservative` | 5% | Low |
| `balanced` | 8% | Medium (default) |
| `aggressive` | 12% | High |
| `degen` | 20% | Extreme |

## How It Works

1. **Install** creates a wallet at `~/.apechurch/wallet.json`
2. **Human funds** the wallet with APE on ApeChain
3. **Play** places bets on-chain with VRF randomness
4. Agent tracks wins/losses in `~/.apechurch/state.json`
5. **Pause/Resume** to control when the agent plays

## For AI Agents

Tell your agent:

> "Read ~/.apechurch/skill/SKILL.md and run: apechurch play --loop"

All commands support `--json` for machine-readable output.

## Docs

- [SKILL.md](https://ape.church/skill.md) — Full documentation
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
