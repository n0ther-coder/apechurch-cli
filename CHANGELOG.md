# Changelog

> Summary: Release history for `apechurch-cli`. Track notable changes by version, with `Unreleased` collecting work that has not been published yet.

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- Hi-Lo Nebula dedicated command now accepts the shared stateful loop controls, including `--loop`, `--max-games`, session stop conditions, and betting strategies

## [8.2.2] - 2026-04-13

### Changed
- Hi-Lo Nebula `--auto best` now scores continuations on net EV, subtracting the extra VRF fee from each future guess while keeping the live jackpot share as the terminal bonus snapshot
- Hi-Lo Nebula manual `Suggested action` hints now appear only with `--solver`, using the same `best` continuation engine when requested
- Hi-Lo Nebula helper text and unfinished-game resume hints now advertise `--solver` alongside `--auto [best]`

## [8.2.1] - 2026-04-13

### Changed
- Refined the Hi-Lo Nebula full display to use the new compact streak layout with centered draw rows, inline range guides, and simplified decision prompts
- Added the standalone `hilo` alias across the CLI catalog and help surface
- Kept the initial Hi-Lo render to a plain waiting message until the first card is revealed

## [8.2.0] - 2026-04-13

### Added
- **Hi-Lo Nebula ✔︎**: Full stateful command with verified start / guess / cashout flow
  - `apechurch-cli hi-lo-nebula <amount>` starts a new run
  - `resume`, `status`, `payouts`, `clear`, and direct action aliases (`high`, `lower`, `same`, `cashout`)
  - `--display full|simple|json`
  - `--auto simple|best` for risk-averse cashout and jackpot-aware continuation heuristics
- **Hi-Lo Nebula docs and verification trail**
  - New contract note: `docs/verification/HI_LO_NEBULA_CONTRACT.md`
  - New analytics note: `docs/analytics/HI_LO_NEBULA_ANALYTICS.md`
  - Updated `ABI_VERIFICATION`, `COMMAND_REFERENCE`, and `GAMES_REFERENCE`
- **Hi-Lo Nebula coverage**
  - New display renderer tests
  - Stateful history refresh now rebuilds Hi-Lo Nebula sessions from `getGameInfo`

### Changed
- `games`, `game <name>`, `status`, and history/status helpers now treat `hi-lo-nebula` as a supported stateful title
- The repo now marks Hi-Lo Nebula as `ABI verified` with a contract-backed rank-only draw model and live jackpot getter support

### Added
- `--auto [simple|best]` for stateful games
- Exact EV `best` solver for Video Poker, including live jackpot value at max bet
- Unit coverage for stateful auto parsing, video poker evaluation, and EV solver

### Changed
- `--auto` without a mode now explicitly means `simple`
- `blackjack --auto best` now prints `not implemented (fallback to simple)`
- `--human` now adds a weighted 3-9s delay on top of `--delay`
- Video Poker docs now describe Royal Flush correctly as `250x + jackpot`

## [1.2.15] - 2026-02-05

### Added
- **Transaction Retry for Game Creation**: All game modes now have 1 retry with 2s backoff
  - Blackjack `startGame()` - retry on failure
  - Video Poker `startGame()` - retry on failure
  - Standard `play` command (already had this) - now consistent across all modes

### Changed
- **Loop Mode Resilience**: All `--loop` modes now continue on transient errors
  - Play, Blackjack, and Video Poker loops all use same pattern
  - Track consecutive errors - stop after 3 failures in a row
  - 5-second delay before retrying after error
  - Clear error messages show retry count: `(1/3 consecutive errors)`
  - Prevents single RPC hiccup from breaking long sessions

### Fixed
- Blackjack loop stopping immediately on any game creation error
- Video Poker loop stopping immediately on any game creation error
- Play loop stopping immediately on transaction errors

## [1.2.14] - 2026-02-05

### Added
- **Color Theme System**: Unified semantic color theming via `lib/theme.js`
  - Semantic colors: win/loss, positive/negative, success/error, etc.
  - Formatters: `formatPnL()`, `formatBalance()`, `formatHistoryLine()`, etc.
  - Card colors: Red suits (♥ ♦) vs black suits (♠ ♣)
  - Uses chalk with automatic NO_COLOR support
  - Self-documenting for future commands

### Changed
- **status**: Colored output with semantic styling
- **history**: Games colored by win/loss, improved formatting
- **games**: Game names highlighted, descriptions styled
- **play**: Win/loss results now color-coded with P&L
- **house status**: Yields green, staked amounts blue, profits colored
- Stateful games (blackjack, video-poker) get colored card rendering

### Developer Notes
- New code should import from `lib/theme.js`
- Use semantic colors (`theme.win`, `theme.error`) not raw colors
- Formatters handle sign/color automatically
- Legacy `colorize()` in display.js deprecated but still works

## [1.2.13] - 2026-02-05

### Added
- **Betting Strategies**: Control bet sizing based on win/loss patterns
  - `flat` — Same bet every time (default)
  - `martingale` — Double on loss, reset on win
  - `reverse-martingale` — Double on win, reset on loss
  - `fibonacci` — Fibonacci sequence on losses
  - `dalembert` — +1 unit on loss, -1 on win
  - Use with `--bet-strategy <name>` and `--max-bet <ape>` for safety cap
- **Loop Controls**: Comprehensive automation options
  - `--max-games <n>` — Stop after N games
  - `--target <ape>` — Stop when balance reaches target
  - `--stop-loss <ape>` — Stop when balance drops to limit
  - Works on `play`, `blackjack`, and `video-poker` commands
- **Parameter Validation**: Comprehensive input validation
  - Invalid strategy names show available options
  - Invalid numeric parameters show clear errors
  - Logical validation (stop-loss < target)
  - Balance-aware warnings at loop start
- **Transaction Retry**: Automatic retry on transaction failures
  - 1 retry with 2-second backoff
  - Better error messages for common RPC issues
- **Documentation Overhaul**:
  - Complete SKILL.md rewrite with all games, strategies, patterns
  - New GAMES_REFERENCE.md with detailed syntax for every game
  - Updated README with full feature list

### Changed
- Balance display shows at each loop iteration with session P&L
- Better error messages for rate limits, gas issues, nonce errors
- Blackjack/Video Poker loops now track results for betting strategies

## [1.2.11] - 2026-02-04

### Added
- **Blackjack**: Full interactive blackjack with optimal strategy
  - `apechurch-cli blackjack <amount>` — Interactive play
  - `apechurch-cli blackjack <amount> --auto` — Auto-play with basic strategy
  - `--loop` support for continuous play
  - All actions: hit, stand, double, split, insurance, surrender
  - Resume unfinished games with `blackjack resume`
- **Video Poker**: Jacks or Better with optimal hold strategy
  - `apechurch-cli video-poker <amount>` — Interactive play
  - `apechurch-cli video-poker <amount> --auto` — Auto-play
  - Fixed denominations: 1, 5, 10, 25, 50, 100 APE
  - Progressive jackpot on Royal Flush at max bet
- **Game Clear Commands**: Remove stuck active games
  - `apechurch-cli blackjack clear`
  - `apechurch-cli video-poker clear`

### Fixed
- Windows path handling for `__dirname` (ENOENT double drive letter)

## [1.0.12] - 2026-02-03

### Added
- **ApeStrong game**: Pick-your-odds dice game
  - Choose win probability from 5-95%
  - Lower range = higher payout (e.g., 5% → 19.5x, 50% → 1.95x)
  - `apechurch-cli play ape-strong 10 50`
  - Aliases: `strong`, `dice`, `limbo`
  - Strategy support with persona-based range selection
- **Keno**: Classic keno with 1-10 picks from 1-40
- **Speed Keno**: Fast batched keno, 1-5 picks from 1-20
- **Monkey Match**: Poker hands from barrel monkeys
- **Bear-A-Dice**: Avoid unlucky dice rolls

## [1.0.2] - 2026-02-03

### Added
- **Pause/Resume commands**: Control autonomous play
  - `apechurch-cli pause` — stops heartbeat from playing
  - `apechurch-cli resume` — allows heartbeat to play again
- **Balance check in bet command**: Prevents play if balance ≤ 1 APE

### Changed
- **Error handling polish**: All errors return clean JSON
  - No stack traces leaked
  - Common RPC/network errors have friendly messages

## [1.0.1] - 2026-02-03

### Changed
- **Faster cooldowns**: Reduced from minutes to seconds
- **Username flexibility**: Any username up to 32 chars
- **Clearer install output**: Shows when username was auto-generated

## [1.0.0] - 2026-02-03

### Added
- Initial release
- Core games: Jungle Plinko, Dino Dough, Bubblegum Heist, Roulette, Baccarat
- Wallet management with optional encryption
- Loop mode with `--loop` flag
- Strategy presets: conservative, balanced, aggressive, degen
- JSON output for all commands
- SIWE-based username registration
