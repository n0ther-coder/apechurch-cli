# Exact Odds Tables

> Summary: Index for compact, exact probability and payout docs meant to help humans and agents choose variants against hit-rate, tail-risk, and target-payout constraints.

These notes belong under `docs/odds/` only when the repo already has a defensible exact model and the resulting table stays readable without turning into a raw state dump.

## Available

| Game | File | Why it belongs here |
|------|------|---------------------|
| ApeStrong ✔︎ | [APESTRONG_ODDS_PAYOUTS.md](./APESTRONG_ODDS_PAYOUTS.md) | Exact two-outcome surface; best documented as formula plus a compressed all-range table. |
| Roulette ✔︎ | [ROULETTE_ODDS_PAYOUTS.md](./ROULETTE_ODDS_PAYOUTS.md) | Every supported single-leg bet class collapses to a compact American-wheel distribution. |
| Baccarat ✔︎ | [BACCARAT_ODDS_PAYOUTS.md](./BACCARAT_ODDS_PAYOUTS.md) | Simple lanes are exact; combined tie overlays are captured by a compact parameterized formula. |
| Jungle Plinko ✔︎ | [JUNGLE_PLINKO_ODDS_PAYOUTS.md](./JUNGLE_PLINKO_ODDS_PAYOUTS.md) | Weighted-bucket modes produce exact finite payout tables once mirrored buckets are aggregated. |
| Cosmic Plinko ✔︎ | [COSMIC_PLINKO_ODDS_PAYOUTS.md](./COSMIC_PLINKO_ODDS_PAYOUTS.md) | Same weighted-bucket structure as Jungle, with only three exact mode surfaces. |
| Keno ✔︎ | [KENO_ODDS_PAYOUTS.md](./KENO_ODDS_PAYOUTS.md) | Hypergeometric hit distributions stay readable across all verified pick counts. |
| Speed Keno ✔︎ | [SPEED_KENO_ODDS_PAYOUTS.md](./SPEED_KENO_ODDS_PAYOUTS.md) | Smaller hypergeometric state space than Keno, with exact hit-count tables by picks. |
| Monkey Match ✔︎ | [MONKEY_MATCH_ODDS_PAYOUTS.md](./MONKEY_MATCH_ODDS_PAYOUTS.md) | Two verified modes and seven multiplicity classes make the full distribution compact. |
| Bear-A-Dice ✔︎ | [BEAR_DICE_ODDS_PAYOUTS.md](./BEAR_DICE_ODDS_PAYOUTS.md) | Fully exact `2d6` survival distributions across `5 x 5` verified difficulty/roll variants. |
| Blocks ✔︎ | [BLOCKS_ODDS_PAYOUTS.md](./BLOCKS_ODDS_PAYOUTS.md) | The published cluster table collapses the whole 3x3 board game to seven paying outcome classes per mode. |
| Primes ✔︎ | [PRIMES_ODDS_PAYOUTS.md](./PRIMES_ODDS_PAYOUTS.md) | Each difficulty has only three exact outcome classes: zero, prime, or dead run. |

## Possible, But Only With Extra Snapshotting

| Game | Blocker |
|------|---------|
| Dino Dough ✔︎ | Exact per-spin distribution is possible, but the full live ordered-triple paytable is not persisted in the repo today; before publishing a full odds doc we should snapshot the whole matrix, not just selected rows. |
| Bubblegum Heist ✔︎ | Same issue as Dino Dough: exact, but the full mutable live matrix should be snapshotted first. |
| Video Poker ✔︎ | Exact final-hand odds are documentable, but a truly decision-useful document for pre-draw play depends on strategy and becomes a different artifact than a single payout matrix. |

## Not A Good Fit Yet

| Game | Reason |
|------|--------|
| Blackjack ✔︎ | The main hand is still modeled statistically in this repo, not proven with a closed-form exact distribution. Side bets could get their own note later, but not a single "full game" odds table. |

## Selection Rule

Prefer this folder for games where:

- the repo already stores the exact payout surface or a reproducible closed-form formula;
- the number of materially distinct outcome rows is small enough to read in Markdown;
- the document helps choose a configuration, not just restate RTP.
