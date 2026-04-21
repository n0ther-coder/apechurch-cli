# The House Reference

> Summary: User-facing note for The House mechanics, the meaning of the CLI's current `House Yield` field, and a planning-grade gross APY model that does not confuse cumulative price appreciation with annualized return.

## What The CLI Reports Today

`apechurch-cli house` reads the current HOUSE token price via `calculatePrice()` and prints:

- total House liquidity;
- current max payout;
- your staked balance and lifetime profit/loss, when a wallet is available;
- `House Yield` as the current HOUSE price multiplier and percentage gain/loss `since launch`.

That `House Yield` figure is cumulative HOUSE token price appreciation since inception. It is **not** an annualized APY.

## In Plain Terms

The easiest way to think about The House is:

- the pool holds APE;
- LPs hold `HOUSE` tokens;
- `HOUSE` tokens represent a share of that pool;
- the value of your position is `your HOUSE balance x current HOUSE price`.

This means you do **not** receive a little payout transfer every time a player loses, and you are not charged a little invoice every time a player wins.

Instead, all player results flow into the shared pool:

- if players lose, APE stays in or flows into the pool, so the HOUSE token price goes up;
- if players win, APE leaves the pool, so the HOUSE token price goes down.

So the gain or loss is socialized across all LPs through the token price.

### What Happens When Other LPs Deposit Or Withdraw

Other LPs do not directly "take" your profit or "push" their loss onto you in the same way player outcomes do.

- when someone deposits, they add APE and receive new `HOUSE` tokens at the current price;
- when someone withdraws, they burn `HOUSE` tokens and take out APE at the current price;
- that changes the total pool size and the total `HOUSE` supply;
- it can change your **percentage ownership** of the pool;
- but by itself it should not change the APE value of your position if minting and burning happen at the fair current price.

So in simple terms:

- **player wins/losses** change the value of everyone's position pro rata;
- **other LP deposits/withdrawals** mainly change who owns what fraction of the pool, not the fair value per share.

### Tiny Example

- Pool: `1,000 APE`
- HOUSE supply: `1,000 HOUSE`
- HOUSE price: `1.00 APE`
- Your balance: `100 HOUSE`
- Your position value: `100 APE`

If players lose `30 APE` overall:

- pool becomes `1,030 APE`;
- supply stays `1,000 HOUSE`;
- HOUSE price becomes `1.03 APE`;
- your `100 HOUSE` becomes worth `103 APE`.

If instead another LP deposits `100 APE` at the fair current price:

- pool increases;
- new `HOUSE` tokens are minted to that LP;
- your ownership percentage becomes a bit smaller;
- but your own `100 HOUSE` should still be worth the same APE amount immediately after that deposit, aside from rounding or fee details.

The same logic applies in reverse to another LP withdrawing at the fair current price.

### Important Caveat

There is still a `2%` withdrawal fee. The repo currently describes that fee as protocol revenue, so this note does **not** assume that other users' exit fees are automatically redistributed to remaining LPs unless the contract source is verified to do exactly that.

## Working APY Model

For planning and scenario analysis, this repo uses a **working long-run blended house-edge assumption of `3%`**.

Treat that `3%` as an operator-friendly midpoint, not as a protocol guarantee or a mathematically proven global constant for every future period.

### Why `3%` Is A Reasonable Central Assumption

- Many supported exact RTP surfaces cluster around roughly `97% - 98%`, which implies a `2% - 3%` house edge.
- `Roulette ✔︎` is documented at `97.11%` RTP, i.e. `2.89%` edge.
- `Baccarat ✔︎` on `BANKER` is documented at `98.94%` RTP, i.e. `1.06%` edge.
- Several lower-RTP modes such as Keno variants and high-edge specialty modes pull a blended long-run average upward.
- This is **not** a simple arithmetic average of every table row in `docs/GAMES_REFERENCE.md`; it is a practical whole-platform planning assumption for House-backed flow.

Two caveats matter:

- `Blackjack ✔︎` main-only is still modeled statistically in this repo rather than as one fully closed-form long-run house edge.
- `Hi-Lo Nebula ✔︎` is policy-dependent because the player can stop after any successful guess and the jackpot pool is live.

For that reason, `3%` should be treated as a planning baseline, with `2%` and `5%` as useful sensitivity bounds.

## Gross Return Formula

Use the following approximation for gross expected annual return on House liquidity:

```text
house_edge = 1 - RTP
turnover = annual eligible wager volume / average house liquidity
expected gross annual return ~= turnover x blended_house_edge
```

Under the repo's central planning assumption:

```text
expected gross annual return ~= turnover x 3%
```

Example:

- if annual eligible wager volume is `1,000,000 APE`;
- and average House liquidity over the same period is `100,000 APE`;
- then turnover is `10x`;
- at a `3%` blended edge, expected gross annual return is about `30%`.

## Sensitivity Table

| Annual Wager Turnover vs Average House Liquidity | Gross Return @ `2%` Edge | Gross Return @ `3%` Edge | Gross Return @ `5%` Edge |
|------|------|------|------|
| `5x` | `10%` | `15%` | `25%` |
| `10x` | `20%` | `30%` | `50%` |
| `20x` | `40%` | `60%` | `100%` |

This table is intentionally simple. It is meant for planning conversations, not for promising realized returns.

## What This Model Does Not Include

- short-term or medium-term variance from lucky or unlucky player samples;
- changes in the House liquidity base during the year;
- any separate LP incentives, rebates, or external token rewards;
- net-of-exit accounting for users who actually pay the `2%` withdrawal fee on exit;
- the idea that the displayed `House Yield` field itself is already annualized.

In particular, the CLI help currently labels the `2%` withdrawal fee as `protocol revenue`, so this note does **not** count that fee as LP yield by default.

## Practical Interpretation

- `House Yield` in the CLI is a cumulative price-based performance snapshot since launch.
- `Potential APY` should be discussed separately as a modeled gross annual return derived from turnover and a blended house-edge assumption.
- When the repo needs one central assumption for docs or planning, `3%` is the preferred baseline and `2% / 3% / 5%` is the preferred sensitivity range.

## Source Pointers

- [docs/COMMAND_REFERENCE.md](./COMMAND_REFERENCE.md) - canonical syntax for `house [action] [amount]`
- [docs/GAMES_REFERENCE.md](./GAMES_REFERENCE.md) - per-game RTP references that motivate the blended-edge range
- [README.md](../README.md) - top-level project overview
