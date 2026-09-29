# ApeChurch fees

> Summary: Protocol fee accounting, measured Keno and Speed Keno transaction
> costs, and links to the contract-specific fee references.

Amounts are in APE unless stated otherwise. The chain sample ends on
**2026-09-24 at 11:30:29 UTC**, block **50,157,965** on ApeChain (chain ID
`33139`). Historical measurements do not guarantee future call costs.

## 1. What a player pays

| Component | Treatment | How to measure it |
| --- | --- | --- |
| Wager | Capital exposed to the game; not an extra transaction fee. | Settled game state or the `GameEnded` buy-in. |
| VRF / randomness fee | Paid in addition to the wager for the verified Keno contracts. | Opening transaction value minus the contract-recorded wager. |
| Opening transaction gas | Paid by the transaction sender, outside the wager. | Receipt `gasUsed × effectiveGasPrice`. |
| Platform / partner / referral allocation | For the verified Keno contracts, taken from the wager inside the contract. | Contract source and state; do not add it again to the payout-based expected loss. |
| Additional player actions | A stateful game can require further transactions and randomness requests. | Sum the actual player-paid receipts and protocol charges for those actions. |

For a direct, settled Keno or Speed Keno play:

```text
extra_call_cost = VRF_fee + opening_transaction_gas
gross_PnL      = payout - wager
net_PnL        = payout - wager - extra_call_cost
expected_loss = wager × (1 - theoretical_RTP) + expected_extra_call_cost
```

The RTP term already describes payouts relative to the full wager. Subtracting
the in-wager platform allocation again would double-count its economic effect.
The oracle settlement callback is not a second transaction sent and paid for
directly by the player. Separate withdrawals, claims, failed transactions, or
other wallet activity need their own accounting when they occur.

Gas limits are not gas costs: use the gas actually charged on the receipt.
“Static VRF fee path” in a CLI helper means a getter without a custom game-count
argument; it does **not** mean the returned amount is permanently fixed.

## 2. Comparing payouts and costs

Gross payout includes returned stake. Gross profit subtracts the wager; net
profit also subtracts the player's protocol charges and transaction gas.
Cumulative payouts can count the same capital repeatedly when returns are
wagered again, so they are not the final wallet balance.

A wallet balance difference includes unrelated transfers and concurrent
activity when present. For a study of contract costs, attribute charges to
individual transactions and use their receipts.

## 3. Verified Keno fee rules

| Property | Keno | Speed Keno |
| --- | --- | --- |
| Contract | [`0xc936D6691737afe5240975622f0597fA2d122FAd`](https://apescan.io/address/0xc936D6691737afe5240975622f0597fA2d122FAd#code) | [`0x40EE3295035901e5Fd80703774E5A9FE7CE2B90C`](https://apescan.io/address/0x40EE3295035901e5Fd80703774E5A9FE7CE2B90C#code) |
| Random draw | 10 winners from 40, without replacement. | 5 winners from 20 per independent game, without replacement. |
| Supported picks | 1–10 | 1–5 |
| VRF getter | `getVRFFee()` delegates to the configured RNG fee getter. | `getVRFFee(customGasLimit)` delegates to the V2 RNG fee getter. |
| Game-count effect | One game per play. | `getGasCost(split) = BASE_GAS + GAS_PER_GAME × split`. |
| Snapshot parameters | No split parameter. | `BASE_GAS = 325000`, `GAS_PER_GAME = 55000`; split 1 uses `380000`. |
| Snapshot VRF quote | `0.075 APE` | `0.058 APE` for split 1. |

Both contracts calculate `totalBetAmount = msg.value - vrfFee`, then allocate
the platform fee from `totalBetAmount`. Speed Keno divides this total wager
among its independent games; `split 20` does not mean twenty wagers each equal
to the supplied amount. Solidity division can leave negligible wei-level dust.

Pick count changes payout probabilities and opening gas, but not the VRF
getter's game-count parameter. A fee estimate for Speed Keno `split 1` must
therefore use `split 1` calls rather than an average across all split counts.

The source files were obtained from Sourcify, their verified runtime bytecode
was compared with `eth_getCode` at the snapshot block, and every payout-table
cell was checked using an on-chain `payouts(picks, hits)` read:

- [Verified Keno source and ABI](https://sourcify.dev/server/v2/contract/33139/0xc936D6691737afe5240975622f0597fA2d122FAd?fields=all).
- [Verified Speed Keno source and ABI](https://sourcify.dev/server/v2/contract/33139/0x40EE3295035901e5Fd80703774E5A9FE7CE2B90C?fields=all).

## 4. September 2026 transaction sample

### Windows and coverage

All windows end at `2026-09-24T11:30:29Z` and overlap:

| Window | Start, UTC | First included block | Last included block |
| --- | --- | ---: | ---: |
| Last week: 7 days | 2026-09-17 11:30:29 | 49,510,498 | 50,157,965 |
| Last calendar month: 31 days | 2026-08-24 11:30:29 | 47,249,224 | 50,157,965 |
| Last 3 calendar months: 92 days | 2026-06-24 11:30:29 | 40,967,529 | 50,157,965 |

The scan covered both contracts over 46 contiguous block intervals and found
**6,662 `GameStarted` and 6,662 `GameEnded` events**. Events were matched by
contract and game ID. Window membership is based on the opening block, not the
settlement block.

**6,607 direct calls** had matched transactions, receipts, and settlements:
4,710 Keno calls and 1,897 Speed Keno calls. Of the Speed Keno calls, 1,569 used
split 1. The remaining **55 indirect calls**—53 Keno and 2 Speed Keno—were
excluded because the outer transaction's gas could not be uniquely assigned to
the individual play. No direct record was missing its opening transaction,
receipt, or matched settlement. All included records had the same payer and
player. These are all-player samples, not one wallet's history.

Only successful game openings with matched outcomes are represented; reverted
transactions without a `GameStarted` event and separate withdrawals are outside
the sample. Means are arithmetic per-call means, not wager-weighted averages.

### Measured costs

| Window | Game / split filter | Calls | Mean VRF | Mean gas | Mean total cost |
| --- | --- | ---: | ---: | ---: | ---: |
| Week | Keno | 1,007 | 0.075000 | 0.089858 | **0.164858** |
| Week | Speed Keno, all splits | 58 | 0.105034 | 0.085954 | **0.190989** |
| Week | Speed Keno, split 1 | 18 | 0.058000 | 0.086312 | **0.144312** |
| Month | Keno | 1,953 | 0.075000 | 0.088259 | **0.163259** |
| Month | Speed Keno, all splits | 334 | 0.075916 | 0.080597 | **0.156513** |
| Month | Speed Keno, split 1 | 226 | 0.058000 | 0.078752 | **0.136752** |
| 3 months | Keno | 4,710 | 0.077444 | 0.087109 | **0.164553** |
| 3 months | Speed Keno, all splits | 1,897 | 0.071740 | 0.078630 | **0.150370** |
| 3 months | Speed Keno, split 1 | 1,569 | 0.058323 | 0.077607 | **0.135930** |

All costs are APE per call, excluding wager. Columns are rounded independently.
All 18 weekly Speed Keno split-1 calls used 5 picks; the monthly split-1 sample
was dominated by 1-pick calls. The difference between weekly and monthly means
is therefore partly a configuration-mix effect, not a rise in the VRF quote.

### Configuration coverage

The monthly average of a game is not automatically the correct average for
every pick count. The following are **observed** values, not interpolations:

| Game | Picks | Monthly calls | Monthly mean total cost | 3-month calls |
| --- | ---: | ---: | ---: | ---: |
| Keno | 1 | 6 | 0.146528 | 10 |
| Keno | 2 | 0 | — | 0 |
| Keno | 3 | 2 | 0.152640 | 66 |
| Keno | 4 | 29 | 0.151672 | 41 |
| Keno | 5 | 649 | 0.157894 | 2,112 |
| Keno | 6 | 33 | 0.158751 | 146 |
| Keno | 7 | 25 | 0.161232 | 53 |
| Keno | 8 | 576 | 0.164449 | 1,164 |
| Keno | 9 | 33 | 0.166184 | 58 |
| Keno | 10 | 600 | 0.168855 | 1,060 |
| Speed Keno, split 1 | 1 | 187 | 0.135176 | 1,501 |
| Speed Keno, split 1 | 2 | 0 | — | 1 |
| Speed Keno, split 1 | 3 | 0 | — | 3 |
| Speed Keno, split 1 | 4 | 0 | — | 22 |
| Speed Keno, split 1 | 5 | 39 | 0.144312 | 42 |

In the 3-month sample, the total mean costs for Speed Keno split 1 with picks
2, 3, and 4 were respectively `0.137171`, `0.139534`, and `0.140202 APE`.
The 1- and 3-call samples are too small to call robust fee estimates. There is
no empirical cost for Keno picks 2 in this sample. An RPC gas estimate can
support a projection, but must not be presented as an observed historical mean.

## 5. Related fee documentation

| Reference | Fee behavior documented |
| --- | --- |
| [Keno contract](verification/KENO_CONTRACT.md#fee-notes) | One live `getVRFFee()` quote on top of the wager; no subsequent in-game action tree. |
| [Speed Keno contract](verification/SPEED_KENO_CONTRACT.md#fee-notes) | VRF depends on the number of games; dividing the wager may leave wei-level rounding dust. |
| [Video Poker contract](verification/VIDEO_POKER_CONTRACT.md#fee-notes) | Opening adds `vrfFeeInitial()`; replacing cards adds `vrfFeeRedraw()`. Standing pat requires no redraw VRF payment. |
| [Video Poker analytics](analytics/VIDEO_POKER_ANALYTICS.md) | Net economics depend on the hold policy and its redraw frequency. |
| [Keno analytics](analytics/KENO_ANALYTICS.md) and [Speed Keno analytics](analytics/SPEED_KENO_ANALYTICS.md) | Payout distributions and theoretical RTP describe game returns before additional transaction costs. |
| [Fee analysis implementation](../lib/fee-analysis.js) | Separates transaction value above the recorded wager from receipt-derived gas. Check each report's filters and attribution rules before comparing it with this sample. |

Zero redraw VRF payment does not imply zero transaction gas. For games with
multiple player actions, include every player-paid receipt and protocol fee in
the operation's total cost.

## 6. Updating a cost estimate

Preserve exact period bounds, transaction counts, game and split filters,
attribution exclusions, and the distinction between observations and
projections. Compare equivalent configurations: a pooled average can change
because the configuration mix changes.

Read live protocol parameters again when preparing a new estimate. A historical
quote is not a fixed network tariff. Include failed transactions and separate
claims or withdrawals in wallet accounting when relevant, even though this
settled-game sample excludes them.
