# Legacy 1-Wallet Layout And Manual Migration

The CLI no longer migrates old storage automatically.

This document covers only:

- the old single-wallet layout
- the current layout used by the latest code

## Current Layout

Canonical layout under `~/.apechurch-cli`:

```text
wallet.json
wallets/<addr>.json
profiles/<addr>_profile.json
states/<addr>_state.json
history/<addr>_history.json
games/<addr>_games.json
```

Rules:

- `<addr>` must be lowercase.
- `wallet.json` is the currently selected wallet.
- `wallets/<addr>.json` is the archived copy used by `wallet select`.
- Old filenames are not read by the current code.

## Old 1-Wallet Layout

```text
wallet.json
profile.json
state.json
active_games.json
history/church_<addr>.json
```

## Backup First

```bash
cd ~/.apechurch-cli
cp -a . "../.apechurch-cli.backup.$(date +%Y%m%d-%H%M%S)"
```

## Resolve The Wallet Address

If `wallet.json` already contains an `address` field:

```bash
cd ~/.apechurch-cli
export ADDR="$(node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync('wallet.json','utf8'));if(!data.address) process.exit(1);process.stdout.write(String(data.address).toLowerCase())")"
```

If it does not, set it manually:

```bash
export ADDR=0x1234...abcd
export ADDR="${ADDR,,}"
```

## Migration Commands

Run from `~/.apechurch-cli`:

```bash
cd ~/.apechurch-cli
mkdir -p wallets profiles states history games
cp -f wallet.json "wallets/${ADDR}.json"
[ -f profile.json ] && mv profile.json "profiles/${ADDR}_profile.json"
[ -f state.json ] && mv state.json "states/${ADDR}_state.json"
[ -f active_games.json ] && mv active_games.json "games/${ADDR}_games.json"
[ -f "history/church_${ADDR}.json" ] && mv "history/church_${ADDR}.json" "history/${ADDR}_history.json"
```

## Verification

List the resulting files:

```bash
cd ~/.apechurch-cli
find . -maxdepth 2 -type f | sort
```

These old paths must not remain:

- `profile.json`
- `state.json`
- `active_games.json`
- `history/church_<addr>.json`

If they still exist, migration is incomplete.
