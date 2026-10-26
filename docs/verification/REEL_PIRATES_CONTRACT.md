# Reel Pirates: contract interface and verification

## Verification status

Reel Pirates is playable but **not ABI verified** under the repository's
[promotion standard](../ABI_VERIFICATION.md). The existing ApeScan
observation on **2026-04-23** reported `Contract: Unverified`. The CLI's
operational encoding and readable public getters do not prove the full
RNG, cascade, bonus or settlement algorithm. The registry intentionally
omits the `✔︎` ABI-verified symbol.

## Public sources and identity

- [Official game](https://ape.church/games/reel-pirates).
  The previously recorded URL was `https://www.ape.church/games/reel-pirates`.
- [Official slots rules](https://docs.ape.church/games/player-vs-house/slots-games).
- [ApeScan contract and code status](https://apescan.io/address/0x5e405198b349d6522bbb614e7391bdc4f4f6f681#code).
- [Caldera contract metadata](https://apechain.calderaexplorer.xyz/api/v2/smart-contracts/0x5E405198B349d6522BbB614E7391bDC4F4F6f681).
- Official frontend chunk checked on 2026-10-26:
  `61104-52e8a447598d8d99.js` (symbol awards, ordered base/bonus strips,
  replay geometry and game-info signature). Chunk names identify a dated
  deployment and can change.
- ApeChain JSON-RPC: `https://rpc.apechain.com/http`, chain ID `33139`.

Contract: `0x5E405198B349d6522BbB614E7391bDC4F4F6f681`.
Registry key: `reel-pirates`; aliases: `reelpirates`, `pirates`, `reel`.
The new strip snapshot is block `53060536`
(`2026-10-26 09:12:48.0 UTC`, block timestamp). An attempted Caldera
metadata refresh on 2026-10-26 returned HTTP 403; that failure does not
refresh the earlier source-verification observation.

## Command semantics

Count mode selects 1–15 paid base spins, default 15. The total wager must
be at least `2.5 APE × paid spins`; for example, ten spins require 25 APE
and the default requires 37.5 APE. `--split` or a positional count selects
the paid count. Free spins and cascades do not add to the paid count.

With `--spin <APE>`, the amount is a budget and the exact paid-spin stake
must be at least 2.5 APE. The count is `min(floor(amount ⁄ spin), 15)`,
subject to live limits; only `count × spin` is wagered and any remainder
stays unspent. Explicit counts conflict with `--spin`.

Normal loop, stop, strategy, timeout, retry, JSON and expert entropy/referral
controls follow the [command reference](../COMMAND_REFERENCE.md). The CLI
exposes no bonus-buy option for this game.

## Write path and fees

The payable entrypoint is `play(address player, bytes gameData)`:

```solidity
abi.encode(uint256 numSpins, uint256 gameId, address ref,
           bytes32 userRandomWord)
```

This **spins-first** layout is implemented by
[`slots.js`](../../lib/games/slots.js) using
`config.gameDataOrder = "spins-first"`. It is operational encoding evidence,
not source-backed ABI verification.

The zero-argument `getVRFFee()` reverts in the existing live evidence.
The callable fee path is `getVRFFee(uint32 customGasLimit)`:

```text
callback gas = 550000 + 200000 × paid spins
VRF fee = getVRFFee(uint32 callback gas)
executor fee = EXECUTOR_FEE() × paid spins
transaction value = actual wager + VRF fee + executor fee
```

Both fees are read live. Actual transaction gas is additional; callback gas
is not the transaction's gas limit. Fees do not enter gross payout ⁄ wager
but reduce net PnL.

## Live limits and read-only checks

The CLI registry enforces the count and 2.5 APE-per-spin constraints above.
This note does not contain synthetic boundary-call evidence for Reel
Pirates comparable to the Dojo Drop or Blizzard Blitz simulation snapshots.
House liquidity, fee values and other live conditions remain contract
constraints rather than immutable guarantees inferred from the registry.

The new snapshot read `getReel(uint8)` and `getBonusReel(uint8)`, returning
`uint8[]`, for indexes **1–6** at one block. Base and bonus lengths were
9,000, 8,500, 9,000, 8,500, 9,000 and 9,500. Every returned ordered strip
matched the official frontend's corresponding strip. These were read-only
calls; no wager or signed transaction was submitted.

## Mechanics and configuration

Official rules describe match-anywhere awards at 8–9, 10–11 or 12+
ordinary symbols, four scatters awarding five free spins, and individual
bonus multipliers up to 100×. The frontend displays five rows and six reel
columns. These are not left-to-right paylines or ordered triples.
Winning symbols are removed and replaced to create cascades.

The public UI paytable is normalized to a 1 APE paid-spin stake:

| ID | Symbol | 8–9 matches | 10–11 matches | 12+ matches |
| --- | --- | ---: | ---: | ---: |
| 0 | Coral | 0.25× | 0.75× | 2× |
| 1 | Fish bones / skeleton | 0.40× | 1× | 4× |
| 2 | Shell | 0.50× | 1.10× | 5× |
| 3 | Purple fish / anglerfish | 0.80× | 1.25× | 8× |
| 4 | Gold coins | 1× | 1.50× | 10× |
| 5 | Hook | 1.50× | 2× | 12× |
| 6 | Anchor | 2× | 5× | 15× |
| 7 | Treasure map | 2.50× | 10× | 25× |
| 8 | Pirate hat | 10× | 25× | 50× |

Scatter symbol: treasure chest, ID 9. Bonus multiplier IDs 10–16 are
2×, 3×, 5×, 10×, 25×, 50× and 100× respectively and are additive within
a spin in the public mechanics description. The sampled base strips have
no multiplier symbols; sampled bonus strips have no scatters. Earlier
public rules describe scatter retriggers, but a current retrigger path or
probability cannot be inferred from that statement and these strips.

The same symbol has different frequencies across reels. Exact per-reel
counts and uniform-stop conditional probabilities are in the
[analytics note](../analytics/REEL_PIRATES_ANALYTICS.md), together with
complete-result loss/draw/win definitions and maximum-payout limits.
The symbol frequencies and frontend geometry improve the earlier evidence
without establishing the deployed random sampling or full payout law.

## Settlement and replay

The shared slots executor uses the common `getEssentialGameInfo(uint256[])`
settlement path for gross wager, gross payout and completion. Pending,
retry, receipt-cost and history handling use the existing shared paths.
A positive payout alone does not establish a gross win or positive net PnL.

The official frontend exposes this public read signature:

```solidity
function getGameInfo(uint256 gameId) returns (
  (address player, uint256 betAmount, uint8 numSpins,
   uint256[] reelIndexes, uint256[] bonusReelIndexes,
   uint8[] bonusTriggerSpinIndexes, uint256 totalPayout,
   bool hasRNGReturned, bool hasEnded, uint256 timestamp)
)
```

Its replay expects six base offsets per paid spin. This is frontend
interface evidence, not a new CLI replay adapter or an independent
verification of the getter's complete deployed behavior. No standalone
resolver or inferred cascade payout is introduced by this documentation.

## Unresolved source-level questions

The current evidence supports the CLI write payload, public component
awards and dated strip contents, but does not establish exact RTP or a
complete outcome distribution. Still missing:

- Verified Solidity source, including source/getter confirmation of the
  frontend display geometry as the settlement geometry.
- RNG expansion, uniform offset mapping, modulo bias and cell/reel
  correlations; strips alone do not prove exact sampling probabilities.
- Exact symbol refill behavior, cascade continuation and bounds.
- Scatter entry/persistence and any current bonus retrigger rules.
- Full bonus multiplier sampling/application and bonus expected value.
- Exact rounding, stake invariance, clipping and maximum mathematical
  payout, its attainability and its probability.
- Verified payout/weight update controls or immutability guarantees.

Until the repository's source/bytecode and economic verification standard
is satisfied, Reel Pirates remains playable without `ABI verified` status.
