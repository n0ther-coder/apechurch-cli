# Glyde or Crash Contract Verification

> Summary: `Glyde or Crash` is now promoted to `ABI verified` in this repo. The live contract is the verified `SpeedCrash` contract at `0x5b44ce34300d1b8d32b5a6119f192e3eda74e144`, and the CLI write/read path, limits, fee getter, and exact EV formula all match the verified source plus live getters checked on 2026-04-24.

## Contract Identity

- Game name in CLI: `Glyde or Crash`
- Public page slug: `speed-crash`
- Explorer contract: `0x5b44ce34300d1b8d32b5a6119f192e3eda74e144`
- Verified explorer name: `SpeedCrash`
- CLI command: `apechurch-cli play glyde-or-crash <amount> <multiplier>`

The public docs and UI currently use both `Glyde or Crash` and `Glyder or Crash`. The verified contract name on ApeScan is `SpeedCrash`.

## Verified Write Path

The CLI uses the generic entrypoint:

```solidity
play(address player, bytes gameData)
```

The verified `gameData` tuple is:

```solidity
(uint256 targetMultiplier, uint256 gameId, address ref, bytes32 userRandomWord)
```

Repo alignment:

- `lib/games/glydeorcrash.js` encodes exactly that tuple.
- `targetMultiplier` is expressed in basis points:
  - `1.01x = 10100`
  - `2x = 20000`
  - `50x = 500000`
  - `10000x = 100000000`
- The CLI now accepts `<number>` or `<number>x`, normalizes to that basis-point surface, and writes the verified tuple order.

## Verified Read Path

The CLI and history refresh use:

```solidity
getGameInfo(uint256 gameId)
```

The verified return tuple is:

```solidity
(
  address player,
  uint256 betAmount,
  uint256 targetMultiplier,
  uint256 crashMultiplier,
  uint256 totalPayout,
  bool hasEnded,
  uint256 timestamp
)
```

Repo alignment:

- `lib/games/glydeorcrash.js` uses the verified `getGameInfo` ABI.
- `lib/wallet-analysis.js` reconstructs saved history variants from both calldata and `getGameInfo`.
- Canonical saved-history variant keys are now `glyde-or-crash:target:<basisPoints>`.

## Live Getter Snapshot (2026-04-24)

The following mutable getters were checked live on 2026-04-24:

| Getter | Live value | Meaning |
|---|---:|---|
| `getVRFFee()` | `0.093211589 APE` | Static VRF fee added on top of the wager |
| `MIN_TARGET_MULTIPLIER()` | `10100` | `1.01x` minimum supported target |
| `MAX_TARGET_MULTIPLIER()` | `100000000` | `10000x` maximum supported target |
| `platformFee()` | `280` | `2.8%` platform fee on the post-VRF bet amount |
| `houseEdge()` | `30000` | `3.0%` crash formula edge input |
| `numUsedGameIDs()` | `26884` | Rough live usage snapshot only |

Important correction versus the current public UI summary:

- the current public presets start at `1.5x`;
- the verified contract and current numeric input surface allow `1.01x`.

## Exact Settlement Rule

The verified source computes:

1. `e = randomWords[0] % 1_000_000`
2. If `e < houseEdge`, then `crashMultiplier = 10000` (`1.00x`)
3. Otherwise:

```text
crashMultiplier = floor(((1_000_000 - houseEdge) * 10_000) / (1_000_000 - e))
```

4. The player wins iff:

```text
crashMultiplier >= targetMultiplier
```

5. Winning payout:

```text
totalPayout = targetMultiplier * betAmount / 10_000
```

With the live `houseEdge = 30000`, the exact win probability for target `T` in basis points is:

```text
P(win at T) = floor(9_700_000_000 / T) / 1_000_000
```

And the exact player RTP is:

```text
RTP(T) = floor(9_700_000_000 / T) * T / 100_000_000
```

Consequences:

- many round-number targets land at exactly `97.00%` RTP;
- the full supported surface is not perfectly flat because of integer quantization;
- the worst exact trough is about `96.01020424%` at `9897.9592x`;
- the best exact RTP is `97.00%`.

## Fee Split Interpretation

With the live `platformFee = 2.8%`:

- player EV is about `97.00%` on many common targets;
- bankroll-side EV on those targets is about `0.2%`;
- protocol edge rises above `0.2%` on quantization troughs because player EV dips below `97%`;
- platform fee plus bankroll EV still reconciles to the contract's `3%` edge model.

## Sample Transactions Checked

Two user-provided gameplay transactions were decoded and cross-checked against live `getGameInfo` reads:

| Tx | Target | Bet | Crash | Payout | Outcome |
|---|---|---:|---|---:|---|
| `0x649f4c59d09fc30a0d12f9e927884a079d33c29f39b48f136a5684d2444eda6b` | `50x` (`500000`) | `1 APE` | `1.9449x` (`19449`) | `0` | Loss |
| `0xa5439fd1c199782b907fc2527daac63e0984e2f1bacbd46315ca8d1ae77fea13` | `2x` (`20000`) | `25 APE` | `1.00x` (`10000`) | `0` | Loss |

Observed settlement timestamps from the live tuple:

- `0x649f...da6b`: `2026-04-24T13:41:22Z`
- `0xa543...ea13`: `2026-04-24T13:40:53Z`

These two samples are not the proof by themselves; they are only consistency checks on top of the verified source and live getters.

## Promotion Outcome

`Glyde or Crash` now meets the repo promotion standard for `abiVerified: true` because:

1. contract identity is fixed and verified;
2. the CLI write tuple matches the verified source exactly;
3. the CLI read tuple matches `getGameInfo` exactly;
4. target bounds and fee getter are live-checked;
5. the RTP model is now derived from the verified settlement formula rather than from public running RTP snapshots.
