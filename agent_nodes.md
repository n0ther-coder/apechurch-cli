AGENT NOTES - APE CHURCH SKILL PACKAGE
======================================

Last updated: 2026-02-03 (v1.0.2)

SUMMARY OF WORK COMPLETED
-------------------------
1) CLI Core (bin/cli.js)
- Wallet generation and storage at ~/.apechurch-wallet.json (install command).
- Install now copies multiple skill files into ~/.openclaw/skills/ape-church:
  - SKILL.md, HEARTBEAT.md, STRATEGY.md, skill.json
- Install now attempts auto-registration via SIWE:
  - If username is not provided, generates a unique username.
  - Enforces username to end in _CLAWBOT, <=32 chars, [A-Za-z0-9_].
  - Registers against https://www.ape.church/api/profile (POST).
  - Payload includes message, signature, user_address, username,
    profile_picture_ipfs: null, referred_by_address: zero address, isAI: true.
  - Uses SIWE message with:
    domain: ape.church, uri: https://ape.church, chainId: 33139,
    statement: username.
- New profile management:
  - apechurch profile show --json
  - apechurch profile set --persona <...> --username <...>
- New register command:
  - apechurch register --username <NAME> --persona <...>
- Status command now returns:
  - address, balance, available_ape, gas_reserve_ape, paused, persona, username,
    can_play (based on available_ape).
- Added heartbeat command (autonomous loop):
  - Reads persona from profile (default balanced).
  - Enforces gas reserve (1 APE) and minimum wager target (10 APE).
  - Dynamic cooldown based on streaks.
  - Chooses one game + config per run.
  - Tracks streaks and totalPnL in ~/.apechurch/state.json.

2) Game Support (implemented in CLI)
- Jungle Plinko:
  - Contract: 0x88683B2F9E765E5b1eC2745178354C70A03531Ce
  - Fee: getVRFFee(uint32 customGasLimit), customGasLimit = 289000 + (balls*11000)
  - gameData: (uint8 mode, uint8 numBalls, uint256 gameId, address ref, bytes32 userRandomWord)
- Dino Dough (Slots):
  - Contract: 0x9ebb4Df257B971582BAf096b62CA41DE7723F3CB
  - Fee: getVRFFee()
  - gameData: (uint256 gameId, uint8 numSpins, address ref, bytes32 userRandomWord)
- Bubblegum Heist (Slots):
  - Contract: 0xB5Da735118e848130B92994Ee16377dB2AE31a4c
  - Same schema and fee as Dino Dough
- Event handling:
  - Watches GameEnded(user indexed, gameId, buyIn, payout)
  - Returns JSON with game_url, wager_ape, payout_ape, etc.

3) Docs & Skill Files
- assets/SKILL.md updated with:
  - Full usage, games, parameters, funding, heartbeat, persona.
  - Registration instructions + endpoint.
  - Replay URLs.
- Added assets/HEARTBEAT.md, assets/STRATEGY.md, assets/skill.json
- Added root SKILL.md, HEARTBEAT.md, STRATEGY.md, skill.json for hosting/local use.

4) Dependency Updates
- Added "siwe" (now ^3.0.0) to package.json.
- Added Node.js engines requirement: >= 18.
- Package name set to "@ape-church/skill".
- CLI now supports `apechurch --version`.

5) Pause/Resume (v1.0.2)
- Added `apechurch pause` and `apechurch resume` commands.
- Profile now includes `paused` field.
- Heartbeat skips gracefully when paused.
- Status shows paused state and can_play reflects it.

6) Error Handling Polish (v1.0.2)
- Added `sanitizeError()` helper for clean JSON output.
- No stack traces leak to users.
- Common RPC/network errors have friendly messages.
- Balance check added to bet command (graceful skip if ≤ 1 APE).

7) UX Improvements (v1.0.1 + v1.0.2)
- Faster cooldowns (10-60 seconds instead of 2-20 minutes).
- Cron runs every minute; internal cooldowns control play rate.
- Username flexibility (no _CLAWBOT suffix required).
- Install output shows auto-generated username and how to change it.
- Status command shows username, persona, paused state.

KNOWN LIMITATIONS / OPEN QUESTIONS
----------------------------------
1) Moltbook skill.md could not be fetched due to 400 response.
   If needed, paste contents to align formatting.
2) No registry abstraction yet for games (still in CLI branching).
3) No username/profile validation feedback from API besides generic errors.
4) GP (cashback) integration removed for v1 - will add later.
5) No explicit "register on install" fallback if API is offline (we log error and continue).
6) No tests executed yet.

WHAT'S LEFT BEFORE GO-LIVE
--------------------------
HIGH PRIORITY
- Refactor game definitions into a registry so adding games is data-only. (DONE - registry.js)
- Registry updates are shipped inside package (Option A). New games require package update.
- ✅ ApeChain RPC uses viem defaults (no env vars needed).
- Ensure package install + register flow works end-to-end with API.

MEDIUM PRIORITY (POST-LAUNCH)
- GP / cashback contract integration (deferred to v2).
- Add profile schema docs and example profile.json. (DONE - profile.example.json + docs)
- Ensure heartbeat respects persona overrides (currently does).
- Confirm replay URL slugs for new games if added later.

LOW PRIORITY / FUTURE
- Add "register username" on install with optional user prompt (currently auto).
- Add "strategy override" command or persona presets.
- Add more games.

GO-LIVE CHECKLIST
-----------------
1) Run install and confirm:
   - wallet generated at ~/.apechurch-wallet.json
   - skill files copied to ~/.openclaw/skills/ape-church
   - username registered via SIWE to https://www.ape.church/api/profile
2) Fund agent address via relay bridge.
3) Run status to confirm balance + available_ape.
4) Run a test bet on each game.
5) Run heartbeat and confirm:
   - dynamic cooldown behavior
   - state file updates
6) Verify game replay URLs.

FILES MODIFIED / ADDED
----------------------
- bin/cli.js (major updates: SIWE, profile, heartbeat, strategies)
- package.json (added siwe)
- package-lock.json (updated for siwe and package rename)
- registry.js (local game registry)
- assets/SKILL.md (expanded)
- assets/HEARTBEAT.md (new)
- assets/STRATEGY.md (new)
- assets/skill.json (new)
- SKILL.md (new)
- HEARTBEAT.md (new)
- STRATEGY.md (new)
- skill.json (new)
- PUBLISHING.md (release + client setup)
- profile.example.json (override example)
- CHANGELOG.md (release log)
