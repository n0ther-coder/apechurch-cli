---
name: ape-church-gambler
description: Autonomous gambling skill for ApeChain. Manages funds and plays casino games.
version: 1.0.0
# The Autonomy Hook: Wakes the agent every minute; internal cooldowns control play rate
cron:
  - schedule: "* * * * *" 
    task: "autonomous_routine"
tools:
  - name: status
    cmd: apechurch status --json
  - name: bet
    cmd: apechurch bet --game <GAME> --amount <APE> --mode <0-4> --balls <1-100> --spins <1-15>
  - name: heartbeat
    cmd: apechurch heartbeat --strategy <conservative|balanced|aggressive|degen> --cooldown <ms> --timeout <ms>
  - name: register
    cmd: apechurch register --username <NAME> --persona <conservative|balanced|aggressive|degen>
  - name: profile_show
    cmd: apechurch profile show --json
  - name: profile_set
    cmd: apechurch profile set --persona <conservative|balanced|aggressive|degen> --username <NAME>
  - name: pause
    cmd: apechurch pause
  - name: resume
    cmd: apechurch resume
---

# Ape Church Protocol

## Overview
This package plays Ape Church casino games on ApeChain using a single entrypoint:
`play(address player, bytes gameData)` on the game contract.
The CLI builds `gameData` locally, fetches the VRF fee on-chain, and sends
`value = wager + vrfFee`. If the value is wrong, the transaction will revert.

## Setup (Human Step)
1. Run `apechurch install`.
2. Fund the printed agent address with APE on ApeChain.
   - Bridge APE using:
     `https://relay.link/bridge/apechain?toCurrency=0x0000000000000000000000000000000000000000`
   - Connect your wallet.
   - Paste the agent address in ApeChain buy area:
     `Select wallet -> Paste wallet address`
3. During install, the agent will auto-register a username via SIWE.
   - Customize: `apechurch install --username <NAME>`
   - Usernames must be 32 characters or fewer (letters, numbers, underscores).
   - If omitted, a unique username is auto-generated (e.g., `APE_BOT_A1B2C3D4`).
   - Change anytime: `apechurch register --username <NEW_NAME>`

## Status
Run `apechurch status --json` to fetch:
- `balance` in APE
- `available_ape` (balance minus 1 APE gas reserve)
- `gas_reserve_ape` (minimum to keep in wallet)
- `gp` (cashback points, pending integration)
- `can_play` if balance is safe to play

## Autonomy (Heartbeat + Strategy)
- The agent should run `apechurch heartbeat` on a schedule to decide if it should play.
- Heartbeat places at most one bet per run.
- Strategy profiles are defined in `STRATEGY.md`.
- Heartbeat rules and state tracking are defined in `HEARTBEAT.md`.
- Local state file: `~/.apechurch/state.json`
- Cooldown is dynamic based on streaks, but can be overridden with `--cooldown`.
- Persona is optional. If not set, default is `balanced`.
- Set a persona with:
  - `apechurch profile set --persona conservative`
  - `apechurch profile set --persona balanced`
  - `apechurch profile set --persona aggressive`
  - `apechurch profile set --persona degen`
- Advanced overrides (optional) live in `~/.apechurch/profile.json`:
  - `overrides.game_weights`
  - `overrides.plinko.mode`, `overrides.plinko.balls`
  - `overrides.slots.spins`
  - `overrides.min_bet_ape`, `overrides.target_bet_pct`, `overrides.max_bet_pct`
  - `overrides.base_cooldown_ms`
- Example file: `profile.example.json`

## Pause & Resume
- Pause autonomous play: `apechurch pause`
- Resume autonomous play: `apechurch resume`
- When paused, heartbeat skips gracefully (no play, no errors).
- Status shows `paused: true/false` and `can_play` reflects paused state.
- Use this to temporarily stop the agent without uninstalling.

## Registration (Username + Persona)
- Agents can register or change username with `apechurch register --username <NAME>`.
- Usernames must be 32 characters or fewer (letters, numbers, underscores only).
- If no username is provided, one is auto-generated (e.g., `APE_BOT_A1B2C3D4`).
- Registration uses SIWE and marks `isAI: true` on the server.
- Usernames can be changed at any time by running the register command again.
- Endpoint: `https://www.ape.church/api/profile`

## Autonomous Routine
(Triggered automatically by cron)

1. **Self-Preservation**:
   - Run `apechurch status --json`.
   - IF `available_ape` <= 0: **STOP**. Do not play. (Wait for human funding).
   - Note: There is a cashback system, but it requires tokens to be utilized for cashback. We will integrate this later.

2. **Action Loop**:
   - If funds are healthy, choose a game based on your own strategy.
   - Decide your risk level and wager size.
   - **Risk Check**: Never bet more than your strategy's max bet percentage.
   - Minimum wager target is 10 APE to avoid gas-heavy micro-bets.
   - Always keep **at least 1 APE** in the wallet for gas (each game usually costs ~0.2 APE).
   - Prefer using `apechurch heartbeat` so the agent can enforce cooldowns and track state.
   - Provide explicit parameters even though defaults exist:
   - Jungle Plinko:
   - Run `apechurch bet --game jungle-plinko --amount <APE> --mode <0-4> --balls <1-100>`
   - Dino Dough (slots):
   - Run `apechurch bet --game dino-dough --amount <APE> --spins <1-15>`
   - Bubblegum Heist (slots):
   - Run `apechurch bet --game bubblegum-heist --amount <APE> --spins <1-15>`

## Jungle Plinko Controls
- `--mode` is difficulty: `0..4` where `4` is riskiest and has highest payouts.
- `--balls` is `1..100` and affects VRF gas cost.
- More balls is safer because the wager is split across more drops.
  - Example: 100 APE with 100 balls = 1 APE per ball.
  - Example: 50 APE with 100 balls = 0.5 APE per ball.
- Defaults are `mode=0` and `balls=50`, but agents should choose explicitly.

## Dino Dough (Slots) Controls
- `--spins` is `1..15` and affects risk and value per spin.
- More spins is safer because the wager is split across more spins.
  - Example: 45 APE with 15 spins = 3 APE per spin.
- 1 spin is very risky; target `5..15` spins for better risk balance.
- Default is `spins=10`, but agents should choose explicitly.

## Bubblegum Heist (Slots) Controls
- Same controls as Dino Dough (slots), with a different contract.
- Use `--spins 1..15` and prefer `5..15` spins.

## How the CLI Works
- Generates:
  - `gameId` (random uint256)
  - `userRandomWord` (random bytes32)
  - `ref = 0x0000000000000000000000000000000000000000`
- Encodes `gameData` as:
  1. `uint8 gameMode`
  2. `uint8 numBalls`
  3. `uint256 gameId`
  4. `address ref`
  5. `bytes32 userRandomWord`
- Slots use a different `gameData` order:
  1. `uint256 gameId`
  2. `uint8 numSpins`
  3. `address ref`
  4. `bytes32 userRandomWord`
- Calls `getVRFFee(uint32 customGasLimit)` for Plinko where:
  - `customGasLimit = 289000 + (numBalls * 11000)`
- Calls `getVRFFee()` for slots (no input).
- Sends `play(...)` with `value = wager + vrfFee`.

## Result Handling
- The CLI listens for `GameEnded` and resolves the play when the event arrives.
- Default behavior is to wait indefinitely. You can pass `--timeout <ms>` to return
  `pending` if the event hasn't arrived after that time.
- JSON output includes `game_url` for replay:
  - `https://www.ape.church/games/jungle-plinko?id=<gameId>`
  - `https://www.ape.church/games/dino-dough?id=<gameId>`
  - `https://www.ape.church/games/bubblegum-heist?id=<gameId>`

## Required Env (Optional)
- `APECHAIN_RPC_URL` for HTTP RPC (recommended).
- `APECHAIN_WSS_URL` for WebSocket event streaming (preferred for fast events).

## Hosted Docs (Reference)
- `https://ape.church/skill.md`
- `https://ape.church/heartbeat.md`
- `https://ape.church/strategy.md`
- `https://ape.church/skill.json`

## Updates
- New games ship via package updates (local registry).
- Installed agents must update the npm package to receive new games.
