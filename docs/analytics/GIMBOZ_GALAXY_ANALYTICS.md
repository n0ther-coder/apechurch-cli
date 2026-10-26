# Gimboz of the Galaxy: analytics and probability evidence

The CLI supports base spins and direct bonus purchases. The public table,
ordered reel strips, bytecode interpretation and historical replay agree
on the documented sample, but do not establish a complete stochastic model.
Exact RTP, variance, whole-result probabilities and the attainable maximum
remain unverified. The game is excluded from exact statistical rankings.
See [contract evidence and reproduction method](../verification/GIMBOZ_GALAXY_CONTRACT.md).

## Accounting and complete outcomes

For one paid base spin, include its complete cascade chain and all awarded
bonus free spins in gross payout `G`. With actual stake `b`, the gross ratio
is `R = G ⁄ b`: loss `R < 1`, draw `R = 1`, profit `R > 1`. A positive payout
can still be a loss. Compare integer wei without display rounding.
A multi-spin session uses `R_session = ΣG_i ⁄ Σb_i` and has a different
distribution. The budget remainder from `--spin` is not wagered.

For a purchased bonus, the denominator is the **full purchase cost**. A
synthetic 170 APE purchase has a 10 APE reference stake (`170 ⁄ 17`) and
starts with three free spins, possibly extending to six. Gross payout ratio
is `payout ⁄ 170`, not `payout ⁄ 10` or `payout ⁄ 30`.
VRF fees, executor fees and actual gas are additional; net PnL subtracts them.

## Mechanics established by the dated evidence

Seven identical ordinary symbols anywhere pay on the 6 × 5 base board;
adjacency is unnecessary. Simultaneous eligible types and successive
cascades add awards. The badge `x2 Cascade!` counts stages, not a payout
factor. A qualifying Black Hole event clears/refills the board within the
same paid-spin chain, without increasing the purchased count. Its charge
excludes Black Holes themselves.

Base Warp charge resets for each purchased spin and triggers at 100.
A bonus starts with three free spins on 8 × 5. Its meter starts at zero,
accumulates between bonus spins, and at 300 allows one +3 extension, at most
six spins. These distinctions refine the tutorial's "extra spin", "every
tile" and open-ended retrigger wording; see the contract note's discrepancy
table. The implementation delegates financial outcomes to contract reads.

## Component paytable

The official table and `symbolPayouts(uint8,uint8)` were compared on
2026-10-26, getter snapshot block `53087598`. `PAYOUT_DENOM()` is 10,000.
Counts 7, 8, 9, 10, 11, 12, 30 and 40 were checked for every ordinary ID;
the displayed 7–8, 9–10 and 11+ values agree. These awards multiply the
per-paid-spin stake, or purchase amount ⁄ 17 for a purchased bonus.
They are component awards, not full spin/session outcomes or caps.

| Contract ID | Visual symbol | 7–8 | 9–10 | 11+ |
| --- | --- | ---: | ---: | ---: |
| 0 | Green slime | 0.20× | 0.40× | 1.00× |
| 1 | Yellow squid | 0.25× | 0.50× | 1.25× |
| 2 | Golden ringed planet | 0.30× | 0.60× | 1.40× |
| 3 | Red planet | 0.40× | 0.80× | 1.50× |
| 4 | Blue alien | 0.50× | 1.10× | 1.75× |
| 5 | Meteor | 0.60× | 1.25× | 2.00× |
| 6 | Pink alien | 0.75× | 1.50× | 2.25× |
| 7 | Purple ringed planet | 1.00× | 1.75× | 2.50× |
| 8 | One-eyed alien | 2.00× | 3.00× | 5.00× |
| 9 | Moon; bonus strips only | 2.50× | 5.00× | 10.00× |

Black Hole is contract ID **10**, mapped to display ID **11** by the frontend;
it is excluded from ordinary payout counting. The display mapping must not
be mistaken for an additional paying contract symbol.

## Exact strip counts and conditional symbol probabilities

At block `53085677`, all six base and eight bonus strips matched the ordered
frontend strips, with `BH` mapped to contract ID 10. Each has 5,000 stops.
Getter indexes are **1–6** and **1–8**; index zero reverted.

Each cell below is exact count and strip frequency, with exact fraction
`count ⁄ 5000`. These frequencies are conditional symbol probabilities if
a stop is chosen uniformly on that reel. They do not establish uniform RNG
mapping, independent cells or reels, full-board probabilities, cascade
probabilities or complete-result odds. Consecutive positions on an ordered
strip are correlated; an IID 30-cell or 40-cell binomial model is unjustified.

### Base reels

| ID | Symbol | Reel 1 | Reel 2 | Reel 3 | Reel 4 | Reel 5 | Reel 6 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | Green slime | 1,035 (20.70%) | 1,056 (21.12%) | 1,018 (20.36%) | 1,035 (20.70%) | 1,103 (22.06%) | 1,048 (20.96%) |
| 1 | Yellow squid | 903 (18.06%) | 833 (16.66%) | 838 (16.76%) | 830 (16.60%) | 831 (16.62%) | 898 (17.96%) |
| 2 | Golden ringed planet | 694 (13.88%) | 710 (14.20%) | 697 (13.94%) | 740 (14.80%) | 685 (13.70%) | 706 (14.12%) |
| 3 | Red planet | 575 (11.50%) | 566 (11.32%) | 576 (11.52%) | 529 (10.58%) | 552 (11.04%) | 526 (10.52%) |
| 4 | Blue alien | 452 (9.04%) | 455 (9.10%) | 468 (9.36%) | 444 (8.88%) | 465 (9.30%) | 473 (9.46%) |
| 5 | Meteor | 394 (7.88%) | 393 (7.86%) | 398 (7.96%) | 415 (8.30%) | 417 (8.34%) | 406 (8.12%) |
| 6 | Pink alien | 296 (5.92%) | 329 (6.58%) | 328 (6.56%) | 322 (6.44%) | 345 (6.90%) | 308 (6.16%) |
| 7 | Purple ringed planet | 293 (5.86%) | 288 (5.76%) | 305 (6.10%) | 306 (6.12%) | 274 (5.48%) | 287 (5.74%) |
| 8 | One-eyed alien | 149 (2.98%) | 167 (3.34%) | 154 (3.08%) | 145 (2.90%) | 139 (2.78%) | 142 (2.84%) |
| 9 | Moon | 0 (0.00%) | 0 (0.00%) | 0 (0.00%) | 0 (0.00%) | 0 (0.00%) | 0 (0.00%) |
| 10 | Black Hole | 209 (4.18%) | 203 (4.06%) | 218 (4.36%) | 234 (4.68%) | 189 (3.78%) | 206 (4.12%) |
| Total | All symbols | 5,000 (100%) | 5,000 (100%) | 5,000 (100%) | 5,000 (100%) | 5,000 (100%) | 5,000 (100%) |

### Bonus reels

| ID | Symbol | Reel 1 | Reel 2 | Reel 3 | Reel 4 | Reel 5 | Reel 6 | Reel 7 | Reel 8 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | Green slime | 756 (15.12%) | 757 (15.14%) | 685 (13.70%) | 684 (13.68%) | 760 (15.20%) | 740 (14.80%) | 717 (14.34%) | 684 (13.68%) |
| 1 | Yellow squid | 732 (14.64%) | 735 (14.70%) | 690 (13.80%) | 695 (13.90%) | 690 (13.80%) | 720 (14.40%) | 780 (15.60%) | 745 (14.90%) |
| 2 | Golden ringed planet | 666 (13.32%) | 628 (12.56%) | 660 (13.20%) | 702 (14.04%) | 665 (13.30%) | 665 (13.30%) | 606 (12.12%) | 664 (13.28%) |
| 3 | Red planet | 497 (9.94%) | 503 (10.06%) | 505 (10.10%) | 522 (10.44%) | 501 (10.02%) | 465 (9.30%) | 493 (9.86%) | 521 (10.42%) |
| 4 | Blue alien | 528 (10.56%) | 511 (10.22%) | 538 (10.76%) | 501 (10.02%) | 502 (10.04%) | 524 (10.48%) | 515 (10.30%) | 531 (10.62%) |
| 5 | Meteor | 412 (8.24%) | 409 (8.18%) | 459 (9.18%) | 441 (8.82%) | 425 (8.50%) | 428 (8.56%) | 454 (9.08%) | 430 (8.60%) |
| 6 | Pink alien | 422 (8.44%) | 428 (8.56%) | 456 (9.12%) | 433 (8.66%) | 431 (8.62%) | 411 (8.22%) | 447 (8.94%) | 450 (9.00%) |
| 7 | Purple ringed planet | 359 (7.18%) | 388 (7.76%) | 358 (7.16%) | 379 (7.58%) | 390 (7.80%) | 379 (7.58%) | 363 (7.26%) | 378 (7.56%) |
| 8 | One-eyed alien | 300 (6.00%) | 293 (5.86%) | 295 (5.90%) | 304 (6.08%) | 294 (5.88%) | 318 (6.36%) | 281 (5.62%) | 268 (5.36%) |
| 9 | Moon | 194 (3.88%) | 207 (4.14%) | 208 (4.16%) | 197 (3.94%) | 221 (4.42%) | 229 (4.58%) | 202 (4.04%) | 203 (4.06%) |
| 10 | Black Hole | 134 (2.68%) | 141 (2.82%) | 146 (2.92%) | 142 (2.84%) | 121 (2.42%) | 121 (2.42%) | 142 (2.84%) | 126 (2.52%) |
| Total | All symbols | 5,000 (100%) | 5,000 (100%) | 5,000 (100%) | 5,000 (100%) | 5,000 (100%) | 5,000 (100%) | 5,000 (100%) | 5,000 (100%) |

The moon's zero base-strip frequency is exact for this snapshot. It does not
mean the moon is absent from the game's shared paytable. Reels have distinct
frequencies; pooled averages must not replace the individual columns.

## Replay corroboration and statistical limits

The contract note records a read-only audit of 100 consecutive public game
records at block `53087521`: all settled payouts, trigger indexes and bonus
counts matched the reconstructed model, with integer rounding at the end
of each paid-spin chain including its awarded bonus. It contained 24 bonus
sessions, 91 base wipes and 35 bonus wipes. These observed counts are **not**
exact trigger odds, profit frequency or theoretical RTP; they are a finite
historical consistency check. No live wager was made for verification.

| Complete result | Loss, R < 1 | Draw, R = 1 | Profit, R > 1 |
| --- | --- | --- | --- |
| One paid base spin, all cascades and awarded bonus included | Not established | Not established | Not established |
| One full bonus purchase | Not established | Not established | Not established |
| A multi-spin session | Count-dependent; not established | Not established | Not established |

A stake-independent linear model would preserve full-spin ratios at a fixed
mode and count, but exact wei rounding, mutable tables, house clipping and
acceptance limits must also be proven. With a fixed budget, changing `--spin`
can change the count as well as the stake, changing session risk even under
a linear model. No exact stake-invariant probabilities are asserted here.

The 10× moon award is not an overall maximum: several symbols, cascades,
wipes and free spins can contribute. Neither the UI's changing house payout
allowance nor the bytecode's bounded resolution depth proves an attainable
maximum. Recover and reproduce verified source, RNG mapping and the complete
settlement logic before deriving exact distributions or promoting the ABI.
