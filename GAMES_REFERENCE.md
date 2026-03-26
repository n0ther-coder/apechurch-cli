# Games Reference

Complete syntax and examples for all Ape Church CLI games.

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

| Type | Options | Payout | Example |
|------|---------|--------|---------|
| Single Number | 0, 00, 1-36 | 36.9x | `17` |
| Red/Black | RED, BLACK | 2.05x | `RED` |
| Odd/Even | ODD, EVEN | 2.05x | `ODD` |
| Halves | FIRST_HALF, SECOND_HALF | 2.05x | `FIRST_HALF` |
| Thirds | FIRST_THIRD, SECOND_THIRD, THIRD_THIRD | 3.075x | `FIRST_THIRD` |
| Columns | FIRST_COL, SECOND_COL, THIRD_COL | 3.075x | `FIRST_COL` |

### Multi-Bet
Comma-separate bets to split wager evenly:
```bash
apechurch-cli play roulette 100 RED,BLACK   # 50 on each (hedge bet)
```

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

### Payouts

| Hits | Payout |
|------|--------|
| 5/5 | 2000x |
| 4/4 | 100x |
| 3/3 | 20x |
| 2/2 | 4x |
| 1/1 | 2x |

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

See [SKILL.md](./SKILL.md#blackjack) for complete documentation.

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

## Video Poker

See [SKILL.md](./SKILL.md#video-poker) for complete documentation.

```bash
# Auto-play
apechurch-cli video-poker 10 --auto
apechurch-cli video-poker 10 --auto best

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
- Minimum bet is typically 1 APE
- VRF fees are automatically calculated and added
- Stateful games use `--auto simple` by default; video poker also supports `--auto best`
- Use `apechurch-cli game <name>` for detailed in-CLI help
