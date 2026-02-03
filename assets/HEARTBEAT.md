---
name: ape-church-heartbeat
version: 0.1.0
description: Periodic autonomous play rules for Ape Church agents.
---

# Ape Church Heartbeat

## Purpose
Heartbeat is a lightweight, periodic decision loop. It checks funds, enforces safety,
and places at most one bet per run.

## Default Cadence
- Run every 30 minutes (cron).
- Enforce a cooldown between plays (strategy-driven, usually minutes not hours).
  - Hot streaks shorten cooldowns, losing streaks lengthen them.

## State File
Store state at `~/.apechurch/state.json`:
{
  "version": 1,
  "strategy": "balanced",
  "lastHeartbeat": 0,
  "lastPlay": 0,
  "cooldownMs": 900000,
  "sessionWins": 0,
  "sessionLosses": 0,
  "consecutiveWins": 0,
  "consecutiveLosses": 0,
  "totalPnLWei": "0"
}

## Rules
1. Load state.
2. Check balance and `available_ape` (balance minus 1 APE gas reserve).
3. If `available_ape` is too low or below 10 APE, do not play.
4. Enforce cooldown before playing again.
5. Use persona from `~/.apechurch/profile.json` if set; otherwise default to `balanced`.
6. Choose one game and config based on the strategy (all games are eligible).
7. Place one bet only.
8. Update state with `lastPlay` and results.

## CLI
Run:
`apechurch heartbeat --strategy <conservative|balanced|aggressive|degen> --cooldown <ms> --timeout <ms>`

- `--cooldown 0` uses the strategy's dynamic cooldown.

## Notes
This is v0.1 behavior and should be revisited after live tests.
