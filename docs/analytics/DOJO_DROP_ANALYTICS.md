# Dojo Drop analytics and evidence limits

Dojo Drop is playable, with contract-returned spin detail and a dated
configuration snapshot, but **exact RTP, profit frequency, variance and
outcome probabilities remain unverified**. See the
[contract note](../verification/DOJO_DROP_CONTRACT.md) and
[official game](https://ape.church/games/dojo-drop).

The snapshot originally read at block `52884995` was reread at block
`52978021` on 2026-10-25; all ten `getGameConfig()` fields matched.
These are mutable configuration observations, not immutable source rules.

## Block payouts and configuration

Payouts use integer units with denominator 10,000.

| Block | Durability | Gross payout units | Factor |
| --- | ---: | ---: | ---: |
| Bamboo | 1 | 0 | 0× |
| Burger Crate | 1 | 0 | 0× |
| Cherry Blossom | 2 | 2,000 | 0.2× |
| Stone Frog | 3 | 8,000 | 0.8× |
| Temple | 4 | 20,000 | 2× |
| Golden Dragon | 6 | 60,000 | 6× |

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

Weight order: Katana, Flame Blade, Void Blade, Ice Blade, Lucky Cat,
Spirit Gem, Burger. The empty-cell basis points and relative symbol weights
describe different parts of the configuration; they must not be added or
treated as one direct probability table. Neither symbol weights nor chest
percentages establish independence or full outcome odds.

The advertised mechanics include a 5 × 6 wall, a 5 × 3 symbol grid,
column-local blade damage, gem upgrades, Burger explosions and multiplying
chests in cleared columns. Three Lucky Cats trigger four bonus drops;
bonus damage persists, while the bonus Lucky Cat weight is zero.
Exact damage ordering and RNG behavior still require source-level evidence.

## Gross cap versus expected return

The snapshot cap is `10000000 ⁄ 10000 = 1000` times a paid spin's stake.
For multiple paid spins, summing capped prizes cannot exceed 1,000× the
total wager; integer allocation can reduce that upper bound. Attainability
at a particular wager or configuration is not established. The cap is not
an expected return, a win probability or a guarantee about future blocks.

`game dojo --paytable` reports minimum 0 and the dated 1,000× gross bound,
with `payouts_enumerated = false`. Block factors and chest values alone are
insufficient to enumerate complete outcomes or rank a profitable strategy.

## Commands and costs

`--split` or a positional count selects 1–15 paid spins, default 15.
Total amount must be at least `2.5 APE × split` (37.5 APE at the default).
`--spin <APE>` sets an exact paid-spin stake and spends only the largest
count within the budget and live limit; the remainder stays unspent.
Bonus drops are automatic within a paid result, with no bonus-buy option.
The normal loop, stop, betting strategy, retry, timeout and JSON controls apply.

```text
callback gas = 500000 + 150000 × paid spins
transaction value = actual wager + getVRFFee(callback gas)
                    + EXECUTOR_FEE() × paid spins
```

Actual gas is separate. Payout greater than zero can still produce a gross
loss or a negative net PnL after costs. Settled integer payouts and masks
come from the contract, rather than a simulator inferred from screenshots.

The replay adapter pins config and detail reads to one block and checks
every spin payout against the total. Its config describes that read block,
not necessarily the original wager block. Full signatures, indexing,
public sources and unresolved questions are in the contract note.
