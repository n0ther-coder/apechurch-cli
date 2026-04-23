# Games Reference

> Summary: Comparison-first guide for every supported game, plus a compact appendix for public Ape Church games not yet exposed by this CLI. Keeps syntax and high-signal RTP/volatility notes in one place, while deeper mechanics and verification trails live under `docs/verification/`.

Compact syntax and comparison notes for all Ape Church CLI games.

Treat published running RTP values as observed snapshots, not guaranteed long-run returns. For ABI-backed tuple layouts, payout matrices, and maintainer-facing verification evidence, follow the per-game links in `docs/verification/`. For compact exact outcome distributions meant to help choose variants, see [docs/analytics/README.md](./analytics/README.md).

The `✔︎` marker means this repo has locally verified the game's ABI-facing behavior against verified on-chain contract data. Supported games without the symbol are still playable in the CLI, but they have not yet been promoted to `ABI verified`; see [ABI_VERIFICATION.md](./ABI_VERIFICATION.md) for the maintainer checklist.

---

## Quick Reference

Ordering: alphabetical by game title.

| Game | Positional Syntax | Flag Syntax | Aliases |
|------|------------------|-------------|---------|
| ApeStrong ✔︎ | `play ape-strong <amt> <range>` | `--game ape-strong --amount X --range Y` | `apestrong`, `strong` |
| Baccarat ✔︎ | `play baccarat <amt> <bet>` | `--game baccarat --amount X --bet Y` | - |
| Bear-A-Dice ✔︎ | `play bear-dice <amt>` | `--game bear-dice --amount X --risk Y --rolls Z` | `bear`, `dice` |
| Blackjack ✔︎ | `blackjack <amt>` | `blackjack <amt> --side X --auto best` | `bj` |
| Blocks ✔︎ | `play blocks <amt> <risk> <runs>` | `--game blocks --amount X --risk Y --runs Z` | - |
| Bubblegum Heist ✔︎ | `play bubblegum-heist <amt> <spins>` | `--game bubblegum-heist --amount X --spins Y` | `bubblegumheist`, `bubblegum`, `heist` |
| Cosmic Plinko ✔︎ | `play cosmic-plinko <amt> <risk> <balls>` | `--game cosmic-plinko --amount X --risk Y --balls Z` | `cosmic` |
| Dino Dough ✔︎ | `play dino-dough <amt> <spins>` | `--game dino-dough --amount X --spins Y` | `dinodough`, `dino` |
| Geez Diggerz ✔︎ | `play geez-diggerz <amt> <spins>` | `--game geez-diggerz --amount X --spins Y` | `geezdiggerz`, `geez` |
| Gimboz Smash ✔︎ | `play gimboz-smash <amt> <range>` | `--game gimboz-smash --amount X --range Y` | `gimbozsmash`, `smash` |
| Hi-Lo Nebula ✔︎ | `hi-lo-nebula <amt>` | `hi-lo-nebula <amt> --auto best --loop` | `hilonebula`, `hilo` |
| Jungle Plinko ✔︎ | `play jungle-plinko <amt> <risk> <balls>` | `--game jungle-plinko --amount X --risk Y --balls Z` | `jungleplinko`, `jungle` |
| Keno ✔︎ | `play keno <amt>` | `--game keno --amount X --picks Y --numbers Z` | - |
| Monkey Match ✔︎ | `play monkey-match <amt>` | `--game monkey-match --amount X --risk Y` | `monkeymatch`, `monkey` |
| Primes ✔︎ | `play primes <amt> <risk> <runs>` | `--game primes --amount X --risk Y --runs Z` | - |
| Reel Pirates | `play reel-pirates <amt> <spins>` | `--game reel-pirates --amount X --spins Y` | `reelpirates`, `pirates`, `reel` |
| Roulette ✔︎ | `play roulette <amt> <bet>` | `--game roulette --amount X --bet Y` | - |
| Speed Keno ✔︎ | `play speed-keno <amt>` | `--game speed-keno --amount X --picks Y --games Z` | `speedkeno`, `skeno` |
| Sushi Showdown ✔︎ | `play sushi-showdown <amt> <spins>` | `--game sushi-showdown --amount X --spins Y` | `sushishowdown`, `sushi` |
| Video Poker ✔︎ / Gimboz Poker | `video-poker <amt>` | `video-poker <amt> --auto best` | `vp` |

## Grammar Conventions

This reference uses compact BNF with semantic constraints in comments:

```bnf
<ape> ::= <number>                 ; decimal APE amount; value > 0
<integer> ::= ...                  ; base-10 integer token parsed by the CLI
```

For list-like arguments such as `--numbers`, the entire value must be one CLI token:

```bash
apechurch-cli play keno 10 --numbers 1,7,13,25,40
```

Not:

```bash
apechurch-cli play keno 10 --numbers 1 7 13 25 40
```

---

## Fee Conventions

- `wager` in this guide means the intended buy-in, not necessarily the full `tx.value` sent on-chain.
- Many games add a separate VRF / RNG fee on top of the wager; the CLI auto-reads and adds that amount for you.
- Some games also apply percentage fees to the post-VRF buy-in, or bake their commission into the payout table instead of charging a second explicit tx surcharge.

---

## Accepted Wagers

For simple `play` games, the CLI accepts any positive APE amount that can be parsed and funded by the current wallet. There is no shared fixed-denomination whitelist for those games. In loop mode, the built-in strategy presets still default to a `1 APE` floor unless you override strategy settings. The main exceptions are `video-poker`, which is fixed-denomination, and `blackjack`, which separates the main bet from optional side exposure.

Ordering: alphabetical by game title.

| Game | Accepted Main Bet | Min / Floor | Max / Cap | Fee Model | Notes |
|------|-------------------|-------------|-----------|------------|-------|
| ApeStrong ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Static VRF + live `2.2%` platform fee | Single total wager |
| Baccarat ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Static VRF; `BANKER` commission is baked into the `1.95x` payout | In combined bets, explicit sub-amounts must sum to the total wager |
| Bear-A-Dice ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | VRF scales with rolls + `2%` platform fee | Single total wager; volatility comes from risk and rolls |
| Blackjack ✔︎ | Any positive APE main bet | Main bet must be `> 0`; `--side` must be `>= 0` | No explicit CLI max besides wallet balance and `--max-bet` in loop mode | Action-based VRF; `double` / `split` / `insurance` are extra stakes, not fees | `double` and `split` each add another initial-bet-sized stake; `insurance` costs half the initial bet |
| Blocks ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | VRF scales with runs | Single total wager across `1-5` consecutive rolls; any dead roll zeroes the whole game |
| Bubblegum Heist ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Static VRF + `2%` platform fee | Total wager is split across `1-15` spins |
| Cosmic Plinko ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Static VRF | Total wager is split across `1-30` balls |
| Dino Dough ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Static VRF + `2%` platform fee | Total wager is split across `1-15` spins |
| Geez Diggerz ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Static VRF + `2%` platform fee | Total wager is split across `1-15` spins |
| Gimboz Smash ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Static VRF | Single total wager across one or two inclusive target intervals; total covered numbers must stay within `1-95` |
| Hi-Lo Nebula ✔︎ | Any positive APE amount | CLI accepts `> 0` | No explicit CLI max besides wallet balance and contract-side liquidity constraints | VRF on start and each guess + `2.5%` platform + `0.5%` jackpot fee | `cashOut()` is non-payable |
| Jungle Plinko ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | VRF scales with balls | Total wager is split across `1-100` balls |
| Keno ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Static VRF | Single total wager |
| Monkey Match ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Static VRF + live `2%` platform fee | Single total wager |
| Primes ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | VRF scales with runs + live `2%` platform fee | Total wager is split across `1-20` runs |
| Reel Pirates | At least `2.5 APE` per spin | `total wager >= spins * 2.5 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | VRF scales with paid base spins + `EXECUTOR_FEE()` per spin | Total wager is split across `1-15` base spins |
| Roulette ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Static live RNG fee; house edge is in the payout multipliers | Total wager is split evenly across comma-separated bets |
| Speed Keno ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | VRF scales with batched games | Total wager is split across `1-20` batched games |
| Sushi Showdown ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Static VRF + `2%` platform fee | Total wager is split across `1-15` spins |
| Video Poker ✔︎ / Gimboz Poker | Fixed denominations only | Fixed list: `1`, `5`, `10`, `25`, `50`, `100 APE` | Fixed max `100 APE` | Separate start / redraw VRF; stand-pat redraw is free | Loop mode rounds to the closest affordable valid denomination; jackpot eligibility requires `100 APE` |

---

Ordering for supported game sections below: alphabetical by game title.

## ApeStrong ✔︎

**Type:** Dice / Limbo
**Contract:** `0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600`
**Aliases:** `apestrong`, `strong`
**ABI verified:** `true`
**Verification notes:** [APESTRONG_CONTRACT.md](./verification/APESTRONG_CONTRACT.md)
**Analytics:** [APESTRONG_ANALYTICS.md](./analytics/APESTRONG_ANALYTICS.md)

Range-based one-word VRF game. You choose a win probability `5-95`; the contract wins on `winningNumber < range` and settles from a live payout table rather than a closed-form multiplier.

**Command:** `apechurch-cli play ape-strong <amount> <range>`

```bnf
<amount> ::= <ape>
<range> ::= <integer>              ; 5 <= value <= 95
```

**Compare:**
- Exact RTP: `97.38% - 97.50%` across the supported range surface.
- Max supported multiplier: `19.5x` at `range 5`.
- Operational note: `range 50` is the clean coin-flip baseline; `range 75` and `95` are slightly below the usual `97.5 / range` table due to live payout exceptions.
- ApeStrong and Gimboz Smash are not identical across the whole shared surface: at `75`, ApeStrong is `1.2999x` / `97.4925%` RTP vs. Gimboz Smash `1.3x` / `97.5000%`; at `95`, ApeStrong is `1.025x` / `97.3750%` vs. Gimboz Smash `1.0263x` / `97.4985%`.

## Baccarat ✔︎

**Type:** Table
**Contract:** `0xB08C669dc0419151bA4e4920E80128802dB5497b`
**ABI verified:** `true`
**Verification notes:** [BACCARAT_CONTRACT.md](./verification/BACCARAT_CONTRACT.md)
**Analytics:** [BACCARAT_ANALYTICS.md](./analytics/BACCARAT_ANALYTICS.md)

Classic baccarat with contract-backed combined bets. You can play `PLAYER`, `BANKER`, or `TIE`, or combine one main side with an explicit `TIE` leg; `PLAYER` and `BANKER` together are not valid on-chain.

**Command:** `apechurch-cli play baccarat <amount> <bet>`

```bnf
<amount> ::= <ape>
<bet> ::= "PLAYER" | "BANKER" | "TIE" | <combo-bet>
<combo-bet> ::= <ape> <side-bet> <ape> "TIE"
<side-bet> ::= "PLAYER" | "BANKER"
```

**Compare:**
- Exact RTP: **`98.94%`** on `BANKER`, **`98.77%`** on `PLAYER`, `85.88%` on `TIE`.
- Max payout: `9x` on `TIE`.
- Operational note: `BANKER` remains the best-EV simple bet; combo-bet RTP is just the wager-weighted average of the chosen legs.

## Bear-A-Dice ✔︎

**Type:** Dice
**Contract:** `0x6a48A513A46955D8622C809Fce876d2f11142003`
**Aliases:** `bear`, `dice`
**ABI verified:** `true`
**Verification notes:** [BEAR_DICE_CONTRACT.md](./verification/BEAR_DICE_CONTRACT.md)
**Analytics:** [BEAR_DICE_ANALYTICS.md](./analytics/BEAR_DICE_ANALYTICS.md)

All-or-nothing compounded `2d6` survival game. You pick a risk level and `1-5` rolls; every safe sum compounds the payout, and the first losing sum zeroes the whole run.

**Command:** `apechurch-cli play bear-dice <amount> [--risk <0-4|Easy|Medium|Hard|Expert|Master>] [--rolls <1-5>]`

```bnf
<amount> ::= <ape>
<risk> ::= <integer> | "Easy" | "Medium" | "Hard" | "Expert" | "Master"  ; 0 <= value <= 4
<rolls> ::= <integer>              ; 1 <= value <= 5
```

**Compare:**
- Exact RTP surface: `97.25% - 97.94%` depending on risk and roll count.
- Max payout: from `1.830x` on Easy / 1 roll up to `1,847,949.193x` on Master / 5 rolls.
- Operational note: there is no cash-out path; higher rolls only buy tail risk.

## Blackjack ✔︎

**Type:** Cards
**Contract:** `0x03AC9d823cCc27df9F0981FD3975Ca6F13067Ed7`
**Aliases:** `bj`
**ABI verified:** `true`
**Verification notes:** [BLACKJACK_CONTRACT.md](./verification/BLACKJACK_CONTRACT.md)

Stateful blackjack with interactive actions, optional player-side exposure, and `--auto` support. This repo's promoted surface is based on the public production ABI, not an explorer-verified Solidity source. See [SKILL.md](../SKILL.md#blackjack-) for the user-facing action flow.

**Command:** `apechurch-cli blackjack <amount> [--side <ape>] [--auto [simple|best]]`

```bnf
<amount> ::= <ape>
<side> ::= <number>                ; decimal APE amount; value >= 0
<auto-mode> ::= "simple" | "best"
```

**Compare:**
- RTP references used by the repo: **`100.05%`** main-only model, `79.88%` player-side only, `82.02%` dealer-side only.
- Core payouts: natural blackjack `2.5x`, normal win `2.0x`, surrender refund `0.5x`.
- Operational note: the main game remains a statistical model; the note file now holds the full action-cost and state-layout trail.

## Blocks ✔︎

**Type:** Board / VRF
**Contract:** `0xA59CF828222EcD8aCe4b6195764d11F5Ea7f62A6`
**ABI verified:** `true`
**Verification notes:** [BLOCKS_CONTRACT.md](./verification/BLOCKS_CONTRACT.md)
**Analytics:** [BLOCKS_ANALYTICS.md](./analytics/BLOCKS_ANALYTICS.md)

Consecutive-roll `3x3` cluster game. Each roll resolves a full `9`-tile board, and the payout depends only on the largest connected color cluster. For the chosen risk and roll count, every surviving roll compounds the current payout, while any dead cluster ends the whole game at `0x`.

**Command:** `apechurch-cli play blocks <amount> <risk> <runs>`

```bnf
<amount> ::= <ape>
<risk> ::= <integer> | "Low" | "High"  ; value ∈ {0, 1}
<runs> ::= <integer>               ; 1 <= value <= 5
```

**Compare:**
- Exact RTP: `Low / 1-5 rolls = 44.77%, 20.04%, 8.97%, 4.02%, 1.80%`.
- Exact RTP: `High / 1-5 rolls = 42.37%, 17.96%, 7.61%, 3.22%, 1.37%`.
- Max fixed top payout per surviving roll: `2500x` in Low, `5000x` in High.
- Operational note: `Low` pays from cluster `3`; `High` pays only from cluster `4` upward. Blocks is all-or-nothing and has no cash-out path.

## Bubblegum Heist ✔︎

**Type:** Slots
**Contract:** `0xB5Da735118e848130B92994Ee16377dB2AE31a4c`
**Aliases:** `bubblegumheist`, `bubblegum`, `heist`
**ABI verified:** `true`
**Verification notes:** [BUBBLEGUM_HEIST_CONTRACT.md](./verification/BUBBLEGUM_HEIST_CONTRACT.md)

Same slots ABI family as Dino Dough, but with a different live reel and paytable snapshot. The current contract has `5` symbol indexes per reel and a lower top line.

**Command:** `apechurch-cli play bubblegum-heist <amount> <spins>`

```bnf
<amount> ::= <ape>
<spins> ::= <integer>              ; 1 <= value <= 15; amount >= spins * 2.5 APE
```

**Compare:**
- Exact RTP: **`97.79962375%`** per spin.
- Max payout: `100x`.
- Operational note: lower ceiling than Dino, but still a contract-backed ordered slot rather than a generic three-of-a-kind toy model.

## Cosmic Plinko ✔︎

**Type:** Plinko
**Contract:** `0x674Bd91adb41897fA780386E610168afBB05e694`
**Aliases:** `cosmic`
**ABI verified:** `true`
**Verification notes:** [COSMIC_PLINKO_CONTRACT.md](./verification/COSMIC_PLINKO_CONTRACT.md)
**Analytics:** [COSMIC_PLINKO_ANALYTICS.md](./analytics/COSMIC_PLINKO_ANALYTICS.md)

Asymmetric weighted-bucket Plinko with a narrower risk range than Jungle. Ball count `1-30` mainly changes variance; the exact EV surface is risk-driven.

**Command:** `apechurch-cli play cosmic-plinko <amount> <risk> <balls>`

```bnf
<amount> ::= <ape>
<risk> ::= <integer> | "Low" | "Modest" | "High"  ; 0 <= value <= 2
<balls> ::= <integer>              ; 1 <= value <= 30
```

**Compare:**
- Exact RTP by risk: **`97.73%`**, **`97.76%`**, **`97.80%`**.
- Top multipliers: `50x`, `100x`, `250x`.
- Operational note: `risk 2` (`High`) has the best exact RTP and the highest tail risk.

## Dino Dough ✔︎

**Type:** Slots
**Contract:** `0x9ebb4Df257B971582BAf096b62CA41DE7723F3CB`
**Aliases:** `dinodough`, `dino`
**ABI verified:** `true`
**Verification notes:** [DINO_DOUGH_CONTRACT.md](./verification/DINO_DOUGH_CONTRACT.md)

Verified ordered `3`-reel slot with `6` live symbol indexes per reel and `1-15` spins per tx. Spin count only changes floor-division dust against the buy-in; the contract-backed per-spin EV is fixed by the live reel tables and ordered payout matrix.

**Command:** `apechurch-cli play dino-dough <amount> <spins>`

```bnf
<amount> ::= <ape>
<spins> ::= <integer>              ; 1 <= value <= 15
```

**Compare:**
- Exact RTP: **`97.89751366817333%`** per spin.
- Max payout: `333x`.
- Operational note: much deeper ordered paytable than the public crop suggests; use the verification note for the full reel and triple matrix.

## Geez Diggerz ✔︎

**Type:** Slots
**Contract:** `0xB02b13Adb8eAaFe1F41ec942612C4a4862b74d1D`
**Aliases:** `geezdiggerz`, `geez`
**ABI verified:** `true`
**Verification notes:** [GEEZ_DIGGERZ_CONTRACT.md](./verification/GEEZ_DIGGERZ_CONTRACT.md)
**Analytics:** [GEEZ_DIGGERZ_ANALYTICS.md](./analytics/GEEZ_DIGGERZ_ANALYTICS.md)

Verified ordered `3`-reel slot with `6` live symbol indexes and the same cumulative `82`-stop reel table on all `3` reels. Spin count can be `1-15`; only floor-division dust changes across spin counts, not the contract-backed per-spin EV.

**Command:** `apechurch-cli play geez-diggerz <amount> <spins>`

```bnf
<amount> ::= <ape>
<spins> ::= <integer>              ; 1 <= value <= 15
```

**Compare:**
- Exact RTP: **`97.694552458612%`** per spin.
- Max payout: `50x`.
- Operational note: flatter, rebate-heavy paytable than the other promoted slots; positive payout is about `41.02%`, while net-profit outcomes are about `30.00%`.

## Gimboz Smash ✔︎

**Type:** Range / Target
**Contract:** `0x17e219844F25F3FED6E422DdaFfD2E6557eBCEd3`
**Aliases:** `gimbozsmash`, `smash`
**ABI verified:** `true`
**Verification notes:** [GIMBOZ_SMASH_CONTRACT.md](./verification/GIMBOZ_SMASH_CONTRACT.md)
**Analytics:** [GIMBOZ_SMASH_ANALYTICS.md](./analytics/GIMBOZ_SMASH_ANALYTICS.md)

Verified one-or-two-interval target game on a public `1-100` board. The CLI accepts human-facing inclusive intervals such as `20-80` or `1-20,81-100`, and it also accepts outside-style input via `--out-range 45-50`, which it rewrites into explicit winning intervals before encoding the contract payload. Exact payout depends only on the total covered numbers across all declared intervals, not on where those intervals sit on the board.

**Command:** `apechurch-cli play gimboz-smash <amount> <range>` or `apechurch-cli play gimboz-smash <amount> --out-range <range>`

```bnf
<amount> ::= <ape>
<range> ::= <target-range> | <target-range> "," <target-range>
<target-range> ::= <integer> [ "-" <integer> ]
; semantic constraint: every endpoint is within 1..100, each range is inclusive, and total covered numbers across all ranges is within 1..95
<out-range> ::= <target-range>
; semantic constraint: the excluded outside range is inclusive and must cover between 5 and 95 numbers
```

**Compare:**
- Exact RTP: `97.4918% - 97.50%` across every supported cover count.
- Max payout: `97.5x` when you cover exactly `1` number.
- Operational note: the live contract still stores winning intervals directly, so `--out-range` is a CLI convenience that rewrites outside bets into the explicit target ranges required by the contract.
- ApeStrong and Gimboz Smash are not identical across the whole shared surface: at `75`, Gimboz Smash is `1.3x` / `97.5000%` RTP vs. ApeStrong `1.2999x` / `97.4925%`; at `95`, Gimboz Smash is `1.0263x` / `97.4985%` vs. ApeStrong `1.025x` / `97.3750%`.

## Hi-Lo Nebula ✔︎

**Type:** Cards / Cash-out streak
**Contract:** `0xa67d5CD51028cAaa367eEFcE90a5eA0b71c6cBE2`
**Aliases:** `hilonebula`, `hilo`
**ABI verified:** `true`
**Verification notes:** [HI_LO_NEBULA_CONTRACT.md](./verification/HI_LO_NEBULA_CONTRACT.md)
**Analytics:** [HI_LO_NEBULA_ANALYTICS.md](./analytics/HI_LO_NEBULA_ANALYTICS.md)

Stateful sequential card-prediction game with explicit `HIGHER`, `LOWER`, `SAME`, and `CASHOUT` actions. The verified contract does **not** use a `52`-card deck: it samples only ranks `2..A` uniformly with replacement, so suits and deck depletion are not part of the on-chain model.

**Command:** `apechurch-cli hi-lo-nebula <amount> [--auto [simple|best]] [--solver] [--loop]`

```bnf
<amount> ::= <ape>
<auto-mode> ::= "simple" | "best"
```

**Compare:**
- Public references still carried by the repo: `97.5%` calculated RTP and **`97.84%`** running RTP from the archived transparency snapshot.
- Verified mechanics: `play`, `makeGuess`, `cashOut`, live `getVRFFee`, verified `getGameInfo`, and a live `getJackpotAmount(betAmount)` getter.
- `--auto best` uses a VRF-aware net-EV continuation solver on the verified branch model, with the live jackpot share treated as the terminal bonus snapshot.
- `--solver` enables manual `Suggested action` hints from that same `best` engine.
- `--loop` now supports the common session stop conditions and betting strategies used by the other stateful games.
- Operational note: the repo now verifies the rank/paytable model exactly, but it still does **not** promote one closed-form whole-game RTP because the player can stop after any successful guess and the jackpot pool is live.

## Jungle Plinko ✔︎

**Type:** Plinko
**Contract:** `0x88683B2F9E765E5b1eC2745178354C70A03531Ce`
**Aliases:** `jungleplinko`, `jungle`
**ABI verified:** `true`
**Verification notes:** [JUNGLE_PLINKO_CONTRACT.md](./verification/JUNGLE_PLINKO_CONTRACT.md)
**Analytics:** [JUNGLE_PLINKO_ANALYTICS.md](./analytics/JUNGLE_PLINKO_ANALYTICS.md)

Weighted-bucket Plinko, not a peg-by-peg physics sim. Mode controls the bucket table; ball count mainly changes variance and the tiny floor-division dust from splitting the wager across `1-100` balls.

**Command:** `apechurch-cli play jungle-plinko <amount> <risk> <balls>`

```bnf
<amount> ::= <ape>
<risk> ::= <integer> | "Low" | "Moderate" | "High" | "Degen" | "Ultra Degen"  ; 0 <= value <= 4
<balls> ::= <integer>              ; 1 <= value <= 100
```

**Compare:**
- Exact RTP by risk: `97.94% - 98.00%`.
- Top multipliers: `2.2x`, `5x`, `15x`, `100x`, `1000x` from risk `0` to `4`.
- Operational note: more balls smooth variance, but risk is what changes the real payout surface.

## Keno ✔︎

**Type:** Keno
**Contract:** `0xc936D6691737afe5240975622f0597fA2d122FAd`
**ABI verified:** `true`
**Verification notes:** [KENO_CONTRACT.md](./verification/KENO_CONTRACT.md)
**Analytics:** [KENO_ANALYTICS.md](./analytics/KENO_ANALYTICS.md)

Classic `1-40` keno with `10` winning numbers drawn without replacement. Specific chosen numbers do not change exact EV; pick count is the only strategic lever.

**Command:** `apechurch-cli play keno <amount> [--picks <1-10>] [--numbers <list|random>]`

```bnf
<amount> ::= <ape>
<picks> ::= <integer>              ; 1 <= value <= 10
<numbers> ::= "random" | <keno-number> ( "," <keno-number> )*
<keno-number> ::= <integer>        ; 1 <= value <= 40
```

**Compare:**
- Exact RTP by pick count: `93.32% - 94.68%`.
- Max payout: `1,000,000x` on `10/10`.
- Operational note: `5 picks` is the best-EV lane; higher pick counts mainly buy variance and top-end exposure.

## Monkey Match ✔︎

**Type:** Matching
**Contract:** `0x59EBd3406b76DCc74102AFa2cA5284E9AAB6bA28`
**Aliases:** `monkeymatch`, `monkey`
**ABI verified:** `true`
**Verification notes:** [MONKEY_MATCH_CONTRACT.md](./verification/MONKEY_MATCH_CONTRACT.md)
**Analytics:** [MONKEY_MATCH_ANALYTICS.md](./analytics/MONKEY_MATCH_ANALYTICS.md)

Five independent monkey draws scored as multiplicity hands. There is no redraw or action tree; risk choice is the whole strategy surface.

**Command:** `apechurch-cli play monkey-match <amount> [--risk <0-1|Low|High>]`

```bnf
<amount> ::= <ape>
<risk> ::= <integer> | "Low" | "High"  ; value ∈ {0, 1}
```

**Compare:**
- Exact RTP: **`97.99%`** in Low, **`98.29%`** in High.
- Max payout: `50x` in both modes.
- Operational note: `risk 1` (`High`, on-chain mode `2`) has the better EV; `risk 0` (`Low`, on-chain mode `1`) is the lower-variance barrel mix.

## Primes ✔︎

**Type:** Number / VRF
**Contract:** `0xC1aCd12aA34dC33979871EF95c540D46A6566B4b`
**ABI verified:** `true`
**Verification notes:** [PRIMES_CONTRACT.md](./verification/PRIMES_CONTRACT.md)
**Analytics:** [PRIMES_ANALYTICS.md](./analytics/PRIMES_ANALYTICS.md)

Batched prime-or-zero number game. Risk controls the numeric range and fixed multipliers; run count only changes variance and floor-division dust.

**Command:** `apechurch-cli play primes <amount> <risk> <runs>`

```bnf
<amount> ::= <ape>
<risk> ::= <integer> | "Easy" | "Medium" | "Hard" | "Extreme"  ; 0 <= value <= 3
<runs> ::= <integer>               ; 1 <= value <= 20
```

**Compare:**
- Exact RTP: **`98.00%`** on Easy/Medium/Hard and **`98.04%`** on Extreme.
- Max fixed top payout: `500x` on Extreme via zero.
- Operational note: the transparency running RTP can sit above **`100%`**, but the contract-backed long-run surface is still the fixed risk table in the verification note.

## Reel Pirates

**Type:** Slots / Cascade
**Contract:** `0x5E405198B349d6522BbB614E7391bDC4F4F6f681`
**Aliases:** `reelpirates`, `pirates`, `reel`
**ABI verified:** `false`
**Verification notes:** [REEL_PIRATES_CONTRACT.md](./verification/REEL_PIRATES_CONTRACT.md)
**Analytics:** [REEL_PIRATES_ANALYTICS.md](./analytics/REEL_PIRATES_ANALYTICS.md)

Pirate-themed match-anywhere cascade slot. The public docs describe regular-symbol pays at `8-9`, `10-11`, and `12+` identical symbols anywhere on the board; `4+` scatter chests trigger `5` free spins; bonus multipliers are additive and can reach `100x`.

**Command:** `apechurch-cli play reel-pirates <amount> <spins>`

```bnf
<amount> ::= <ape>
<spins> ::= <integer>              ; optional, default 5; 1 <= value <= 15; amount >= spins * 2.5 APE
```

**Compare:**
- Observed running RTP from the supplied analytics screenshot: **`100.07%`**.
- Exact closed-form RTP: not published from the current local/public source set.
- Operational note: playable via the observed `play(address,bytes)` payload, dynamic `getVRFFee(uint32)` path, and per-spin executor fee, but not promoted to `ABI verified` because the live contract is unverified on ApeScan.

## Roulette ✔︎

**Type:** Table
**Contract:** `0x1f48A104C1808eb4107f3999999D36aeafEC56d5`
**ABI verified:** `true`
**Verification notes:** [ROULETTE_CONTRACT.md](./verification/ROULETTE_CONTRACT.md)
**Analytics:** [ROULETTE_ANALYTICS.md](./analytics/ROULETTE_ANALYTICS.md)

American roulette on a `38`-pocket wheel. The contract supports single numbers, colors, parity, halves, dozens, and columns; multi-bets split the wager across legs, while one-leg bets subtract `1 wei` because each encoded leg must stay strictly below the post-fee total.

**Command:** `apechurch-cli play roulette <amount> <bet>`

```bnf
<amount> ::= <ape>
<bet-list> ::= <roulette-bet> ( "," <roulette-bet> )*
<roulette-bet> ::= "0" | "00" | <roulette-number> | "RED" | "BLACK" | "ODD" | "EVEN" | "FIRST_HALF" | "SECOND_HALF" | "FIRST_THIRD" | "SECOND_THIRD" | "THIRD_THIRD" | "FIRST_COL" | "SECOND_COL" | "THIRD_COL"
<roulette-number> ::= <integer>    ; 1 <= value <= 36
```

**Compare:**
- Exact RTP: `97.11%` across all verified supported bet classes.
- Max payout: `36.9x` on a single number, `0`, or `00`.
- Operational note: `RED,BLACK` is the low-volatility hedge baseline and only loses to `0/00`.

## Speed Keno ✔︎

**Type:** Keno (Batched)
**Contract:** `0x40EE3295035901e5Fd80703774E5A9FE7CE2B90C`
**Aliases:** `speedkeno`, `skeno`
**ABI verified:** `true`
**Verification notes:** [SPEED_KENO_CONTRACT.md](./verification/SPEED_KENO_CONTRACT.md)
**Analytics:** [SPEED_KENO_ANALYTICS.md](./analytics/SPEED_KENO_ANALYTICS.md)

Fast batched keno on a `1-20` board. You choose `1-5` picks and batch `1-20` mini-games into one tx; batch count changes fee efficiency and variance, while pick count changes actual EV.

**Command:** `apechurch-cli play speed-keno <amount> [--picks <1-5>] [--games <1-20>] [--numbers <list|random>]`

```bnf
<amount> ::= <ape>
<picks> ::= <integer>              ; 1 <= value <= 5
<games> ::= <integer>              ; 1 <= value <= 20
<numbers> ::= "random" | <speed-keno-number> ( "," <speed-keno-number> )*
<speed-keno-number> ::= <integer>  ; 1 <= value <= 20
```

**Compare:**
- Exact RTP by pick count: `97.37% - 97.84%`.
- Max payout: `2,000x` on `5/5`.
- Operational note: `5 picks` is the best-EV lane; batch count only changes dust and pacing, not the per-game draw EV.

## Sushi Showdown ✔︎

**Type:** Slots
**Contract:** `0x7B53Ec7A5e1C30D4b91D2c3Ec0472a6E4818a657`
**Aliases:** `sushishowdown`, `sushi`
**ABI verified:** `true`
**Verification notes:** [SUSHI_SHOWDOWN_CONTRACT.md](./verification/SUSHI_SHOWDOWN_CONTRACT.md)
**Analytics:** [SUSHI_SHOWDOWN_ANALYTICS.md](./analytics/SUSHI_SHOWDOWN_ANALYTICS.md)

Verified ordered `3`-reel slot in the same ABI family as Dino Dough, Bubblegum Heist, and Geez Diggerz, but with `7` live symbol indexes and asymmetric reels. Spin count can be `1-15`; the per-spin EV comes from the live reel tables and full ordered paytable snapshot.

**Command:** `apechurch-cli play sushi-showdown <amount> <spins>`

```bnf
<amount> ::= <ape>
<spins> ::= <integer>              ; 1 <= value <= 15
```

**Compare:**
- Exact RTP: **`97.87165381190353%`** per spin.
- Max payout: `500x`.
- Operational note: lower hit rate than Geez at about `31.19%`, but a much fatter top tail and many fractional mid-tier payouts from the live basis-point table.

## Video Poker ✔︎ / Gimboz Poker

**Type:** Cards
**Contract:** `0x4f7D016704bC9A1d373E512e10CF86A0E7015D1D`
**Aliases:** `vp`
**ABI verified:** `true`
**Verification notes:** [VIDEO_POKER_CONTRACT.md](./verification/VIDEO_POKER_CONTRACT.md)

Stateful Jacks or Better with one redraw, interactive play, and an exact hold-EV solver. `video-poker` is the CLI command; Ape Church calls the same game `Gimboz Poker`.

**Command:** `apechurch-cli video-poker <amount> [--auto [simple|best]]`

```bnf
<amount> ::= "1" | "5" | "10" | "25" | "50" | "100"
<auto-mode> ::= "simple" | "best"
```

**Compare:**
- Exact base RTP: **`98.1649%`** at any fixed denomination.
- Jackpot uplift: `98.1649% + jackpot_ape / 40,000` at `100 APE` only.
- Operational note: redraw fee is `0` when standing pat; jackpot eligibility exists only at the max fixed bet.

---

## Common Loop Options

All games support these with `--loop`.
Note: `play` defaults to `--delay 3`, while `blackjack`, `hi-lo-nebula`, and `video-poker` default to `--delay 5`.

```bash
--loop                    # Enable continuous play
--delay <seconds>         # Fixed time between games
--human                   # Add weighted 3-9s human-like delay on top of --delay
--take-profit <ape>       # Stop at target balance
--min-profit <ape>        # Stop at target session profit
--target-x <x>            # Stop after any single-game payout multiplier at or above X
--target-profit <ape>     # Stop after any single-game payout amount at or above this APE
--retrace <ape>           # Stop after any single-game loss at or above this APE
--recover-loss <ape>      # Stop once a drawdown of at least this size gets back to break-even/profit
--giveback-profit <ape>   # Stop once a run-up of at least this size falls back to break-even/loss
--stop-loss <ape>         # Stop at loss limit
--max-loss <ape>          # Stop at target session loss
--max-games <n>           # Stop after N games
--bet-strategy <name>     # flat, martingale, fibonacci, dalembert, reverse-martingale
--max-bet <ape>           # Cap maximum bet (for progressive strategies)
--json                    # Machine-readable output
```

---

## Notes

- All amounts are in APE
- Manual `play` for simple games accepts any positive APE amount; built-in strategy presets usually floor auto-sized bets at `1 APE`
- VRF fees are automatically calculated and added; some games also expose percentage fees or payout-side commissions, so check `Accepted Wagers` and the per-game verification note before comparing raw stake sizes
- Stateful games use `--auto simple` by default; `blackjack`, `hi-lo-nebula`, and `video-poker` also accept `--auto best`
- `hi-lo-nebula --display full` uses the boxed multi-panel layout with current card, action keys, and streak info
- `hi-lo-nebula --loop` supports the common `--take-profit`, `--stop-loss`, `--max-games`, `--bet-strategy`, and related session controls
- `video-poker --solver` shows a best-EV hold suggestion in interactive mode
- `video-poker --display full` uses the boxed ASCII table renderer; `simple` stays compact
- Use `apechurch-cli game <name>` for detailed in-CLI help

---

## RTP Comparison

This section keeps exact or formula-derived RTP separate from public `Running RTP` snapshots. Use it as a sanity check, not as proof of edge. Values are rounded to `2` decimals in this document even where the underlying constants keep more precision in code.

### Exact Calculated RTP by Game and Mode

Ordering: game sections are sorted by descending maximum fixed exact RTP documented here; ties are alphabetical by game title. Formula-derived jackpot uplift rows stay within their game section and do not affect inter-game ordering. Within each game section, rows are sorted by descending exact RTP; ties keep the game's native mode order.

#### Blackjack ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| Main Only | Yes | **`100.05%`** | Statistical main-game model from the repo simulator | `96.84%` |
| Dealer Side Only | Yes | `82.02%` | Exact EV from the published dealer-side conditions | `96.84%` |
| Side Only | Yes | `79.88%` | Exact EV from the published player-side table | `96.84%` |

#### Baccarat ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| BANKER | Yes | **`98.94%`** | Exact weighted sum on the verified 6-rank draw tree | **`98.12%`** |
| PLAYER | Yes | **`98.77%`** | Exact weighted sum on the verified 6-rank draw tree | **`98.12%`** |
| TIE | Yes | `85.88%` | Exact weighted sum on the verified 6-rank draw tree | **`98.12%`** |

#### Blocks ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| High / 1 roll | Yes | `42.37%` | Exact exhaustive `6^9` board enumeration compounded across the configured consecutive-roll count | `93.92%` |
| High / 2 rolls | Yes | `17.96%` | Exact exhaustive `6^9` board enumeration compounded across the configured consecutive-roll count | `93.92%` |
| High / 3 rolls | Yes | `7.61%` | Exact exhaustive `6^9` board enumeration compounded across the configured consecutive-roll count | `93.92%` |
| High / 4 rolls | Yes | `3.22%` | Exact exhaustive `6^9` board enumeration compounded across the configured consecutive-roll count | `93.92%` |
| High / 5 rolls | Yes | `1.37%` | Exact exhaustive `6^9` board enumeration compounded across the configured consecutive-roll count | `93.92%` |
| Low / 1 roll | Yes | `44.77%` | Exact exhaustive `6^9` board enumeration compounded across the configured consecutive-roll count | `93.92%` |
| Low / 2 rolls | Yes | `20.04%` | Exact exhaustive `6^9` board enumeration compounded across the configured consecutive-roll count | `93.92%` |
| Low / 3 rolls | Yes | `8.97%` | Exact exhaustive `6^9` board enumeration compounded across the configured consecutive-roll count | `93.92%` |
| Low / 4 rolls | Yes | `4.02%` | Exact exhaustive `6^9` board enumeration compounded across the configured consecutive-roll count | `93.92%` |
| Low / 5 rolls | Yes | `1.80%` | Exact exhaustive `6^9` board enumeration compounded across the configured consecutive-roll count | `93.92%` |

#### Monkey Match ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| High | Yes | **`98.29%`** | Exact combinatorial EV over the verified on-chain 5-draw paytable | `97.34%` |
| Low | Yes | **`97.99%`** | Exact combinatorial EV over the verified on-chain 5-draw paytable | `97.34%` |

#### Video Poker ✔︎ / Gimboz Poker

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| `100 APE` bet with known jackpot pool | Yes | `98.16% + jackpot_ape / 40,000` | Exact parametric jackpot uplift from `jackpotTotal` | `89.53%` |
| Base paytable at any fixed bet | Yes | **`98.16%`** | Exact weighted sum over verified on-chain paytable and final-hand odds | `89.53%` |

#### Primes ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| Extreme | Yes | **`98.04%`** | Exact weighted sum over verified on-chain `gameModes` and prime mapping | **`105.64%`** |
| `Easy` / `Medium` / `Hard` | Yes | **`98.00%`** | Exact weighted sum over verified on-chain `gameModes` and prime mapping | **`105.64%`** |

#### Reel Pirates

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| Any base spin count `1-15` | Yes | Not verified | Public docs + supplied gameplay tx confirm mechanics and play payload; exact symbol-frequency model is not available from verified source | **`100.07%`** |

#### Jungle Plinko ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| Risk 0 / Low | Yes | **`98.00%`** | Exact weighted sum over on-chain bucket tables | **`98.42%`** |
| Risk 4 / Ultra Degen | Yes | **`97.99%`** | Exact weighted sum over on-chain bucket tables | **`98.42%`** |
| `Risk 1 / Moderate` / `Risk 2 / High` | Yes | **`97.97%`** | Exact weighted sum over on-chain bucket tables | **`98.42%`** |
| Risk 3 / Degen | Yes | **`97.94%`** | Exact weighted sum over on-chain bucket tables | **`98.42%`** |

#### Bear-A-Dice ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| Difficulty / roll matrix | Yes | `97.25% - 97.94%` | Exact weighted sum over verified on-chain `payouts[difficulty][numRuns][diceSum]` and the true 2d6 distribution | **`97.56%`** |

#### Dino Dough ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| Any spin count `1-15` | Yes | **`97.90%`** | Exact weighted sum over the verified live reel-stop tables and ordered paytable getters | **`97.80%`** |

#### Sushi Showdown ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| Any spin count `1-15` | Yes | **`97.87%`** | Exact weighted sum over the verified live reel-stop tables and ordered paytable getters | `95.99%` |

#### Speed Keno ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| Picks 5 | Yes | **`97.84%`** | Exact hypergeometric EV | `93.36%` |
| Picks 3 | Yes | **`97.81%`** | Exact hypergeometric EV | `93.36%` |
| Picks 1 | Yes | `97.50%` | Exact hypergeometric EV | `93.36%` |
| Picks 4 | Yes | `97.42%` | Exact hypergeometric EV | `93.36%` |
| Picks 2 | Yes | `97.37%` | Exact hypergeometric EV | `93.36%` |

#### Bubblegum Heist ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| Any spin count `1-15` | Yes | **`97.80%`** | Exact weighted sum over the verified live reel-stop tables and ordered paytable getters | `97.26%` |

#### Cosmic Plinko ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| Mode 2 / High | Yes | **`97.80%`** | Exact weighted sum over on-chain bucket tables | `97.32%` |
| Risk 1 / Modest | Yes | **`97.76%`** | Exact weighted sum over on-chain bucket tables | `97.32%` |
| Risk 0 / Low | Yes | **`97.73%`** | Exact weighted sum over on-chain bucket tables | `97.32%` |

#### Geez Diggerz ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| Any spin count `1-15` | Yes | **`97.69%`** | Exact weighted sum over the verified live reel-stop tables and ordered paytable getters | `97.25%` |

#### Gimboz Smash ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| Any supported cover count `1-95` | Yes | `97.4918% - 97.50%` | Exact EV from verified ABI + live `getPayoutFromRange(range)` getter snapshot read on `2026-04-20` | **`97.70%`** |

#### ApeStrong ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| Any supported `range` (`5-95`) | Yes | `97.38% - 97.50%` | Exact EV from verified contract source + live `edgeFlipRangeToPayout(range)` table read on `2026-04-09` | **`98.53%`** |

#### Roulette ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| All verified bet classes | Yes | `97.11%` | Exact weighted sum on 38 pockets | `97.05%` |

#### Keno ✔︎

| Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|-------------|-----------|--------|--------------------|
| Picks 5 | Yes | `94.68%` | Exact hypergeometric EV | `86.35%` |
| Picks 7 | Yes | `94.29%` | Exact hypergeometric EV | `86.35%` |
| Picks 8 | Yes | `94.19%` | Exact hypergeometric EV | `86.35%` |
| Picks 6 | Yes | `93.90%` | Exact hypergeometric EV | `86.35%` |
| Picks 10 | Yes | `93.83%` | Exact hypergeometric EV | `86.35%` |
| `Picks 1` / `Picks 2` | Yes | `93.75%` | Exact hypergeometric EV | `86.35%` |
| Picks 3 | Yes | `93.67%` | Exact hypergeometric EV | `86.35%` |
| Picks 4 | Yes | `93.39%` | Exact hypergeometric EV | `86.35%` |
| Picks 9 | Yes | `93.32%` | Exact hypergeometric EV | `86.35%` |

### Win Rate vs Max X Cross-Check

These two tables are intentionally **game-level** and use **one single supported mode per row**. In the first table, each game is represented by the mode with its highest exact `win rate`; in the second, each game is represented by the mode with its highest exact `max X`. In both tables, `win rate`, `RTP`, and `max X` therefore refer to the **same game and the same mode**.

`Win rate` here means **exact net-profit frequency** (`payout > 1x`), which matches the CLI's `win_rate` semantics rather than merely counting any positive payout. `RTP` is the exact expected return for that same selected mode, and `max X` is the exact gross multiplier for that same selected mode. Equivalent tied modes may be represented by one documented mode label. For `Video Poker`, the ordering uses the fixed `250x` royal-flush base and excludes the live progressive jackpot uplift. These tables exclude `Blackjack`, `Hi-Lo Nebula`, `Dino Dough`, and `Bubblegum Heist` because the local repo does not currently keep a comparable exact net-profit win-rate surface for them in reusable form.

For the complete all-mode version of both comparisons, see [GAMES_PAYOUTS_VS_ODDS.md](./GAMES_PAYOUTS_VS_ODDS.md).

#### Top 10 Games by Win Rate, Ordered by Max X

| Game | Selected Mode | Win Rate | Min X | Mode X | Max X | RTP |
|------|---------------|----------|-------|-------|-------|-----|
| Keno ✔︎ | `Picks 5` | `58.35%` | `1.1x` @ `27.77%` | `1.1x` @ `27.77%` | `200x` @ `0.04%` | `94.68%` |
| Monkey Match ✔︎ | `Low` | `44.44%` | `1.25x` @ `23.15%` | `1.25x` @ `23.15%` | `50x` @ `0.08%` | **`97.99%`** |
| Speed Keno ✔︎ | `Picks 2` | `44.74%` | `1.45x` @ `39.47%` | `1.45x` @ `39.47%` | `5x` @ `5.26%` | `97.37%` |
| Jungle Plinko ✔︎ | `Risk 0 / Low` | `53.33%` | `1.2x` @ `38.10%` | `1.2x` @ `38.10%` | `2.2x` @ `15.24%` | **`98.00%`** |
| Primes ✔︎ | `Easy` | `50.00%` | `1.9x` @ `40.00%` | `1.9x` @ `40.00%` | `2.2x` @ `10.00%` | **`98.00%`** |
| Roulette ✔︎ | `Red / Black` | `47.37%` | `2.05x` @ `47.37%` | `2.05x` @ `47.37%` | `2.05x` @ `47.37%` | `97.11%` |
| Baccarat ✔︎ | `BANKER` | `45.84%` | `1.95x` @ `45.84%` | `1.95x` @ `45.84%` | `1.95x` @ `45.84%` | **`98.94%`** |
| Bear-A-Dice ✔︎ | `Easy / 1 roll` | `83.33%` | `1.01x` @ `27.78%` | `1.01x` @ `27.78%` | `1.83x` @ `5.56%` | **`97.89%`** |
| Gimboz Smash ✔︎ | `Cover 95` | `95.00%` | `1.0263x` @ `95.00%` | `1.0263x` @ `95.00%` | `1.0263x` @ `95.00%` | `97.50%` |
| ApeStrong ✔︎ | `Range 95` | `95.00%` | `1.025x` @ `95.00%` | `1.025x` @ `95.00%` | `1.025x` @ `95.00%` | `97.38%` |

#### Top 10 Games by Max X, Ordered by Win Rate

| Game | Selected Mode | Win Rate | Min X | Mode X | Max X | RTP |
|------|---------------|----------|-------|-------|-------|-----|
| Speed Keno ✔︎ | `Picks 5` | `26.63%` | `1.25x` @ `19.37%` | `1.25x` @ `19.37%` | `2000x` @ `0.01%` | **`97.84%`** |
| Video Poker ✔︎ / Gimboz Poker | `Base paytable` | `23.99%` | `1x` @ `21.46%` | `1x` @ `21.46%` | `250x` @ `0.00%` | **`98.16%`** |
| Sushi Showdown ✔︎ | `Any spin count 1-15` | `23.91%` | `1.25x` @ `3.97%` | `1.75x` @ `5.31%` | `500x` @ `0.01%` | **`97.87%`** |
| Keno ✔︎ | `Picks 10` | `23.23%` | `1.2x` @ `14.71%` | `1.2x` @ `14.71%` | `1000000x` @ `0.00%` | `93.83%` |
| Jungle Plinko ✔︎ | `Risk 4 / Ultra Degen` | `22.18%` | `1.4x` @ `9.87%` | `1.4x` @ `9.87%` | `1000x` @ `0.00%` | **`97.99%`** |
| Cosmic Plinko ✔︎ | `Mode 2 / High` | `14.37%` | `1.5x` @ `6.19%` | `1.5x` @ `6.19%` | `250x` @ `0.03%` | **`97.80%`** |
| Primes ✔︎ | `Extreme` | `12.30%` | `7.57x` @ `12.29%` | `7.57x` @ `12.29%` | `500x` @ `0.01%` | **`98.04%`** |
| Gimboz Smash ✔︎ | `Cover 1` | `1.00%` | `97.5x` @ `1.00%` | `97.5x` @ `1.00%` | `97.5x` @ `1.00%` | `97.50%` |
| Blocks ✔︎ | `High / 5 rolls` | `0.0013%` | `57.67x` @ `0.00%` | `57.67x` @ `0.00%` | `3125000000000000000.00x` @ `0.00%` | `1.37%` |
| Bear-A-Dice ✔︎ | `Master / 5 rolls` | `0.000053%` | `1,847,949.19x` @ `0.00%` | `1,847,949.19x` @ `0.00%` | `1,847,949.19x` @ `0.00%` | **`97.80%`** |

### Still Not Exactly Calculable from Local Sources

The local source set is still insufficient for a defensible closed-form RTP on `Cash Dash`, `Cult Quest`, `Glyde or Crash`, `Reel Pirates`, and `Rico's Revenge`.

For `Blackjack ✔︎`, the main hand still remains a statistical model rather than a closed-form proof, while the isolated player-side and dealer-side lanes are recoverable from the published side-bet tables and the public rule surface now matches the repo solver assumptions.

For `Hi-Lo Nebula ✔︎`, the contract-backed rank model, paytable, and jackpot getter are now verified, but the repo still treats whole-run RTP as policy-dependent because the player can cash out after any winning guess and the jackpot pool is live.

---

## GP Farming Considerations

From a more academic perspective, GP farming is a volume-optimization problem under negative expected value. If `V` is eligible wager volume in APE, `m` is the weekly GP multiplier (`0.5` on half weeks, `1.0` on standard weeks, `2.0` on double weeks), and `B(V)` is the cumulative-wager bonus at that milestone, then:

- `GP_total(V, m) = 5mV + B(V)`
- `effective GP/APE ratio = 5m + B(V) / V`
- `level equivalent = GP_total(V, m) / 10,000`
- `expected loss (best case) = V x (1 - RTP_best)` when a defensible theoretical RTP exists
- `expected loss (worst case) = 0.05V` under a flat 5% house edge assumption over long samples

Every `10,000 GP` equals `1 Level`, so GP optimization is also level-progression optimization. Two consequences follow. First, progressive betting does **not** improve GP efficiency, because GP accrues on wagered volume rather than on profitability; it only changes variance and bankroll stress. Second, cumulative-wager bonuses raise the effective GP/APE ratio only gradually, but over large volume they materially reduce the implied APE cost per GP and the implied APE cost per level.

### Working Assumptions

- The bonus figures below are treated as **total cumulative bonus GP** at each threshold, not as incremental add-ons.
- The repo does not currently surface level conversion directly in commands, so this section makes the progression rule explicit: every `10,000 GP = 1 Level`.
- For intermediate volumes between published thresholds, the examples conservatively carry forward the latest published cumulative bonus already unlocked.
- The examples assume the selected games are eligible for the current GP campaign.
- Best-case RTP inputs used below are:
  - `ApeStrong ✔︎` at `range 75`: `97.49%` from the verified live `edgeFlipRangeToPayout[75] = 12,999` table entry
  - `Roulette ✔︎` hedge (`RED,BLACK`): `97.1%` from the public transparency header
  - `Bubblegum Heist ✔︎`: **`97.80%`** from the verified live reel and ordered-paytable snapshot read on `2026-04-09`
- The commands below omit `--stop-loss` so the wager-volume math stays exact. In real play, bankroll limits should still be imposed.

### Published Cumulative Wager Bonus Schedule

| Wager Volume | Cumulative Bonus GP | Bonus Levels | Standard-Week Total GP | Standard-Week Levels | Standard GP/APE |
|-------------|---------------------|--------------|------------------------|----------------------|-----------------|
| `1,000 APE` | `1,000 GP` | `0.1` | `6,000 GP` | `0.6` | `6.00` |
| `10,000 APE` | `15,000 GP` | `1.5` | `65,000 GP` | `6.5` | `6.50` |
| `50,000 APE` | `80,000 GP` | `8.0` | `330,000 GP` | `33.0` | `6.60` |
| `100,000 APE` | `180,000 GP` | `18.0` | `680,000 GP` | `68.0` | `6.80` |
| `250,000 APE` | `475,000 GP` | `47.5` | `1,725,000 GP` | `172.5` | `6.90` |
| `500,000 APE` | `1,000,000 GP` | `100.0` | `3,500,000 GP` | `350.0` | `7.00` |
| `1,000,000 APE` | `2,250,000 GP` | `225.0` | `7,250,000 GP` | `725.0` | `7.25` |

The ladder matters because the bonus GP is not small relative to the early levels. Crossing the `10,000 APE` threshold on a standard week already yields `65,000 GP`, which is `6.5 Levels`, while the `1,000,000 APE` threshold lifts the standard-week effective ratio to `7.25 GP/APE`.

### Worked Examples

1. **Level 0 bootstrap**
   Command: `apechurch-cli play ape-strong 10 75 --loop --bet-strategy flat --delay 3 --max-games 100`
   Volume: `1,000 APE`
   Expected Loss (`Best ~ Worst`): `25 ~ 50 APE`
   GP Obtained (`Half / Std / Double`): `3,500 / 6,000 / 11,000 GP`
   Levels Gained (`Half / Std / Double`): `0.35 / 0.6 / 1.1`
   GP/APE Ratio (`Half / Std / Double`): `3.5 / 6.0 / 11.0`

2. **Reach Level 5 conservatively**
   Command: `apechurch-cli play roulette 50 RED,BLACK --loop --bet-strategy flat --delay 3 --max-games 100`
   Volume: `5,000 APE`
   Expected Loss (`Best ~ Worst`): `145 ~ 250 APE`
   GP Obtained (`Half / Std / Double`): `13,500 / 26,000 / 51,000 GP`
   Levels Gained (`Half / Std / Double`): `1.35 / 2.6 / 5.1`
   GP/APE Ratio (`Half / Std / Double`): `2.7 / 5.2 / 10.2`

3. **Clear Level 10 with better RTP**
   Command: `apechurch-cli play bubblegum-heist 100 10 --loop --bet-strategy flat --delay 3 --max-games 100`
   Volume: `10,000 APE`
   Expected Loss (`Best ~ Worst`): `220 ~ 500 APE`
   GP Obtained (`Half / Std / Double`): `40,000 / 65,000 / 115,000 GP`
   Levels Gained (`Half / Std / Double`): `4.0 / 6.5 / 11.5`
   GP/APE Ratio (`Half / Std / Double`): `4.0 / 6.5 / 11.5`

4. **Clear Level 15**
   Command: `apechurch-cli play ape-strong 75 75 --loop --bet-strategy flat --delay 3 --max-games 200`
   Volume: `15,000 APE`
   Expected Loss (`Best ~ Worst`): `376 ~ 750 APE`
   GP Obtained (`Half / Std / Double`): `52,500 / 90,000 / 165,000 GP`
   Levels Gained (`Half / Std / Double`): `5.25 / 9.0 / 16.5`
   GP/APE Ratio (`Half / Std / Double`): `3.5 / 6.0 / 11.0`

5. **50k bonus tier baseline**
   Command: `apechurch-cli play ape-strong 50 75 --loop --bet-strategy flat --delay 3 --max-games 1000`
   Volume: `50,000 APE`
   Expected Loss (`Best ~ Worst`): `1,254 ~ 2,500 APE`
   GP Obtained (`Half / Std / Double`): `205,000 / 330,000 / 580,000 GP`
   Levels Gained (`Half / Std / Double`): `20.5 / 33.0 / 58.0`
   GP/APE Ratio (`Half / Std / Double`): `4.1 / 6.6 / 11.6`

6. **100k bonus tier RTP-leaning**
   Command: `apechurch-cli play bubblegum-heist 100 10 --loop --bet-strategy flat --delay 3 --max-games 1000`
   Volume: `100,000 APE`
   Expected Loss (`Best ~ Worst`): `2,200 ~ 5,000 APE`
   GP Obtained (`Half / Std / Double`): `430,000 / 680,000 / 1,180,000 GP`
   Levels Gained (`Half / Std / Double`): `43.0 / 68.0 / 118.0`
   GP/APE Ratio (`Half / Std / Double`): `4.3 / 6.8 / 11.8`

7. **250k marathon tier**
   Command: `apechurch-cli play ape-strong 100 75 --loop --bet-strategy flat --delay 3 --max-games 2500`
   Volume: `250,000 APE`
   Expected Loss (`Best ~ Worst`): `6,269 ~ 12,500 APE`
   GP Obtained (`Half / Std / Double`): `1,100,000 / 1,725,000 / 2,975,000 GP`
   Levels Gained (`Half / Std / Double`): `110.0 / 172.5 / 297.5`
   GP/APE Ratio (`Half / Std / Double`): `4.4 / 6.9 / 11.9`

### Interpretation

These examples suggest a fairly stable conclusion. If the objective is **GP per unit of expected loss**, then high-RTP eligible games dominate, but the margin between a roughly `97.49%` ApeStrong baseline and a **`97.8%`** baseline is smaller than many players intuit. By contrast, volatility and bankroll path-dependence can differ substantially, which is why `ApeStrong ✔︎` at a relatively wide range or `Roulette ✔︎` with `RED,BLACK` remain attractive operational baselines even when a slot-like game has a slightly better published RTP.

Equally important, the cumulative bonus system means the relevant metric is not just raw RTP but **expected loss per effective GP** and, by extension, **expected loss per level**. Under the standard ratio, the bonus ladder shifts the effective return from `6.0 GP/APE` at `1,000 APE` volume to `7.25 GP/APE` at `1,000,000 APE` volume. On double weeks the same ladder becomes markedly more favorable, while on half weeks the economics deteriorate enough that conservative flat-volume loops become more important than promotional optimism.

---

## Not Yet Supported in This CLI

These titles appear in Ape Church public docs or the Transparency section, but this repo does not expose a playable CLI command for them yet. The numbers below are descriptive only. Running RTP values are public snapshots, not guaranteed long-run returns.

### Public Overview

Ordering: alphabetical by game title.

| Game | Publicly described as | Running RTP | Coverage | Notes |
|------|------------------------|-------------|----------|-------|
| Cash Dash | ladder / cash-out tile game | 96.04% | aggregate only | Docs + transparency; each step raises multiplier and can bust the run |
| Cult Quest | gem / trap grid cash-out game | 96.67% | aggregate only | Docs + transparency; fewer safe spots means higher risk |
| Glyde or Crash | crash / cash-out multiplier game | 105.59% | aggregate only | Docs + transparency; official docs also use the spelling `Glyder or Crash` |
| Reel Pirates | match-anywhere cascade slot | 100.07% | aggregate only | Now playable; exact odds remain unverified because the live contract source is not verified |
| Rico's Revenge | undocumented in current official source set | 90.94% | aggregate only | Transparency only in the material archived here |

### Richer Public Mechanics

Ordering: alphabetical by game title.

| Game | Useful public detail |
|------|----------------------|
