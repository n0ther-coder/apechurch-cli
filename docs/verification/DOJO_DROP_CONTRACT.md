# Dojo Drop: public interface and remaining verification

Dojo Drop is playable but **not ABI verified** under this repository's
[promotion standard](../ABI_VERIFICATION.md). Its Solidity source was not
verified on the public explorers when checked on 2026-10-24. The adapter
uses the official frontend's interface, corroborated by live read calls and
read-only `eth_call` simulation. This is not a Solidity audit or a proof of
its full probability model.

## Public sources

- [Official game](https://ape.church/games/dojo-drop).
- [ApeScan contract](https://apescan.io/address/0x914d11f805586dF8Ed440Fe23dcdce929965FBb1).
- [Caldera contract](https://apechain.calderaexplorer.xyz/address/0x914d11f805586dF8Ed440Fe23dcdce929965FBb1).
- Frontend chunks observed on the official game page:
  `56948-eb84926027d99428.js` (getter signatures and geometry) and
  `42220-9cf77c8720759af1.js` (transaction construction). These filenames
  identify the checked deployment; subsequent deployments may rename them.
- ApeChain JSON-RPC: `https://rpc.apechain.com/http`, chain ID `33139`.
  The configuration snapshot below was read at block `52884995`; all ten
  fields matched a reread at block `52978021` on 2026-10-25.

The contract address is
`0x914d11f805586dF8Ed440Fe23dcdce929965FBb1`. The official frontend catalog
identifies it as Dojo Drop, game `40`.

## Command and transaction

```bash
apechurch-cli play dojo-drop 25 --split 10 --validate-only --json
apechurch-cli game dojo --paytable --split 1 --json
apechurch-cli play dojo-drop 5 --split 2 --json
```

Aliases: `dojodrop`, `dojo`. In count mode the total wager is the amount
supplied to `play` or `bet`; `--split` and the positional count select
1–15 paid spins. With `--spin <APE>`, that amount is a budget: maximize the
paid count within it and the live limit, wagering only `count × spin` and
leaving the remainder unspent. The option conflicts with explicit counts.
Default: 15 spins. At least 2.5 APE per spin is required; malformed or
fractional counts, conflicting flags and smaller explicit totals fail before
wallet access. Auto-play retains the existing slots strategy behavior.

The payable entrypoint is `play(address player, bytes gameData)`:

```solidity
abi.encode(uint8 numSpins, uint256 gameId, address ref, bytes32 userRandomWord)
```

The order differs from the older slots' game-ID-first format. The shared
slots encoder uses the explicit `spins-first-uint8` registry setting.

```text
callback gas = 500000 + 150000 × paid spins
VRF = getVRFFee(uint32 callback gas)
executor = EXECUTOR_FEE() × paid spins
transaction value = total wager + VRF + executor
```

Both fees are read live. At the checked snapshot the executor getter returned
0.03 APE per spin. RPC simulation accepted the 2.5 APE one-spin boundary,
rejected one wei below it, accepted 15 spins with sufficient stake, and
rejected 0 and 16 spins. Simulations used synthetic calldata and sent no
transaction. House limits, paused state and fee values can change; the
contract enforces the live conditions. No GP-spending transaction path is
implemented; `--gp-ape` retains its existing reward-accounting meaning.

For the compact cap, configuration and probability limitations, see
[DOJO_DROP_ANALYTICS.md](../analytics/DOJO_DROP_ANALYTICS.md).

## Live configuration snapshot

Multipliers use integer units with denominator `10000`.

| Block tier | Hits | Gross payout units |
| --- | ---: | ---: |
| Bamboo | 1 | 0 |
| Burger Crate | 1 | 0 |
| Cherry Blossom | 2 | 2,000 |
| Stone Frog | 3 | 8,000 |
| Temple | 4 | 20,000 |
| Golden Dragon | 6 | 60,000 |

`getGameConfig()` returned:

```text
blockUpgradeBp = 1600
baseEmptyBp = 4900
baseWeights = [32, 17, 9, 4, 4, 4, 2]
bonusEmptyBp = 6000
bonusWeights = [40, 22, 10, 3, 0, 4, 1]
chestValues = [2, 3, 4, 5]
chestPercents = [40, 30, 18, 12]
maxWinXUnits = 10000000
```

The symbol order is Katana, Flame Blade, Void Blade, Ice Blade, Lucky Cat,
Spirit Gem, Burger; `255` means an empty symbol cell. Wall slots are indexed
`6 × column + row`; symbol slots use `3 × column + row`. Both are column
major. Four bonus grids occupy consecutive groups of 15 symbols.

The official rules describe 16% one-tier wall upgrades, column-local blades,
Spirit Gems upgrading same-column blades to four damage, and Burger
plus-shaped destruction after blades. At least three base-game Lucky Cats
award four bonus drops on a fresh copy of the wall. Bonus damage persists;
bonus cats have zero weight. Cleared columns reveal multiplying chests.
These descriptions are public gameplay rules, not a verified RNG algorithm.

The observed cap is `10000000 / 10000 = 1000` times the per-spin stake.
`--paytable` exposes the checked-in gross bound `0`–`1000`, including for
multiple paid spins, without enumerating outcomes or treating rounded cell
odds as an exact model. It does not promise that the bound is attainable
for every wager or that the live configuration is immutable. No theoretical
or screenshot-derived running RTP is installed as an expected RTP.

## Settlement and replay

The common executor polls `getEssentialGameInfo(uint256[])` for authoritative
gross buy-in, payout and completion. The normal accounting, pending-result,
retry and history paths remain shared with other stateless games. Actual
VRF and executor costs are preserved separately from actual transaction gas.
Positive payout alone does not mean a positive net result.

Optional settled JSON enrichment calls the public getters defined in
[`dojo-drop.js`](../../lib/games/dojo-drop.js):

- `getGameInfo(uint256)` returns player, total bet, paid-spin count, next
  spin index, spin payouts, bonus-trigger indexes, cleared-column masks,
  cap-hit mask, total payout, RNG/completion flags, timestamp and RNG words.
- `getSpinDetails(uint256,uint8,uint8)` returns wall tiers, base/bonus
  symbols, broken-block masks after base and each bonus drop, cleared
  columns, five chest multipliers, uncapped/capped multiplier units and
  exact payout for each requested paid spin.
- `getGameConfig()` returns the ten configuration fields listed above.

The spin detail interval is **start inclusive, end exclusive**. Reading
`[0, numSpins)` returns the complete session. Integer masks and array slots
are passed through with their original zero-based indexing.

The library's `readDojoDropReplay(publicClient, { gameId, blockNumber? })`
pins every read to one block, returns monetary integers as decimal strings,
and checks per-spin payouts against the game total. `blockNumber` defaults
to the current block. `game_config` is explicitly the configuration at that
snapshot, not a claim about the configuration at the original wager block.
No spin replay is requested for a pending game. A failed optional enrichment
does not invalidate the shared executor's independently read settlement.
History can recover split metadata from calldata or `getGameInfo` without
accessing a wallet or submitting another wager.

## Unresolved source-level questions

The implementation delegates gameplay evaluation to the deployed contract.
It does not invent an off-chain resolver for these unresolved points:

- RNG expansion, cell sampling order, independence and modulo bias.
- Exact blade traversal, damage overflow, Burger landing coordinates,
  overlapping explosions and edge handling.
- Bonus wall initialization, damage retention internals and chest reveal
  timing across base and bonus phases.
- Original hidden-chest sampling, correlations and cap application order.
- Wager remainder allocation and intermediate integer rounding for every
  possible multiplier. Contract payout integers are retained as returned.
- Owner change controls, house-liquidity limits, RNG failure/refund policy,
  and the complete GP issuance/spending rules.

A full standalone simulator or exact theoretical RTP requires additional
verified source-level evidence. On-chain replay masks expose completed
outcomes without proving those internal rules.
