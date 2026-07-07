# Ape Church CLI Tests

> Summary: Entry point for the test suite. Explains safe versus live commands, required environment variables, current coverage, and where new tests should be added.

## Quick Start

```bash
# Run all tests (includes live bets!)
npm test

# Run only unit tests (safe, no network)
npm run test:unit

# Run safe integration tests (no real bets)
npm run test:safe

# Run live game tests (USES REAL APE!)
npm run test:live
```

## Test Categories

### Unit Tests (`tests/unit/`)
Pure function tests - no network calls, no state changes.

| File | Tests |
|------|-------|
| `utils.test.js` | Utility functions (formatters, random generators) |
| `theme.test.js` | Color theme and formatting functions |
| `strategies.test.js` | All betting strategy implementations |
| `stateful-auto.test.js` | Auto mode parsing and human delay timing |
| `profile.test.js` | Username validation, profile functions |
| `video-poker-evaluator.test.js` | Video poker hand evaluator and payouts |
| `video-poker-solver.test.js` | Exact EV solver for video poker hold choices |

**Safe to run anytime.** No side effects.

### Integration Tests (`tests/integration/`)

| File | Network | Real Bets | Notes |
|------|---------|-----------|-------|
| `commands.test.js` | Read-only | No | Tests CLI output, validation |
| `wallet.test.js` | No | No | Tests hardened wallet restrictions/status |
| `games.test.js` | Yes | **YES** | Live mainnet games |

## Environment Variables

| Variable | Effect |
|----------|--------|
| `SKIP_LIVE_TESTS=1` | Skip all live game tests |
| `APECHURCH_CLI_PASS=...` | Supply the local wallet password non-interactively during live signing |
| `APECHURCH_CLI_PK=0x...` | Optional non-interactive fallback if you must run `apechurch-cli install` on a fresh machine without a terminal prompt |
| `APECHURCH_CLI_PROFILE_URL=https://...` | Override the profile API endpoint during local setup/registration |
| `APECHURCH_CLI_CONFIG_DIR=/path/to/config` | Override the local CLI config/data root for isolated test runs |
| `APECHURCH_CLI_BOTS_DIR=/path/to/bots` | Override the external bot root used by `bot` tests |
| `APECHURCH_CLI_LOG_DIR=/path/to/log` | Override the bot log directory |
| `APECHURCH_CLI_R2_PREFIX=prefix` | Optional object-key prefix for best-effort R2 bot log mirrors |
| `APECHURCH_CLI_R2_NAME=...` | Optional bucket-name fallback for `apechurch-cli bucket install <bucket>` |
| `APECHURCH_CLI_R2_ACCOUNT_ID=...` | Optional account-ID fallback for `apechurch-cli bucket install <bucket>` |
| `APECHURCH_CLI_R2_TOKEN=...` | Optional API-token fallback for `apechurch-cli bucket install <bucket>` |
| `APECHURCH_CLI_R2_KEY=...` | Optional access-key fallback for `apechurch-cli bucket install <bucket>` |
| `APECHURCH_CLI_R2_SECRET=...` | Optional secret-access-key fallback for `apechurch-cli bucket install <bucket>` |
| `APECHAIN_RPC_URL=https://...` | Override the ApeChain RPC URL used by wallet/live reads |

## Live Test Requirements

For `games.test.js`:
- Funded wallet with **at least 20 APE**
- Encrypted wallet must be installed locally
- Password must be provided interactively or via `APECHURCH_CLI_PASS` before signing
- Each test makes 1 APE minimum bets

## Test Commands

```bash
# Full test suite
npm test

# Unit tests only (fast, safe)
npm run test:unit

# Safe integration (no real bets)
npm run test:safe

# Live games only
npm run test:live

# Skip live tests via env
SKIP_LIVE_TESTS=1 npm test

# Run specific test file
node --test tests/unit/strategies.test.js

# Run with verbose output
node --test --test-reporter spec tests/unit/
```

## Adding Tests

1. Unit tests go in `tests/unit/`
2. Integration tests go in `tests/integration/`
3. Use `node:test` built-in module
4. Follow existing patterns for consistency

Example:
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('MyFeature', () => {
  it('does something', () => {
    assert.strictEqual(1 + 1, 2);
  });
});
```

## What Gets Tested

### ✅ Covered
- All betting strategies (flat, martingale, fibonacci, etc.)
- Color theme formatters
- Username/profile validation
- CLI command parsing
- JSON output format
- Hardened encrypted-wallet flow
- Stateful auto mode parsing and humanized delay logic
- Video poker hand evaluation and exact EV hold solver
- Live game execution
- Error handling

### 🔲 Not Covered (yet)
- Loop mode stop conditions (would need multiple real bets)
- House deposit/withdraw (state-changing)
- Contest registration
- Full VRF timeout scenarios
