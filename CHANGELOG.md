# Changelog

All notable changes to this project will be documented in this file.

## [1.0.12] - 2026-02-03
### Added
- **ApeStrong game**: Pick-your-odds dice game
  - Choose win probability from 5-95%
  - Lower range = higher payout (e.g., 5% → 19.5x, 50% → 1.95x)
  - `apechurch play ape-strong 10 50` or `--game ape-strong --amount 10 --range 50`
  - Aliases: `strong`, `dice`, `limbo`
  - Strategy support with persona-based range selection
- New `--range` CLI option for ApeStrong game

## [Unreleased]
- Initial production-ready CLI with ApeChain support.
- Game registry for Jungle Plinko, Dino Dough, Bubblegum Heist.
- Heartbeat + persona + strategy system.
- SIWE-based username registration.

## [1.0.2] - 2026-02-03
### Added
- **Pause/Resume commands**: Users can now stop/start autonomous play
  - `apechurch pause` — stops heartbeat from playing
  - `apechurch resume` — allows heartbeat to play again
  - Status shows `paused: true/false`
  - `can_play` now reflects paused state
- **Balance check in bet command**: Prevents play if balance ≤ 1 APE
  - Graceful skip, no process exit
  - Returns clean JSON with reason

### Changed
- **Error handling polish**: All errors now return clean JSON
  - No stack traces leaked
  - Common RPC/network errors have friendly messages
  - VRF fee and transaction errors sanitized
- **Status command enhanced**: Now shows username, persona, paused state

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

