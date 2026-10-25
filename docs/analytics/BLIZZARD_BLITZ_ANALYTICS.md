# Blizzard Blitz analytics and evidence limits

Blizzard Blitz has a public symbol award table and readable reel strips,
but no verified complete stochastic model. **Exact RTP, profit frequency,
variance, bonus probability and overall maximum payout remain unknown.**
It is excluded from exact mode rankings. See
[contract evidence](../verification/BLIZZARD_BLITZ_CONTRACT.md) and the
[official game/help](https://ape.church/games/blizzard-blitz).

## Symbol awards

Official frontend snapshot: 2026-10-25. Awards multiply the per-paid-spin
stake in base play, or the bonus reference stake (purchase amount ⁄ 32) for
a purchased bonus. They are component awards, not whole-session outcomes.

| ID | Symbol | 7–8 | 9–10 | 11+ |
| --- | --- | ---: | ---: | ---: |
| 0 | Penguin | 0.25× | 0.75× | 2× |
| 1 | Mittens | 0.45× | 1× | 4× |
| 2 | Beanie | 0.5× | 1.1× | 5× |
| 3 | Parka | 0.8× | 1.25× | 8× |
| 4 | Sled | 1× | 1.5× | 10× |
| 5 | Campfire | 1.5× | 2.5× | 15× |
| 6 | Ice block | 2× | 5× | 25× |
| 7 | Goggles | 5× | 10× | 50× |

At least seven copies can pay anywhere in the 25-cell grid; adjacency and
paylines are unnecessary. Several symbols can qualify in one evaluation.
Winning ordinary symbols are removed and replacements can form cascades.
The base cascade badge numbers stages; it is not an extra payout factor.
For example, seven mittens and seven beanies on a 4 APE spin give component
awards of 1.8 + 2 = 3.8 APE before any later cascade. This is public-table
arithmetic, not an independently verified settlement algorithm.

Five or more base scatters advertise five free spins, including triggers
appearing during a cascade. Bonus strips replace the scatter with chests.
Each chest advertises doubling: 2×, 4×, 8×, 16×, up to 4,096×. That factor
does not establish a 4,096× maximum for the whole spin or purchase.

## Live strip frequencies

Read at block `52977804` on 2026-10-25 via `getReel(1..5)` and
`getBonusReel(1..5)`. Each strip has 5,000 positions; each five-strip pool
has 25,000. Frequencies match the official frontend and its displayed table.
Percentages below are pool count ⁄ 25,000, rounded to two decimals.

| Symbol | Base count | Pool frequency | Bonus count | Pool frequency |
| --- | ---: | ---: | ---: | ---: |
| Penguin | 5,819 | 23.28% | 5,707 | 22.83% |
| Mittens | 4,900 | 19.60% | 4,776 | 19.10% |
| Beanie | 4,014 | 16.06% | 3,740 | 14.96% |
| Parka | 2,935 | 11.74% | 2,845 | 11.38% |
| Sled | 2,561 | 10.24% | 2,408 | 9.63% |
| Campfire | 2,012 | 8.05% | 2,020 | 8.08% |
| Ice block | 1,177 | 4.71% | 1,157 | 4.63% |
| Goggles | 798 | 3.19% | 796 | 3.18% |
| Scatter, ID 8 | 784 | 3.14% | 0 | 0% |
| Chest, ID 9 | 0 | 0% | 1,551 | 6.20% |
| Total | 25,000 | 100% before rounding | 25,000 | 100% before rounding |

These are exact counts at a dated block, not exact joint probabilities.
Per-reel ordering and sampling/refill correlations matter; a binomial model
over 25 IID cells is not established by this table. A running or realized
return is not a theoretical expected RTP and is not installed as one.

## Configuration and economics

Base play allows 1–20 paid spins (CLI default 10), at least 2.5 APE per spin.
The amount is split across paid spins; awarded free spins add no paid wager.
`--spin <APE>` instead treats amount as a budget and wagers only
`min(floor(budget / spin), 20) × spin`, leaving the remainder unspent.

`--bonus` buys one bonus round for at least 100 APE; the full amount is the
gross wager. A 128 APE purchase has a 4 APE bonus reference stake; any payout
ratio still divides by **128 APE**, not by 4 APE. This conversion does not
prove bonus-buy EV is equal to base-game EV.

Live VRF and executor fees plus actual transaction gas reduce net PnL but
do not change gross payout ⁄ gross wager. Increasing paid spin count can
spread fixed fee overhead; variance reduction or equal EV is not asserted
as an exact theorem without the full stochastic and rounding model.

`game blizzard --paytable` exposes the complete component table separately
from the whole-game bounds: minimum 0, maximum unknown, outcomes not
enumerated. The CLI does not silently treat the highest ordinary award
(50×), the advertised chest factor, or current house liquidity as an exact
overall maximum. No numeric payout probability or strategy ranking follows
from these partial data.
