# Hi-Lo Nebula Odds and Payouts

> Summary: Exact per-guess branch probabilities and payout multipliers for the verified rank-only Hi-Lo Nebula contract surface.

This note summarizes the exact **single-guess** branch odds for **Hi-Lo Nebula** as implemented by the verified contract.

It does **not** try to collapse the whole game to one fixed RTP number, because the player can stop after any successful guess and the jackpot pool is live. What is exact here is the per-step branch surface.

## Verified Model

The contract samples the next card rank uniformly from:

- `2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A`

with:

- **rank-only outcomes**
- **replacement after every reveal**

thus:

- **there is no suit information**
- **and no finite-deck depletion**

So the exact hit rates are:

- `P(Higher | rank r) = (14 - r) / 13`
- `P(Lower | rank r) = (r - 2) / 13`
- `P(Same | rank r) = 1 / 13`

## How To Read The Table

- **Hit Rate** is the exact probability that a single chosen branch wins from the current rank.
- **Gross Payout** is the contract multiplier applied to the current bet / current cash-out basis.
- **Branch EV** is the exact expected gross return for one guess on that branch before any later cash-out choice:
  - `Branch EV = Hit Rate x Gross Payout`
- Jackpot uplift is excluded from the table below, because it depends on streak depth and the live jackpot getter.

## Exact Branch Surface

| Current Rank | Branch | Hit Rate | Gross Payout | Branch EV |
|-------------|--------|----------|--------------|-----------|
| `2` | Higher | `12/13 = 92.31%` | `1.0600x` | `97.85%` |
| `2` | Same | `1/13 = 7.69%` | `12.5000x` | `96.15%` |
| `3` | Higher | `11/13 = 84.62%` | `1.1363x` | `96.15%` |
| `3` | Lower | `1/13 = 7.69%` | `12.5000x` | `96.15%` |
| `3` | Same | `1/13 = 7.69%` | `12.5000x` | `96.15%` |
| `4` | Higher | `10/13 = 76.92%` | `1.2500x` | `96.15%` |
| `4` | Lower | `2/13 = 15.38%` | `6.2500x` | `96.15%` |
| `4` | Same | `1/13 = 7.69%` | `12.5000x` | `96.15%` |
| `5` | Higher | `9/13 = 69.23%` | `1.3888x` | `96.15%` |
| `5` | Lower | `3/13 = 23.08%` | `4.1666x` | `96.15%` |
| `5` | Same | `1/13 = 7.69%` | `12.5000x` | `96.15%` |
| `6` | Higher | `8/13 = 61.54%` | `1.5625x` | `96.15%` |
| `6` | Lower | `4/13 = 30.77%` | `3.1250x` | `96.15%` |
| `6` | Same | `1/13 = 7.69%` | `12.5000x` | `96.15%` |
| `7` | Higher | `7/13 = 53.85%` | `1.7857x` | `96.15%` |
| `7` | Lower | `5/13 = 38.46%` | `2.5000x` | `96.15%` |
| `7` | Same | `1/13 = 7.69%` | `12.5000x` | `96.15%` |
| `8` | Higher | `6/13 = 46.15%` | `2.0833x` | `96.15%` |
| `8` | Lower | `6/13 = 46.15%` | `2.0833x` | `96.15%` |
| `8` | Same | `1/13 = 7.69%` | `12.5000x` | `96.15%` |
| `9` | Higher | `5/13 = 38.46%` | `2.5000x` | `96.15%` |
| `9` | Lower | `7/13 = 53.85%` | `1.7857x` | `96.15%` |
| `9` | Same | `1/13 = 7.69%` | `12.5000x` | `96.15%` |
| `10` | Higher | `4/13 = 30.77%` | `3.1250x` | `96.15%` |
| `10` | Lower | `8/13 = 61.54%` | `1.5625x` | `96.15%` |
| `10` | Same | `1/13 = 7.69%` | `12.5000x` | `96.15%` |
| `J` | Higher | `3/13 = 23.08%` | `4.1666x` | `96.15%` |
| `J` | Lower | `9/13 = 69.23%` | `1.3888x` | `96.15%` |
| `J` | Same | `1/13 = 7.69%` | `12.5000x` | `96.15%` |
| `Q` | Higher | `2/13 = 15.38%` | `6.2500x` | `96.15%` |
| `Q` | Lower | `10/13 = 76.92%` | `1.2500x` | `96.15%` |
| `Q` | Same | `1/13 = 7.69%` | `12.5000x` | `96.15%` |
| `K` | Higher | `1/13 = 7.69%` | `12.5000x` | `96.15%` |
| `K` | Lower | `11/13 = 84.62%` | `1.1363x` | `96.15%` |
| `K` | Same | `1/13 = 7.69%` | `12.5000x` | `96.15%` |
| `A` | Lower | `12/13 = 92.31%` | `1.0600x` | `97.85%` |
| `A` | Same | `1/13 = 7.69%` | `12.5000x` | `96.15%` |

## Interpretation

- `8` is the symmetric midpoint: `Higher` and `Lower` are exactly the same branch.
- `Same` is always the long-shot `12.5x` branch with exact hit rate `1/13`.
- The safest edge branches are `2 -> Higher` and `A -> Lower`; those are the only listed branches above `96.15%` because `12` of `13` ranks win.
- Once a guess wins, the player may still stop or continue, so whole-run EV is a separate policy question from the one-step branch EV listed here.

## Variance

Variance is computed over `X = payout / current stake basis` for one guess. The one-step branch has only two outcomes: the branch multiplier on a hit and `0x` on a miss.

```text
p = successfulRanks / 13
m = branch payout bps / 10_000
Var(X) = p * m^2 - (p * m)^2
```

The table is grouped by exact hit count because any `Higher`, `Lower`, or `Same` branch with the same hit count and payout bps has the same variance. Whole-run variance remains policy-dependent because the player can cash out after any successful guess.

| Hit count | Gross payout | Branch EV | Variance | Std. Dev. |
|----------:|-------------:|----------:|---------:|----------:|
| `12/13` | `1.0600x` | `97.8462%` | `0.079782` | `0.282458` |
| `11/13` | `1.1363x` | `96.1485%` | `0.168082` | `0.409978` |
| `10/13` | `1.2500x` | `96.1538%` | `0.277367` | `0.526656` |
| `9/13` | `1.3888x` | `96.1477%` | `0.410861` | `0.640985` |
| `8/13` | `1.5625x` | `96.1538%` | `0.577848` | `0.760163` |
| `7/13` | `1.7857x` | `96.1531%` | `0.792464` | `0.890205` |
| `6/13` | `2.0833x` | `96.1523%` | `1.078614` | `1.038564` |
| `5/13` | `2.5000x` | `96.1538%` | `1.479290` | `1.216261` |
| `4/13` | `3.1250x` | `96.1538%` | `2.080251` | `1.442308` |
| `3/13` | `4.1666x` | `96.1523%` | `3.081755` | `1.755493` |
| `2/13` | `6.2500x` | `96.1538%` | `5.085059` | `2.255008` |
| `1/13` | `12.5000x` | `96.1538%` | `11.094675` | `3.330867` |

## Winston Ladder Auto Solver

`winston-ladder` is a Hi-Lo Nebula auto-play mode designed around a two-game target ladder. It is selected with:

```bash
apechurch-cli hi-lo-nebula <amount> --auto winston-ladder
apechurch-cli play hi-lo-nebula <amount> --auto winston-ladder
```

For manual play, the same policy can be used as a suggestion engine:

```bash
apechurch-cli hi-lo-nebula <amount> --solver winston-ladder
```

Let `A` be the initial bet amount for one on-chain game. The ladder:

- plays at most `2` on-chain Hi-Lo Nebula games
- uses the same initial bet `A` for the second game when it is needed
- plays at most `7` guesses per game
- ignores VRF fees for the ladder target
- opens the first game with the highest immediate hit-rate branch
- cashes out the first game once payout is at least `1.5A`
- if the first game ends below `1.5A`, starts a second game when bankroll and loop safety controls allow it
- targets total payout of at least `2.5A` across both games when a second game is played

After a first-game cashout below `1.5A`, the solver compares two chances:

- continuing the current game toward the `1.5A` first-game target
- banking the current payout and trying to reach the remaining ladder target in the second game

The policy chooses the branch with the higher exact probability of reaching the target within the `7`-guess cap.

### Winston Ladder Distribution

The table below is computed from the verified rank-only model and the local `winston-ladder` policy. It excludes VRF fees. Net result bins are expressed in units of `A`, using the actual games played by the ladder.

| Outcome bucket | Probability |
|----------------|-------------|
| Total loss (`-2A`) | `25.6254%` |
| `-2A < P&L < -A` | `0.0000%` |
| `-A <= P&L < 0` | `11.3309%` |
| `0 < win < A` | `50.0477%` |
| `A <= win < 1.5A` | `11.3878%` |
| `win > 1.5A` | `1.6082%` |
| RTP on expected actual wagers | `94.2069%` |

Supporting figures:

- Probability of playing the second game: `64.2476%`
- Expected games per ladder run: `1.6425`
- Expected payout per initial bet `A`: `1.5473A`
- Expected actual wager per ladder run: `1.6425A`
- RTP normalized to a fixed `2A` budget: `77.3663%`

## Sources

1. [docs/verification/HI_LO_NEBULA_CONTRACT.md](../verification/HI_LO_NEBULA_CONTRACT.md) — verified write path, draw model, getters, and paytable.
2. [lib/stateful/hi-lo-nebula/constants.js](../../lib/stateful/hi-lo-nebula/constants.js) — local hard-coded multiplier table derived from the verified contract.
3. [lib/stateful/hi-lo-nebula/strategy.js](../../lib/stateful/hi-lo-nebula/strategy.js) — `simple`, `best`, and `winston-ladder` auto-play policies.

## FAQ

### Can the website show the exact same card twice, including the same suit?

Yes.

There are two different cases:

- **Two different draws in one run.** On-chain, the next outcome is only a rank and is sampled uniformly from `13` values with replacement. On the website, the visible suit is then added separately by the frontend from `4` cosmetic suits. So the displayed card behaves like one random draw from `52` rank/suit combinations, and the chance that the next displayed card is exactly identical to the current displayed card is:
  - `1/13 * 1/4 = 1/52 = 1.9231%`
- **The same on-chain draw reconstructed again by the frontend.** The rank stays fixed, but the visible suit is assigned again by the UI layer. In that case, the chance that the same draw is shown again with the same suit is:
  - `1/4 = 25%`

So the important distinction is:

- the rank is part of the verified game state
- the suit is only visual decoration on the website
- the visible suit is not part of the on-chain outcome and is not independently verifiable
