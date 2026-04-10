# ABI Verification Guide

> Summary: Maintainer checklist for promoting a supported game to `ABI verified` in this repo. Defines the evidence required before setting `abiVerified: true` and showing the `✔︎` marker in CLI output and docs.

In this fork, `ABI verified` means more than "the game works" or "the contract address is known". A game only earns `abiVerified: true` after the local ABI, encoding/decoding logic, runtime constants, payout or solver model, and user-facing docs have been checked against verified on-chain contract data.

If any part of that chain is still inferred from transparency screenshots, gameplay behavior, or informal notes, leave the game unverified and do not add the `✔︎`.

## Promotion Standard

To promote a game from unverified to verified, confirm all of the following:

1. The contract address used by the CLI matches the live Ape Church game contract.
2. The contract source or ABI reference is publicly verified and readable.
3. The CLI's write path matches the contract exactly:
   - function names
   - `gameData` tuple shape and field order
   - fee getter (`getVRFFee`, `vrfFee`, or game-specific equivalent)
   - any action methods for stateful games
4. The CLI's read path matches the contract exactly:
   - `getGameInfo` or equivalent return shape
   - enum values
   - auxiliary getters used for limits, paytables, jackpots, or runtime metadata
5. The repo's paytable, RTP model, and solver assumptions are derived from verified contract logic, not only from public transparency summaries.
6. Tests cover the promoted metadata and the contract-backed logic that justified the promotion.
7. The docs record the verified behavior clearly enough that a future maintainer can reproduce the check.

## Acceptable Sources

Use sources in this priority order:

1. Verified ApeScan or Blockscan source code for the exact contract address.
2. Live view calls against that verified ABI for mutable data such as jackpots, bet lists, bucket weights, or fee constants.
3. Ape Church transparency pages or game docs as secondary corroboration only.
4. Repo-local notes, tests, and implementation details after they have been reconciled with the verified source.

The following are not enough on their own:

- a contract address in the UI
- a working gameplay transaction
- rounded transparency RTP values
- hand-written notes without a verified source

## Promotion Checklist

### 1. Confirm Contract Identity

- Match the address in `registry.js` or the stateful constants module to the public game page and explorer page.
- Confirm the contract you are reading is the one the CLI actually calls.
- Record the contract address in the game's docs section if it is not already present.

### 2. Verify the Write Path

- Confirm the entrypoint function used by the CLI, usually `play(address player, bytes gameData)`.
- For stateful games, confirm every follow-up action function and its payable requirements.
- Match the local `encodeAbiParameters(...)` tuple exactly to the contract's `abi.decode(...)` order and types.
- Check special value rules such as:
  - static vs custom-gas VRF fee reads
  - wager splitting
  - extra action costs like `double`, `split`, or redraw fees

### 3. Verify the Read Path

- Confirm every ABI item used by the repo for reads and history refreshes.
- Check struct layouts, enum ordinals, and tuple component order.
- Verify helper getters that the docs or solver rely on, such as:
  - paytable getters
  - bucket weight getters
  - bet denomination getters
  - jackpot getters
  - mode tables

### 4. Verify Rules, Limits, and Constraints

- Confirm min/max ranges and any cross-field rules in `registry.js`.
- Check mode numbering, allowed pick counts, bet tokens, and any contract-side caps.
- If the CLI intentionally omits a supported contract feature, document that separately instead of silently marking the whole game verified.

### 5. Verify Payout and RTP Logic

- Reconcile `lib/rtp.js`, solver code, and any game-specific constants with the verified source.
- For exact RTP claims, verify the paytable and the probability model.
- For stateful solvers, verify that payout evaluation uses the same hand ranking or outcome logic as the contract.
- If a live getter changes over time, record the exact read date in the docs alongside the derived statement.

### 6. Lock It In With Tests

Before promotion, add or refresh tests for the relevant game:

- CLI metadata output from `games` and `game <name>`
- JSON `abiVerified` metadata
- exact payout, RTP, or solver constants derived from the verified source
- any state parsing or getter-decoding that was part of the promotion

### 7. Flip the Visible Status

Only after the checks above are complete:

- set `abiVerified: true` in `registry.js` or the supplemental display entry
- add or refresh the game's dedicated note under `docs/verification/`
- update `docs/GAMES_REFERENCE.md` with `ABI verified: true`, the short verified summary, and a link to the dedicated note
- update `README.md` or `SKILL.md` summaries if they enumerate verified games
- confirm `apechurch-cli games` and `apechurch-cli game <name>` now show the `✔︎` or `true` metadata consistently

## Current Backlog

As of **2026-04-09**, there are no remaining supported games waiting on promotion to `ABI verified` in this repo.

Currently promoted games are ApeStrong ✔︎, Roulette ✔︎, Baccarat ✔︎, Jungle Plinko ✔︎, Cosmic Plinko ✔︎, Keno ✔︎, Speed Keno ✔︎, Dino Dough ✔︎, Bubblegum Heist ✔︎, Monkey Match ✔︎, Bear-A-Dice ✔︎, Primes ✔︎, Blackjack ✔︎, and Video Poker ✔︎.

Every promoted game now has a dedicated verification note under `docs/verification/`:

| Game | Note |
|------|------|
| ApeStrong | `docs/verification/APESTRONG_CONTRACT.md` |
| Roulette | `docs/verification/ROULETTE_CONTRACT.md` |
| Baccarat | `docs/verification/BACCARAT_CONTRACT.md` |
| Jungle Plinko | `docs/verification/JUNGLE_PLINKO_CONTRACT.md` |
| Cosmic Plinko | `docs/verification/COSMIC_PLINKO_CONTRACT.md` |
| Keno | `docs/verification/KENO_CONTRACT.md` |
| Speed Keno | `docs/verification/SPEED_KENO_CONTRACT.md` |
| Dino Dough | `docs/verification/DINO_DOUGH_CONTRACT.md` |
| Bubblegum Heist | `docs/verification/BUBBLEGUM_HEIST_CONTRACT.md` |
| Monkey Match | `docs/verification/MONKEY_MATCH_CONTRACT.md` |
| Bear-A-Dice | `docs/verification/BEAR_DICE_CONTRACT.md` |
| Primes | `docs/verification/PRIMES_CONTRACT.md` |
| Blackjack | `docs/verification/BLACKJACK_CONTRACT.md` |
| Video Poker | `docs/verification/VIDEO_POKER_CONTRACT.md` |

## When the Docs Are Not Clear

If a game looks "almost verified" but the evidence trail is still incomplete:

1. Do not set `abiVerified: true`.
2. Add the missing maintainer notes first.
3. Capture the verified source or live getter evidence in `docs/verification/<GAME>_CONTRACT.md` and link it from `docs/GAMES_REFERENCE.md`.
4. Only then flip the flag and add the `✔︎`.
