# Cash Dash Contract Verification

Contract: `0xbcfA645D79F4ccF2B5448aC67309DCd15Bc94035`

Verified source name: `DeathFun`

## ABI Surface Used

- `play(address player, bytes gameData)` starts a run and embeds the first tile guess.
- `makeGuess(uint256 gameId, uint8 index, bytes32 userRandomWord)` continues an active run.
- `cashOut(uint256 gameId)` settles the current cashout after a resolved safe row.
- `getGameInfo(uint256 gameId)` returns the state tuple used by the CLI.
- `getRowsForRound(uint256 roundId, uint256 tilesetSeed)`, `rowPayouts(uint8)`, `platformFee()`, and `getVRFFee()` provide live configuration.

## Encoded Start Payload

`gameData` is decoded on-chain as:

```solidity
(uint256 gameId, uint256 tilesetSeed, uint8 firstGuess, address ref, bytes32 userRandomWord)
```

The CLI uses a random `gameId`, `tilesetSeed = 0`, a one-based user tile converted to zero-based `firstGuess`, the configured referral address, and a fresh random user word.

## Verified Row Model

- `MIN_ROWS = 2`
- `MAX_ROWS = 7`
- `ROWS_MODULUS = 6`
- Default `rowPayouts`:
  - `2 -> 19200` (`1.9200x`)
  - `3 -> 14400` (`1.4400x`)
  - `4 -> 12800` (`1.2800x`)
  - `5 -> 12000` (`1.2000x`)
  - `6 -> 11500` (`1.1500x`)
  - `7 -> 11000` (`1.1000x`)
- With `tilesetSeed = 0`, row sizes repeat `7, 6, 5, 4, 3`; every 20th resolved row uses `2` tiles.

Each resolved row has one death tile: `deathHit = randomWord % numTiles`. If the chosen index matches it, the run ends with `0` payout. Otherwise the current payout is multiplied by `rowPayouts[numTiles] / 10000`.

## CLI Notes

Cash Dash is stateful. A valid run can span `play -> makeGuess* -> cashOut`, or end on a death tile after any random resolution. The CLI stores active game IDs under `cash-dash`, waits for VRF resolution between guesses, and records local history when a terminal state is detected.
