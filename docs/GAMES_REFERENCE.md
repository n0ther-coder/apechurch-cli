# Games Reference

> Summary: Command cookbook for every supported game, plus a compact appendix for public Ape Church games not yet exposed by this CLI. Gives quick syntax, parameter reminders, examples, and the most useful transparency metrics without the broader agent-focused context in `SKILL.md`.

Complete syntax and examples for all Ape Church CLI games.

Where useful, this file also folds in payout tables and live Transparency-section snapshots for the games that are actually supported by this repo. Treat published RTP values as observed snapshots, not guaranteed long-run returns.

---

## Quick Reference

| Game | Positional Syntax | Flag Syntax |
|------|------------------|-------------|
| ApeStrong | `play ape-strong <amt> <range>` | `--game ape-strong --amount X --range Y` |
| Roulette | `play roulette <amt> <bet>` | `--game roulette --amount X --bet Y` |
| Baccarat | `play baccarat <amt> <bet>` | `--game baccarat --amount X --bet Y` |
| Plinko | `play jungle-plinko <amt> <mode> <balls>` | `--game jungle-plinko --amount X --mode Y --balls Z` |
| Keno | `play keno <amt>` | `--game keno --amount X --picks Y --numbers Z` |
| Speed Keno | `play speed-keno <amt>` | `--game speed-keno --amount X --picks Y --games Z` |
| Dino Dough | `play dino-dough <amt> <spins>` | `--game dino-dough --amount X --spins Y` |
| Bubblegum | `play bubblegum-heist <amt> <spins>` | `--game bubblegum-heist --amount X --spins Y` |
| Monkey Match | `play monkey-match <amt>` | `--game monkey-match --amount X --mode Y` |
| Bear-A-Dice | `play bear-dice <amt>` | `--game bear-dice --amount X --difficulty Y --rolls Z` |

---

## Accepted Wagers

For simple `play` games, the CLI accepts any positive APE amount that can be parsed and funded by the current wallet. There is no shared fixed-denomination whitelist for those games. In loop mode, the built-in strategy presets still default to a `1 APE` floor unless you override strategy settings. The main exceptions are `video-poker`, which is fixed-denomination, and `blackjack`, which separates the main bet from optional side exposure.

| Game | Accepted Main Bet | Min / Floor | Max / Cap | Notes |
|------|-------------------|-------------|-----------|-------|
| ApeStrong | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Single total wager |
| Roulette | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Total wager is split evenly across comma-separated bets |
| Baccarat | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | In combined bets, explicit sub-amounts must sum to the total wager |
| Jungle Plinko | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Total wager is split across `1-100` balls |
| Keno | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Single total wager |
| Speed Keno | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Total wager is split across `1-20` batched games |
| Dino Dough | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Total wager is split across `1-15` spins |
| Bubblegum Heist | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Total wager is split across `1-15` spins |
| Monkey Match | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Single total wager |
| Bear-A-Dice | Any positive APE amount | CLI accepts `> 0`; strategy auto-sizing usually floors at `1 APE` | No explicit CLI max besides wallet balance, `--max-bet`, and any contract-side limits | Single total wager; volatility comes from difficulty and rolls |
| Blackjack | Any positive APE main bet | Main bet must be `> 0`; `--side` must be `>= 0` | No explicit CLI max besides wallet balance and `--max-bet` in loop mode | `double` and `split` each add another initial-bet-sized stake; `insurance` costs half the initial bet |
| Video Poker / Gimboz Poker | Fixed denominations only | Fixed list: `1`, `5`, `10`, `25`, `50`, `100 APE` | Fixed max `100 APE` | Loop mode rounds to the closest affordable valid denomination; jackpot eligibility requires `100 APE` |

---

## ApeStrong

**Type:** Dice / Limbo  
**Contract:** `0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600`  
**Aliases:** `strong`, `dice`, `limbo`

### How It Works
Pick a win probability (5-95%). Roll under your number to win. Lower probability = higher payout.

### Syntax

```bash
# Positional
apechurch-cli play ape-strong <amount> <range>

# Flags
apechurch-cli play --game ape-strong --amount <APE> --range <5-95>
```

### Parameters

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| amount | 1+ | required | Wager in APE |
| range | 5-95 | 50 | Win probability (%) |

### Payouts

| Range | Win Chance | Payout |
|-------|------------|--------|
| 5 | 5% | 19.5x |
| 10 | 10% | 9.75x |
| 25 | 25% | 3.9x |
| 50 | 50% | 1.95x |
| 75 | 75% | 1.3x |
| 95 | 95% | 1.025x |

### Transparency Snapshot

- House Profit: `90,902 APE`
- Running RTP: `98.53%`
- Total Wagered: `6,164,641 APE`
- Total Games Played: `137,076`
- Public transparency currently exposes aggregate metrics only for Ape Strong; the CLI pay formula above remains the useful source of truth for actual play here.

### Examples

```bash
# 50% chance, 1.95x payout
apechurch-cli play ape-strong 10 50

# High risk, high reward
apechurch-cli play ape-strong 5 10

# Safe grinding
apechurch-cli play ape-strong 20 75

# Loop with martingale
apechurch-cli play ape-strong 10 50 --loop --bet-strategy martingale --max-bet 80

# JSON output
apechurch-cli play ape-strong 10 50 --json
```

---

## Roulette

**Type:** Table  
**Contract:** `0x1f48A104C1808eb4107f3999999D36aeafEC56d5`  
**Aliases:** `rl`

### How It Works
American roulette with 0, 00, and 1-36. Bet on numbers, colors, sections, or combinations.

### Syntax

```bash
# Positional
apechurch-cli play roulette <amount> <bet>

# Flags
apechurch-cli play --game roulette --amount <APE> --bet <BETS>
```

### Bet Types

| Type | Options | Payout | Probability | Example |
|------|---------|--------|-------------|---------|
| Single Number | 0, 00, 1-36 | 36.9x | 2.63% | `17` |
| Red/Black | RED, BLACK | 2.05x | 47.37% | `RED` |
| Odd/Even | ODD, EVEN | 2.05x | 47.37% | `ODD` |
| Halves | FIRST_HALF, SECOND_HALF | 2.05x | 47.37% | `FIRST_HALF` |
| Thirds | FIRST_THIRD, SECOND_THIRD, THIRD_THIRD | 3.075x | 31.58% | `FIRST_THIRD` |
| Columns | FIRST_COL, SECOND_COL, THIRD_COL | 3.075x | 31.58% | `FIRST_COL` |

### Multi-Bet
Comma-separate bets to split wager evenly:
```bash
apechurch-cli play roulette 100 RED,BLACK   # 50 on each (hedge bet)
```

The public transparency table also lists split and corner payouts, but this reference sticks to the bet classes the CLI already documents directly.

### Transparency Snapshot

- Calculated RTP shown in transparency: `97.1%`
- House Profit: `192,637 APE`
- Running RTP: `97.05%`
- Total Wagered: `6,529,689 APE`
- Total Games Played: `90,386`

### Examples

```bash
# Color bet
apechurch-cli play roulette 10 RED

# Single number (big payout)
apechurch-cli play roulette 5 17

# Zero
apechurch-cli play roulette 10 0

# Double zero
apechurch-cli play roulette 10 00

# Hedge bet (small guaranteed profit unless 0/00)
apechurch-cli play roulette 100 RED,BLACK

# Third bet
apechurch-cli play roulette 30 FIRST_THIRD

# Loop on red
apechurch-cli play roulette 10 RED --loop --target 150 --stop-loss 50
```

---

## Baccarat

**Type:** Table  
**Contract:** `0xB08C669dc0419151bA4e4920E80128802dB5497b`  
**Aliases:** `bacc`

### How It Works
Classic baccarat. Bet on Player, Banker, or Tie.

### Syntax

```bash
# Simple bet
apechurch-cli play baccarat <amount> <bet>

# Combined bet (explicit amounts)
apechurch-cli play baccarat <total> <amt1> <bet1> <amt2> <bet2>
```

### Bet Types

| Bet | Payout |
|-----|--------|
| PLAYER | 2.0x |
| BANKER | 1.95x |
| TIE | 9.0x |

Combined bets can pair `PLAYER` or `BANKER` with `TIE`, but not `PLAYER` and `BANKER` together in the same wager.

### Transparency Snapshot

- House Profit: `9,888 APE`
- Running RTP: `98.12%`
- Total Wagered: `525,991 APE`
- Total Games Played: `13,183`

### Examples

```bash
# Single bet on Banker
apechurch-cli play baccarat 50 BANKER

# Single bet on Player
apechurch-cli play baccarat 50 PLAYER

# Tie bet (high risk)
apechurch-cli play baccarat 10 TIE

# Combined: 140 Banker + 10 Tie = 150 total
apechurch-cli play baccarat 150 140 BANKER 10 TIE

# Combined: 180 Player + 20 Tie = 200 total
apechurch-cli play baccarat 200 180 PLAYER 20 TIE

# Loop on Banker
apechurch-cli play baccarat 25 BANKER --loop --max-games 50
```

---

## Jungle Plinko

**Type:** Plinko  
**Contract:** `0x88683B2F9E765E5b1eC2745178354C70A03531Ce`  
**Aliases:** `plinko`

### How It Works
Drop balls through pegs. Each ball lands in a multiplier bucket. Higher modes = more volatile multipliers.

### Syntax

```bash
# Positional
apechurch-cli play jungle-plinko <amount> <mode> <balls>

# Flags
apechurch-cli play --game jungle-plinko --amount <APE> --mode <0-4> --balls <1-100>
```

### Parameters

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| amount | 1+ | required | Total wager (split across balls) |
| mode | 0-4 | 2 | Risk level |
| balls | 1-100 | 50 | Number of balls |

### Modes

| Mode | Name | Description |
|------|------|-------------|
| 0 | Safe | Tight multiplier range |
| 1 | Low | Slightly wider range |
| 2 | Medium | Balanced (recommended) |
| 3 | High | Wide swings |
| 4 | Extreme | Maximum volatility |

### Transparency Snapshot

- House Profit: `31,743 APE`
- Running RTP: `98.42%`
- Total Wagered: `2,008,923 APE`
- Total Games Played: `41,638`
- Public transparency currently exposes aggregate metrics only for Jungle Plinko, not a bucket-by-bucket payout table.

### Examples

```bash
# Standard play
apechurch-cli play jungle-plinko 10 2 50

# High risk, max balls
apechurch-cli play jungle-plinko 100 4 100

# Safe mode, few balls
apechurch-cli play jungle-plinko 20 0 10

# Loop
apechurch-cli play jungle-plinko 10 2 50 --loop --max-games 20
```

---

## Keno

**Type:** Keno  
**Contract:** `0xc936D6691737afe5240975622f0597fA2d122FAd`  
**Aliases:** `k`

### How It Works
Pick 1-10 numbers from 1-40. More numbers = riskier but bigger payouts. Hit 10/10 for 1,000,000x!

### Syntax

```bash
# Random picks
apechurch-cli play keno <amount> [--picks <1-10>]

# Specific numbers
apechurch-cli play keno <amount> --picks <N> --numbers <comma-separated>
```

### Parameters

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| amount | 1+ | required | Wager in APE |
| picks | 1-10 | 5 | How many numbers |
| numbers | 1-40 | random | Specific numbers |

### Transparency Snapshot

- House Profit: `16,821 APE`
- Running RTP: `86.35%`
- Total Wagered: `123,224 APE`
- Total Games Played: `25,673`

### Transparency Payout Matrix

| Picks | 0 matches | 1 match | 2 matches | 3 matches | 4 matches | 5 matches | 6 matches | 7 matches | 8 matches | 9 matches | 10 matches |
|-------|-----------|---------|-----------|-----------|-----------|-----------|-----------|-----------|-----------|-----------|------------|
| 1 | 0.5x | 2.25x | - | - | - | - | - | - | - | - | - |
| 2 | 0x | 1.8x | 4.25x | - | - | - | - | - | - | - | - |
| 3 | 0x | 0.8x | 2.5x | 20x | - | - | - | - | - | - | - |
| 4 | 0x | 0x | 2x | 7x | 100x | - | - | - | - | - | - |
| 5 | 1.25x | 0x | 1.1x | 2.5x | 10x | 200x | - | - | - | - | - |
| 6 | 1.5x | 0x | 0.5x | 2x | 7x | 50x | 500x | - | - | - | - |
| 7 | 2x | 0x | 0x | 1.25x | 4x | 37.5x | 250x | 2,500x | - | - | - |
| 8 | 2x | 0x | 0.5x | 1.1x | 2x | 10x | 50x | 500x | 10,000x | - | - |
| 9 | 3x | 0x | 0x | 0.25x | 1.5x | 10x | 50x | 500x | 5,000x | 500,000x | - |
| 10 | 4x | 0x | 0x | 0.25x | 1.2x | 4x | 25x | 250x | 2,000x | 50,000x | 1,000,000x |

### Examples

```bash
# Random 5 picks
apechurch-cli play keno 10

# 10 random picks (max risk)
apechurch-cli play keno 10 --picks 10

# Specific numbers
apechurch-cli play keno 10 --picks 5 --numbers 1,7,13,25,40

# 3 picks (lower risk)
apechurch-cli play keno 20 --picks 3

# Loop
apechurch-cli play keno 5 --picks 5 --loop --max-games 50
```

---

## Speed Keno

**Type:** Keno (Batched)  
**Contract:** `0x40EE3295035901e5Fd80703774E5A9FE7CE2B90C`  
**Aliases:** `sk`, `speedk`

### How It Works
Fast keno with batched games. Pick 1-5 numbers from 1-20. Play up to 20 games at once.

### Syntax

```bash
apechurch-cli play speed-keno <amount> [--picks <1-5>] [--games <1-20>]
```

### Parameters

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| amount | 1+ | required | Total wager (split across games) |
| picks | 1-5 | 3 | Numbers to pick |
| games | 1-20 | 5 | Games to batch |

### Transparency Snapshot

- House Profit: `15,083 APE`
- Running RTP: `93.36%`
- Total Wagered: `227,058 APE`
- Total Games Played: `6,938`

### Transparency Payout Matrix

| Picks | 0 matches | 1 match | 2 matches | 3 matches | 4 matches | 5 matches |
|-------|-----------|---------|-----------|-----------|-----------|-----------|
| 1 | 0.5x | 2.4x | - | - | - | - |
| 2 | 0.25x | 1.45x | 5x | - | - | - |
| 3 | 0.5x | 0.5x | 2.5x | 25x | - | - |
| 4 | 0.5x | 0.5x | 1.5x | 5.5x | 100x | - |
| 5 | 1.25x | 0.2x | 0.5x | 3x | 35x | 2,000x |

### Examples

```bash
# Standard
apechurch-cli play speed-keno 10

# Max games
apechurch-cli play speed-keno 20 --picks 5 --games 20

# Specific numbers
apechurch-cli play speed-keno 10 --picks 3 --numbers 5,10,15

# Loop
apechurch-cli play speed-keno 10 --loop --max-games 30
```

---

## Dino Dough

**Type:** Slots  
**Contract:** `0x9ebb4Df257B971582BAf096b62CA41DE7723F3CB`  
**Aliases:** `dino`, `slots`

### How It Works
Dinosaur-themed slot machine. Spin for matching symbols and multipliers.

### Syntax

```bash
apechurch-cli play dino-dough <amount> <spins>
```

### Parameters

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| amount | 1+ | required | Total wager (split across spins) |
| spins | 1-15 | 10 | Spins per bet |

### Transparency Snapshot

- House Profit: `38,582 APE`
- Running RTP: `97.80%`
- Total Wagered: `1,755,176 APE`
- Total Games Played: `25,154`

### Visible Pattern Payouts

Normalized symbols from the public transparency table:

- `A` = blue dinosaur icon
- `B` = gold square-like icon
- `C` = round emblem icon

| Visible Pattern | Payout |
|-----------------|--------|
| `A A A` | 333x |
| `A A B` | 60x |
| `A B A` | 60x |
| `B A A` | 60x |
| `C A A` | 53.33x |
| `B B B` | 50x |
| `A B B` | 40x |

### Examples

```bash
# 10 APE, 10 spins
apechurch-cli play dino-dough 10 10

# High volume
apechurch-cli play dino-dough 30 15

# Few spins (more variance)
apechurch-cli play dino-dough 10 3

# Loop
apechurch-cli play dino-dough 10 10 --loop --max-games 25
```

---

## Bubblegum Heist

**Type:** Slots  
**Contract:** `0xB5Da735118e848130B92994Ee16377dB2AE31a4c`  
**Aliases:** `bubblegum`, `heist`

### How It Works
Candy-themed slot machine. Identical mechanics to Dino Dough.

### Syntax

```bash
apechurch-cli play bubblegum-heist <amount> <spins>
```

### Parameters

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| amount | 1+ | required | Total wager (split across spins) |
| spins | 1-15 | 10 | Spins per bet |

### Transparency Snapshot

- House Profit: `20,985 APE`
- Running RTP: `97.26%`
- Total Wagered: `765,169 APE`
- Total Games Played: `16,609`

### Visible Pattern Payouts

Normalized symbols from the public transparency table:

- `A` = pink octopus-like icon
- `B` = purple square icon

| Visible Pattern | Payout |
|-----------------|--------|
| `A A A` | 100x |
| `A A B` | 25x |
| `A B A` | 25x |
| `B A A` | 25x |
| `A B B` | 12x |
| `B A B` | 12x |
| `B B A` | 12x |

### Examples

```bash
apechurch-cli play bubblegum-heist 10 10
apechurch-cli play bubblegum-heist 20 15 --loop
```

---

## Monkey Match

**Type:** Matching  
**Contract:** `0x59EBd3406b76DCc74102AFa2cA5284E9AAB6bA28`  
**Aliases:** `monkey`, `mm`

### How It Works
5 monkeys pop from barrels. Form poker hands! Five of a Kind = 50x.

### Syntax

```bash
apechurch-cli play monkey-match <amount> [--mode <1-2>]
```

### Modes

| Mode | Name | Description |
|------|------|-------------|
| 1 | Low Risk | 6 monkey types, easier matches |
| 2 | Normal | 7 monkey types, better mid payouts |

### Transparency Snapshot

- House Profit: `9,169 APE`
- Running RTP: `97.34%`
- Total Wagered: `345,257 APE`
- Total Games Played: `12,405`

### Transparency Paytable

| Outcome | Easy Mode (6 monkeys) | Probability | Normal Mode (7 monkeys) | Probability |
|---------|------------------------|-------------|--------------------------|-------------|
| All Match | 50x | 0.08% | 50x | 0.04% |
| Four of a Kind | 5x | 1.93% | 5x | 1.25% |
| Full House | 4x | 3.86% | 4x | 2.50% |
| Three of a Kind | 2x | 15.43% | 3x | 12.49% |
| Two Pair | 1.25x | 23.15% | 2x | 18.74% |
| One Pair | 0.2x | 46.30% | 0.1x | 49.98% |
| No Match | 0x | 9.26% | 0x | 14.99% |

### Examples

```bash
# Low risk (default)
apechurch-cli play monkey-match 10

# Normal risk
apechurch-cli play monkey-match 10 --mode 2

# Loop
apechurch-cli play monkey-match 10 --loop --max-games 30
```

---

## Bear-A-Dice

**Type:** Dice  
**Contract:** `0x6a48A513A46955D8622C809Fce876d2f11142003`  
**Aliases:** `bear`, `bd`

### How It Works
Roll 2 dice up to 5 times. Avoid unlucky numbers! Higher difficulty = more losing numbers.

### Syntax

```bash
apechurch-cli play bear-dice <amount> [--difficulty <0-4>] [--rolls <1-5>]
```

### Difficulty Levels

| Level | Name | Losing Numbers | Safe Numbers |
|-------|------|----------------|--------------|
| 0 | Easy | 7 | 2-6, 8-12 |
| 1 | Normal | 6, 7, 8 | 2-5, 9-12 |
| 2 | Hard | 5-9 | 2-4, 10-12 |
| 3 | Extreme | 4-10 | 2-3, 11-12 |
| 4 | Master | 3-11 | 2, 12 only |

### Rolls

More rolls = higher potential payout, but more chances to hit a losing number.

At Extreme and Master difficulty, the CLI caps rolls to `3` because of the contract limit.

### Transparency Snapshot

- House Profit: `7,382 APE`
- Running RTP: `97.56%`
- Total Wagered: `302,958 APE`
- Total Games Played: `8,817`
- Public transparency currently exposes aggregate metrics only for Bear-A-Dice, not the unlucky-number roll table used by this CLI.

### Examples

```bash
# Easy, 1 roll
apechurch-cli play bear-dice 10

# Easy, max rolls
apechurch-cli play bear-dice 10 --difficulty 0 --rolls 5

# Normal difficulty
apechurch-cli play bear-dice 10 --difficulty 1 --rolls 3

# Loop (stick to easy for auto-play)
apechurch-cli play bear-dice 10 --difficulty 0 --loop --max-games 20
```

---

## Blackjack

**Type:** Cards<br>
**Contract:** `0x03AC9d823cCc27df9F0981FD3975Ca6F13067Ed7`

Stateful blackjack with interactive actions and auto-play support. See [SKILL.md](../SKILL.md#blackjack) for the full command flow, action handling, and solver notes.

### Accepted Bets

- Main bet: any positive APE amount
- Optional player side bet: `--side <ape>` accepts any non-negative APE amount
- Derived follow-up wagers:
  - `double` adds another stake equal to the initial bet
  - `split` adds another stake equal to the initial bet
  - `insurance` costs half of the initial bet

### Core Rules and Payouts

- Supported player actions: `hit`, `stand`, `double`, `split`, `insurance`, `surrender`
- Natural blackjack pays `2.5x` total (`3:2`)
- Normal win pays `2.0x`
- Early surrender refunds `0.5x` of the initial stake
- Insurance returns `3.0x` total on the insurance stake (`2:1`) if the dealer has blackjack

### Transparency Snapshot

- House Profit: `193,216 APE`
- Running RTP: `96.84%`
- Total Wagered: `6,107,706 APE`
- Total Games Played: `89,385`

### Public Side Bet Table

| Side Bet Outcome | Condition | Payout | Probability |
|------------------|-----------|--------|-------------|
| Diamond Sevens | First two cards are both 7 of Diamonds | 500x | 0.037% |
| Perfect Pair | First two cards share rank and suit | 20x | 1.923% |
| Natural Blackjack | First two cards total 21 | 5x | 4.734% |
| Match Dealer | One of the player's first two cards matches dealer upcard rank | 2x | 14.793% |
| Dealer Ten | Dealer upcard is 10/J/Q/K | 2x | 30.769% |

The transparency side-bet probabilities assume independent card draws for that published mode; do not silently swap them with finite-deck odds when reasoning about this table.

### Examples

```bash
# Auto-play
apechurch-cli blackjack 10 --auto
apechurch-cli blackjack 10 --auto best   # Falls back to simple for now

# Interactive
apechurch-cli blackjack 10

# Loop with strategy
apechurch-cli blackjack 10 --auto --loop --bet-strategy martingale --max-bet 80
apechurch-cli blackjack 10 --auto --loop --delay 5 --human
```

---

## Video Poker / Gimboz Poker

**Type:** Cards<br>
**Contract:** `0x4f7D016704bC9A1d373E512e10CF86A0E7015D1D`<br>
**Aliases:** `vp`, `gimboz-poker`

`video-poker` is the CLI command for Ape Church's `Gimboz Poker`.

Stateful Jacks or Better video poker with one redraw, interactive play, `--auto` modes, and a best-EV solver view. See [SKILL.md](../SKILL.md#video-poker) for the full flow and operational details.

### Accepted Bets

- Fixed denominations only: `1`, `5`, `10`, `25`, `50`, `100 APE`
- In loop mode, strategy output is rounded to the closest affordable valid denomination
- `100 APE` is the maximum fixed bet and the only jackpot-eligible denomination

### Final Hand Paytable

| Final Hand | Payout | Probability |
|------------|--------|-------------|
| Royal Flush | 250x | 0.0025% |
| Straight Flush | 50x | 0.0108% |
| Four of a Kind | 25x | 0.2363% |
| Full House | 9x | 1.1512% |
| Flush | 6x | 1.0995% |
| Straight | 4x | 1.1214% |
| Three of a Kind | 3x | 7.4449% |
| Two Pair | 2x | 12.9279% |
| Jacks or Better | 1x | 21.4585% |

### Transparency Snapshot

- House Profit: `29,557 APE`
- Running RTP: `89.53%`
- Total Wagered: `282,230 APE`
- Total Games Played: `12,866`
- Transparency publishes the visible base paytable above; the CLI also preserves the separate progressive-jackpot rule for a Royal Flush at max bet.

### Examples

```bash
# Auto-play
apechurch-cli video-poker 10 --auto
apechurch-cli video-poker 10 --auto best
apechurch-cli video-poker 10 --solver

# Interactive
apechurch-cli video-poker 10

# Loop
apechurch-cli video-poker 10 --auto --loop --max-games 50
apechurch-cli video-poker 10 --auto best --loop --delay 5 --human
apechurch-cli video-poker --auto best --loop --human --delay 3 --target 2000 --max-games 50 25
```

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
- Stateful games use `--auto simple` by default; video poker also supports `--auto best`
- `video-poker --solver` shows a best-EV hold suggestion in interactive mode
- `video-poker --display full` uses the boxed ASCII table renderer; `simple` stays compact
- Use `apechurch-cli game <name>` for detailed in-CLI help

---

## RTP Comparison

This section keeps theoretical or reconstructed RTP separate from public `Running RTP` snapshots. Use it as a sanity check, not as proof of current edge. Positive deltas mean the live snapshot is running above the published or reconstructed reference at that moment.

### Direct Comparison

These entries are the cleanest comparison points because the theoretical RTP is published or inferred at roughly the same scope as the visible running snapshot.

| Game | CLI Support | Theoretical RTP | Running RTP | Delta | Basis / Confidence |
|------|-------------|-----------------|-------------|-------|--------------------|
| Roulette | Yes | 97.10% | 97.05% | -0.05 pp | Explicit transparency header |
| Hi-Lo Nebula | No | 97.50% | 97.84% | +0.34 pp | Explicit transparency header |
| Bubblegum Heist | Yes | 97.80% | 97.26% | -0.54 pp | Explicit transparency header |
| Geez Diggerz | No | 97.80% | 97.25% | -0.55 pp | Explicit transparency header |
| Dino Dough | Yes | 97.80% | 97.80% | +0.00 pp | Lower-confidence inference from the same public slot-layout treatment |
| Sushi Showdown | No | 97.80% | 95.99% | -1.81 pp | Lower-confidence inference from the same public slot-layout treatment |

### Mode-Specific vs Aggregate Snapshot

These are still useful, but the comparison is less clean because the theoretical RTP is mode-specific while the visible `Running RTP` is a single aggregate snapshot across all public play.

| Game / Mode | CLI Support | Mode RTP | Running RTP | Delta vs Snapshot | Caveat |
|-------------|-------------|----------|-------------|-------------------|--------|
| Cosmic Plinko - Low | No | ~97.64% | 97.32% | -0.32 pp | Mode RTP vs aggregate public snapshot |
| Cosmic Plinko - Moderate | No | ~98.30% | 97.32% | -0.98 pp | Mode RTP vs aggregate public snapshot |
| Cosmic Plinko - High | No | ~99.29% | 97.32% | -1.97 pp | Mode RTP vs aggregate public snapshot |
| Blocks - Easy | No | ~98.41% | 93.92% | -4.49 pp | Mode RTP vs aggregate public snapshot |
| Blocks - Hard | No | ~98.55% | 93.92% | -4.63 pp | Mode RTP vs aggregate public snapshot |
| Monkey Match - Mode 1 / Low Risk | Yes | ~98.15% | 97.34% | -0.81 pp | Mode RTP vs aggregate public snapshot |
| Monkey Match - Mode 2 / Normal | Yes | ~98.20% | 97.34% | -0.86 pp | Mode RTP vs aggregate public snapshot |
| Primes - Easy | No | 98.00% | 105.64% | +7.64 pp | Snapshot currently running well above reconstructed RTP |
| Primes - Medium | No | 98.00% | 105.64% | +7.64 pp | Snapshot currently running well above reconstructed RTP |
| Primes - Hard | No | ~98.00% | 105.64% | +7.64 pp | Snapshot currently running well above reconstructed RTP |
| Primes - Extreme | No | ~98.04% | 105.64% | +7.60 pp | Snapshot currently running well above reconstructed RTP |

### Missing Comparison Cases

The public material archived in `docs/archive/TRANSPARENCY_REFERENCE.md` is still not enough to give a defensible theoretical-vs-running comparison for `ApeStrong`, `Baccarat`, `Jungle Plinko`, `Keno`, `Speed Keno`, `Bear-A-Dice`, `Blackjack`, and `Video Poker / Gimboz Poker`.

---

## GP Farming Considerations

From a more academic perspective, GP farming is a volume-optimization problem under negative expected value. If `V` is eligible wager volume in APE, `m` is the weekly GP multiplier (`0.5` on half weeks, `1.0` on standard weeks, `2.0` on double weeks), and `B(V)` is the cumulative-wager bonus at that milestone, then:

- `GP_total(V, m) = 10mV + B(V)`
- `effective GP/APE ratio = 10m + B(V) / V`
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
  - `ApeStrong`: `97.5%` from the repo formula in `lib/games/apestrong.js`
  - `Roulette` hedge (`RED,BLACK`): `97.1%` from the public transparency header
  - `Bubblegum Heist`: `97.8%` from the public transparency header
- The commands below omit `--stop-loss` so the wager-volume math stays exact. In real play, bankroll limits should still be imposed.

### Published Cumulative Wager Bonus Schedule

| Wager Volume | Cumulative Bonus GP | Bonus Levels | Standard-Week Total GP | Standard-Week Levels | Standard GP/APE |
|-------------|---------------------|--------------|------------------------|----------------------|-----------------|
| `1,000 APE` | `1,000 GP` | `0.1` | `11,000 GP` | `1.1` | `11.00` |
| `10,000 APE` | `15,000 GP` | `1.5` | `115,000 GP` | `11.5` | `11.50` |
| `50,000 APE` | `80,000 GP` | `8.0` | `580,000 GP` | `58.0` | `11.60` |
| `100,000 APE` | `180,000 GP` | `18.0` | `1,180,000 GP` | `118.0` | `11.80` |
| `250,000 APE` | `475,000 GP` | `47.5` | `2,975,000 GP` | `297.5` | `11.90` |
| `500,000 APE` | `1,000,000 GP` | `100.0` | `6,000,000 GP` | `600.0` | `12.00` |
| `1,000,000 APE` | `2,250,000 GP` | `225.0` | `12,250,000 GP` | `1,225.0` | `12.25` |

The ladder matters because the bonus GP is not small relative to the early levels. Crossing the `10,000 APE` threshold on a standard week already yields `115,000 GP`, which is `11.5 Levels`, while the `1,000,000 APE` threshold lifts the standard-week effective ratio to `12.25 GP/APE`.

### Worked Examples

1. **Level 0 bootstrap**
   Command: `apechurch-cli play ape-strong 10 75 --loop --bet-strategy flat --delay 3 --max-games 100`
   Volume: `1,000 APE`
   Expected Loss (`Best ~ Worst`): `25 ~ 50 APE`
   GP Obtained (`Half / Std / Double`): `6,000 / 11,000 / 21,000 GP`
   Levels Gained (`Half / Std / Double`): `0.6 / 1.1 / 2.1`
   GP/APE Ratio (`Half / Std / Double`): `6.0 / 11.0 / 21.0`

2. **Reach Level 5 conservatively**
   Command: `apechurch-cli play roulette 50 RED,BLACK --loop --bet-strategy flat --delay 3 --max-games 100`
   Volume: `5,000 APE`
   Expected Loss (`Best ~ Worst`): `145 ~ 250 APE`
   GP Obtained (`Half / Std / Double`): `26,000 / 51,000 / 101,000 GP`
   Levels Gained (`Half / Std / Double`): `2.6 / 5.1 / 10.1`
   GP/APE Ratio (`Half / Std / Double`): `5.2 / 10.2 / 20.2`

3. **Clear Level 10 with better RTP**
   Command: `apechurch-cli play bubblegum-heist 100 10 --loop --bet-strategy flat --delay 3 --max-games 100`
   Volume: `10,000 APE`
   Expected Loss (`Best ~ Worst`): `220 ~ 500 APE`
   GP Obtained (`Half / Std / Double`): `65,000 / 115,000 / 215,000 GP`
   Levels Gained (`Half / Std / Double`): `6.5 / 11.5 / 21.5`
   GP/APE Ratio (`Half / Std / Double`): `6.5 / 11.5 / 21.5`

4. **Clear Level 15**
   Command: `apechurch-cli play ape-strong 75 75 --loop --bet-strategy flat --delay 3 --max-games 200`
   Volume: `15,000 APE`
   Expected Loss (`Best ~ Worst`): `375 ~ 750 APE`
   GP Obtained (`Half / Std / Double`): `90,000 / 165,000 / 315,000 GP`
   Levels Gained (`Half / Std / Double`): `9.0 / 16.5 / 31.5`
   GP/APE Ratio (`Half / Std / Double`): `6.0 / 11.0 / 21.0`

5. **50k bonus tier baseline**
   Command: `apechurch-cli play ape-strong 50 75 --loop --bet-strategy flat --delay 3 --max-games 1000`
   Volume: `50,000 APE`
   Expected Loss (`Best ~ Worst`): `1,250 ~ 2,500 APE`
   GP Obtained (`Half / Std / Double`): `330,000 / 580,000 / 1,080,000 GP`
   Levels Gained (`Half / Std / Double`): `33.0 / 58.0 / 108.0`
   GP/APE Ratio (`Half / Std / Double`): `6.6 / 11.6 / 21.6`

6. **100k bonus tier RTP-leaning**
   Command: `apechurch-cli play bubblegum-heist 100 10 --loop --bet-strategy flat --delay 3 --max-games 1000`
   Volume: `100,000 APE`
   Expected Loss (`Best ~ Worst`): `2,200 ~ 5,000 APE`
   GP Obtained (`Half / Std / Double`): `680,000 / 1,180,000 / 2,180,000 GP`
   Levels Gained (`Half / Std / Double`): `68.0 / 118.0 / 218.0`
   GP/APE Ratio (`Half / Std / Double`): `6.8 / 11.8 / 21.8`

7. **250k marathon tier**
   Command: `apechurch-cli play ape-strong 100 75 --loop --bet-strategy flat --delay 3 --max-games 2500`
   Volume: `250,000 APE`
   Expected Loss (`Best ~ Worst`): `6,250 ~ 12,500 APE`
   GP Obtained (`Half / Std / Double`): `1,725,000 / 2,975,000 / 5,475,000 GP`
   Levels Gained (`Half / Std / Double`): `172.5 / 297.5 / 547.5`
   GP/APE Ratio (`Half / Std / Double`): `6.9 / 11.9 / 21.9`

### Interpretation

These examples suggest a fairly stable conclusion. If the objective is **GP per unit of expected loss**, then high-RTP eligible games dominate, but the margin between a `97.5%` baseline and a `97.8%` baseline is smaller than many players intuit. By contrast, volatility and bankroll path-dependence can differ substantially, which is why `ApeStrong` at a relatively wide range or `Roulette` with `RED,BLACK` remain attractive operational baselines even when a slot-like game has a slightly better published RTP.

Equally important, the cumulative bonus system means the relevant metric is not just raw RTP but **expected loss per effective GP** and, by extension, **expected loss per level**. Under the standard ratio, the bonus ladder shifts the effective return from `11.0 GP/APE` at `1,000 APE` volume to `12.25 GP/APE` at `1,000,000 APE` volume. On double weeks the same ladder becomes markedly more favorable, while on half weeks the economics deteriorate enough that conservative flat-volume loops become more important than promotional optimism.

---

## Not Yet Supported in This CLI

These titles appear in Ape Church public docs or the Transparency section, but this repo does not expose a playable CLI command for them yet. The numbers below are descriptive only. Running RTP values are public snapshots, not guaranteed long-run returns.

### Public Overview

| Game | Publicly described as | Running RTP | Coverage | Notes |
|------|------------------------|-------------|----------|-------|
| Cash Dash | ladder / cash-out tile game | 96.04% | aggregate only | Docs + transparency; each step raises multiplier and can bust the run |
| Gimboz Smash | range-target risk game | 99.42% | aggregate only | Docs + transparency; not the same mechanic as the supported `ape-strong` command |
| Hi-Lo Nebula | higher/lower card streak game | 97.84% | paytable | Docs + transparency; public header shows `97.5%` calculated RTP |
| Cosmic Plinko | low/medium/high-risk plinko | 97.32% | paytable | Docs + transparency; separate from supported `jungle-plinko` |
| Cult Quest | gem / trap grid cash-out game | 96.67% | aggregate only | Docs + transparency; fewer safe spots means higher risk |
| Blocks | 3x3 cluster-matching tile game | 93.92% | paytable | Docs + transparency; payout depends on largest color cluster |
| Glyde or Crash | crash / cash-out multiplier game | 105.59% | aggregate only | Docs + transparency; official docs also use the spelling `Glyder or Crash` |
| Primes | prime-or-zero number game | 105.64% | paytable | Docs + transparency; zero is the jackpot case |
| Reel Pirates | undocumented in current official source set | 99.81% | aggregate only | Transparency only in the material archived here |
| Sushi Showdown | slot-style icon game | 95.99% | partial paytable | Transparency only in the material archived here |
| Geez Diggerz | slot-style icon game | 97.25% | partial paytable | Transparency only in the material archived here; header shows `97.8%` calculated RTP |
| Rico's Revenge | undocumented in current official source set | 90.94% | aggregate only | Transparency only in the material archived here |

### Richer Public Mechanics

| Game | Useful public detail |
|------|----------------------|
| Hi-Lo Nebula | Multiplier depends on the current card. Edge cards only allow one direction at `1.0600x`, while `8` is symmetric at `2.0833x` for either `Higher` or `Lower`. |
| Cosmic Plinko | Three public risk tables are visible. Top multipliers are `50x` low risk, `100x` moderate, and `250x` high; the most common floor buckets are `0.4x`, `0.3x`, and `0.1x` respectively. |
| Blocks | Largest color cluster determines payout. Easy mode starts paying at `3 blocks = 1.01x`; hard mode sacrifices that floor but pushes the top end to `5000x` for `9 blocks`. |
| Primes | Difficulty changes digit count and win odds. Total win chance drops from `50%` on Easy to `12.3%` on Extreme, while the zero jackpot rises from `2.2x` to `500x`. |
| Sushi Showdown | The visible public slot patterns top out at `500x` for `A A A`, with mixed patterns like `A A B`, `A B A`, and `B A A` all paying `100x`. |
| Geez Diggerz | The visible public slot patterns top out at `50x` for `A A A`; mixed visible patterns mostly cluster around `8x` to `10x`. |