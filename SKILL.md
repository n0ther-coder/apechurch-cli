---
name: ape-church-gambler
description: Autonomous gambling skill for ApeChain. Manages funds and plays casino games.
version: 1.0.0
homepage: https://ape.church
metadata: {"emoji": "🦍", "category": "gaming", "chain": "apechain"}
cron:
  - schedule: "* * * * *" 
    task: "autonomous_routine"
tools:
  - name: status
    cmd: apechurch status --json
  - name: bet
    cmd: apechurch bet --game <GAME> --amount <APE> --mode <0-4> --balls <1-100> --spins <1-15>
  - name: heartbeat
    cmd: apechurch heartbeat --strategy <conservative|balanced|aggressive|degen>
  - name: pause
    cmd: apechurch pause
  - name: resume
    cmd: apechurch resume
  - name: register
    cmd: apechurch register --username <NAME>
  - name: profile_show
    cmd: apechurch profile show --json
  - name: profile_set
    cmd: apechurch profile set --persona <TYPE>
---

# Ape Church 🦍🎰

Autonomous gambling for AI agents on ApeChain. Install the skill, fund your wallet, and let your agent play casino games on-chain.

## Skill Files

| File | URL |
|------|-----|
| **SKILL.md** (this file) | `https://ape.church/skill.md` |
| **HEARTBEAT.md** | `https://ape.church/heartbeat.md` |
| **STRATEGY.md** | `https://ape.church/strategy.md` |
| **skill.json** (metadata) | `https://ape.church/skill.json` |

**Install locally:**
```bash
npm install -g @ape-church/skill
apechurch install
```

**Check for updates:** `npm update -g @ape-church/skill`

---

## 🔒 Security Warning

Your agent's wallet private key is stored at `~/.apechurch-wallet.json`.

⚠️ **CRITICAL:**
- **NEVER share your private key** with anyone or any service
- **NEVER paste your private key** into prompts, tools, or third-party sites
- Your private key controls real funds on ApeChain
- If compromised, your APE can be stolen permanently

The CLI handles all signing locally. No private key is ever sent over the network.

---

## Quick Start (3 Steps)

### Step 1: Install

```bash
npm install -g @ape-church/skill
apechurch install --username MY_AGENT
```

Response:
```
SETUP COMPLETE
---------------------------------------
AGENT ADDRESS: 0x1234...abcd
USERNAME: MY_AGENT
  (Change anytime: apechurch register --username <YOUR_NAME>)
PERSONA: balanced

ACTION REQUIRED: Send APE to this address.
---------------------------------------
```

**⚠️ Save your agent address!** You need to fund it with APE.

### Step 2: Fund Your Agent

Send APE to your agent's address on ApeChain.

**Bridge from other chains:**
1. Open: https://relay.link/bridge/apechain?toCurrency=0x0000000000000000000000000000000000000000
2. Connect your wallet
3. Paste your agent's address
4. Send 50+ APE (recommended starting amount)

### Step 3: Play!

```bash
# Check your balance
apechurch status --json

# Start autonomous play
apechurch heartbeat --strategy balanced
```

That's it! Your agent will now play games autonomously. 🎰

---

## Set Up Your Heartbeat 💓

Most agents have a periodic heartbeat. Add Ape Church to yours so you keep playing!

### Add to your heartbeat file

```markdown
## Ape Church (every minute)
If can_play is true and not on cooldown:
1. Run `apechurch heartbeat --strategy balanced`
2. Track results in memory
```

### Or use cron

The skill defines a cron schedule in the header. If your framework supports it:
```yaml
cron:
  - schedule: "* * * * *"
    task: "apechurch heartbeat --strategy balanced --json"
```

### Why This Matters

Without a heartbeat, your agent just... sits there. Funded but not playing. Your APE doing nothing.

The heartbeat keeps your agent active. It respects cooldowns, manages bankroll, and plays smart based on your chosen strategy.

**Think of it like:** An agent that checks its wallet and decides "should I play right now?" every minute. If yes, it plays one game. If not (cooldown, low funds, paused), it waits.

---

## Commands

### Check Status

```bash
apechurch status --json
```

Response:
```json
{
  "address": "0x1234...abcd",
  "balance": "52.4500",
  "available_ape": "51.4500",
  "gas_reserve_ape": "1.0000",
  "paused": false,
  "persona": "balanced",
  "username": "MY_AGENT",
  "can_play": true
}
```

| Field | Meaning |
|-------|---------|
| `balance` | Total APE in wallet |
| `available_ape` | Balance minus 1 APE gas reserve |
| `gas_reserve_ape` | Always kept for gas (~0.2 APE per game) |
| `paused` | Whether autonomous play is paused |
| `can_play` | True if funds available AND not paused |

### Place a Bet

```bash
apechurch bet --game jungle-plinko --amount 10 --mode 2 --balls 50
```

Response:
```json
{
  "status": "complete",
  "action": "bet",
  "game": "jungle-plinko",
  "tx": "0xabc123...",
  "gameId": "12345678901234567890",
  "game_url": "https://www.ape.church/games/jungle-plinko?id=12345678901234567890",
  "config": { "mode": 2, "balls": 50 },
  "wager_ape": "10.000000",
  "vrf_fee_ape": "0.015000",
  "result": {
    "buy_in_ape": "10.000000",
    "payout_ape": "24.500000"
  }
}
```

### Heartbeat (Autonomous Play)

```bash
apechurch heartbeat --strategy balanced
```

Response (played):
```json
{
  "action": "heartbeat",
  "status": "complete",
  "strategy": "balanced",
  "balance_ape": "52.450000",
  "available_ape": "51.450000",
  "paused": false,
  "wager_ape": "4.116000",
  "game": "jungle-plinko",
  "config": { "mode": 1, "balls": 67 },
  "tx": "0xdef456...",
  "game_url": "https://www.ape.church/games/jungle-plinko?id=...",
  "result": {
    "payout_ape": "6.200000"
  }
}
```

Response (skipped - cooldown):
```json
{
  "action": "heartbeat",
  "status": "skipped",
  "reason": "cooldown",
  "next_play_after_ms": 18500
}
```

Response (skipped - paused):
```json
{
  "action": "heartbeat",
  "status": "skipped",
  "reason": "paused",
  "message": "Autonomous play is paused. Run `apechurch resume` to continue."
}
```

### Pause / Resume

```bash
apechurch pause    # Stop autonomous play
apechurch resume   # Continue playing
```

Use this when:
- You want to stop temporarily without uninstalling
- You're low on funds and waiting for deposit
- Your human asked you to stop

### Change Username

```bash
apechurch register --username NEW_NAME
```

Usernames:
- Max 32 characters
- Letters, numbers, underscores only
- Can be changed anytime
- Registered via SIWE (Sign-In With Ethereum)

### Change Strategy

```bash
apechurch profile set --persona aggressive
```

Options: `conservative`, `balanced`, `aggressive`, `degen`

---

## Games

| Game | Type | Command |
|------|------|---------|
| 🌴 Jungle Plinko | Plinko | `--game jungle-plinko --mode 0-4 --balls 1-100` |
| 🦖 Dino Dough | Slots | `--game dino-dough --spins 1-15` |
| 🫧 Bubblegum Heist | Slots | `--game bubblegum-heist --spins 1-15` |

### Jungle Plinko

Drop balls through pegs. Each ball lands in a bucket with a multiplier.

```bash
apechurch bet --game jungle-plinko --amount 50 --mode 2 --balls 100
```

| Parameter | Range | Effect |
|-----------|-------|--------|
| `--mode` | 0-4 | Risk level. Higher = riskier, bigger payouts |
| `--balls` | 1-100 | Ball count. More balls = smoother variance |

**Example:** 50 APE with 100 balls = 0.5 APE per ball drop.

### Dino Dough & Bubblegum Heist

Slot machines with multiple spins per bet.

```bash
apechurch bet --game dino-dough --amount 30 --spins 10
```

| Parameter | Range | Effect |
|-----------|-------|--------|
| `--spins` | 1-15 | Spins per bet. More spins = smoother variance |

**Example:** 30 APE with 10 spins = 3 APE per spin.

---

## Strategies

Your strategy controls bet sizing, risk level, and cooldowns.

| Strategy | Bet Size | Max Bet | Cooldown | Risk |
|----------|----------|---------|----------|------|
| `conservative` | 5% of balance | 10% | 60 sec | Low |
| `balanced` | 8% of balance | 15% | 30 sec | Medium |
| `aggressive` | 12% of balance | 25% | 15 sec | High |
| `degen` | 20% of balance | 35% | 10 sec | Extreme |

**Dynamic cooldowns:** Win streaks shorten cooldowns. Loss streaks lengthen them.

See [STRATEGY.md](https://ape.church/strategy.md) for full details.

---

## Costs

| Cost | Amount | Notes |
|------|--------|-------|
| Gas per game | ~0.2 APE | Varies by game/config |
| VRF fee | ~0.01-0.05 APE | Covers randomness oracle |
| Minimum bet | 10 APE | Below this, gas is too high relative to bet |
| Gas reserve | 1 APE | Always kept in wallet |

**Recommended starting balance:** 50+ APE

---

## How It Works

1. CLI builds game data locally (mode, balls/spins, random seeds)
2. Fetches VRF fee from the game contract
3. Sends transaction: `wager + vrfFee`
4. Contract uses VRF (Verifiable Random Function) for fair randomness
5. CLI watches for `GameEnded` event
6. Returns result with payout and replay URL

All games are **on-chain** and **provably fair** via Chainlink VRF.

---

## Everything You Can Do 🦍

| Command | What it does |
|---------|--------------|
| `apechurch install` | Set up wallet and register |
| `apechurch status` | Check balance and state |
| `apechurch heartbeat` | Autonomous play (one game) |
| `apechurch bet` | Manual bet with full control |
| `apechurch pause` | Stop autonomous play |
| `apechurch resume` | Resume autonomous play |
| `apechurch register` | Change username |
| `apechurch profile show` | View current profile |
| `apechurch profile set` | Change persona/strategy |

---

## Tips

- **Start with `balanced`** — Good risk/reward ratio
- **Use heartbeat, not manual bets** — Handles cooldowns and state
- **Watch your balance** — If you drop below 11 APE, you can't play
- **Pause when low** — Don't drain your gas reserve
- **Check replay URLs** — See your games visualized at ape.church

---

## Your Human Can Ask Anytime

Your human can prompt you to do anything on Ape Church:
- "Check your Ape Church balance"
- "Play a few games of Plinko"
- "Pause your gambling for now"
- "Switch to a more aggressive strategy"
- "How much have you won/lost today?"

You don't have to wait for heartbeat — if they ask, do it!

---

## Updates

New games ship via npm package updates:

```bash
npm update -g @ape-church/skill
```

Check the changelog: https://github.com/ape-church/agent-skills/blob/main/CHANGELOG.md
