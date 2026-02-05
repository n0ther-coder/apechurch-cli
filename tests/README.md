# Ape Church CLI Tests

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
| `profile.test.js` | Username validation, profile functions |

**Safe to run anytime.** No side effects.

### Integration Tests (`tests/integration/`)

| File | Network | Real Bets | Notes |
|------|---------|-----------|-------|
| `commands.test.js` | Read-only | No | Tests CLI output, validation |
| `wallet.test.js` | No | No | Tests encrypt/decrypt flow |
| `games.test.js` | Yes | **YES** | Live mainnet games |

## Environment Variables

| Variable | Effect |
|----------|--------|
| `SKIP_LIVE_TESTS=1` | Skip all live game tests |
| `SKIP_WALLET_TESTS=1` | Skip wallet encryption tests |

## Live Test Requirements

For `games.test.js`:
- Funded wallet with **at least 20 APE**
- Wallet must be unencrypted (or have active session)
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
- Wallet encryption flow
- Live game execution
- Error handling

### 🔲 Not Covered (yet)
- Loop mode stop conditions (would need multiple real bets)
- House deposit/withdraw (state-changing)
- Contest registration
- Full VRF timeout scenarios
