# Gimboz of the Galaxy: contract interface and verification

## Status and public sources

The game is playable but remains **ABI unverified** under the
[promotion standard](../ABI_VERIFICATION.md). Public getters, bytecode,
frontend code and historical settlements corroborate the integration; a
reproducible Solidity source/build and exhaustive economic checks are missing.
No wager was signed or broadcast during this investigation.

- [Official game](https://ape.church/games/gimboz-of-the-galaxy).
- [ApeScan contract](https://apescan.io/address/0x1AC78E6a153DeEd1b8dB67b9813991651D53E3a6).
- [Caldera metadata and bytecode](https://apechain.calderaexplorer.xyz/api/v2/smart-contracts/0x1AC78E6a153DeEd1b8dB67b9813991651D53E3a6).
- Official frontend chunk observed on 2026-10-26:
  `19745-3b4a864bcce3b676.js`. Chunk names can change.
- ApeChain RPC: `https://rpc.apechain.com/http`, chain ID `33139`.

Contract: `0x1AC78E6a153DeEd1b8dB67b9813991651D53E3a6`.
Key: `gimboz-galaxy`; aliases: `gimbozgalaxy`, `galaxy`.
The website slug is `gimboz-of-the-galaxy`, distinct from the command key.

At block `53087521` (`2026-10-26 17:23:56.0 UTC`), RPC runtime bytecode
matched the explorer bytes. Its Keccak-256 was
`0x40d95fa91a6197a02f4f70679884fcdcb6d5d6be28d8d761be2ae9a60c0e4675`.
The compiler footer identifies Solidity `0.8.28` and metadata CID
`QmNhU6izhH9E5kvwrjwx4soBhUD9drSyC894ev319cLnqL`. Metadata retrieval did
not succeed; Sourcify full/partial lookups returned 404. Neither a compiler
footer nor a missing lookup constitutes verified Solidity source.

## Commands and amounts

```bnf
<game> ::= "gimboz-galaxy" | "gimbozgalaxy" | "galaxy"
<base> ::= "play" <game> <ape> [ <split> | "--split" <split> | "--spin" <ape> | "--bet-split" <ape> ] <galaxy-play-option>*
<bonus> ::= "play" <game> <ape> "--bonus" <galaxy-play-option>*
<bet> ::= "bet" "--game" <game> "--amount" <ape> [ "--split" <split> | "--spin" <ape> | "--bet-split" <ape> | "--bonus" ] <bet-option>*
<table> ::= "game" <game> "--paytable" [ "--amount" <ape> ] [ "--split" <split> | "--spin" <ape> | "--bet-split" <ape> | "--bonus" ] [ "--json" ]
<galaxy-play-option> ::= <play-shared-option> | "--timeout" <integer> | "--x-gameId" <uint256> | "--x-ref" <address> | "--x-userRandomWord" <bytes32>
<split> ::= <integer> ; 1 ≤ value ≤ 10; default 10
<ape> ::= <positive-decimal> ; at most 18 decimal places
; base: total wager ≥ 3 APE × split
; exact stake: stake ≥ 3 APE; count = min(floor(budget ⁄ stake), 10)
; only count × stake is wagered; unused budget remains unspent
; --spin and --bet-split conflict with each other and explicit counts
; duplicate named/positional counts must agree; malformed counts fail
; --bonus: one purchase, full cost ≥ 100 APE; encoded count 1
; --bonus rejects --split, --spin, --bet-split and positional counts
```

Shared `play`/`bet` options include loop, bet strategy, bankroll allocation,
profit/loss and balance stops, retries, timeout, JSON and expert entropy/referral
controls. `play --validate-only` checks arguments without RPC or wallet access.
See the complete shared grammar in [COMMAND_REFERENCE](../COMMAND_REFERENCE.md).
`--loop --bonus` repeats purchases; all wager and economic limits apply to
full purchase costs. Automatic game selection uses base play; `--bonus`
requires an explicitly selected supported game.

Synthetic examples:

```bash
apechurch-cli play galaxy 30 --split 10 --validate-only --json
apechurch-cli play gimbozgalaxy 25 --spin 4 --validate-only --json
apechurch-cli play gimboz-galaxy 170 --bonus --validate-only --json
apechurch-cli game galaxy --paytable --bonus --json
```

The second example wagers 24 APE on six spins and leaves 1 APE unspent.
The third buys one bonus round for 170 APE, initially three free spins,
with a reference stake of 10 APE (`170 ⁄ 17`). It can extend to six spins.
Neither three times the reference stake nor the reference stake alone is
the purchased wager. Do not label the difference as an entry fee.

## Write path, fees and checked boundaries

The payable entrypoint is `play(address player, bytes gameData)`:

```solidity
abi.encode(uint8 numSpins, uint256 gameId, address ref,
           bytes32 userRandomWord, bool isBonusBuy)
```

Base uses `false`; bonus uses `true` and `numSpins = 1`. The trailing
field is a bool, not an arbitrary numeric risk mode.

```text
callback gas = 550000 + 200000 × encoded count
VRF fee = getVRFFee(uint32 callback gas)
executor fee = EXECUTOR_FEE() × encoded count
transaction value = actual wager + VRF fee + executor fee
```

Actual receipt gas is additional. Callback gas is not the transaction gas
limit. At block `53085654`, one encoded count quoted 0.095 APE VRF plus
0.05 APE executor, total 0.145 APE. Ten quoted 0.275 + 0.5 = 0.775 APE.
Fees are read live; quoted snapshot values are not immutable guarantees.

At block `53085612`, getters returned:

| Getter | Value |
| --- | ---: |
| `MAX_SPINS()` | 10 |
| `MIN_BET_AMOUNT_PER_SPIN()` | 3 APE in wei |
| `MIN_BONUS_BUY_AMOUNT()` | 100 APE in wei |
| `BONUS_BUY_COST_MULTIPLIER()` | 17 |
| `EXECUTOR_FEE()` | 0.05 APE in wei |

`paused()` was false at block `53087410`. Read-only `eth_call` checks at
block `53085654`, with a synthetic funded caller balance override, accepted
one spin for 3 APE, two for 6 APE and ten for 30 APE. They rejected zero and
eleven spins and one wei below the per-spin minimum. Bonus accepted 100 APE
with one encoded count, rejected one wei less and rejected two counts.
These calls did not sign or submit transactions.

The website's 80,000 APE bet label and changing house payout allowance are
not treated as immutable contract constants. The contract and gas preflight
remain responsible for live liquidity, pause and other acceptance conditions.
`--spin` / `--bet-split` also read `MAX_SPINS()` and fail closed if limits or
contract gas estimation cannot be verified.

## Rules and discrepancies resolved

The public symbol table matches `symbolPayouts(uint8,uint8)` divided by
`PAYOUT_DENOM() = 10000`; see [analytics](../analytics/GIMBOZ_GALAXY_ANALYTICS.md).
Ordinary wins count anywhere, with no adjacency requirement, on 6 × 5 base
and 8 × 5 bonus boards. Several eligible symbol types add their awards;
winning symbols disappear and the board refills. Cascade badge numbers
are not additional payout multipliers.

| Topic | Corroborated behavior | Difference from instructional wording |
| --- | --- | --- |
| Base Warp | Ordinary removals accumulate within one purchased spin; 100 triggers a bonus after the chain resolves. Charge resets for the next purchased spin. | A generic "fill the drive" description does not establish session-wide persistence. |
| Bonus Warp | Charge resets on entry, then persists across free spins; threshold 300. | The modal omits the different bonus threshold. |
| Retrigger | Three initial free spins; one +3 extension; six maximum in that bonus round. | "Fill it again" does not imply unlimited retriggers. |
| Black Hole | At least four remain after ordinary matches; clear/refill the board and continue the same spin, preserving its charge. | Tutorial "extra spin" does not add a purchased spin or a separate free-spin credit. |
| Wipe charge | Only the ordinary tiles destroyed contribute; Black Holes themselves do not. | "Every tile" is broader than the implementation. |
| Moon | Regular symbol ID 9 exists only on bonus strips in the snapshot. | The shared paytable does not distinguish base/bonus availability. |

Bytecode corroboration, for the runtime hash above: base threshold comparison
near `0x44d1`; bonus threshold 300 near `0x489a`; one-shot retrigger flag,
+3 and cap 6 near `0x4891–0x48ca`; Black Hole threshold and wipe near
`0x4a72–0x4abc`. The wipe charge expression is `5 × width – BlackHoleCount`.
Calls to selectors `0x9afc219a` and `0x17ef118e` returned 100 and 300;
no unproven Solidity names are assigned to those selectors in the ABI.
`MAX_CASCADE_DEPTH()` returned 100 and the bytecode bounds resolution steps.
Static bytecode interpretation remains corroborating evidence, not recovered
verified source or an exhaustive proof of every path.

## Historical reconciliation and exact rounding

At block `53087521`, `numUsedGameIDs()` returned 33,947. The 100 entries at
indexes 33,847 through 33,946, obtained with
`paginateUsedGameIDs(33847, 33947)` and `batchGameInfo`, were replayed using
public strips, offsets, the component paytable, and the rule sequence above.
The audit counted 91 base wipes and 35 bonus wipes. Of the 100 sessions,
24 contained a bonus: 11 naturally triggered and 13 purchased. Bonus counts
were 3 or 6; trigger indexes and all free-spin counts matched the getters.

All 100 aggregate payouts matched integer wei exactly with this observed
rounding order:

```text
base reference = floor(full wager wei ⁄ purchased spin count)
bonus-buy reference = floor(full purchase wei ⁄ 17)
for each purchased spin / purchase:
  B = sum of payout units across its base cascades and all awarded bonus spins
  chain payout wei = floor(reference wei × B ⁄ 10000)
session payout wei = sum of chain payout wei
```

Rounding every individual symbol award or every free spin separately can
change the result by wei. The runtime adapter reads settled values instead
of reproducing this inferred economic model.

Alternative replay hypotheses disagreed with the sample: carrying base
charge across purchased spins changed triggers in 44 sessions; bonus
threshold 100 changed eight bonus counts; resetting charge every free spin
changed six; repeated reset-and-retrigger changed four. This is a finite
historical cross-check, not an exact RTP, odds or global maximum proof.

## Settlement, replay and history

Shared `getEssentialGameInfo(uint256[])` remains authoritative for wager,
payout and completion. The normal pending, retry, receipt-cost, history and
net-PnL paths apply. Optional
[`readGimbozGalaxyReplay`](../../lib/games/gimboz-galaxy.js) pins reads to one
block and returns integer wei and offsets as decimal strings, including
`num_spins`, `is_bonus_buy`, `bonus_trigger_spin_indexes` and the actual
`bonus_spin_counts` (not an assumed fixed length).

Completed records require six base offsets per encoded count, one count
per trigger, eight bonus offsets per free spin, ordered in-range trigger
indexes, and 3 or 6 free spins per bonus. A purchased bonus retains one
encoded base-offset block but skips its base outcome. Missing optional
replay details do not replace or invalidate independently read settlement.
No animation, local outcome generator or GP-spending entrypoint is introduced.
Existing general GP accounting remains separate.

History retains the existing base-spin and bonus-round variant keys,
including older saved configurations. When calldata is missing, `getGameInfo`
can recover the purchased count and bonus flag using the correct tuple,
which includes `bonusSpinCounts` before `totalPayout`.

## Remaining verification work

Recover original source/build metadata, reproduce exact compiler settings,
libraries and deployed bytecode, and perform differential/fork checks for
RNG expansion, modulo mapping, resolution limits, payout clipping, integer
overflow, owner controls, failure/refund behavior and extreme states. The
observed replay agreement does not establish the complete stochastic model.
Exact RTP, loss/draw/win probabilities, variance and an attainable overall
maximum remain unverified; no exact ranking is installed in the CLI.
