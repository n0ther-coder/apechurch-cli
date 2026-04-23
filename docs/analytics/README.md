# Exact Analytics Notes

> Summary: Index for compact, exact analytics notes meant to help humans and agents choose variants against hit-rate, tail-risk, and target-payout constraints.

These notes belong under `docs/analytics/` only when the repo already has a defensible exact model and the resulting table stays readable without turning into a raw state dump.

## Available

| Game | File | Why it belongs here |
|------|------|---------------------|
| ApeStrong ✔︎ | [APESTRONG_ANALYTICS.md](./APESTRONG_ANALYTICS.md) | Exact two-outcome surface; best documented as formula plus a compressed all-range table. |
| Roulette ✔︎ | [ROULETTE_ANALYTICS.md](./ROULETTE_ANALYTICS.md) | Every supported single-leg bet class collapses to a compact American-wheel distribution. |
| Baccarat ✔︎ | [BACCARAT_ANALYTICS.md](./BACCARAT_ANALYTICS.md) | Simple lanes are exact; combined tie overlays are captured by a compact parameterized formula. |
| Jungle Plinko ✔︎ | [JUNGLE_PLINKO_ANALYTICS.md](./JUNGLE_PLINKO_ANALYTICS.md) | Weighted-bucket modes produce exact finite payout tables once mirrored buckets are aggregated. |
| Cosmic Plinko ✔︎ | [COSMIC_PLINKO_ANALYTICS.md](./COSMIC_PLINKO_ANALYTICS.md) | Same weighted-bucket structure as Jungle, with only three exact mode surfaces. |
| Keno ✔︎ | [KENO_ANALYTICS.md](./KENO_ANALYTICS.md) | Hypergeometric hit distributions stay readable across all verified pick counts. |
| Speed Keno ✔︎ | [SPEED_KENO_ANALYTICS.md](./SPEED_KENO_ANALYTICS.md) | Smaller hypergeometric state space than Keno, with exact hit-count tables by picks. |
| Monkey Match ✔︎ | [MONKEY_MATCH_ANALYTICS.md](./MONKEY_MATCH_ANALYTICS.md) | Two verified modes and seven multiplicity classes make the full distribution compact. |
| Bear-A-Dice ✔︎ | [BEAR_DICE_ANALYTICS.md](./BEAR_DICE_ANALYTICS.md) | Fully exact `2d6` survival distributions across `5 x 5` verified difficulty/roll variants. |
| Blocks ✔︎ | [BLOCKS_ANALYTICS.md](./BLOCKS_ANALYTICS.md) | Exhaustive `3x3` board enumeration plus consecutive-roll compounding gives exact `Low` / `High` survival matrices through `5` rolls. |
| Primes ✔︎ | [PRIMES_ANALYTICS.md](./PRIMES_ANALYTICS.md) | Each difficulty has only three exact outcome classes: zero, prime, or dead run. |
| Geez Diggerz ✔︎ | [GEEZ_DIGGERZ_ANALYTICS.md](./GEEZ_DIGGERZ_ANALYTICS.md) | The full live ordered-triple matrix compresses cleanly to `16` payout rows after the symmetric reel snapshot. |
| Gimboz Smash ✔︎ | [GIMBOZ_SMASH_ANALYTICS.md](./GIMBOZ_SMASH_ANALYTICS.md) | Exact one-or-two interval play collapses to a compact cover-count table because interval placement does not change EV. |
| Hi-Lo Nebula ✔︎ | [HI_LO_NEBULA_ANALYTICS.md](./HI_LO_NEBULA_ANALYTICS.md) | The verified rank-only paytable collapses to a compact per-rank branch table with exact hit rates and branch EV. |
| Sushi Showdown ✔︎ | [SUSHI_SHOWDOWN_ANALYTICS.md](./SUSHI_SHOWDOWN_ANALYTICS.md) | The full live ordered-triple matrix still stays readable as a `45`-row exact per-spin distribution. |
| Reel Pirates | [REEL_PIRATES_ANALYTICS.md](./REEL_PIRATES_ANALYTICS.md) | Public mechanics and observed running statistics are useful, but exact odds are intentionally not claimed. |

## Possible, But Only With Extra Snapshotting

| Game | Blocker |
|------|---------|
| Dino Dough ✔︎ | Exact per-spin distribution is possible, but the full live ordered-triple paytable is not persisted in the repo today; before publishing a full analytics note we should snapshot the whole matrix, not just selected rows. |
| Bubblegum Heist ✔︎ | Same issue as Dino Dough: exact, but the full mutable live matrix should be snapshotted first. |
| Video Poker ✔︎ | Exact final-hand odds are documentable, but a truly decision-useful document for pre-draw play depends on strategy and becomes a different artifact than a single payout matrix. |

## Not A Good Fit Yet

| Game | Reason |
|------|--------|
| Blackjack ✔︎ | The main hand is still modeled statistically in this repo, not proven with a closed-form exact distribution. Side bets could get their own note later, but not a single "full game" analytics note. |

## Selection Rule

Prefer this folder for games where:

- the repo already stores the exact payout surface or a reproducible closed-form formula;
- the number of materially distinct outcome rows is small enough to read in Markdown;
- the document helps choose a configuration, not just restate RTP.
