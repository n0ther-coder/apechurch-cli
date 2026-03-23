# Ape Church Skill - Publishing & Client Setup

## Maintainer: Publish to npm

### Prerequisites
- Node.js >= 18 (required for built-in `fetch` and SIWE registration)

### 1) Prepare release
1. Update `registry.js` if adding or changing games.
2. Update docs if needed:
   - `SKILL.md`, `HEARTBEAT.md`, `STRATEGY.md`, `skill.json`
   - `assets/SKILL.md`, `assets/HEARTBEAT.md`, `assets/STRATEGY.md`, `assets/skill.json`
3. Update `agent_nodes.md` with new changes and any open items.

### 2) Versioning
Use semver:
- Patch: docs/bugfixes, no behavior changes
- Minor: new games, new CLI commands, new config fields
- Major: breaking changes to CLI or behavior

Example:
`npm version minor`

### 3) Publish
1. Login (first time):
   - `npm login`
2. Publish:
   - `npm publish --access public`

### 4) Verify
- `npm view @apechurch-hf/apechurch-cli-gx54 version`
- Install from a clean machine:
  - `npm install -g @apechurch-hf/apechurch-cli-gx54`

---

## Client: Human User Setup

### Install
1. `npm install -g @apechurch-hf/apechurch-cli-gx54`
   - Requires Node.js >= 18
2. `apechurch-cli-gx54 install`
   - Requires APECHURCH_CLI_GX54_PK and stores only an encrypted wallet locally
   - Registers username via SIWE (auto-generated unless provided)
   - Prints funding guide and wallet address

### Fund
Open:
`https://relay.link/bridge/apechain?toCurrency=0x0000000000000000000000000000000000000000`

Steps:
1. Connect wallet
2. Paste agent address into ApeChain buy area:
   `Select wallet -> Paste wallet address`

### Check Status
`apechurch-cli-gx54 status --json`

### Optional: Set Persona
`apechurch-cli-gx54 profile set --persona balanced`

### Run Autonomy
`apechurch-cli-gx54 heartbeat --strategy balanced`

---

## Client: Agent-Driven Setup

### Install & Register
1. `npm install -g @apechurch-hf/apechurch-cli-gx54`
   - Requires Node.js >= 18
2. `apechurch-cli-gx54 install --username <NAME>`
   - If no username is given, one is generated.

### Persona (Optional)
`apechurch-cli-gx54 profile set --persona aggressive`

### Autonomous Play
Run on a schedule:
`apechurch-cli-gx54 heartbeat --strategy balanced`

Notes:
- Heartbeat runs at most one play per invocation.
- Cooldown is strategy-driven and can be overridden with `--cooldown`.

---

## Updates (Option A Registry)
- New games are shipped via package updates only.
- Clients must run:
  - `npm update -g @apechurch-hf/apechurch-cli-gx54`
  - or reinstall with `npm install -g @apechurch-hf/apechurch-cli-gx54`

---

## Migration Guide (Template)

### When to bump versions
- Patch: docs, small bugfixes
- Minor: new games, new flags, new outputs
- Major: breaking CLI changes, renamed commands, altered defaults

### Migration steps for clients
1. Update:
   - `npm update -g @apechurch-hf/apechurch-cli-gx54`
2. Verify version:
   - `apechurch-cli-gx54 --version`
3. Re-run install to refresh skill files:
   - `apechurch-cli-gx54 install`

### Notes
- Registry is bundled in the package; updating is required for new games.

---

## Profile Overrides (Optional)
Profiles live at `~/.apechurch-cli-gx54/profile.json` and can override strategy defaults.
See `profile.example.json` for a full example.

Common override keys:
- `overrides.min_bet_ape`
- `overrides.target_bet_pct`
- `overrides.max_bet_pct`
- `overrides.base_cooldown_ms`
- `overrides.game_weights`
- `overrides.plinko.mode`, `overrides.plinko.balls`
- `overrides.slots.spins`

---

## Release Checklist
1. Update `CHANGELOG.md` under [Unreleased].
2. Update `registry.js` if adding games.
3. Update docs in both root and `assets/`.
4. Run a local sanity check:
   - `node -v`
   - `npm -v`
   - `apechurch-cli-gx54 install --username TEST_CLAWBOT` (local)
5. Bump version:
   - `npm version patch|minor|major`
6. Publish:
   - `npm publish --access public`
