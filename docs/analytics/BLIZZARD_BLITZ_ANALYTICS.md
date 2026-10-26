# Blizzard Blitz: analytics and probability evidence

Blizzard Blitz is playable through the CLI, with public symbol awards and
readable reel strips, but no verified complete stochastic model. Exact
RTP, variance, complete outcome probabilities and the attainable maximum
payout are not established. It remains outside exact mode rankings.

## Scope and payout definitions

Use the **complete result of one paid spin**, including all cascades and
awarded free spins/drops, when defining its gross payout ratio:

```text
b = actual paid-spin stake
G = complete gross payout attributable to that paid spin
R = G ⁄ b
loss: R < 1    draw: R = 1    win: R > 1
```

A positive payout below the stake is still a loss. VRF fees, executor fees
and transaction gas are excluded from this ratio; net PnL subtracts them.
Compare settled integer wei directly (`G < b`, `G = b`, `G > b`), rather
than rounding a displayed multiplier. A multi-spin session instead uses
`R_session = ΣG_i ⁄ Σb_i`; its loss/draw/win probabilities need not equal
those of one paid spin. The budget remainder left by `--spin` is not wagered.

For `--bonus`, use the **full purchase cost** as the denominator: a 128 APE
purchase has a 4 APE bonus reference stake (`128 ⁄ 32`), but its gross ratio
is `payout ⁄ 128`, not `payout ⁄ 4`. This mode has its own outcome distribution;
a purchased bonus is not equivalent to a single paid base spin.

## Mechanics

The official frontend displays a 5 × 5 grid. At least seven ordinary copies
pay anywhere; adjacency and paylines are unnecessary. Several symbols can
qualify in one evaluation. Winning ordinary symbols are removed and
replacements can form cascades. The base cascade badge numbers stages;
it is not an extra payout factor.

Five or more base scatters advertise five free spins, including triggers
appearing during a cascade. Bonus strips replace the scatter with chests.
Each chest advertises doubling: 2×, 4×, 8×, 16×, up to 4,096×. This is a
feature factor, not an overall spin or purchase maximum.

## Component paytable

Official frontend award snapshot: 2026-10-25. Entries multiply the
per-paid-spin stake in base play, or the reference stake (purchase amount ⁄
32) for a purchased bonus. These are component awards, not session outcomes.

| ID | Symbol | 7–8 matches | 9–10 matches | 11+ matches |
| --- | --- | ---: | ---: | ---: |
| 0 | Penguin | 0.25× | 0.75× | 2× |
| 1 | Mittens | 0.45× | 1× | 4× |
| 2 | Beanie | 0.5× | 1.1× | 5× |
| 3 | Parka | 0.8× | 1.25× | 8× |
| 4 | Sled | 1× | 1.5× | 10× |
| 5 | Campfire | 1.5× | 2.5× | 15× |
| 6 | Ice block | 2× | 5× | 25× |
| 7 | Goggles | 5× | 10× | 50× |

For example, seven mittens and seven beanies on a 4 APE spin give
`1.8 + 2 = 3.8 APE` in component awards before any later cascade. That is
public-table arithmetic, not independently verified settlement, and remains
a loss if no other payout follows. Scatter: ID 8; bonus chest: ID 9.

## Symbol probabilities by reel

Originally read at block `52977804` on 2026-10-25 through `getReel(uint8)`
and `getBonusReel(uint8)`, indexes **1–5**. Reread at block `53060536`
(`2026-10-26 09:12:48.0 UTC`, block timestamp); pooled counts match the
previous snapshot. Every ordered strip matched the official frontend chunk
`40448-35ce3484f58ba904.js` checked on the new date. Each strip has 5,000
positions, giving 25,000 per five-strip pool.

Each cell below shows **exact count (strip frequency)**. The exact fraction
is `count ⁄ 5000`; these percentages are exact to two decimals. They give
per-symbol probabilities **conditional on uniformly selecting a position
on that reel**. Strip counts alone do not prove uniform RNG mapping,
independence between reels/cells or cascade refill behavior. They are not
the probability of at least one appearance anywhere in a complete spin.

### Base reels

| ID | Symbol | Reel 1 | Reel 2 | Reel 3 | Reel 4 | Reel 5 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 0 | Penguin | 1,196 (23.92%) | 1,160 (23.20%) | 1,132 (22.64%) | 1,197 (23.94%) | 1,134 (22.68%) |
| 1 | Mittens | 988 (19.76%) | 924 (18.48%) | 1,003 (20.06%) | 973 (19.46%) | 1,012 (20.24%) |
| 2 | Beanie | 792 (15.84%) | 848 (16.96%) | 786 (15.72%) | 802 (16.04%) | 786 (15.72%) |
| 3 | Parka | 574 (11.48%) | 581 (11.62%) | 584 (11.68%) | 587 (11.74%) | 609 (12.18%) |
| 4 | Sled | 502 (10.04%) | 502 (10.04%) | 527 (10.54%) | 500 (10.00%) | 530 (10.60%) |
| 5 | Campfire | 418 (8.36%) | 411 (8.22%) | 396 (7.92%) | 389 (7.78%) | 398 (7.96%) |
| 6 | Ice block | 222 (4.44%) | 240 (4.80%) | 254 (5.08%) | 221 (4.42%) | 240 (4.80%) |
| 7 | Goggles | 145 (2.90%) | 174 (3.48%) | 162 (3.24%) | 161 (3.22%) | 156 (3.12%) |
| 8 | Scatter | 163 (3.26%) | 160 (3.20%) | 156 (3.12%) | 170 (3.40%) | 135 (2.70%) |
| 9 | Chest | 0 (0.00%) | 0 (0.00%) | 0 (0.00%) | 0 (0.00%) | 0 (0.00%) |
| Total | All symbols | 5,000 (100%) | 5,000 (100%) | 5,000 (100%) | 5,000 (100%) | 5,000 (100%) |

### Bonus reels

| ID | Symbol | Reel 1 | Reel 2 | Reel 3 | Reel 4 | Reel 5 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 0 | Penguin | 1,181 (23.62%) | 1,135 (22.70%) | 1,119 (22.38%) | 1,102 (22.04%) | 1,170 (23.40%) |
| 1 | Mittens | 926 (18.52%) | 933 (18.66%) | 970 (19.40%) | 1,009 (20.18%) | 938 (18.76%) |
| 2 | Beanie | 731 (14.62%) | 782 (15.64%) | 740 (14.80%) | 741 (14.82%) | 746 (14.92%) |
| 3 | Parka | 572 (11.44%) | 568 (11.36%) | 572 (11.44%) | 583 (11.66%) | 550 (11.00%) |
| 4 | Sled | 493 (9.86%) | 489 (9.78%) | 450 (9.00%) | 497 (9.94%) | 479 (9.58%) |
| 5 | Campfire | 409 (8.18%) | 371 (7.42%) | 449 (8.98%) | 397 (7.94%) | 394 (7.88%) |
| 6 | Ice block | 227 (4.54%) | 253 (5.06%) | 224 (4.48%) | 214 (4.28%) | 239 (4.78%) |
| 7 | Goggles | 152 (3.04%) | 163 (3.26%) | 173 (3.46%) | 157 (3.14%) | 151 (3.02%) |
| 8 | Scatter | 0 (0.00%) | 0 (0.00%) | 0 (0.00%) | 0 (0.00%) | 0 (0.00%) |
| 9 | Chest | 309 (6.18%) | 306 (6.12%) | 303 (6.06%) | 300 (6.00%) | 333 (6.66%) |
| Total | All symbols | 5,000 (100%) | 5,000 (100%) | 5,000 (100%) | 5,000 (100%) | 5,000 (100%) |

The same symbol does **not** have the same strip frequency on every reel.
For example, base penguin is `1196 ⁄ 5000 = 23.92%` on reel 1 and
`1132 ⁄ 5000 = 22.64%` on reel 3.

### Pooled frequencies retained from the earlier snapshot

Pool count ⁄ 25,000, rounded to two decimals. This is an average across
five equal-length reels, not a replacement for their distinct frequencies.

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

## Loss, draw and win probabilities

| Complete result | Loss, `R < 1` | Draw, `R = 1` | Win, `R > 1` |
| --- | --- | --- | --- |
| One paid base spin including its bonus | Not established | Not established | Not established |
| One full bonus purchase | Not established | Not established | Not established |

Reel ordering, offsets, correlated cells, refill progression, scatter and
chest treatment, and rounding are needed to turn the strips into the full
payout distribution. A binomial model over 25 IID cells is not established.
A hit, cascade or bonus trigger is not synonymous with `R > 1`.

In a stake-independent model with linear settlement `G = b × X`, these
probabilities would be invariant under changing `b` at a **fixed paid-spin
count and game mode**. The available evidence does not establish that full
model: exact integer rounding, payout clipping and stake-dependent limits
must also be checked. Consequently no exact bet-invariant percentages are
claimed. With a fixed budget, changing `--spin` can change the paid-spin
count as well as the stake, changing the session distribution even in a
linear model.

For equal stakes and independent full-spin factors `X_i`, session loss,
draw and win would require `P(ΣX_i < n)`, `P(ΣX_i = n)` and `P(ΣX_i > n)`.
That calculation needs the complete factor distribution and evidence of
independence; symbol marginals alone do not supply either.

The 32× purchase scalar alone does not establish equal EV or equal outcome
probabilities between base play and a purchased bonus.

## Maximum payout and its probability

| Quantity | Result |
| --- | --- |
| Reported gross minimum | 0× |
| Largest ordinary component award | 50× for 11+ goggles |
| Advertised chest multiplier ceiling | 4,096× |
| Attainable maximum complete paid-spin/session/purchase payout | Not established |
| Probability of that maximum | Not established |

The highest ordinary award and chest factor do not establish a whole-game
maximum when cascades and bonus spins contribute. Current house liquidity,
the changing UI allowance and its 80,000 APE label do not establish an
immutable cap or a probability of reaching it.

## RTP, variance and observed statistics

No exact expected RTP, variance, profit frequency, bonus probability or
bonus EV is established. A running/realized return is not a theoretical
expected RTP; none is installed as one. No dated running-statistics
snapshot is included in the current evidence. No simulation-derived odds
or numeric strategy ranking are substituted for the missing model.

Increasing paid-spin count can spread fixed fee overhead. Exact variance
reduction or equal EV is not asserted without the stochastic/rounding model.

## Configuration, commands and costs

Base play selects 1–20 paid spins, default 10, at least 2.5 APE per spin.
The total amount is split across paid spins; free spins add no paid wager.
`--spin <APE>` treats amount as a budget and wagers only
`min(floor(budget ⁄ spin), 20) × spin`, leaving the remainder unspent.

`--bonus` buys one round for at least 100 APE. The full amount is the gross
wager, with a reference stake of amount ⁄ 32. It conflicts with explicit
counts and `--spin`; `--loop --bonus` repeats purchases. Normal loop, stop,
strategy, retry, timeout and JSON controls remain available.

```text
callback gas = 550000 + 200000 × encoded spins
transaction value = actual wager + getVRFFee(uint32 callback gas)
                    + EXECUTOR_FEE() × encoded spins
```

A purchase encodes one spin. Live VRF/executor fees and actual transaction
gas reduce net PnL without changing gross payout ⁄ gross wager. Neither
immutable reel weights nor complete payout/weight update controls have
been established from verified source.

`game blizzard --paytable` exposes the component table separately from
whole-game bounds: minimum 0, maximum unknown, outcomes not enumerated.
The CLI does not install 50×, 4,096× or current house liquidity as an exact
overall maximum.

## Evidence limits and sources

Exact RNG expansion/modulo bias, reel advance/refill order, cell
correlations, scatter persistence/retriggers, chest retention/application,
cascade bounds, rounding, clipping and owner controls remain unresolved.
The strips and public display rules do not constitute a verified complete
stochastic model.

To reproduce the frequencies, use ApeChain JSON-RPC
`https://rpc.apechain.com/http` (chain ID 33139), the contract address in the
linked contract note, block `53060536`, and the two getter signatures above
returning `uint8[]`. Count each symbol ID separately for each reel, verify
5,000 positions per strip, and divide by 5,000. No wallet, signed
transaction or gameplay is needed.

- [Contract interface and verification](../verification/BLIZZARD_BLITZ_CONTRACT.md).
- [Official game and help](https://ape.church/games/blizzard-blitz), including
  the dated frontend chunk identified above.
- [Official slots rules](https://docs.ape.church/games/player-vs-house/slots-games).
