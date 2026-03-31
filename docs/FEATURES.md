# Ape Church CLI — Feature List

> Summary: Product and marketing inventory of the CLI's capabilities. Useful for high-level positioning, release summaries, and quick feature review without digging into operational details.

> The first command-line interface for on-chain gaming on ApeChain. Play, automate, and integrate Ape Church games without a browser.

---

## Wallet & Assets
- Self-custodial wallet generation and import
- Send APE (native currency) to any address
- Send GP (Gimbo Points / cashback rewards)
- Real-time balance checking (APE + GP)
- Per-wallet history download with cached recent games, history stats, and per-game breakdowns
- Wallet reset with safety warnings

## Private Key Encryption (Optional)
- **Password protection** — Encrypt your private key with scrypt + AES-256-GCM
- **Encrypted-only local signer** — Private keys stay encrypted on disk in this hardened build
- **No unlock cache** — Signing reads the password each time from prompt or `APECHURCH_CLI_PASS`
- **No plaintext export** — Plaintext key export/storage is disabled
- **Password hints** — Store up to 3 hints to help remember your password
- **Environment variable support** — Fresh install/reinstall prompts locally for the private key by default; `APECHURCH_CLI_PK` remains an optional non-interactive fallback, `APECHURCH_CLI_PASS` supports non-interactive local signing, and `APECHURCH_CLI_PROFILE_URL` overrides the username/profile API
- **Commands:**
  - `wallet download` — Download supported on-chain history for any wallet into local cache
  - `history` — Read cached history, recent games, aggregate stats, and per-game breakdowns
  - `wallet encrypt` — Add password protection
  - `wallet new-password` — Rotate the local wallet password in place
  - `wallet hints` — View or update password hints
  - `wallet status` — Check encrypted-wallet status

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
- Stateful card-game auto-play for blackjack and video poker
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
- npm package: `npm install -g @n0ther/apechurch-cli`
- Transaction hashes and game IDs returned
- Downloaded history reports with cached stats, per-game breakdowns, token totals, and recent settlements

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

### History Coverage
- **Raw-RPC coverage for Blackjack** — Upgrade the downloader beyond minimal local entries
- **Raw-RPC coverage for Video Poker** — Upgrade the downloader beyond minimal local entries
- **Gap-aware sync tracking** — Track downloaded ranges in addition to the latest synced block

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
npm install -g @n0ther/apechurch-cli
apechurch-cli install
```

---

## Links

- **Website:** https://ape.church
- **Games:** https://ape.church/games
- **GitHub:** https://github.com/ape-church/agent-skills
- **npm:** https://www.npmjs.com/package/@n0ther/apechurch-cli

---

*Built for apes, agents, and degens alike.* 🦍
