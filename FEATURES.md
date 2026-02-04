# Ape Church CLI — Feature List

> The first command-line interface for on-chain gaming on ApeChain. Play, automate, and integrate Ape Church games without a browser.

---

## Wallet & Assets
- Self-custodial wallet generation and import
- Send APE (native currency) to any address
- Send GP (Gimbo Points / cashback rewards)
- Real-time balance checking (APE + GP)
- Wallet reset with safety warnings
- Private key export

## Gaming (10+ Games)
- **Slots:** Jungle Plinko, Dino Dough, Bubblegum Heist
- **Table:** Roulette, Baccarat
- **Keno:** Standard Keno, Speed Keno (batched games)
- **Dice:** ApeStrong, Bear-A-Dice
- **Other:** Monkey Match
- Full game customization (difficulty, risk, picks, rolls, bets)
- Single plays or continuous loop mode
- Strategy presets: Conservative → Degen

## Automation
- `--loop` mode for continuous play
- Pause/Resume autonomous play
- Strategy-based wager sizing
- Session tracking (wins, losses, PnL, streaks)
- Configurable delays between games

## Identity & Social
- On-chain username registration
- Referral system with credit tracking
- Profile personas (play style)
- Contest registration and tracking

## Developer / Integrator Ready
- JSON output on all commands (`--json`)
- Scriptable and pipe-friendly
- No browser required (headless servers, VPS, containers)
- npm package: `npm install -g @ape-church/skill`
- Transaction hashes and game IDs returned

## 🤖 AI Agent Compatible
- Structured JSON responses for parsing
- Self-documenting commands
- SKILL.md teaches agents how to use it
- Agents can develop custom strategies
- Autonomous play without human intervention

---

## 🚀 Coming Soon

### The House
- **Deposit to The House** — Become the house, earn when players lose
- **Withdraw from The House** — Pull your liquidity anytime
- **Decentralized bankroll** — The House is a smart contract, not a company
- **Transparent odds** — Games play against on-chain liquidity, not hidden reserves

### NFT Features
- Buy NFTs with GP (Scratch Cards, Loot Boxes, Runestones)
- Send NFTs to other wallets
- Open Loot NFTs and reveal prizes
- Marketplace: List any NFT for sale

### Advanced Games
- **Blackjack Console** — AI-optimal play support
- **Video Poker Console** — Terminal-based poker
- Strategy suggestions for perfect play

### Agent Ecosystem
- Autonomous tournaments (agent vs agent)
- Strategy sharing and community presets
- Long-term profit analytics

---

## Why CLI vs Browser?

| Browser | CLI |
|---------|-----|
| Manual clicking | Fully automated |
| One game at a time | Loop thousands |
| Human-only | AI agents welcome |
| No scripting | Webhook/API ready |

---

## Installation

```bash
npm install -g @ape-church/skill
apechurch install
```

---

## Links

- **Website:** https://ape.church
- **Games:** https://ape.church/games
- **GitHub:** https://github.com/ape-church/agent-skills
- **npm:** https://www.npmjs.com/package/@ape-church/skill

---

*Built for apes, agents, and degens alike.* 🦍
