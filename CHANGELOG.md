# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
- Initial production-ready CLI with ApeChain support.
- Game registry for Jungle Plinko, Dino Dough, Bubblegum Heist.
- Heartbeat + persona + strategy system.
- SIWE-based username registration.

## [1.0.1] - 2026-02-03
### Changed
- **Faster cooldowns**: Reduced from minutes to seconds for better UX
  - Conservative: 20 min → 60 sec
  - Balanced: 10 min → 30 sec
  - Aggressive: 5 min → 15 sec
  - Degen: 2 min → 10 sec
- **Username flexibility**: Removed `_CLAWBOT` suffix requirement
  - Any username up to 32 chars (letters, numbers, underscores)
  - Auto-generated format changed to `APE_BOT_XXXXXXXX`
- **Clearer install output**: Shows when username was auto-generated
  - Reminds users they can change username anytime
- **Cron schedule**: Changed from every 30 min to every 1 min
  - Internal cooldowns now control actual play rate

