---
name: ape-church-gambler
description: Autonomous gambling skill for ApeChain. Play casino games, manage bankroll, compete in contests.
version: 1.2.0
homepage: https://ape.church
metadata: {"emoji": "🦍", "category": "gaming", "chain": "apechain"}
tools:
  - name: play
    cmd: apechurch-cli play [game] [amount] [config...] --json
  - name: play_loop
    cmd: apechurch-cli play --loop --json
  - name: blackjack
    cmd: apechurch-cli blackjack <amount> --auto --json
  - name: video_poker
    cmd: apechurch-cli video-poker <amount> --auto --json
  - name: status
    cmd: apechurch-cli status --json
  - name: games
    cmd: apechurch-cli games --json
  - name: pause
    cmd: apechurch-cli pause
  - name: resume
    cmd: apechurch-cli resume
---

# Ape Church CLI 🦍🎰

**Fully on-chain, decentralized casino on ApeChain.**

Every bet is placed and settled on-chain via smart contracts. Provably fair with Chainlink VRF randomness. No servers, no trust required.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [All Games](#all-games)
3. [Loop Mode & Automation](#loop-mode--automation)
4. [Betting Strategies](#betting-strategies)
5. [Blackjack](#blackjack)
6. [Video Poker](#video-poker)
7. [Commands Reference](#commands-reference)
8. [JSON Output Schemas](#json-output-schemas)
9. [Agent Play Patterns](#agent-play-patterns)
10. [Costs & Limits](#costs--limits)

---

## Quick Start

```bash
# Install
npm install -g @n0ther/apechurch-cli

# Optional for non-interactive local signing
export APECHURCH_CLI_PASS=your-local-password

# Optional to override the username/profile API
export APECHURCH_CLI_PROFILE_URL=https://www.ape.church/api/profile

# Fresh install/import prompts securely for the private key
apechurch-cli install --username MY_AGENT

# Fund wallet with APE on ApeChain (address shown after install)
# Bridge: https://relay.link/bridge/apechain

# Check status
apechurch-cli status

# Play one game
apechurch-cli play

# Play continuously
apechurch-cli play --loop
```

On a fresh install/reinstall, `apechurch-cli install` prompts securely for the private key with hidden input. If `~/.apechurch-cli/wallet.json` already exists, the encrypted wallet is reused and the private key is not requested again. `APECHURCH_CLI_PK` remains an optional non-interactive fallback, `APECHURCH_CLI_PASS` is required for non-interactive install/signing, and `APECHURCH_CLI_PROFILE_URL` overrides the default username/profile API.

---

## All Games

### Quick Reference

| Game | Command | Type | Key Parameters |
|------|---------|------|----------------|
| ApeStrong | `play ape-strong 10 50` | Dice | `--range 5-95` |
| Roulette | `play roulette 10 RED` | Table | `--bet RED,BLACK,0-36,00` |
| Baccarat | `play baccarat 10 BANKER` | Table | `--bet PLAYER,BANKER,TIE` |
| Jungle Plinko | `play jungle-plinko 10 2 50` | Plinko | `--mode 0-4` `--balls 1-100` |
| Keno | `play keno 10` | Keno | `--picks 1-10` `--numbers 1-40` |
| Speed Keno | `play speed-keno 10` | Keno | `--picks 1-5` `--games 1-20` |
| Dino Dough | `play dino-dough 10 10` | Slots | `--spins 1-15` |
| Bubblegum Heist | `play bubblegum-heist 10 10` | Slots | `--spins 1-15` |
| Monkey Match | `play monkey-match 10` | Match | `--mode 1-2` |
| Bear-A-Dice | `play bear-dice 10` | Dice | `--difficulty 0-4` `--rolls 1-5` |
| Blackjack | `blackjack 10 --auto` | Cards | Interactive or `--auto` |
| Video Poker | `video-poker 10 --auto` | Cards | Interactive or `--auto` |

---

### ApeStrong (Dice)

Pick your win probability. Roll under your number to win.

```bash
apechurch-cli play ape-strong <amount> <range>
apechurch-cli play ape-strong 10 50      # 50% chance, 1.95x payout
apechurch-cli play ape-strong 10 25      # 25% chance, 3.9x payout
apechurch-cli play ape-strong 10 75      # 75% chance, 1.3x payout
```

| Range | Win Chance | Payout |
|-------|------------|--------|
| 5 | 5% | 19.5x |
| 25 | 25% | 3.9x |
| 50 | 50% | 1.95x |
| 75 | 75% | 1.3x |
| 95 | 95% | 1.025x |

**Aliases:** `strong`, `dice`, `limbo`

---

### Roulette

American roulette with 0, 00, and 1-36.

```bash
apechurch-cli play roulette <amount> <bet>
apechurch-cli play roulette 10 RED        # Color bet (2.05x)
apechurch-cli play roulette 10 17         # Single number (36.9x)
apechurch-cli play roulette 10 RED,BLACK  # Split bet (hedge)
apechurch-cli play roulette 10 0          # Zero (36.9x)
apechurch-cli play roulette 10 00         # Double zero (36.9x)
```

**Bet Types:**
| Type | Options | Payout |
|------|---------|--------|
| Numbers | 0, 00, 1-36 | 36.9x |
| Colors | RED, BLACK | 2.05x |
| Parity | ODD, EVEN | 2.05x |
| Halves | FIRST_HALF, SECOND_HALF | 2.05x |
| Thirds | FIRST_THIRD, SECOND_THIRD, THIRD_THIRD | 3.075x |
| Columns | FIRST_COL, SECOND_COL, THIRD_COL | 3.075x |

**Multi-bet:** Comma-separate to split wager evenly: `RED,BLACK`

**Alias:** `rl`

---

### Baccarat

Classic baccarat. Bet on Player, Banker, or Tie.

```bash
apechurch-cli play baccarat <amount> <bet>
apechurch-cli play baccarat 50 BANKER           # Single bet
apechurch-cli play baccarat 50 PLAYER           # Single bet
apechurch-cli play baccarat 150 140 BANKER 10 TIE  # Combined: 140 on Banker, 10 on Tie
```

| Bet | Payout |
|-----|--------|
| PLAYER | 2.0x |
| BANKER | 1.95x |
| TIE | 9.0x |

**Combined bets:** Specify explicit amounts (must sum to total wager).

**Alias:** `bacc`

---

### Jungle Plinko

Drop balls through pegs into multiplier buckets.

```bash
apechurch-cli play jungle-plinko <amount> <mode> <balls>
apechurch-cli play jungle-plinko 10 2 50    # 10 APE, mode 2, 50 balls
apechurch-cli play jungle-plinko 50 4 100   # High risk, max balls
```

| Parameter | Range | Description |
|-----------|-------|-------------|
| mode | 0-4 | Risk level (0=safe, 4=extreme) |
| balls | 1-100 | Ball count (wager split across balls) |

**Alias:** `plinko`

---

### Keno

Pick numbers, hope they hit.

```bash
apechurch-cli play keno <amount> [--picks N] [--numbers X,Y,Z]
apechurch-cli play keno 10                     # Random 5 picks
apechurch-cli play keno 10 --picks 10          # 10 random picks
apechurch-cli play keno 10 --picks 5 --numbers 1,7,13,25,40
```

| Parameter | Range | Description |
|-----------|-------|-------------|
| picks | 1-10 | How many numbers to pick |
| numbers | 1-40 | Specific numbers (comma-separated) |

**Max payout:** 10/10 hits = 1,000,000x

**Alias:** `k`

---

### Speed Keno

Fast keno with batched games.

```bash
apechurch-cli play speed-keno <amount> [--picks N] [--games N]
apechurch-cli play speed-keno 10                # 3 picks, 5 games
apechurch-cli play speed-keno 10 --picks 5 --games 20
```

| Parameter | Range | Description |
|-----------|-------|-------------|
| picks | 1-5 | Numbers to pick |
| games | 1-20 | Games to batch (wager split) |

**Max payout:** 5/5 = 2000x

**Aliases:** `sk`, `speedk`

---

### Dino Dough & Bubblegum Heist (Slots)

Slot machines with multiple spins.

```bash
apechurch-cli play dino-dough <amount> <spins>
apechurch-cli play dino-dough 10 10      # 10 APE, 10 spins
apechurch-cli play bubblegum-heist 10 15 # 10 APE, 15 spins
```

| Parameter | Range | Description |
|-----------|-------|-------------|
| spins | 1-15 | Spins per bet (wager split) |

**Aliases:** `dino`, `slots`, `bubblegum`, `heist`

---

### Monkey Match

Monkeys pop from barrels — form poker hands!

```bash
apechurch-cli play monkey-match <amount> [--mode N]
apechurch-cli play monkey-match 10           # Low risk (default)
apechurch-cli play monkey-match 10 --mode 2  # Normal risk
```

| Mode | Description |
|------|-------------|
| 1 | Low Risk — 6 monkey types, easier matches |
| 2 | Normal Risk — 7 monkey types, better mid payouts |

**Max payout:** Five of a Kind = 50x

**Aliases:** `monkey`, `mm`

---

### Bear-A-Dice

Roll dice, avoid unlucky numbers.

```bash
apechurch-cli play bear-dice <amount> [--difficulty N] [--rolls N]
apechurch-cli play bear-dice 10                    # Easy, 1 roll
apechurch-cli play bear-dice 10 --difficulty 0 --rolls 5
```

| Difficulty | Losing Numbers | Risk |
|------------|----------------|------|
| 0 (Easy) | 7 | Low |
| 1 (Normal) | 6, 7, 8 | Medium |
| 2 (Hard) | 5-9 | High |
| 3 (Extreme) | 4-10 | Very High |
| 4 (Master) | 3-11 | Only 2 or 12 wins |

| Rolls | Effect |
|-------|--------|
| 1-5 | More rolls = higher payout, more chances to lose |

**Aliases:** `bear`, `bd`

---

## Loop Mode & Automation

Play continuously with safety controls.

### Basic Loop

```bash
apechurch-cli play --loop                    # Random games, default settings
apechurch-cli play ape-strong 10 50 --loop   # Specific game
apechurch-cli play --loop --delay 5          # 5 seconds between games
```

### Safety Controls

```bash
# Stop when balance reaches target
apechurch-cli play --loop --target 200

# Stop when balance drops to limit
apechurch-cli play --loop --stop-loss 50

# Stop after N games
apechurch-cli play --loop --max-games 100

# Combine them all
apechurch-cli play ape-strong 10 50 --loop --target 200 --stop-loss 50 --max-games 100
```

| Option | Description |
|--------|-------------|
| `--target <ape>` | Stop when balance reaches this amount |
| `--stop-loss <ape>` | Stop when balance drops to this amount |
| `--max-games <n>` | Stop after N games |
| `--delay <sec>` | Seconds between games (default: 3) |

### Loop Output

```
🔄 Loop mode: ApeStrong (3s delay | Strategy: martingale)
   🎯 Target: 200 APE
   🛑 Stop-loss: 50 APE
   🏁 Max games: 100
──────────────────────────────────────────────────
   📊 martingale: betting 10.00 APE

🎰 ApeStrong (50% chance)
   Betting 10.00 APE

🎉 WON! 10.00 APE → 19.50 APE (+9.50 APE)

⏳ Next game in 3s | 💰 Balance: 109.50 APE (+9.50)
```

---

## Betting Strategies

Control bet sizing based on win/loss patterns.

### Available Strategies

| Strategy | Behavior | Risk |
|----------|----------|------|
| `flat` | Same bet every time (default) | Low |
| `martingale` | Double on loss, reset on win | High |
| `reverse-martingale` | Double on win, reset on loss | Medium |
| `fibonacci` | Fibonacci sequence on losses | Medium |
| `dalembert` | +1 unit on loss, -1 on win | Low-Medium |

### Using Strategies

```bash
# Martingale with 10 APE base bet
apechurch-cli play ape-strong 10 50 --loop --bet-strategy martingale

# Martingale with safety cap
apechurch-cli play roulette 10 RED --loop --bet-strategy martingale --max-bet 100

# Fibonacci on blackjack
apechurch-cli blackjack 5 --auto --loop --bet-strategy fibonacci --max-games 50
```

### Strategy Behavior Examples

**Martingale** (10 APE base):
```
Win → bet 10 → Win → bet 10 → Lose → bet 20 → Lose → bet 40 → Win → bet 10
```

**Fibonacci** (10 APE base):
```
Lose → bet 10 → Lose → bet 10 → Lose → bet 20 → Lose → bet 30 → Win → bet 10
```

### Safety Options

```bash
--max-bet <ape>    # Cap maximum bet (prevents runaway martingale)
--stop-loss <ape>  # Stop if balance drops too low
```

**Recommended:** Always use `--max-bet` with progressive strategies.

---

## Blackjack

Interactive blackjack with `simple` auto-play by default.

### Quick Play (Auto)

```bash
apechurch-cli blackjack 10 --auto              # Single game, simple auto-play
apechurch-cli blackjack 10 --auto best         # Not implemented yet; falls back to simple
apechurch-cli blackjack 10 --auto --loop       # Continuous auto-play
apechurch-cli blackjack 10 --auto --loop --max-games 20 --bet-strategy martingale
apechurch-cli blackjack 10 --auto --loop --delay 5 --human
```

### Interactive Play

```bash
apechurch-cli blackjack 10   # Prompts for each decision
```

### Actions

| Action | When Available |
|--------|----------------|
| Hit | Always (unless bust/stand) |
| Stand | Always |
| Double | First two cards only |
| Split | Pair of same value |
| Insurance | Dealer shows Ace |
| Surrender | First action only |

### Auto Strategy

`--auto simple` uses basic strategy:
- Considers your hand value (hard/soft)
- Considers dealer's upcard
- Makes statistically best decision

`--auto best` is reserved for a future stricter solver and currently prints:
- `not implemented (fallback to simple)`

### Managing Games

```bash
apechurch-cli blackjack resume     # Resume unfinished game
apechurch-cli blackjack status     # Check active games
apechurch-cli blackjack clear      # Clear stuck games
```

---

## Video Poker

Jacks or Better video poker with two auto-play modes: `simple` and `best`.

### Quick Play (Auto)

```bash
apechurch-cli video-poker 10 --auto              # Single game, simple mode
apechurch-cli video-poker 10 --auto best         # Exact EV solver
apechurch-cli video-poker 10 --auto --loop       # Continuous
apechurch-cli vp 10 --auto --loop --max-games 50 # Using alias
apechurch-cli video-poker 10 --auto best --loop --delay 5 --human
```

### Bet Amounts

Video poker uses fixed denominations: **1, 5, 10, 25, 50, 100 APE**

### Hand Rankings

| Hand | Payout |
|------|--------|
| Royal Flush | 250x base (+ progressive jackpot at max bet) |
| Straight Flush | 50x |
| Four of a Kind | 25x |
| Full House | 9x |
| Flush | 6x |
| Straight | 4x |
| Three of a Kind | 3x |
| Two Pair | 2x |
| Jacks or Better | 1x |

### Auto Modes

- `--auto simple`
  - Uses the existing priority-ranked hold table
  - Fast, deterministic, and good for general grinding
- `--auto best`
  - Evaluates all 32 hold combinations
  - Enumerates all possible redraw outcomes
  - Chooses the hold with the highest expected value
  - Includes the live jackpot value when betting 100 APE

### Managing Games

```bash
apechurch-cli video-poker resume   # Resume unfinished game
apechurch-cli video-poker status   # Check active games
apechurch-cli video-poker clear    # Clear stuck games
apechurch-cli video-poker payouts  # Show payout table
```

**Aliases:** `vp`, `gimboz-poker`

---

## Commands Reference

### Core Commands

| Command | Description |
|---------|-------------|
| `apechurch-cli install` | Setup wallet and register |
| `apechurch-cli status` | Check balance, address, settings |
| `apechurch-cli play [game] [amount]` | Play a game |
| `apechurch-cli blackjack <amount>` | Play blackjack |
| `apechurch-cli video-poker <amount>` | Play video poker |
| `apechurch-cli games` | List all games |
| `apechurch-cli game <name>` | Detailed game info |
| `apechurch-cli history` | Recent game history |
| `apechurch-cli pause` | Stop autonomous play |
| `apechurch-cli resume` | Resume play |

### Wallet Commands

| Command | Description |
|---------|-------------|
| `apechurch-cli wallet encrypt` | Migrate a legacy plaintext wallet to encrypted-only storage |
| `apechurch-cli wallet new-password` | Re-encrypt the local wallet with a new password |
| `apechurch-cli send APE <amount> <address>` | Send APE |
| `apechurch-cli send GP <amount> <address>` | Send Gimbo Points |

### Profile Commands

| Command | Description |
|---------|-------------|
| `apechurch-cli profile show` | View settings |
| `apechurch-cli profile set --persona <type>` | Change play style |
| `apechurch-cli register --username <name>` | Change username |

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable JSON output |
| `--loop` | Continuous play mode |
| `--delay <sec>` | Delay between games |
| `--human` | Add a weighted 3-9s human-like delay on top of `--delay` |
| `--target <ape>` | Stop at target balance |
| `--stop-loss <ape>` | Stop at loss limit |
| `--max-games <n>` | Stop after N games |
| `--bet-strategy <name>` | Betting strategy |
| `--max-bet <ape>` | Maximum bet cap |

---

## JSON Output Schemas

All commands support `--json` for machine-readable output.

### Status Response

```json
{
  "address": "0x1234...abcd",
  "balance": "52.4500",
  "gp": "150",
  "available_ape": "51.4500",
  "gas_reserve_ape": "1.0000",
  "paused": false,
  "persona": "balanced",
  "username": "MY_AGENT",
  "can_play": true
}
```

### Play Response

```json
{
  "status": "complete",
  "game": "ape-strong",
  "tx": "0xabc123...",
  "game_url": "https://www.ape.church/games/ape-strong?id=...",
  "wager_ape": "10.000000",
  "config": {
    "range": 50,
    "winChance": "50%",
    "approxPayout": "1.95x"
  },
  "result": {
    "payout_ape": "19.50",
    "won": true,
    "pnl_ape": "9.500000"
  }
}
```

### Error Response

```json
{
  "error": "Insufficient balance. Available: 5.00 APE"
}
```

---

## Agent Play Patterns

### Pattern 1: Simple Loop with Safety

Best for hands-off autonomous play.

```bash
apechurch-cli play --loop --target 200 --stop-loss 50 --max-games 500
```

The agent will:
- Play random games with balanced strategy
- Stop if balance reaches 200 APE (profit target)
- Stop if balance drops to 50 APE (loss limit)
- Stop after 500 games maximum

### Pattern 2: Specific Game Grinding

Target a specific game with fixed parameters.

```bash
apechurch-cli play ape-strong 10 50 --loop --target 150 --stop-loss 80
```

### Pattern 3: Martingale Recovery

Progressive betting to recover losses.

```bash
apechurch-cli play roulette 5 RED --loop --bet-strategy martingale --max-bet 50 --stop-loss 20
```

**Important:** Always set `--max-bet` with martingale to prevent exponential loss.

### Pattern 4: Session-Based Play

Play a fixed number of games per session.

```bash
apechurch-cli play --loop --max-games 20
```

### Pattern 5: Blackjack Grinding

Auto-play blackjack with optimal strategy.

```bash
apechurch-cli blackjack 10 --auto --loop --max-games 50 --target 200
```

### Pattern 6: Check Before Play

Always verify state before starting:

```bash
# Check if can play
apechurch-cli status --json | jq '.can_play'

# Check balance
apechurch-cli status --json | jq '.available_ape'

# Then play
apechurch-cli play --loop --max-games 10
```

### Pattern 7: Handle Pause/Resume

```bash
# Human says "stop gambling"
apechurch-cli pause

# Human says "you can play again"
apechurch-cli resume

# Check state
apechurch-cli status --json | jq '.paused'
```

---

## Costs & Limits

### Transaction Costs

| Cost | Amount | Notes |
|------|--------|-------|
| Gas per game | ~0.02-0.2 APE | Varies by game complexity |
| VRF fee | ~0.01-0.1 APE | Randomness oracle cost |
| Gas reserve | 1 APE | Always kept in wallet |

### Minimum Bets

| Game | Minimum |
|------|---------|
| Most games | 1 APE |
| Video Poker | 1 APE (fixed denominations) |

### Recommended Starting Balance

- **Minimum:** 20 APE
- **Recommended:** 50+ APE
- **For martingale:** 100+ APE

---

## Security

Your encrypted wallet material is stored at `~/.apechurch-cli/wallet.json`.

⚠️ **CRITICAL:**
- Never share your private key
- Never paste it into prompts or third-party tools
- The CLI handles all signing locally
- Consider using `wallet new-password` periodically to rotate local password protection

---

## Updates

```bash
npm update -g @n0ther/apechurch-cli
apechurch-cli --version
```

---

## Links

- **Website:** https://ape.church
- **Games:** https://ape.church/games
- **GitHub:** https://github.com/ape-church/agent-skills
- **npm:** https://www.npmjs.com/package/@n0ther/apechurch-cli

---

*Built for apes, agents, and degens.* 🦍
