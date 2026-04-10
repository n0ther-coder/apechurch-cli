# Primes Contract Verification Notes

> Summary: Contract-backed tuple layout, difficulty table, and exact RTP notes used to keep Primes marked `ABI verified`.

## Source Basis

- Contract used by the CLI: `0xC1aCd12aA34dC33979871EF95c540D46A6566B4b`
- Explorer address page: `https://apescan.io/address/0xC1aCd12aA34dC33979871EF95c540D46A6566B4b#code`
- Local write-path reference: `lib/games/primes.js`
- Local registry/VRF config: `registry.js`
- Local RTP/reference model: `lib/rtp.js`

This note consolidates the verified contract-facing behavior that was previously embedded inline in `docs/GAMES_REFERENCE.md`.

## Contract Identity

- Game name in the repo: `Primes`
- Alias: `prime`
- Supported difficulty values: `0..3`
- Supported run counts: `1..20`

## Verified Write Path and VRF Cost

The CLI encodes `gameData` as:

```text
(uint8 difficulty, uint8 numRuns, uint256 gameId, address ref, bytes32 userRandomWord)
```

Verified runtime constraints:

- `difficulty` must be in `0..3`
- `numRuns` must be in `1..20`
- the total wager is split across runs on-chain via `floor(totalBetAmount / numRuns)`

Primes uses a custom gas fee path:

```text
BASE_GAS = 520000
GAS_PER_RUN = 80000
customGasLimit = BASE_GAS + GAS_PER_RUN * numRuns
```

## Verified Difficulty Table

The contract-backed `gameModes[difficulty]` table is:

| Difficulty | Label | Draw Space | Prime Hits | Prime Payout | Zero Payout | Total Win Chance | Exact RTP |
|------------|-------|------------|------------|--------------|-------------|------------------|-----------|
| `0` | Easy | `0-9` | `4 / 10` | `1.9x` | `2.2x` | `50.0%` | `98.00%` |
| `1` | Medium | `00-99` | `25 / 100` | `3.5x` | `10.5x` | `26.0%` | `98.00%` |
| `2` | Hard | `000-999` | `168 / 1000` | `5.5x` | `56x` | `16.9%` | `98.00%` |
| `3` | Extreme | `0000-9999` | `1229 / 10000` | `7.57x` | `500x` | `12.3%` | `98.04%` |

Important mechanic:

- `0` is the fixed top-payout outcome, not a live progressive jackpot
- primes pay the base multiplier
- non-prime, non-zero outcomes pay `0`

## Verified Runtime Constants

- `MAX_RUNS = 20`
- `platformFee = 200`
- `BASE_GAS = 520000`
- `GAS_PER_RUN = 80000`

The documented payout model depends on the verified `gameModes[difficulty]` table plus the on-chain `isPrime` mapping.

## Exact RTP Model

For difficulty `d`:

```text
RTP_run(d) = ((primeCount(d) * primeMultiplier(d)) + zeroMultiplier(d))
             / maxRange(d) / 100

RTP_game(d, B, N) = RTP_run(d) * floor(B / N) * N / B
```

Implications:

- difficulty controls the actual EV surface
- run count only changes floor-division dust against the total buy-in

Verified exact references:

| Difficulty | Exact RTP |
|------------|-----------|
| Easy | `98.00%` |
| Medium | `98.00%` |
| Hard | `98.00%` |
| Extreme | `98.04%` |

## Transparency Snapshot

- House Profit: `-12,401 APE`
- Running RTP: `105.64%`
- Total Wagered: `219,787 APE`
- Total Games Played: `6,484`

The observed running RTP above `100%` is a historical snapshot, not proof of a stable player edge.

## Promotion Outcome

Primes qualifies for `ABI verified` in this repo because:

- the encoded tuple, dynamic fee path, and run/difficulty limits are documented locally
- the repo's exact RTP references use the verified difficulty table and prime mapping rather than only transparency rounding
- the docs now preserve the fixed zero-payout mechanic and the batching dust model explicitly
