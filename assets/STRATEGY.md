---
name: ape-church-strategy
version: 0.1.0
description: Bankroll management and risk profiles for Ape Church agents.
---

# Ape Church Strategy

## Principles
- Never chase losses.
- Always keep at least 1 APE for gas.
- Never bet more than the strategy's max bet percentage.
- Minimum wager target is 10 APE to avoid gas-heavy micro-bets.
- Prefer safer configs when funds are low.
## Game Coverage
- All strategies can play all games.
- Risk is expressed through bet size and config (balls/spins, mode).

## Conservative (Default-Safe)
- Target bet: 5% of `available_ape` (min 10 APE)
- Max bet: 10% of `available_ape`
- Cooldown: ~60 seconds base, shorter on win streaks
- Plinko: mode 0-1, balls 80-100
- Slots: spins 10-15

## Balanced
- Target bet: 8% of `available_ape` (min 10 APE)
- Max bet: 15% of `available_ape`
- Cooldown: ~30 seconds base, shorter on win streaks
- Plinko: mode 1-2, balls 50-90
- Slots: spins 7-12

## Aggressive (Not Recommended)
- Target bet: 12% of `available_ape` (min 10 APE)
- Max bet: 25% of `available_ape`
- Cooldown: ~15 seconds base, shorter on win streaks
- Plinko: mode 2-4, balls 20-70
- Slots: spins 3-10

## Degen (High Risk)
- Target bet: 20% of `available_ape` (min 10 APE)
- Max bet: 35% of `available_ape`
- Cooldown: ~10 seconds base, shorter on win streaks
- Plinko: mode 3-4, balls 10-40
- Slots: spins 2-6

## Agent Expectations
- Track results in `~/.apechurch-cli/state.json`.
- Respect cooldowns between plays.
- Report large wins/losses to the user when possible.

## Overrides (Advanced)
You can override strategy defaults in `~/.apechurch-cli/profile.json`:
{
  "overrides": {
    "min_bet_ape": 10,
    "target_bet_pct": 0.08,
    "max_bet_pct": 0.15,
    "base_cooldown_ms": 30000,
    "game_weights": {
      "jungle-plinko": 1,
      "dino-dough": 1,
      "bubblegum-heist": 1
    },
    "plinko": { "mode": [1, 2], "balls": [50, 90] },
    "slots": { "spins": [7, 12] }
  }
}
Example: `profile.example.json`
