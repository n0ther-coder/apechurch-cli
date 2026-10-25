# Blizzard Blitz: public interface and verification limits

Blizzard Blitz is playable but **not ABI verified** under the repository's
[promotion standard](../ABI_VERIFICATION.md). The public explorer did not
provide verified Solidity source or an ABI on 2026-10-25. The implementation
uses the official frontend's ABI, corroborated by live getters and read-only
RPC simulation. This does not prove the complete RNG or settlement algorithm.

## Public sources and identity

- [Official game and help](https://ape.church/games/blizzard-blitz).
- [ApeScan contract](https://apescan.io/address/0x64b27c1c69559A795C98958614398dD7195AE1B8).
- [Caldera contract](https://apechain.calderaexplorer.xyz/address/0x64b27c1c69559A795C98958614398dD7195AE1B8).
- [Caldera contract metadata](https://apechain.calderaexplorer.xyz/api/v2/smart-contracts/0x64b27c1c69559A795C98958614398dD7195AE1B8).
- Official frontend chunk observed: `40448-35ce3484f58ba904.js`, containing
  transaction construction, the game-info signature, symbol awards and reels.
  Chunk names identify this deployment and can change.
- ApeChain JSON-RPC: `https://rpc.apechain.com/http`, chain ID `33139`.

Contract: `0x64b27c1c69559A795C98958614398dD7195AE1B8`.
Registry key: `blizzard-blitz`; aliases: `blizzardblitz`, `blizzard`.
The live getter/reel and simulation snapshot below is block `52977804`.

## Write path and fees

The payable entrypoint is `play(address player, bytes gameData)`:

```solidity
abi.encode(uint8 numSpins, uint256 gameId, address ref,
           bytes32 userRandomWord, bool isBonusBuy)
```

The trailing field is a **bool**, rather than a generic numeric risk mode.
Normal play uses `false`; a bonus purchase uses `true` and `numSpins = 1`.
The CLI uses the shared slots executor with `spins-first-uint8-bonus` encoding.

```text
callback gas = 550000 + 200000 × numSpins
VRF fee = getVRFFee(uint32 callback gas)
executor fee = EXECUTOR_FEE() × numSpins
transaction value = actual wager + VRF fee + executor fee
```

Both fee getters are read live. At the snapshot, `EXECUTOR_FEE()` was
0.04 APE; one base spin or one bonus purchase quoted 0.095 APE VRF and
0.04 APE executor fees. Twenty base spins quoted 0.475 APE VRF and 0.8 APE
executor fees. Actual receipt gas is additional and accounted separately.
The callback-gas formula is not the transaction's gas limit.

## Live limits and simulation

| Getter | Value at snapshot |
| --- | ---: |
| `MAX_SPINS()` | 20 |
| `MIN_BET_AMOUNT_PER_SPIN()` | 2.5 APE in wei |
| `MIN_BONUS_BUY_AMOUNT()` | 100 APE in wei |
| `BONUS_BUY_COST_MULTIPLIER()` | 32 |
| `BONUS_SPINS()` | 5 |
| `paused()` | false |

Synthetic `eth_call` requests used a funded balance override; no transaction
was signed or broadcast. They accepted base play at 2.5 APE for one spin
and 50 APE for twenty spins, rejected one wei below the one-spin minimum,
and rejected zero or twenty-one spins. Bonus requests accepted 100 APE with
one encoded round, rejected one wei less, and rejected two encoded rounds.
These checks prove these observed boundaries, not every revert or outcome.
House liquidity, payout ceilings, pause state and fees remain live conditions.
The UI's changing house payout allowance and 80,000 APE label are not encoded
as immutable game caps in this integration.

## Command semantics

```bnf
<game> ::= "blizzard-blitz" | "blizzardblitz" | "blizzard"
<base> ::= "play" <game> <ape> [ <split> | "--split" <split> | "--spin" <ape> ]
<bonus> ::= "play" <game> <ape> "--bonus"
<bet> ::= "bet" "--game" <game> "--amount" <ape> [ "--split" <split> | "--spin" <ape> | "--bonus" ]
<table> ::= "game" <game> "--paytable" [ "--amount" <ape> ] [ "--split" <split> | "--spin" <ape> | "--bonus" ] [ "--json" ]
<split> ::= <integer> ; decimal integer, 1 ≤ value ≤ 20; base default 10
; base: total amount ≥ 2.5 APE × split
; --spin: exact paid-spin stake ≥ 2.5 APE; count = min(floor(amount / spin), 20)
; only count × spin is wagered; any budget remainder is unspent
; --bonus: amount is the full purchase cost ≥ 100 APE; exactly one purchase
; --bonus rejects --split, --spin and positional counts
; --spin rejects explicit counts; duplicate named/positional counts must agree
```

Amounts are positive decimal APE values with at most 18 decimal places.
The standard `play` loop, stop conditions, bet strategies, timeout, retry,
JSON and expert entropy/referral controls apply; see
[the command reference](../COMMAND_REFERENCE.md). `--loop --bonus` repeats
bonus purchases and applies all economic limits to the **full purchase cost**.
Automatic game selection continues to choose base play unless a fixed
Blizzard Blitz command explicitly requests `--bonus`.

The official bonus replay uses a reference stake of purchase amount ⁄ 32;
the getter corroborates the pricing scalar. This reference is distinct from
the purchase cost used for gross payout ratios and net PnL. Exact payout
division and intermediate rounding remain delegated to the contract.

No GP-spending write path is added. The existing `--gp-ape` option keeps its
general reward-accounting meaning and does not select the site's Use GP flow.

## Mechanics and probability evidence

The public frontend shows a 5 × 5 grid, count-anywhere wins at 7–8, 9–10 and
11+ copies, additive base cascades, five-scatter entry into five free spins,
and bonus chests doubling a spin's multiplier. The advertised 4,096× is a
chest multiplier ceiling, **not** a proven overall gross payout maximum.
The full visible symbol table and reel frequencies are in
[the analytics note](../analytics/BLIZZARD_BLITZ_ANALYTICS.md).

`getReel(uint8)` and `getBonusReel(uint8)` return five 5,000-stop strips each;
the getter indexes are **1–5**. Symbol IDs are 0–7 for ordinary symbols,
8 for base scatters and 9 for bonus chests. At the snapshot, aggregated
frequencies matched the official frontend's strips and displayed weights.
Marginal frequencies do not prove IID cell draws or full-game odds.

## Settlement and offset replay

The common `getEssentialGameInfo(uint256[])` path remains authoritative for
gross wager, gross payout and completion, with the shared pending, retry,
receipt-cost and history paths. Positive payout alone is not net profit.

[`readBlizzardBlitzReplay`](../../lib/games/blizzard-blitz.js) optionally reads
`getGameInfo(uint256)` at one pinned block and retains monetary integers and
reel offsets as decimal strings. Fields include paid/encoded spin count,
base and bonus reel indexes, zero-based bonus trigger spin indexes,
`isBonusBuy`, payout and RNG/completion flags. The frontend expects five
base offsets per encoded spin and twenty-five bonus offsets per trigger.
Completed offset arrays are checked for those shapes. The adapter does not
invent individual spin prizes or cascade boards from offsets. Failure of
optional enrichment does not invalidate independently read settlement.

History uses the same base-spin and bonus-round variant keys as older
downloads. Missing calldata can be supplemented through `getGameInfo`.

## Unresolved source-level questions

RNG expansion and modulo bias, reel advance/refill order, cell correlations,
scatter persistence and retriggers, chest retention/application timing,
cascade bounds, exact per-stage rounding, house payout clipping, owner
controls and failure/refund behavior require further source-level evidence.
The CLI deliberately installs no expected RTP, exact hit rate, standalone
outcome generator or numerical overall maximum for this game.
