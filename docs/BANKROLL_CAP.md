# Shared bankroll allocation, stop and cap

```bnf
<bankroll-cap-option> ::= "--bankroll-cap" <positive-ape>
<bankroll-stop-option> ::= "--bankroll-stop" <nonnegative-ape>
```

`--bankroll-cap` is available wherever the shared `--bankroll` option is
accepted: stateless game loops, Blackjack, Video Poker, Cash Dash, Hi-Lo Nebula,
and bot implementations using the standard controls. Both space-separated and
`--bankroll-cap=<ape>` forms are supported. The cap is a positive APE amount
with at most 18 decimal places; percentages and payout multipliers are invalid.

Both capital controls are optional flags requiring the `--` prefix. In script
JSON command objects, use keys `"--bankroll-cap"` and `"--bankroll-stop"`; keys
are emitted literally and an undashed key is not converted into an option.

It limits allocated capital and supplies a profit exit. It does not rename or
change `--bankroll`, which remains an absolute net-loss-budget alias for
`--max-loss`. With a cap, an optional absolute loss budget can also restrict the
initial allocation. A percentage loss guard never defines initial capital.

For starting wallet balance C, configured floor L (zero if absent), cap K, and
optional absolute budget A and residual stop S (zero if absent):

```text
initial allocation H = max(0, min(K, C − L, A if present))
effective wallet floor F = max(L, C − H + S)  # S defaults to zero
remaining capital = H + cumulative net PnL
capital used for fractional sizing = min(K, max(0, remaining capital))
```

For example, C = 400, L = 90 and K = 240 allocate 240 APE and set the effective
floor to 160. C = 250 with the same controls allocates 160 APE and keeps the
floor at 90. An additional absolute budget of 120 would allocate at most 120.

```bash
apechurch-cli play roulette --bet RED --loop --min-balance 90 --bankroll-cap 240 --bet-strategy bankroll-fraction=0.1 --min-bet 1 --max-bet 30
```

Each completed game checks whether remaining capital is **strictly greater**
than K. If so, it stops normally with reason `bankroll_cap`. Equality continues,
so a new run starting with H = K can play. Net PnL includes all actual additional
execution costs; a gross profit offset by costs cannot trigger this exit.
`--min-profit` is optional. Existing explicit guards retain priority.

The floor stays fixed for that invocation. At each fresh start, allocation and
floor are recalculated from the current wallet; there is no persistent reserve
and no automatic relaunch. Script-watch intervals and balance conditions are
unchanged. The cap does not constrain cumulative wager or guarantee that an
already submitted wager, split, double or fee cannot cross the wallet floor.
Fixed bets and strategy-specific exposure rules remain independent.

Bots use their documented completed control-unit boundaries. A router may defer
the cap exit until all follow-ups complete, while continuing to enforce wallet
and other safety limits between children. It forwards the effective floor, not
the parent's cap, to child calls. Pending resume retains the original allocation
and floor; it must not rebase them to the balance observed during reconciliation.
Wallet-free simulations require a supplied starting balance and must not infer
one from the opening wager.

See [the bot runtime contract](BOTS.md#capped-allocation-runtime-contract) for
implementation and regression requirements.

## Residual bankroll stop

`--bankroll-stop S` is available in every context supporting `--bankroll-cap`,
with or without a cap. It accepts a nonnegative APE amount, at most 18 decimals,
in spaced or equals syntax. Percentages, multipliers, negative amounts and
repeated options are invalid. Require S < actual initial allocation H and,
when configured, S < K. Impossible static ranges fail before wallet access;
insufficient available capital fails before the first wager.

With no cap, omit K from the allocation/sizing minima; an absolute bankroll or
loss budget still limits H. Without another allocation limit, available wallet
capital above the configured floor supplies H. Existing invocations without the
new option retain their behavior.

The stop leaves H unchanged for fractional sizing. At each standard checkpoint,
H + cumulative actual net PnL ≤ S stops with reason `bankroll_stop` and exact
`threshold_ape`, `bankroll_ape`, `pnl_ape` fields. Equality stops; cap equality
still continues. Failed-attempt costs reduce this net capital without becoming
successful game outcomes. The wallet floor is reactive, so an already submitted
wager or its costs may cross it.

For example, C = 400, absolute bankroll = 120, S = 30 and K = 240 allocate
120 APE, derive a wallet floor of 310 and size a 0.1 fraction at 12 APE.
With C = 650, the same controls still allocate 120 and start at 12, but the
floor becomes 560. Subtracting S before sizing would be incorrect.

```bash
apechurch-cli play roulette --bet RED --loop --bankroll 120 --bankroll-stop 30 --bankroll-cap 240 --bet-strategy bankroll-fraction=0.1 --min-bet 1 --max-bet 30
```

The effective floor is forwarded to children, not the parent's `--bankroll-stop`
or cap. Keep `initial_bankroll_ape` separate from `min_balance_ape` when sizing;
loop implementations pass the saved `bankrollCapState` to
`getRemainingBankrollApe` rather than deriving a new allocation from that raised
floor. Pending resume validates and retains stop, cap, original allocation and
floor; only a fresh start recalculates them. External wallet transfers are not
net game profit, while independent wallet guards still apply.

See [CLI 33 migration](migrations/v33.md) for the option/output comparison.
