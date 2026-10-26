# Reel Pirates: analytics and probability evidence

Reel Pirates is playable through the CLI, with public symbol awards and
readable reel strips, but its deployed source remains unverified in the
repository's evidence. Exact RTP, variance, complete outcome probabilities
and the attainable maximum payout are not established.

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

The official frontend displays five rows and six reel columns: 30 cells.
This is a match-anywhere cascade slot; paylines and ordered triples do not
apply. Ordinary symbols pay at 8–9, 10–11 or 12+ copies anywhere on the
board. Winning symbols are removed and replaced, allowing more cascade
wins in the same paid result.

Four or more scatter chests trigger five free spins, including triggers
appearing during cascades. The previously supplied public rules describe
additional scatters awarding more free spins. However, the bonus strips
read at the new snapshot contain **no scatter symbols**; a numerical
retrigger probability or an operative retrigger path is not established
by those descriptions. Bonus-only multipliers are additive within a spin;
the documented values are 2×, 3×, 5×, 10×, 25×, 50× and 100×.

## Component paytable

The public UI table is normalized to a 1 APE paid-spin stake. Entries are
gross component multipliers of that stake, not complete spin returns.

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

Scatter chest: ID 9. Bonus multiplier IDs 10–16 map respectively to
2×, 3×, 5×, 10×, 25×, 50× and 100×. These are feature multipliers rather
than additional ordinary-symbol match awards.

## Symbol probabilities by reel

Read via `getReel(uint8)` and `getBonusReel(uint8)`, indexes **1–6**, at
block `53060536` (`2026-10-26 09:12:48.0 UTC`, block timestamp).
Base and bonus lengths are 9,000, 8,500, 9,000, 8,500, 9,000 and 9,500
positions respectively. Every ordered strip matched the official frontend
chunk `61104-52e8a447598d8d99.js` checked on the same date.

Each cell below shows **exact count (strip frequency)**. The exact fraction
is `count ⁄ reel length`; percentages are rounded to four decimals.
These are per-symbol probabilities **conditional on uniformly selecting a
position on that reel**. Uniform RNG mapping, independence between reels,
and refill sampling are not proved by a strip getter. They are not the
probability that a symbol appears anywhere in a spin or a cascade.

### Base reels

| ID | Symbol | Reel 1 | Reel 2 | Reel 3 | Reel 4 | Reel 5 | Reel 6 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | Coral | 2,084 (23.1556%) | 1,990 (23.4118%) | 1,998 (22.2000%) | 1,952 (22.9647%) | 2,067 (22.9667%) | 2,193 (23.0842%) |
| 1 | Fish bones / skeleton | 1,540 (17.1111%) | 1,416 (16.6588%) | 1,606 (17.8444%) | 1,482 (17.4353%) | 1,563 (17.3667%) | 1,644 (17.3053%) |
| 2 | Shell | 1,463 (16.2556%) | 1,315 (15.4706%) | 1,396 (15.5111%) | 1,323 (15.5647%) | 1,411 (15.6778%) | 1,439 (15.1474%) |
| 3 | Purple fish / anglerfish | 1,025 (11.3889%) | 932 (10.9647%) | 1,059 (11.7667%) | 962 (11.3176%) | 970 (10.7778%) | 1,116 (11.7474%) |
| 4 | Gold coins | 827 (9.1889%) | 826 (9.7176%) | 840 (9.3333%) | 809 (9.5176%) | 910 (10.1111%) | 927 (9.7579%) |
| 5 | Hook | 666 (7.4000%) | 698 (8.2118%) | 737 (8.1889%) | 667 (7.8471%) | 730 (8.1111%) | 723 (7.6105%) |
| 6 | Anchor | 524 (5.8222%) | 514 (6.0471%) | 529 (5.8778%) | 495 (5.8235%) | 543 (6.0333%) | 532 (5.6000%) |
| 7 | Treasure map | 369 (4.1000%) | 334 (3.9294%) | 343 (3.8111%) | 343 (4.0353%) | 322 (3.5778%) | 398 (4.1895%) |
| 8 | Pirate hat | 294 (3.2667%) | 243 (2.8588%) | 278 (3.0889%) | 247 (2.9059%) | 281 (3.1222%) | 291 (3.0632%) |
| 9 | Scatter chest | 208 (2.3111%) | 232 (2.7294%) | 214 (2.3778%) | 220 (2.5882%) | 203 (2.2556%) | 237 (2.4947%) |
| Total | All symbols | 9,000 (100%) | 8,500 (100%) | 9,000 (100%) | 8,500 (100%) | 9,000 (100%) | 9,500 (100%) |

Bonus multiplier IDs 10–16 are absent from every base strip (0%).

### Bonus reels

| ID | Symbol | Reel 1 | Reel 2 | Reel 3 | Reel 4 | Reel 5 | Reel 6 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | Coral | 1,872 (20.8000%) | 1,781 (20.9529%) | 1,896 (21.0667%) | 1,752 (20.6118%) | 1,875 (20.8333%) | 2,014 (21.2000%) |
| 1 | Fish bones / skeleton | 1,376 (15.2889%) | 1,318 (15.5059%) | 1,394 (15.4889%) | 1,277 (15.0235%) | 1,391 (15.4556%) | 1,465 (15.4211%) |
| 2 | Shell | 1,284 (14.2667%) | 1,090 (12.8235%) | 1,201 (13.3444%) | 1,145 (13.4706%) | 1,188 (13.2000%) | 1,284 (13.5158%) |
| 3 | Purple fish / anglerfish | 942 (10.4667%) | 875 (10.2941%) | 937 (10.4111%) | 890 (10.4706%) | 914 (10.1556%) | 1,012 (10.6526%) |
| 4 | Gold coins | 764 (8.4889%) | 771 (9.0706%) | 835 (9.2778%) | 716 (8.4235%) | 813 (9.0333%) | 846 (8.9053%) |
| 5 | Hook | 613 (6.8111%) | 573 (6.7412%) | 600 (6.6667%) | 634 (7.4588%) | 598 (6.6444%) | 677 (7.1263%) |
| 6 | Anchor | 452 (5.0222%) | 464 (5.4588%) | 443 (4.9222%) | 445 (5.2353%) | 480 (5.3333%) | 478 (5.0316%) |
| 7 | Treasure map | 307 (3.4111%) | 304 (3.5765%) | 300 (3.3333%) | 321 (3.7765%) | 323 (3.5889%) | 314 (3.3053%) |
| 8 | Pirate hat | 252 (2.8000%) | 257 (3.0235%) | 297 (3.3000%) | 231 (2.7176%) | 238 (2.6444%) | 236 (2.4842%) |
| 9 | Scatter chest | 0 (0.0000%) | 0 (0.0000%) | 0 (0.0000%) | 0 (0.0000%) | 0 (0.0000%) | 0 (0.0000%) |
| 10 | Multiplier 2× | 696 (7.7333%) | 638 (7.5059%) | 668 (7.4222%) | 650 (7.6471%) | 704 (7.8222%) | 679 (7.1474%) |
| 11 | Multiplier 3× | 343 (3.8111%) | 311 (3.6588%) | 321 (3.5667%) | 315 (3.7059%) | 355 (3.9444%) | 372 (3.9158%) |
| 12 | Multiplier 5× | 74 (0.8222%) | 95 (1.1176%) | 82 (0.9111%) | 91 (1.0706%) | 98 (1.0889%) | 99 (1.0421%) |
| 13 | Multiplier 10× | 17 (0.1889%) | 11 (0.1294%) | 17 (0.1889%) | 24 (0.2824%) | 14 (0.1556%) | 13 (0.1368%) |
| 14 | Multiplier 25× | 3 (0.0333%) | 7 (0.0824%) | 2 (0.0222%) | 4 (0.0471%) | 7 (0.0778%) | 6 (0.0632%) |
| 15 | Multiplier 50× | 2 (0.0222%) | 4 (0.0471%) | 6 (0.0667%) | 4 (0.0471%) | 0 (0.0000%) | 2 (0.0211%) |
| 16 | Multiplier 100× | 3 (0.0333%) | 1 (0.0118%) | 1 (0.0111%) | 1 (0.0118%) | 2 (0.0222%) | 3 (0.0316%) |
| Total | All symbols | 9,000 (100%) | 8,500 (100%) | 9,000 (100%) | 8,500 (100%) | 9,000 (100%) | 9,500 (100%) |

The same symbol does **not** have the same strip frequency on every reel,
in either mode. For example, base coral is `2084 ⁄ 9000 ≈ 23.1556%` on
reel 1 and `1990 ⁄ 8500 ≈ 23.4118%` on reel 2. Pooling all stops would
weight the longer reels more heavily; it is not a common per-reel law.
The bonus 50× symbol is absent from reel 5, while 100× is present there.
Absence from one strip is not absence from the entire bonus.

## Loss, draw and win probabilities

| Complete paid-spin result | Probability | Bet invariance |
| --- | --- | --- |
| Loss, `R < 1` | Not established | Not established |
| Draw, `R = 1` | Not established | Not established |
| Win, `R > 1` | Not established | Not established |

The strips and award table improve the evidence but do not provide a
verified mapping from RNG through initial offsets, cascade continuation,
bonus entry and bonus evaluation to the final settled payout. Multiplying
single-cell frequencies or treating the 30 cells as IID would replace that
missing model with an assumption. A bonus trigger is not itself a win.

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
| Largest ordinary component award | 50× for 12+ pirate hats |
| Largest individual bonus multiplier | 100× |
| Attainable maximum complete paid-spin/session payout | Not established |
| Probability of that maximum | Not established |

Neither 50× nor 100× is a demonstrated overall payout cap. Adding bonus
multipliers, cascades and free spins requires the full evaluation rules;
no maximum probability can be inferred from the rarest multiplier's strip
frequency. Current house liquidity also does not establish an immutable
mathematical maximum.

## RTP, variance and observed statistics

The previously supplied analytics snapshot reported:

| Metric | Value |
| --- | ---: |
| House Profit | −11,485 APE |
| Running RTP | 100.07% |
| Total Wagered | 16,970,709 APE |
| Total Games Played | 73,051 |

The original observation did not include a pinned block or timestamp.
It is retained as a historical moving statistic, not refreshed by the strip
read, not a theoretical return guarantee and not an installed expected RTP.
It cannot determine loss/draw/win frequencies or variance.

No exact long-run RTP, variance, cascade continuation probability,
bonus-trigger probability or bonus expected value is established. Exact
analysis needs the full stochastic surface and settlement rules; no
simulation-derived estimates are substituted in this note.

## Configuration, commands and costs

The UI table and official rules are the award sources; the full deployed
settlement source remains unverified. No verified `oddsLocked` or equivalent
payout/weight update control has been established. Neither immutability
nor a current exact payout distribution is claimed.

Count mode selects 1–15 paid base spins, default 15, with a total wager of
at least `2.5 APE × paid spins` (37.5 APE at the default). More paid spins
change the required wager and quoted execution fees; free spins and cascades
add outcomes to a paid result. `--spin <APE>` instead selects an exact
paid-spin stake within the amount budget and live limit, wagering only
`min(floor(budget ⁄ spin), 15) × spin`; the remainder stays unspent.

```text
callback gas = 550000 + 200000 × paid spins
transaction value = actual wager + getVRFFee(uint32 callback gas)
                    + EXECUTOR_FEE() × paid spins
```

The zero-argument `getVRFFee()` reverts in the existing live evidence.
Actual transaction gas is separate. Live fees and gas reduce net PnL but
do not enter the gross payout ratio. Normal loop, stop, strategy, retry,
timeout and JSON controls use the shared slots executor. No bonus-buy
option is exposed for Reel Pirates by the CLI.

## Evidence limits and sources

The dated strip counts resolve the earlier absence of symbol-frequency
data; the official frontend supplies display geometry. Neither replaces
verified Solidity or proves RNG expansion/modulo bias, uniform offsets,
correlations, refill order, scatter/retrigger rules, bonus multiplier
application, rounding, clipping, update controls or the maximum outcome.
The game remains outside exact probability and strategy rankings.

To reproduce the frequencies, use ApeChain JSON-RPC
`https://rpc.apechain.com/http` (chain ID 33139), the contract address in the
linked contract note, block `53060536`, and the two getter signatures above
returning `uint8[]`. Count each symbol ID in each returned strip separately,
verify its stated length, and divide by that length. No wallet, signed
transaction or gameplay is needed.

- [Contract interface and verification](../verification/REEL_PIRATES_CONTRACT.md).
- [Official game](https://ape.church/games/reel-pirates), including the dated
  frontend chunk identified above.
- [Official slots rules](https://docs.ape.church/games/player-vs-house/slots-games).
