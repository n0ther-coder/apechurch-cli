# Games Reference

> Summary: Comparison-first guide for every supported game, plus a compact appendix for public Ape Church games not yet exposed by this CLI. Keeps syntax and high-signal RTP/volatility notes in one place, while deeper mechanics and verification trails live under `docs/verification/`.

Compact syntax and comparison notes for all Ape Church CLI games.

Treat published running RTP values as observed snapshots, not guaranteed long-run returns. For ABI-backed tuple layouts, payout matrices, and maintainer-facing verification evidence, follow the per-game links in `docs/verification/`.

The `✔︎` marker means this repo has locally verified the game's ABI-facing behavior against verified on-chain contract data. Supported games without the symbol are still playable in the CLI, but they have not yet been promoted to `ABI verified`; see [ABI_VERIFICATION.md](./ABI_VERIFICATION.md) for the maintainer checklist.

---

## Quick Reference

| Game | Positional Syntax | Flag Syntax |
|------|------------------|-------------|
| ApeStrong ✔︎ | `play ape-strong <amt> <range>` | `--game ape-strong --amount X --range Y` |
| Roulette ✔︎ | `play roulette <amt> <bet>` | `--game roulette --amount X --bet Y` |
| Baccarat ✔︎ | `play baccarat <amt> <bet>` | `--game baccarat --amount X --bet Y` |
| Jungle Plinko ✔︎ | `play jungle <amt> <mode> <balls>` | `--game jungle --amount X --mode Y --balls Z` |
| Cosmic Plinko ✔︎ | `play cosmic <amt> <mode> <balls>` | `--game cosmic --amount X --mode Y --balls Z` |
| Keno ✔︎ | `play keno <amt>` | `--game keno --amount X --picks Y --numbers Z` |
| Speed Keno ✔︎ | `play speed-keno <amt>` | `--game speed-keno --amount X --picks Y --games Z` |
| Dino Dough ✔︎ | `play dino-dough <amt> <spins>` | `--game dino-dough --amount X --spins Y` |
| Bubblegum Heist ✔︎ | `play bubblegum-heist <amt> <spins>` | `--game bubblegum-heist --amount X --spins Y` |
| Monkey Match ✔︎ | `play monkey-match <amt>` | `--game monkey-match --amount X --mode Y` |
| Bear-A-Dice ✔︎ | `play bear-dice <amt>` | `--game bear-dice --amount X --difficulty Y --rolls Z` |
| Primes ✔︎ | `play primes <amt> <difficulty> <runs>` | `--game primes --amount X --difficulty Y --runs Z` |
| Blackjack ✔︎ | `blackjack <amt>` | `blackjack <amt> --side X --auto best` |
| Video Poker ✔︎ / Gimboz Poker | `video-poker <amt>` | `video-poker <amt> --auto best` |

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

## Accepted Wagers

For simple `play` games, the CLI accepts any positive APE amount that can be parsed and funded by the current wallet. There is no shared fixed-denomination whitelist for those games. In loop mode, the built-in strategy presets still default to a `1 APE` floor unless you override strategy settings. The main exceptions are `video-poker`, which is fixed-denomination, and `blackjack`, which separates the main bet from optional side exposure.

| Game | Accepted Main Bet | Min / Floor | Max / Cap | Notes |
|------|-------------------|-------------|-----------|-------|
| ApeStrong ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Single total wager |
| Roulette ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Total wager is split evenly across comma-separated bets |
| Baccarat ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | In combined bets, explicit sub-amounts must sum to the total wager |
| Jungle Plinko ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Total wager is split across `1-100` balls |
| Cosmic Plinko ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Total wager is split across `1-30` balls |
| Keno ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Single total wager |
| Speed Keno ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Total wager is split across `1-20` batched games |
| Dino Dough ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Total wager is split across `1-15` spins |
| Bubblegum Heist ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Total wager is split across `1-15` spins |
| Monkey Match ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Single total wager |
| Bear-A-Dice ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Single total wager; volatility comes from difficulty and rolls |
| Primes ✔︎ | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Total wager is split across `1-20` runs |
| Blackjack ✔︎ | Any positive APE main bet | Main bet must be `> 0`; `--side` must be `>= 0` | No explicit CLI max besides wallet balance and `--max-bet` in loop mode | `double` and `split` each add another initial-bet-sized stake; `insurance` costs half the initial bet |
| Video Poker ✔︎ / Gimboz Poker | Fixed denominations only | Fixed list: `1`, `5`, `10`, `25`, `50`, `100 APE` | Fixed max `100 APE` | Loop mode rounds to the closest affordable valid denomination; jackpot eligibility requires `100 APE` |

---

## ApeStrong ✔︎

**Type:** Dice / Limbo
**Contract:** `0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600`
**ABI verified:** `true`
**Aliases:** `strong`, `dice`, `limbo`
**Verification notes:** [APESTRONG_CONTRACT.md](./verification/APESTRONG_CONTRACT.md)

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

## Roulette ✔︎

**Type:** Table
**Contract:** `0x1f48A104C1808eb4107f3999999D36aeafEC56d5`
**ABI verified:** `true`
**Aliases:** `rl`
**Verification notes:** [ROULETTE_CONTRACT.md](./verification/ROULETTE_CONTRACT.md)

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

## Baccarat ✔︎

**Type:** Table
**Contract:** `0xB08C669dc0419151bA4e4920E80128802dB5497b`
**ABI verified:** `true`
**Aliases:** `bacc`
**Verification notes:** [BACCARAT_CONTRACT.md](./verification/BACCARAT_CONTRACT.md)

Classic baccarat with contract-backed combined bets. You can play `PLAYER`, `BANKER`, or `TIE`, or combine one main side with an explicit `TIE` leg; `PLAYER` and `BANKER` together are not valid on-chain.

**Command:** `apechurch-cli play baccarat <amount> <bet>`

```bnf
<amount> ::= <ape>
<bet> ::= "PLAYER" | "BANKER" | "TIE" | <combo-bet>
<combo-bet> ::= <ape> <side-bet> <ape> "TIE"
<side-bet> ::= "PLAYER" | "BANKER"
```

**Compare:**
- Exact RTP: `98.94%` on `BANKER`, `98.77%` on `PLAYER`, `85.88%` on `TIE`.
- Max payout: `9x` on `TIE`.
- Operational note: `BANKER` remains the best-EV simple bet; combo-bet RTP is just the wager-weighted average of the chosen legs.

## Jungle Plinko ✔︎

**Type:** Plinko
**Contract:** `0x88683B2F9E765E5b1eC2745178354C70A03531Ce`
**ABI verified:** `true`
**Aliases:** `jungle`
**Verification notes:** [JUNGLE_PLINKO_CONTRACT.md](./verification/JUNGLE_PLINKO_CONTRACT.md)

Weighted-bucket Plinko, not a peg-by-peg physics sim. Mode controls the bucket table; ball count mainly changes variance and the tiny floor-division dust from splitting the wager across `1-100` balls.

**Command:** `apechurch-cli play jungle <amount> <mode> <balls>`

```bnf
<amount> ::= <ape>
<mode> ::= <integer>               ; 0 <= value <= 4
<balls> ::= <integer>              ; 1 <= value <= 100
```

**Compare:**
- Exact RTP by mode: `97.94% - 98.00%`.
- Top multipliers: `2.2x`, `5x`, `15x`, `100x`, `1000x` from mode `0` to `4`.
- Operational note: more balls smooth variance, but mode is what changes the real payout surface.

## Cosmic Plinko ✔︎

**Type:** Plinko
**Contract:** `0x674Bd91adb41897fA780386E610168afBB05e694`
**ABI verified:** `true`
**Aliases:** `cosmic`
**Verification notes:** [COSMIC_PLINKO_CONTRACT.md](./verification/COSMIC_PLINKO_CONTRACT.md)

Asymmetric weighted-bucket Plinko with a narrower mode range than Jungle. Ball count `1-30` mainly changes variance; the exact EV surface is mode-driven.

**Command:** `apechurch-cli play cosmic <amount> <mode> <balls>`

```bnf
<amount> ::= <ape>
<mode> ::= <integer>               ; 0 <= value <= 2
<balls> ::= <integer>              ; 1 <= value <= 30
```

**Compare:**
- Exact RTP by mode: `97.73%`, `97.76%`, `97.80%`.
- Top multipliers: `50x`, `100x`, `250x`.
- Operational note: `mode 2` has the best exact RTP and the highest tail risk.

## Keno ✔︎

**Type:** Keno
**Contract:** `0xc936D6691737afe5240975622f0597fA2d122FAd`
**ABI verified:** `true`
**Aliases:** `k`
**Verification notes:** [KENO_CONTRACT.md](./verification/KENO_CONTRACT.md)

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

## Speed Keno ✔︎

**Type:** Keno (Batched)
**Contract:** `0x40EE3295035901e5Fd80703774E5A9FE7CE2B90C`
**ABI verified:** `true`
**Aliases:** `sk`, `speedk`
**Verification notes:** [SPEED_KENO_CONTRACT.md](./verification/SPEED_KENO_CONTRACT.md)

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

## Dino Dough ✔︎

**Type:** Slots
**Contract:** `0x9ebb4Df257B971582BAf096b62CA41DE7723F3CB`
**ABI verified:** `true`
**Aliases:** `dino`, `slots`
**Verification notes:** [DINO_DOUGH_CONTRACT.md](./verification/DINO_DOUGH_CONTRACT.md)

Verified ordered `3`-reel slot with `6` live symbol indexes per reel and `1-15` spins per tx. Spin count only changes floor-division dust against the buy-in; the contract-backed per-spin EV is fixed by the live reel tables and ordered payout matrix.

**Command:** `apechurch-cli play dino-dough <amount> <spins>`

```bnf
<amount> ::= <ape>
<spins> ::= <integer>              ; 1 <= value <= 15
```

**Compare:**
- Exact RTP: `97.89751366817333%` per spin.
- Max payout: `333x`.
- Operational note: much deeper ordered paytable than the public crop suggests; use the verification note for the full reel and triple matrix.

## Bubblegum Heist ✔︎

**Type:** Slots
**Contract:** `0xB5Da735118e848130B92994Ee16377dB2AE31a4c`
**ABI verified:** `true`
**Aliases:** `bubblegum`, `heist`
**Verification notes:** [BUBBLEGUM_HEIST_CONTRACT.md](./verification/BUBBLEGUM_HEIST_CONTRACT.md)

Same slots ABI family as Dino Dough, but with a different live reel and paytable snapshot. The current contract has `5` symbol indexes per reel and a lower top line.

**Command:** `apechurch-cli play bubblegum-heist <amount> <spins>`

```bnf
<amount> ::= <ape>
<spins> ::= <integer>              ; 1 <= value <= 15
```

**Compare:**
- Exact RTP: `97.79962375%` per spin.
- Max payout: `100x`.
- Operational note: lower ceiling than Dino, but still a contract-backed ordered slot rather than a generic three-of-a-kind toy model.

## Monkey Match ✔︎

**Type:** Matching
**Contract:** `0x59EBd3406b76DCc74102AFa2cA5284E9AAB6bA28`
**ABI verified:** `true`
**Aliases:** `monkey`, `mm`
**Verification notes:** [MONKEY_MATCH_CONTRACT.md](./verification/MONKEY_MATCH_CONTRACT.md)

Five independent monkey draws scored as multiplicity hands. There is no redraw or action tree; mode choice is the whole strategy surface.

**Command:** `apechurch-cli play monkey-match <amount> [--mode <1-2>]`

```bnf
<amount> ::= <ape>
<mode> ::= <integer>               ; value ∈ {1, 2}
```

**Compare:**
- Exact RTP: `97.99%` in Low Risk, `98.29%` in Normal Risk.
- Max payout: `50x` in both modes.
- Operational note: `mode 2` has the better EV; `mode 1` is the lower-variance barrel mix.

## Bear-A-Dice ✔︎

**Type:** Dice
**Contract:** `0x6a48A513A46955D8622C809Fce876d2f11142003`
**ABI verified:** `true`
**Aliases:** `bear`, `bd`
**Verification notes:** [BEAR_DICE_CONTRACT.md](./verification/BEAR_DICE_CONTRACT.md)

All-or-nothing compounded `2d6` survival game. You pick a difficulty and `1-5` rolls; every safe sum compounds the payout, and the first losing sum zeroes the whole run.

**Command:** `apechurch-cli play bear-dice <amount> [--difficulty <0-4>] [--rolls <1-5>]`

```bnf
<amount> ::= <ape>
<difficulty> ::= <integer>         ; 0 <= value <= 4
<rolls> ::= <integer>              ; 1 <= value <= 5
```

**Compare:**
- Exact RTP surface: `97.25% - 97.94%` depending on difficulty and roll count.
- Max payout: from `1.830x` on Easy / 1 roll up to `1,847,949.193x` on Master / 5 rolls.
- Operational note: there is no cash-out path; higher rolls only buy tail risk.

## Primes ✔︎

**Type:** Number / VRF
**Contract:** `0xC1aCd12aA34dC33979871EF95c540D46A6566B4b`
**ABI verified:** `true`
**Aliases:** `prime`
**Verification notes:** [PRIMES_CONTRACT.md](./verification/PRIMES_CONTRACT.md)

Batched prime-or-zero number game. Difficulty controls the numeric range and fixed multipliers; run count only changes variance and floor-division dust.

**Command:** `apechurch-cli play primes <amount> <difficulty> <runs>`

```bnf
<amount> ::= <ape>
<difficulty> ::= <integer>         ; 0 <= value <= 3
<runs> ::= <integer>               ; 1 <= value <= 20
```

**Compare:**
- Exact RTP: `98.00%` on Easy/Medium/Hard and `98.04%` on Extreme.
- Max fixed top payout: `500x` on Extreme via zero.
- Operational note: the transparency running RTP can sit above `100%`, but the contract-backed long-run surface is still the fixed difficulty table in the verification note.

## Blackjack ✔︎

**Type:** Cards
**Contract:** `0x03AC9d823cCc27df9F0981FD3975Ca6F13067Ed7`
**ABI verified:** `true`
**Aliases:** `bj`
**Verification notes:** [BLACKJACK_CONTRACT.md](./verification/BLACKJACK_CONTRACT.md)

Stateful blackjack with interactive actions, optional player-side exposure, and `--auto` support. This repo's promoted surface is based on the public production ABI, not an explorer-verified Solidity source. See [SKILL.md](../SKILL.md#blackjack-) for the user-facing action flow.

**Command:** `apechurch-cli blackjack <amount> [--side <ape>] [--auto [simple|best]]`

```bnf
<amount> ::= <ape>
<side> ::= <number>                ; decimal APE amount; value >= 0
<auto-mode> ::= "simple" | "best"
```

**Compare:**
- RTP references used by the repo: `100.05%` main-only model, `79.88%` player-side only, `82.02%` dealer-side only.
- Core payouts: natural blackjack `2.5x`, normal win `2.0x`, surrender refund `0.5x`.
- Operational note: the main game remains a statistical model; the note file now holds the full action-cost and state-layout trail.

## Video Poker ✔︎ / Gimboz Poker

**Type:** Cards
**Contract:** `0x4f7D016704bC9A1d373E512e10CF86A0E7015D1D`
**ABI verified:** `true`
**Aliases:** `vp`, `gimboz-poker`
**Verification notes:** [VIDEO_POKER_CONTRACT.md](./verification/VIDEO_POKER_CONTRACT.md)

Stateful Jacks or Better with one redraw, interactive play, and an exact hold-EV solver. `video-poker` is the CLI command; Ape Church calls the same game `Gimboz Poker`.

**Command:** `apechurch-cli video-poker <amount> [--auto [simple|best]]`

```bnf
<amount> ::= "1" | "5" | "10" | "25" | "50" | "100"
<auto-mode> ::= "simple" | "best"
```

**Compare:**
- Exact base RTP: `98.1649%` at any fixed denomination.
- Jackpot uplift: `98.1649% + jackpot_ape / 40,000` at `100 APE` only.
- Operational note: redraw fee is `0` when standing pat; jackpot eligibility exists only at the max fixed bet.

---

## Common Loop Options

All games support these with `--loop`.
Note: `play` defaults to `--delay 3`, while `blackjack` and `video-poker` default to `--delay 5`.

```bash
--loop                    # Enable continuous play
--delay <seconds>         # Fixed time between games
--human                   # Add weighted 3-9s human-like delay on top of --delay
--target <ape>            # Stop at target balance
--stop-loss <ape>         # Stop at loss limit
--max-games <n>           # Stop after N games
--bet-strategy <name>     # flat, martingale, fibonacci, dalembert, reverse-martingale
--max-bet <ape>           # Cap maximum bet (for progressive strategies)
--json                    # Machine-readable output
```

---

## Notes

- All amounts are in APE
- Manual `play` for simple games accepts any positive APE amount; built-in strategy presets usually floor auto-sized bets at `1 APE`
- VRF fees are automatically calculated and added
- Stateful games use `--auto simple` by default; `blackjack` and `video-poker` also support `--auto best`
- `video-poker --solver` shows a best-EV hold suggestion in interactive mode
- `video-poker --display full` uses the boxed ASCII table renderer; `simple` stays compact
- Use `apechurch-cli game <name>` for detailed in-CLI help

---

## RTP Comparison

This section keeps exact or formula-derived RTP separate from public `Running RTP` snapshots. Use it as a sanity check, not as proof of edge. Values are rounded to `2` decimals in this document even where the underlying constants keep more precision in code.

### Exact Calculated RTP by Game and Mode

| Game | Mode | CLI Support | Exact RTP | Method | Public Running RTP |
|------|------|-------------|-----------|--------|--------------------|
| ApeStrong ✔︎ | Any supported `range` (`5-95`) | Yes | `97.38% - 97.50%` | Exact EV from verified contract source + live `edgeFlipRangeToPayout(range)` table read on `2026-04-09` | `98.53%` |
| Roulette ✔︎ | All verified bet classes | Yes | `97.11%` | Exact weighted sum on 38 pockets | `97.05%` |
| Baccarat ✔︎ | PLAYER | Yes | `98.77%` | Exact weighted sum on the verified 6-rank draw tree | `98.12%` |
| Baccarat ✔︎ | BANKER | Yes | `98.94%` | Exact weighted sum on the verified 6-rank draw tree | `98.12%` |
| Baccarat ✔︎ | TIE | Yes | `85.88%` | Exact weighted sum on the verified 6-rank draw tree | `98.12%` |
| Jungle Plinko ✔︎ | Mode 0 / Safe | Yes | `98.00%` | Exact weighted sum over on-chain bucket tables | `98.42%` |
| Jungle Plinko ✔︎ | Mode 1 / Low | Yes | `97.97%` | Exact weighted sum over on-chain bucket tables | `98.42%` |
| Jungle Plinko ✔︎ | Mode 2 / Medium | Yes | `97.97%` | Exact weighted sum over on-chain bucket tables | `98.42%` |
| Jungle Plinko ✔︎ | Mode 3 / High | Yes | `97.94%` | Exact weighted sum over on-chain bucket tables | `98.42%` |
| Jungle Plinko ✔︎ | Mode 4 / Extreme | Yes | `97.99%` | Exact weighted sum over on-chain bucket tables | `98.42%` |
| Cosmic Plinko ✔︎ | Mode 0 / Low | Yes | `97.73%` | Exact weighted sum over on-chain bucket tables | `97.32%` |
| Cosmic Plinko ✔︎ | Mode 1 / Modest | Yes | `97.76%` | Exact weighted sum over on-chain bucket tables | `97.32%` |
| Cosmic Plinko ✔︎ | Mode 2 / High | Yes | `97.80%` | Exact weighted sum over on-chain bucket tables | `97.32%` |
| Dino Dough ✔︎ | Any spin count `1-15` | Yes | `97.90%` | Exact weighted sum over the verified live reel-stop tables and ordered paytable getters | `97.80%` |
| Bubblegum Heist ✔︎ | Any spin count `1-15` | Yes | `97.80%` | Exact weighted sum over the verified live reel-stop tables and ordered paytable getters | `97.26%` |
| Keno ✔︎ | Picks 1 | Yes | `93.75%` | Exact hypergeometric EV | `86.35%` |
| Keno ✔︎ | Picks 2 | Yes | `93.75%` | Exact hypergeometric EV | `86.35%` |
| Keno ✔︎ | Picks 3 | Yes | `93.67%` | Exact hypergeometric EV | `86.35%` |
| Keno ✔︎ | Picks 4 | Yes | `93.39%` | Exact hypergeometric EV | `86.35%` |
| Keno ✔︎ | Picks 5 | Yes | `94.68%` | Exact hypergeometric EV | `86.35%` |
| Keno ✔︎ | Picks 6 | Yes | `93.90%` | Exact hypergeometric EV | `86.35%` |
| Keno ✔︎ | Picks 7 | Yes | `94.29%` | Exact hypergeometric EV | `86.35%` |
| Keno ✔︎ | Picks 8 | Yes | `94.19%` | Exact hypergeometric EV | `86.35%` |
| Keno ✔︎ | Picks 9 | Yes | `93.32%` | Exact hypergeometric EV | `86.35%` |
| Keno ✔︎ | Picks 10 | Yes | `93.83%` | Exact hypergeometric EV | `86.35%` |
| Speed Keno ✔︎ | Picks 1 | Yes | `97.50%` | Exact hypergeometric EV | `93.36%` |
| Speed Keno ✔︎ | Picks 2 | Yes | `97.37%` | Exact hypergeometric EV | `93.36%` |
| Speed Keno ✔︎ | Picks 3 | Yes | `97.81%` | Exact hypergeometric EV | `93.36%` |
| Speed Keno ✔︎ | Picks 4 | Yes | `97.42%` | Exact hypergeometric EV | `93.36%` |
| Speed Keno ✔︎ | Picks 5 | Yes | `97.84%` | Exact hypergeometric EV | `93.36%` |
| Monkey Match ✔︎ | Low Risk | Yes | `97.99%` | Exact combinatorial EV over the verified on-chain 5-draw paytable | `97.34%` |
| Monkey Match ✔︎ | Normal Risk | Yes | `98.29%` | Exact combinatorial EV over the verified on-chain 5-draw paytable | `97.34%` |
| Bear-A-Dice ✔︎ | Difficulty / roll matrix | Yes | `97.25% - 97.94%` | Exact weighted sum over verified on-chain `payouts[difficulty][numRuns][diceSum]` and the true 2d6 distribution | `97.56%` |
| Blackjack ✔︎ | Main Only | Yes | `100.05%` | Statistical main-game model from the repo simulator | `96.84%` |
| Blackjack ✔︎ | Side Only | Yes | `79.88%` | Exact EV from the published player-side table | `96.84%` |
| Blackjack ✔︎ | Dealer Side Only | Yes | `82.02%` | Exact EV from the published dealer-side conditions | `96.84%` |
| Video Poker ✔︎ / Gimboz Poker | Base paytable at any fixed bet | Yes | `98.16%` | Exact weighted sum over verified on-chain paytable and final-hand odds | `89.53%` |
| Video Poker ✔︎ / Gimboz Poker | `100 APE` bet with known jackpot pool | Yes | `98.16% + jackpot_ape / 40,000` | Exact parametric jackpot uplift from `jackpotTotal` | `89.53%` |
| Blocks | Easy | No | `98.41%` | Exact weighted sum over cluster table | `93.92%` |
| Blocks | Hard | No | `98.55%` | Exact weighted sum over cluster table | `93.92%` |
| Primes ✔︎ | Easy | Yes | `98.00%` | Exact weighted sum over verified on-chain `gameModes` and prime mapping | `105.64%` |
| Primes ✔︎ | Medium | Yes | `98.00%` | Exact weighted sum over verified on-chain `gameModes` and prime mapping | `105.64%` |
| Primes ✔︎ | Hard | Yes | `98.00%` | Exact weighted sum over verified on-chain `gameModes` and prime mapping | `105.64%` |
| Primes ✔︎ | Extreme | Yes | `98.04%` | Exact weighted sum over verified on-chain `gameModes` and prime mapping | `105.64%` |

### Still Not Exactly Calculable from Local Sources

The local source set is still insufficient for a defensible closed-form RTP on `Cash Dash`, `Gimboz Smash`, `Hi-Lo Nebula`, `Cult Quest`, `Glyde or Crash`, `Reel Pirates`, `Sushi Showdown`, `Geez Diggerz`, and `Rico's Revenge`.

For `Blackjack ✔︎`, the main hand still remains a statistical model rather than a closed-form proof, while the isolated player-side and dealer-side lanes are recoverable from the published side-bet tables and the public rule surface now matches the repo solver assumptions.

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
  - `Bubblegum Heist ✔︎`: `97.80%` from the verified live reel and ordered-paytable snapshot read on `2026-04-09`
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

These examples suggest a fairly stable conclusion. If the objective is **GP per unit of expected loss**, then high-RTP eligible games dominate, but the margin between a roughly `97.49%` ApeStrong baseline and a `97.8%` baseline is smaller than many players intuit. By contrast, volatility and bankroll path-dependence can differ substantially, which is why `ApeStrong ✔︎` at a relatively wide range or `Roulette ✔︎` with `RED,BLACK` remain attractive operational baselines even when a slot-like game has a slightly better published RTP.

Equally important, the cumulative bonus system means the relevant metric is not just raw RTP but **expected loss per effective GP** and, by extension, **expected loss per level**. Under the standard ratio, the bonus ladder shifts the effective return from `6.0 GP/APE` at `1,000 APE` volume to `7.25 GP/APE` at `1,000,000 APE` volume. On double weeks the same ladder becomes markedly more favorable, while on half weeks the economics deteriorate enough that conservative flat-volume loops become more important than promotional optimism.

---

## Not Yet Supported in This CLI

These titles appear in Ape Church public docs or the Transparency section, but this repo does not expose a playable CLI command for them yet. The numbers below are descriptive only. Running RTP values are public snapshots, not guaranteed long-run returns.

### Public Overview

| Game | Publicly described as | Running RTP | Coverage | Notes |
|------|------------------------|-------------|----------|-------|
| Cash Dash | ladder / cash-out tile game | 96.04% | aggregate only | Docs + transparency; each step raises multiplier and can bust the run |
| Gimboz Smash | range-target risk game | 99.42% | aggregate only | Docs + transparency; not the same mechanic as the supported `ape-strong` command |
| Hi-Lo Nebula | higher/lower card streak game | 97.84% | paytable | Docs + transparency; public header shows `97.5%` calculated RTP |
| Cult Quest | gem / trap grid cash-out game | 96.67% | aggregate only | Docs + transparency; fewer safe spots means higher risk |
| Blocks | 3x3 cluster-matching tile game | 93.92% | paytable | Docs + transparency; payout depends on largest color cluster |
| Glyde or Crash | crash / cash-out multiplier game | 105.59% | aggregate only | Docs + transparency; official docs also use the spelling `Glyder or Crash` |
| Reel Pirates | undocumented in current official source set | 99.81% | aggregate only | Transparency only in the material archived here |
| Sushi Showdown | slot-style icon game | 95.99% | partial paytable | Transparency only in the material archived here |
| Geez Diggerz | slot-style icon game | 97.25% | partial paytable | Transparency only in the material archived here; header shows `97.8%` calculated RTP |
| Rico's Revenge | undocumented in current official source set | 90.94% | aggregate only | Transparency only in the material archived here |

### Richer Public Mechanics

| Game | Useful public detail |
|------|----------------------|
| Hi-Lo Nebula | Multiplier depends on the current card. Edge cards only allow one direction at `1.0600x`, while `8` is symmetric at `2.0833x` for either `Higher` or `Lower`. |
| Blocks | Largest color cluster determines payout. Easy mode starts paying at `3 blocks = 1.01x`; hard mode sacrifices that floor but pushes the top end to `5000x` for `9 blocks`. |
| Sushi Showdown | The visible public slot patterns top out at `500x` for `A A A`, with mixed patterns like `A A B`, `A B A`, and `B A A` all paying `100x`. |
| Geez Diggerz | The visible public slot patterns top out at `50x` for `A A A`; mixed visible patterns mostly cluster around `8x` to `10x`. |

### Exact Calculated RTP by Unsupported Game

#### Blocks

| Mode | Exact RTP |
|------|-----------|
| Easy | `98.41%` |
| Hard | `98.55%` |
