# Dojo Drop: analytics and probability evidence

Dojo Drop is playable through the CLI, with contract-returned spin details
and a dated configuration snapshot, but exact RTP, variance and complete
outcome probabilities remain unverified. The configuration supplies a
1,000× gross upper bound, whose attainability/probability is not established.

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

## Mechanics

The public rules describe a wall with five columns and six rows (30 blocks)
and a symbol grid with five columns and three rows (15 cells). Blades deal
column-local damage; Spirit Gems upgrade same-column blades to four damage;
Burger explosions destroy a plus shape after blades. Wall blocks have a
16% advertised one-tier upgrade chance at the checked configuration.

Three base-game Lucky Cats trigger four bonus drops on a fresh copy of the
wall. Bonus damage persists between drops; the bonus Lucky Cat weight is
zero. Cleared columns reveal chests that multiply the collected total.
Exact damage ordering, overlapping explosions, edge behavior and RNG
mapping still require source-level evidence.

## Component paytable

The configuration uses integer payout units with denominator 10,000.
These factors describe broken-block contributions, not complete outcomes.

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

These ten `getGameConfig()` fields were originally read at block `52884995`,
matched at `52978021` on 2026-10-25, and matched again at `53060536`
(`2026-10-26 09:12:48.0 UTC`, block timestamp). They are mutable
configuration observations, not immutable source rules.

Chest values have configured shares of 40% for 2×, 30% for 3×, 18% for 4×
and 12% for 5×. They do not give the chance of clearing a column, receiving
a chest, or independent joint probabilities for several chests.

## Symbol probabilities by reel

Dojo Drop exposes a common weight vector for its five symbol columns,
rather than finite base/bonus reel strips. No per-column weight variation
is exposed by `getGameConfig()`. That fact alone does not prove identical
actual cell probabilities or independence across all columns and rows.

The following **nominal model** assumes an empty-cell draw first, followed
by proportional weighted selection conditional on a nonempty cell:

```text
P(empty) = emptyBp ⁄ 10000
P(symbol s) = (1 – emptyBp ⁄ 10000) × weight_s ⁄ Σweights
ΣbaseWeights = 72    ΣbonusWeights = 80
```

Under those assumptions the same table applies to columns 1–5 and their
three symbol rows. These are normalized configuration calculations, **not
verified exact on-chain probabilities**: draw order, integer random mapping
and correlations have not been established. The empty-cell basis points
and relative weights describe different stages and must not be added as
one probability table. Frontend animation/demo defaults contain different
weights and empty-cell settings; they are not substituted for this live
configuration or used as a settlement simulator.

| ID | Symbol | Base weight | Base nominal probability | Bonus weight | Bonus nominal probability |
| --- | --- | ---: | ---: | ---: | ---: |
| 0 | Katana | 32 | 22.6667% | 40 | 20% |
| 1 | Flame Blade | 17 | 12.0417% | 22 | 11% |
| 2 | Void Blade | 9 | 6.3750% | 10 | 5% |
| 3 | Ice Blade | 4 | 2.8333% | 3 | 1.5% |
| 4 | Lucky Cat | 4 | 2.8333% | 0 | 0% |
| 5 | Spirit Gem | 4 | 2.8333% | 4 | 2% |
| 6 | Burger | 2 | 1.4167% | 1 | 0.5% |
| 255 | Empty cell | Separate draw | 49% | Separate draw | 60% |
| Total | All cells | 72 nonempty weights | 100% before rounding | 80 nonempty weights | 100% |

For example, the base Katana fraction is `0.51 × 32 ⁄ 72 = 17 ⁄ 75`;
it is neither 32% nor `32 ⁄ 10000`. Symbol weights and chest shares do not
establish the full payout law or bonus-trigger odds.

## Loss, draw and win probabilities

| Complete paid-spin result | Probability | Bet invariance |
| --- | --- | --- |
| Loss, `R < 1` | Not established | Not established |
| Draw, `R = 1` | Not established | Not established |
| Win, `R > 1` | Not established | Not established |

The wall upgrade/damage order, base-to-bonus wall reset, persistent damage,
chest reveals/correlations and cap/rounding rules all contribute to the
complete result. Applying a binomial law to Lucky Cats or multiplying chest
shares would introduce unverified independence assumptions and would still
not yield loss/draw/win probabilities. A broken paying block or a positive
payout alone need not recover the paid stake.

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

## Maximum payout and its probability

| Quantity | Result |
| --- | --- |
| Reported gross minimum | 0× |
| Largest individual block contribution | 6× for Golden Dragon |
| Largest configured individual chest value | 5× |
| Configured gross upper bound per paid spin | `10000000 ⁄ 10000 = 1000×` |
| Gross upper bound for a paid-spin session | 1,000× total actual wager |
| Attainable maximum at a specified stake/configuration | Not established |
| Probability of reaching the 1,000× bound | Not established |

For a stake `b`, the configured cap gives `G ≤ 1000 × b`; summing capped
paid-spin prizes gives `ΣG_i ≤ 1000 × Σb_i`. Integer allocation can reduce
the bound relative to the supplied total. For example, a synthetic 5 APE
one-spin wager has a 5,000 APE gross bound, not a guaranteed reachable prize.
The complete paid result includes its automatic bonus drops.

A configured cap is not a proof that an RNG outcome can reach it. Computing
its probability requires summing the probabilities of **all** outcomes
whose uncapped award reaches the cap, with exact settlement rounding; it
is not the probability of one block, chest value or all-largest-chests
combination. The cap is neither expected return nor a future-block guarantee.

## RTP, variance and observed statistics

No exact expected RTP, variance, profit frequency, complete outcome odds,
bonus frequency or bonus EV is established. No theoretical or
screenshot-derived running RTP is installed as expected RTP. No dated
running-statistics snapshot is included in the current evidence, and no
simulation-derived odds replace the missing source model.

## Configuration, commands and costs

`--split` or a positional count selects 1–15 paid spins, default 15.
Total amount must be at least `2.5 APE × split` (37.5 APE at the default).
`--spin <APE>` selects an exact paid-spin stake and wagers only
`min(floor(budget ⁄ spin), 15) × spin`, subject to live limits, leaving the
remainder unspent. It conflicts with explicit counts. Bonus drops are
automatic within a paid result; there is no bonus-buy option. Normal loop,
stop, betting strategy, retry, timeout and JSON controls apply.

```text
callback gas = 500000 + 150000 × paid spins
transaction value = actual wager + getVRFFee(uint32 callback gas)
                    + EXECUTOR_FEE() × paid spins
```

Actual transaction gas is separate. Live fees and gas reduce net PnL but
do not enter the gross payout ratio; positive payout can still mean a gross
loss or negative net PnL. Settled integer payouts and masks come from the
contract, not a simulator inferred from screenshots.

`game dojo --paytable` reports minimum 0 and the dated 1,000× gross bound,
with `payouts_enumerated = false`, including for multiple paid spins. Block
factors and chest values alone do not enumerate outcomes or rank strategies.

## Evidence limits and sources

The replay adapter pins configuration and detail reads to one block and
checks every spin payout against the total. Its configuration describes
that read block, not necessarily the original wager block. Replay masks
expose completed outcomes, without proving the RNG or evaluator internals.

Exact sampling, damage/bonus/chest evaluation, rounding, owner controls,
liquidity clipping and failure/refund rules still require verified source.
To reproduce the nominal symbol table, read `getGameConfig()` at block
`53060536` from the contract in the linked note using ApeChain JSON-RPC
`https://rpc.apechain.com/http` (chain ID 33139), then apply the explicitly
conditional formula above. No wallet, signed transaction or gameplay is
needed. Full signatures and zero-based indexing are in the contract note.

- [Contract interface and verification](../verification/DOJO_DROP_CONTRACT.md).
- [Official game and help](https://ape.church/games/dojo-drop).
- [Official slots rules](https://docs.ape.church/games/player-vs-house/slots-games).
