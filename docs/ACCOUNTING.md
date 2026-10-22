# Game result accounting

CLI 30 changes accounting and breaks compatibility with earlier scripts.
See the [migration comparison](MIGRATION_30.md) before updating integrations.

Accounting version 2 separates gross game returns from the player's additional
execution costs. Calculate money in integer wei; serialize APE as decimal strings.

## Quantities

For a settled operation with actual wager W, gross payout P and additional
player-paid costs C:

```text
multiplier = P / W
gross_profit = P - W
PnL Profit = P - W - C
```

For a group, sum wagers, payouts and additional costs over exactly the same
operations before calculating its multiplier and net result. Include all actual
split and double stakes. Cumulative payouts can count reinvested capital several
times and are not a wallet balance.

The display name `multiplier` means only gross payout divided by matching gross
wager. Display two decimals and the multiplication sign, such as `1.01×`. Use
`net PnL` for a net monetary result or a whole-number percentage with an
explicitly documented reference amount. Positive multipliers and negative PnL
can coexist. If W is zero, serialize the multiplier as `null`; a failed
transaction is not a settled game outcome.

`gross_profit` is a separate arithmetic quantity, not net PnL. Deposits,
withdrawals and unrelated wallet movements remain separate from game PnL.

## Additional costs

The `costs` object exports `vrf`, `protocol`, `executor`, `gas` and `other`
components in wei and APE, their total and the underlying transaction records.
Do not record or subtract allocations already included in wager or payout.
A protocol allocation inside a 100 APE wager remains inside that wager;
subtracting it again duplicates the charge.

Receipt gas is `gasUsed * effectiveGasPrice`, not a gas limit or an estimate.
Count every player-paid mined transaction, including reverted attempts. A
reverted transaction consumes gas but not its reverted value. Quotes and
historical averages may inform planning; export actual costs for executions.

Games persist `cost_transactions` in their history records. Deduplicate by
transaction hash, including after interruption and resumption. Reconcile a
pending hash by reading its receipt; never submit a replacement wager merely
because its result or receipt is still unknown.

Unknown costs are `null` with `costs.complete: false`, never zero. Net PnL is
unavailable until costs are known. Reverted transactions follow the normal
exception/retry policy. Failed attempts add costs; successful settled plays
supply the game outcomes used for continuation. Exhausted retries export their
accounting with the exception. Failed-only gas also enters loop totals without
increasing game counts, wager or payout. An action error with an unresolved
wager exports known costs and leaves the unresolved net result unavailable.

## JSON and implementation

Settled game JSON exposes `accounting_version: 2`, `wager_wei`, `payout_wei`,
`cost_wei`, `pnl_wei` and matching `_ape` fields, `multiplier`, formatted
`multiplier_display`, `pnl_basis: "net"` and the detailed `costs` object.
`lib/economics.js` implements the equations and serialization.

Explicit fixed single-game wager inputs preserve up to 18 APE decimal places
without rounding through a JavaScript number. Amounts must be positive decimal
strings; excess fractional precision is rejected. Numeric strategy progressions
retain their documented sizing precision. Glyde or Crash targets retain up to
four input decimals internally; the two-decimal multiplier is a display value,
not a threshold or a replacement gameplay target. Compare unrounded amounts
when evaluating conditions.

Stateless handlers use `executeGame` and pass their additional fee components.
Export executor and VRF fees separately when both exist. Stateful handlers pass
`createGameCostObserver` to the shared submission helper for opening and every
later player action. Completed state reads use `withGameEconomics`; pending
continuations use `reconcileGameCosts`.

Cover successful and reverted attempts, later actions, interruption and resume.
Persist costs before returning final results. Loops export aggregate economics
over their completed games with per-game economics available to callers.

Bot callers propagate gross wager, gross payout and actual child costs. Parent
aggregation must not charge the child's gas twice. Never reconstruct a gross
payout as `wager + net PnL`.

Real receipt hashes are deduplicated across nested aggregates. Legacy
cost-only placeholders have only local identities: scope them to their child
aggregate so independent known costs are not mistakenly merged or dropped.
Such placeholders do not turn legacy cost totals into receipt evidence.

## Controls and planning

`--min-balance` and `--max-balance` are absolute wallet thresholds. Profit and
loss options use net PnL Profit; `--take-profit` aliases `--min-profit` and
`--stop-loss` aliases `--max-loss`. Absolute thresholds are APE amounts; whole
percentages use the actual wager of the controlled result. `--target-profit`
uses one settled game's net profit, while session guards use session totals.
A net PnL limit does not become an implicit wallet limit.

Prospective repetition may use a fixed percentage of an explicitly documented
opening bet as a risk budget. Keep that budget separate from PnL percentages.
Historical estimates and current fee quotes can guide ladder planning, but only
actual observed economics determine completion and target qualification.

Stateful compound games export whole-call wallet-principal wager with the final
payout. Activity turnover from internal reinvestment is separate; do not divide
one final cashout by a sum of internal round stakes. A multi-game call exports
matching cumulative whole-game wagers, payouts and additional costs.

History `win_loss` and win/push/loss counts use net PnL Profit. History RTP
continues to use gross payout divided by gross wager. Failed-only transaction
costs reduce total PnL without creating a game outcome. Legacy records without
a complete receipt ledger retain their recorded cost classification; they do
not acquire invented receipt evidence.

A stateless native loop pauses before another wager if its current play remains
pending. Reconciliation retains completed games and reads only the pending
identity; it closes that partial call once settled. It does not resubmit the
wager or automatically launch the unused portion of a requested game limit.
Terminal transaction exceptions stop the native loop after the centralized
retry policy is exhausted, preserving the additional costs in the exception.

The compact contract-history lookup can establish gross payout and wager from
contract state alone. It leaves net PnL unavailable unless a receipt ledger or
recorded additional costs are present; it never relabels gross profit as PnL.
Stateful opening and action exceptions also propagate their recorded costs.
Their outer game loops do not start a new wager after centralized retries fail.

Expected-value models document their own scope. Blackjack's exact game solver
exports `evUnits` with an explicit gross-profit basis and displays expected
gross profit in APE; its ranking excludes additional chain costs. Cash Dash and
Hi-Lo continuation EV percentages compare a future net cashout estimate with
the current cashout, subtracting quoted future VRF fees. They are labeled
continuation EV, not realized PnL Profit or payout multipliers. Realized game
PnL includes every actual additional receipt cost, independently of those
planning models.

## Terminal net-result labels

Display actual net results as `net PnL: <value>`. Command comments show gross
`bet` and `payout`, then a single net field without parentheses, a currency
suffix, or a duplicate `net:` label. APE is the command currency. Completed
stateful result labels use the same format; unavailable costs remain explicitly
unavailable. Headers and routine summaries use `net PnL` for cumulative results.
Keep JSON economic field names unchanged. Callers must pass cost-adjusted
`pnlWei` to `formatCommandEconomicsSuffix`, including simulated costs.
