# Shared bankroll cap

```bnf
<bankroll-cap-option> ::= "--bankroll-cap" <positive-ape>
```

`--bankroll-cap` is available wherever the shared `--bankroll` option is
accepted: stateless game loops, Blackjack, Video Poker, Cash Dash, Hi-Lo Nebula,
and bot implementations using the standard controls. Both space-separated and
`--bankroll-cap=<ape>` forms are supported. The cap is a positive APE amount
with at most 18 decimal places; percentages and payout multipliers are invalid.

It limits allocated capital and supplies a profit exit. It does not rename or
change `--bankroll`, which remains an absolute net-loss-budget alias for
`--max-loss`. With a cap, an optional absolute loss budget can also restrict the
initial allocation. A percentage loss guard never defines initial capital.

For starting wallet balance C, configured floor L (zero if absent), cap K, and
optional absolute budget A:

```text
initial allocation H = max(0, min(K, C − L, A if present))
effective wallet floor F = max(L, C − H)
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
