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

## Sources

1. [docs/verification/HI_LO_NEBULA_CONTRACT.md](../verification/HI_LO_NEBULA_CONTRACT.md) — verified write path, draw model, getters, and paytable.
2. [lib/stateful/hi-lo-nebula/constants.js](../../lib/stateful/hi-lo-nebula/constants.js) — local hard-coded multiplier table derived from the verified contract.

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
