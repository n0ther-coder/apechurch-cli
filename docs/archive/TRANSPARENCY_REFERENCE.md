---
title: "Ape Church — mechanics, odds, payouts, and stats"
source_urls:
  - "https://www.ape.church/transparency"
  - "https://docs.ape.church/games/player-vs-house/classic-games"
  - "https://docs.ape.church/games/player-vs-house/original-games"
source_priority:
  - "Primary: Ape Church Transparency section (https://www.ape.church/transparency)"
  - "Secondary: official Ape Church docs — Classic Games and Original Games pages"
language: "en"
audience: "You and the Ape Church gameplay agents"
status: "manual extraction + normalization from Transparency-section snapshots, supplemented with official docs"
notes:
  - "If the official docs and the Transparency section disagree, prefer the Transparency section for numbers, naming, and current mechanics."
  - "Running RTP is a live snapshot, not a guaranteed long-run theoretical RTP."
  - "Where the Transparency section explicitly shows a Calculated RTP, treat that as the best documented theoretical reference in this file."
---

# Ape Church — mechanics, odds, payouts, and stats

> Summary: Archived extraction of Transparency-section metrics, payout tables, and derived notes. Kept for raw detail and source archaeology after the supported-game highlights were folded into `docs/GAMES_REFERENCE.md`.

## Purpose

This file is meant to be useful in two ways at once:

1. as a **human-readable reference**;
2. as a **machine-friendly knowledge file** for an Ape Church gameplay agent.

It consolidates three source layers:

- the **Ape Church Transparency section** for live metrics, paytables, probabilities, and visible game cards;
- the official Ape Church **Classic Games** docs page;
- the official Ape Church **Original Games** docs page.

In case of discrepancies, this file treats the **Transparency section** as the authoritative source for numbers, naming, and currently visible mechanics.

## Source precedence

Use this precedence order when reasoning:

1. **Transparency section numeric data and visible labels**
2. **Official docs for narrative descriptions and control flow**
3. **Derived calculations in this Markdown**

Whenever a statement below is not literally shown in the Transparency section or the official docs, it is marked as a **derived note** or **inference**.

## Important caveats

- The Transparency section repeatedly states that **"RTP will vary"** and that the displayed amount is a **live RTP calculation**.
- Therefore, **Running RTP** should be treated as an observed snapshot, **not** as proven long-run EV.
- Some games show only aggregate metrics in the Transparency section, while their high-level mechanics come only from the official docs.
- Some slot-style games in the Transparency section use only icons, not textual symbol names. For those, this file uses **normalized placeholder symbols** such as `A`, `B`, and `C` rather than inventing undocumented names.

## Normalized field meanings

- **House Profit**: the house profit shown in APE in the screenshot.
- **Running RTP**: observed live RTP at the time of the screenshot.
- **Total Wagered**: total wager volume visible in the screenshot.
- **Total Games Played**: total rounds/games shown in the screenshot.
- **Payout**: multiplier visible in the source.
- **Chance / Probability**: explicitly shown probability when present.
- **Coverage**:
  - `full detail` = the Transparency section includes paytable / odds / probabilities;
  - `aggregate only` = the Transparency section only shows the Game Mechanics card;
  - `docs only` = no numeric table is visible in the Transparency section used here, but official docs describe the gameplay.

---

# 1. Game catalog visible in the Transparency section

## 1.1 Full catalog from the Transparency game grid

| &nbsp; | &nbsp; | &nbsp; | &nbsp; |
|:---:|:---:|:---:|:---:|
| Roulette | Ape Strong | Blackjack+ | Reel Pirates |
| Cosmic Plinko | Jungle Plinko | Dino Dough | Sushi Showdown |
| Gimboz Smash | Geez Diggerz | Bubblegum Heist | Baccarat |
| Glyde or Crash | Cash Dash | Monkey Match | Bear-A-Dice |
| Gimboz Poker | Hi-Lo Nebula | Rico's Revenge | Cult Quest |
| Speed Keno | Blocks | Primes | Keno |

## 1.2 Coverage map by source

| Game | Transparency metrics | Transparency paytable / odds | Official docs coverage | Notes |
| --- | --- | --- | --- | --- |
| Baccarat | Yes | Yes | Yes | Classic Games docs |
| Keno | Yes | Yes | Yes | Classic Games docs |
| Speed Keno | Yes | Yes | Yes | Mentioned as faster Keno in Classic Games docs |
| Gimboz Poker | Yes | Yes | Yes | Implemented in this repo as `video-poker` / `gimboz-poker` |
| Roulette | Yes | Yes | Yes | Classic Games docs |
| Blackjack+ | Yes | Yes | Yes (as Blackjack) | Transparency naming appears newer |
| Cash Dash | Yes | No | Yes | Original Games docs |
| Gimboz Smash | Yes | No | Yes | Original Games docs |
| Ape Strong | Yes | No | Yes | Original Games docs |
| Hi-Lo Nebula | Yes | Yes | Yes | Original Games docs |
| Cosmic Plinko | Yes | Yes | Yes | Original Games docs |
| Monkey Match | Yes | Yes | Yes | Original Games docs |
| Cult Quest | Yes | No | Yes | Original Games docs |
| Jungle Plinko | Yes | No | Yes | Original Games docs |
| Bear-A-Dice | Yes | No | Yes | Original Games docs |
| Blocks | Yes | Yes | Yes | Original Games docs |
| Glyde or Crash | Yes | No | Yes (as Glyder or Crash) | Transparency spelling appears newer |
| Primes | Yes | Yes | Yes | Original Games docs |
| Reel Pirates | Yes | No | No | Transparency-only in supplied sources |
| Dino Dough | Yes | Yes | No | Transparency-only in supplied sources |
| Sushi Showdown | Yes | Yes | No | Transparency-only in supplied sources |
| Geez Diggerz | Yes | Yes | No | Transparency-only in supplied sources |
| Bubblegum Heist | Yes | Yes | No | Transparency-only in supplied sources |
| Rico's Revenge | Yes | No | No | Transparency-only in supplied sources |

---

# 2. Snapshot overview of all games shown with Transparency metrics

Mirror group numbers below refer to the local extraction grouping used to mirror the Transparency section; they are **not** website page numbers.

| Mirror group | Game | House Profit | Running RTP | Total Wagered | Total Games Played | Coverage |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | Primes | -12,401 APE | 105.64% | 219,787 APE | 6,484 | full detail |
| 4 | Glyde or Crash | -22,088 APE | 105.59% | 394,960 APE | 18,072 | aggregate only |
| 4 | Reel Pirates | 7,536 APE | 99.81% | 3,922,681 APE | 23,622 | aggregate only |
| 4 | Gimboz Smash | 7,184 APE | 99.42% | 1,228,317 APE | 26,983 | aggregate only |
| 4 | Ape Strong | 90,902 APE | 98.53% | 6,164,641 APE | 137,076 | aggregate only |
| 4 | Jungle Plinko | 31,743 APE | 98.42% | 2,008,923 APE | 41,638 | aggregate only |
| 3 | Baccarat | 9,888 APE | 98.12% | 525,991 APE | 13,183 | full detail |
| 3 | Hi-Lo Nebula | 5,999 APE | 97.84% | 277,470 APE | 13,954 | full detail |
| 2 | Dino Dough | 38,582 APE | 97.80% | 1,755,176 APE | 25,154 | full detail |
| 4 | Bear-A-Dice | 7,382 APE | 97.56% | 302,958 APE | 8,817 | aggregate only |
| 3 | Monkey Match | 9,169 APE | 97.34% | 345,257 APE | 12,405 | full detail |
| 2 | Cosmic Plinko | 66,719 APE | 97.32% | 2,487,239 APE | 68,239 | full detail |
| 3 | Bubblegum Heist | 20,985 APE | 97.26% | 765,169 APE | 16,609 | full detail |
| 3 | Geez Diggerz | 28,427 APE | 97.25% | 1,034,711 APE | 18,145 | full detail |
| 2 | Roulette | 192,637 APE | 97.05% | 6,529,689 APE | 90,386 | full detail |
| 3 | Blackjack+ | 193,216 APE | 96.84% | 6,107,706 APE | 89,385 | full detail |
| 4 | Cult Quest | 7,789 APE | 96.67% | 233,786 APE | 4,392 | aggregate only |
| 4 | Cash Dash | 15,035 APE | 96.04% | 379,507 APE | 57,210 | aggregate only |
| 2 | Sushi Showdown | 61,508 APE | 95.99% | 1,533,650 APE | 22,063 | full detail |
| 2 | Blocks | 13,910 APE | 93.92% | 228,655 APE | 9,782 | full detail |
| 3 | Speed Keno | 15,083 APE | 93.36% | 227,058 APE | 6,938 | full detail |
| 4 | Rico's Revenge | 24,281 APE | 90.94% | 267,873 APE | 3,270 | aggregate only |
| 2 | Gimboz Poker | 29,557 APE | 89.53% | 282,230 APE | 12,866 | full detail |
| 2 | Keno | 16,821 APE | 86.35% | 123,224 APE | 25,673 | full detail |

---

# 3. Fast-read notes for agents

- **Games with explicit paytables / probabilities in the Transparency section**: `Keno`, `Blocks`, `Cosmic Plinko`, `Sushi Showdown`, `Gimboz Poker`, `Dino Dough`, `Roulette`, `Hi-Lo Nebula`, `Monkey Match`, `Speed Keno`, `Bubblegum Heist`, `Primes`, `Geez Diggerz`, `Blackjack+`, `Baccarat`.
- **Games with only aggregate metrics in the Transparency section**: `Ape Strong`, `Reel Pirates`, `Jungle Plinko`, `Gimboz Smash`, `Glyde or Crash`, `Cash Dash`, `Bear-A-Dice`, `Rico's Revenge`, `Cult Quest`.
- **Observed live RTP above 100%**: `Primes`, `Glyde or Crash`. This is a snapshot only and does **not** prove long-run player edge.
- **Naming discrepancy worth preserving**:
  - Transparency section: `Glyde or Crash`; docs: `Glyder or Crash`
  - Transparency section: `Blackjack+`; docs: `Blackjack`
  In this file, the **Transparency section naming is preferred**.

---

# 4. Detailed game sections

## 4.1 Classic Games

## Baccarat

### Official gameplay summary

- Card game with three outcomes: **Player**, **Banker**, or **Tie**.
- Goal: predict which hand finishes closest to nine.
- Not enough information in this repo. The official docs say betting is done by selecting chip value and outcome, and they explicitly describe the game as **non-custodial** and **fully on-chain**, with the option to **queue multiple hands per session**.

### Transparency live metrics

- House Profit: **9,888 APE**
- Running RTP: **98.12%**
- Total Wagered: **525,991 APE**
- Total Games Played: **13,183**

### Bet types and payouts

| Bet | Meaning | Payout | Note |
| --- | --- | --- | --- |
| Player Bet | Player hand wins | 2x | even money |
| Banker Bet | Banker hand wins | 1.95x | 5% commission |
| Tie Bet | equal hand value | 9x | plus return of the other bets per the Transparency section wording |

---

## Keno

### Official gameplay summary

- Lottery-style numbers game.
- Players pick spots on a grid and wait for the draw.
- Partially reflected in this repo. The official docs say players can choose numbers manually or use **Auto Pick**, clear the board before betting, and winnings are based on how many matches hit.

### Transparency live metrics

- House Profit: **16,821 APE**
- Running RTP: **86.35%**
- Total Wagered: **123,224 APE**
- Total Games Played: **25,673**

### Keno payouts

| Picks | 0 matches | 1 match | 2 matches | 3 matches | 4 matches | 5 matches | 6 matches | 7 matches | 8 matches | 9 matches | 10 matches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.5x | 2.25x | — | — | — | — | — | — | — | — | — |
| 2 | 0x | 1.8x | 4.25x | — | — | — | — | — | — | — | — |
| 3 | 0x | 0.8x | 2.5x | 20x | — | — | — | — | — | — | — |
| 4 | 0x | 0x | 2x | 7x | 100x | — | — | — | — | — | — |
| 5 | 1.25x | 0x | 1.1x | 2.5x | 10x | 200x | — | — | — | — | — |
| 6 | 1.5x | 0x | 0.5x | 2x | 7x | 50x | 500x | — | — | — | — |
| 7 | 2x | 0x | 0x | 1.25x | 4x | 37.5x | 250x | 2,500x | — | — | — |
| 8 | 2x | 0x | 0.5x | 1.1x | 2x | 10x | 50x | 500x | 10,000x | — | — |
| 9 | 3x | 0x | 0x | 0.25x | 1.5x | 10x | 50x | 500x | 5,000x | 500,000x | — |
| 10 | 4x | 0x | 0x | 0.25x | 1.2x | 4x | 25x | 250x | 2,000x | 50,000x | 1,000,000x |

---

## Speed Keno

### Official gameplay summary

- Speed Keno is a **faster-paced version of Keno** with rapid draws and quicker results.

### Transparency live metrics

- House Profit: **15,083 APE**
- Running RTP: **93.36%**
- Total Wagered: **227,058 APE**
- Total Games Played: **6,938**

### Speed Keno payouts

| Picks | 0 matches | 1 match | 2 matches | 3 matches | 4 matches | 5 matches |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.5x | 2.4x | — | — | — | — |
| 2 | 0.25x | 1.45x | 5x | — | — | — |
| 3 | 0.5x | 0.5x | 2.5x | 25x | — | — |
| 4 | 0.5x | 0.5x | 1.5x | 5.5x | 100x | — |
| 5 | 1.25x | 0.2x | 0.5x | 3x | 35x | 2,000x |

---

## Gimboz Poker / Video Poker

### Official gameplay summary

- Classic 5-card draw style poker round.
- In this repo, Ape Church's `Gimboz Poker` is implemented as the stateful `video-poker` command, with the aliases `vp` and `gimboz-poker`.
- Five cards are dealt, the player decides which to hold and discard, the final hand is evaluated against a fixed payout table, and a **Royal Flush at max bet** qualifies for the progressive jackpot.

### Transparency live metrics

- House Profit: **29,557 APE**
- Running RTP: **89.53%**
- Total Wagered: **282,230 APE**
- Total Games Played: **12,866**

### Transparency rules / structure

- 5-card draw video poker
- One redraw
- Any subset of cards may be held / discarded
- The Transparency section states that the listed odds refer to the **final hand**

### Final hand paytable

| Final Hand | Payout | Probability | Approx. frequency |
| --- | --- | --- | --- |
| Royal Flush | 250x | 0.0025% | about 1 in 40,000 hands |
| Straight Flush | 50x | 0.0108% | about 1 in 9,259 hands |
| Four of a Kind | 25x | 0.2363% | about 1 in 423 hands |
| Full House | 9x | 1.1512% | about 1 in 87 hands |
| Flush | 6x | 1.0995% | about 1 in 91 hands |
| Straight | 4x | 1.1214% | about 1 in 89 hands |
| Three of a Kind | 3x | 7.4449% | about 1 in 13 hands |
| Two Pair | 2x | 12.9279% | about 1 in 8 hands |
| Jacks or Better | 1x | 21.4585% | about 1 in 5 hands |

### Source note

- The Transparency section shows **250x base** for a Royal Flush.
- The repo's `video-poker` implementation also uses a **progressive jackpot for a Royal Flush at max bet**.
- For agent logic, treat **250x** as the visible base paytable entry and **progressive jackpot** as an extra rule-layer that is not fully quantified in the Transparency section.

---

## Roulette

### Official gameplay summary

- Standard roulette-style betting on numbers, groups, or colors.
- Not implemented in this repo. The official docs say players can pre-select multiple spins per session and that total cost depends on buy-in and number of spins.

### Transparency live metrics

- House Profit: **192,637 APE**
- Running RTP: **97.05%**
- Total Wagered: **6,529,689 APE**
- Total Games Played: **90,386**

### Bet types and payouts

The Transparency section header shows **97.1% Calculated RTP**.

| Bet Type | Meaning | Payout | Probability |
| --- | --- | --- | --- |
| Single Number | 1 exact number | 36.9x | 2.63% |
| Split | 2 adjacent numbers | 18.45x | 5.26% |
| Corner | 4 adjacent numbers | 9.225x | 10.53% |
| Red / Black | color bet | 2.05x | 47.37% |
| Even / Odd | parity bet | 2.05x | 47.37% |
| Dozen | 12-number group | 3.075x | 31.58% |
| Half | 18-number half | 2.05x | 47.37% |

---

## Blackjack+

### Official gameplay summary

- Classic player-vs-dealer blackjack flow.
- Player controls include **Hit**, **Stand**, and advanced choices such as **Double Down**.
- The round settles on-chain after the dealer reveals their hand.

### Transparency live metrics

- House Profit: **193,216 APE**
- Running RTP: **96.84%**
- Total Wagered: **6,107,706 APE**
- Total Games Played: **89,385**

### Transparency rules, payouts, and side bets

The Transparency section explicitly lists these standard actions / rules:

- double
- split
- insurance
- early surrender
- natural blackjack pays 3:2

| Item | Payout / Effect | Note |
| --- | --- | --- |
| Regular Win | 2.0x (1:1) | normal win vs dealer |
| Natural Blackjack | 2.5x (3:2) | 21 on the initial two-card hand |
| Insurance (if dealer has Blackjack) | 3.0x total on insurance stake (2:1) | offered when dealer shows an Ace |
| Early Surrender | 0.5x refund | forfeit hand and recover half the initial bet |

### Player side bet outcomes

| Side Bet Outcome | Condition | Payout | Probability |
| --- | --- | --- | --- |
| Diamond Sevens | first two cards are both 7 of Diamonds | 500x | 0.037% (~1 in 2,704) |
| Perfect Pair | first two cards same rank and same suit | 20x | 1.923% (~1 in 52) |
| Natural Blackjack | first two cards total 21 (A + 10/J/Q/K) | 5x | 4.734% (~1 in 21) |

### Dealer side bet outcomes

| Side Bet Outcome | Condition | Payout | Probability |
| --- | --- | --- | --- |
| Match Dealer | one of the player's first two cards matches the dealer upcard rank | 2x | 14.793% (~1 in 7) |
| Dealer Ten | dealer upcard is 10/J/Q/K | 2x | 30.769% (~1 in 3) |

### Source note

- The Transparency section says the side-bet odds are calculated assuming **independent card draws (with replacement)** for this mode.
- That assumption matters; do not silently swap in standard finite-deck blackjack odds unless separately documented.

---

## 4.2 Original Games

## Cash Dash

### Official gameplay summary

- Risk-vs-reward ladder game.
- Players move upward through rows of tiles.
- Each step raises the multiplier.
- Hidden losing tiles can end the round immediately.
- Players can cash out at any time.

### Transparency live metrics

- House Profit: **15,035 APE**
- Running RTP: **96.04%**
- Total Wagered: **379,507 APE**
- Total Games Played: **57,210**

### Transparency detail coverage

- The Transparency section shows only aggregate Game Mechanics data for this game.
- No detailed paytable is visible in the available Transparency capture used here.

---

## Gimboz Smash

### Official gameplay summary

- Not implemented in this repo. The official docs describe a range-target risk game where the player adjusts a difficulty slider to define a target interval, such as `20–80` or tighter ranges like `40–60`.
- Narrower ranges yield higher multipliers and lower win rates.
- Wider ranges yield higher hit rates and lower payouts.

### Transparency live metrics

- House Profit: **7,184 APE**
- Running RTP: **99.42%**
- Total Wagered: **1,228,317 APE**
- Total Games Played: **26,983**

### Transparency detail coverage

- Aggregate metrics only.
- No detailed win table is visible in the available Transparency capture used here.

---

## Ape Strong

### Official gameplay summary

- Not enough information in this repo. The implemented `ape-strong` command is documented differently, while the official docs describe a strength / target-score game where the player chooses a bet and difficulty, difficulty determines the target number and win chance, and closer hits pay more.

### Transparency live metrics

- House Profit: **90,902 APE**
- Running RTP: **98.53%**
- Total Wagered: **6,164,641 APE**
- Total Games Played: **137,076**

### Transparency detail coverage

- Aggregate metrics only.

---

## Hi-Lo Nebula

### Official gameplay summary

- Sequential higher/lower/same card prediction game.
- Not implemented in this repo. The official docs say the player can continue after each correct choice or cash out to lock gains, and they also mention a jackpot for lucky streaks.

### Transparency live metrics

- House Profit: **5,999 APE**
- Running RTP: **97.84%**
- Total Wagered: **277,470 APE**
- Total Games Played: **13,954**

### Bet types and payouts

The Transparency section header shows **97.5% Calculated RTP**.

| Current Card | Higher | Lower |
| --- | --- | --- |
| 2 | 1.0600x | N/A |
| 3 | 1.1363x | 12.5000x |
| 4 | 1.2500x | 6.2500x |
| 5 | 1.3888x | 4.1666x |
| 6 | 1.5625x | 3.1250x |
| 7 | 1.7857x | 2.5000x |
| 8 | 2.0833x | 2.0833x |
| 9 | 2.5000x | 1.7857x |
| 10 | 3.1250x | 1.5625x |
| J | 4.1666x | 1.3888x |
| Q | 6.2500x | 1.2500x |
| K | 12.5000x | 1.1363x |
| A | N/A | 1.0600x |

---

## Cosmic Plinko

### Official gameplay summary

- Peg-board / falling-ball multiplier game.
- Not implemented in this repo. The official docs say players choose bet size, risk level (`low`, `medium`, `high`), and number of balls.

### Transparency live metrics

- House Profit: **66,719 APE**
- Running RTP: **97.32%**
- Total Wagered: **2,487,239 APE**
- Total Games Played: **68,239**

### Low Risk

| Multiplier | Probability |
| --- | --- |
| 50x | 0.22% |
| 20x | 0.44% |
| 11x | 0.66% |
| 7x | 1.54% |
| 3x | 3.31% |
| 2x | 4.41% |
| 1.2x | 6.61% |
| 0.4x | 82.80% |

### Moderate Risk

| Multiplier | Probability |
| --- | --- |
| 100x | 0.12% |
| 50x | 0.23% |
| 25x | 0.46% |
| 11x | 1.03% |
| 5x | 2.30% |
| 2x | 5.74% |
| 0.5x | 9.75% |
| 0.3x | 80.37% |

### High Risk

| Multiplier | Probability |
| --- | --- |
| 250x | 0.04% |
| 100x | 0.07% |
| 50x | 0.17% |
| 25x | 0.52% |
| 10x | 1.20% |
| 5x | 2.06% |
| 3x | 4.13% |
| 1.5x | 6.19% |
| 0.4x | 27.51% |
| 0.1x | 58.11% |

---

## Monkey Match

### Official gameplay summary

- Symbol-combination game.
- Each round reveals a set of symbols and the payout depends on the final combination.
- They explicitly mention high-value outcomes such as **All Match**, **Four of a Kind**, and **Full House**.

### Transparency live metrics

- House Profit: **9,169 APE**
- Running RTP: **97.34%**
- Total Wagered: **345,257 APE**
- Total Games Played: **12,405**

### Transparency rules

- 5 monkeys are revealed each round.
- Easy mode uses **6 monkey types**.
- Hard mode uses **7 monkey types**.

| Outcome | Easy Mode (6 monkeys) | Probability | Hard Mode (7 monkeys) | Probability |
| --- | --- | --- | --- | --- |
| All Match | 50x | 0.08% | 50x | 0.04% |
| Four of a Kind | 5x | 1.93% | 5x | 1.25% |
| Full House | 4x | 3.86% | 4x | 2.50% |
| Three of a Kind | 2x | 15.43% | 3x | 12.49% |
| Two Pair | 1.25x | 23.15% | 2x | 18.74% |
| One Pair | 0.2x | 46.30% | 0.1x | 49.98% |
| No Match | 0x | 9.26% | 0x | 14.99% |

---

## Cult Quest

### Official gameplay summary

- Grid-based risk game.
- Not implemented in this repo. The official docs say the player chooses the number of **gems / safe spots**.
- Fewer gems means higher risk and higher potential payout.
- Each pick reveals either a gem or a trap.
- The player can cash out early.

### Transparency live metrics

- House Profit: **7,789 APE**
- Running RTP: **96.67%**
- Total Wagered: **233,786 APE**
- Total Games Played: **4,392**

### Transparency detail coverage

- Aggregate metrics only.

---

## Jungle Plinko

### Official gameplay summary

- Jungle-themed plinko variant.
- Players can adjust wager, risk level, and number of balls.

### Transparency live metrics

- House Profit: **31,743 APE**
- Running RTP: **98.42%**
- Total Wagered: **2,008,923 APE**
- Total Games Played: **41,638**

### Transparency detail coverage

- Aggregate metrics only.

---

## Bear-A-Dice

### Official gameplay summary

- Not enough information in this repo; the implemented `bear-dice` command is documented as an unlucky-number dice game rather than a multiplier-tile board.
- Players can choose bet amount, difficulty, and number of rolls.

### Transparency live metrics

- House Profit: **7,382 APE**
- Running RTP: **97.56%**
- Total Wagered: **302,958 APE**
- Total Games Played: **8,817**

### Transparency detail coverage

- Aggregate metrics only.

---

## Blocks

### Official gameplay summary

- 3x3 tile game.
- Not implemented in this repo. The official docs say each flip reveals a number tied to a multiplier.
- Risk level affects how multipliers are distributed across the board.

### Transparency live metrics

- House Profit: **13,910 APE**
- Running RTP: **93.92%**
- Total Wagered: **228,655 APE**
- Total Games Played: **9,782**

### Transparency base rule

- 3x3 grid
- 9 blocks
- 6 possible colors
- payout depends on the **largest color cluster**

| Largest Cluster | Easy Mode | Probability | Hard Mode | Probability |
| --- | --- | --- | --- | --- |
| 3 blocks | 1.01x | 55.8461% | no payout | 55.8461% |
| 4 blocks | 1.2x | 23.0303% | 2.25x | 23.0303% |
| 5 blocks | 2x | 4.6886% | 6.6x | 4.6886% |
| 6 blocks | 5x | 0.6251% | 15x | 0.6251% |
| 7 blocks | 20x | 0.0536% | 80x | 0.0536% |
| 8 blocks | 200x | 0.0027% | 600x | 0.0027% |
| 9 blocks | 2500x | 0.0001% | 5000x | 0.0001% |

---

## Glyde or Crash

### Official gameplay summary

- It is a multiplier game where payout increases over time until a crash event occurs.
- The player can cash out before the crash or target a preset multiplier.

### Transparency live metrics

- House Profit: **-22,088 APE**
- Running RTP: **105.59%**
- Total Wagered: **394,960 APE**
- Total Games Played: **18,072**

### Transparency detail coverage

- Aggregate metrics only.
- No detailed crash-distribution table is visible in the available Transparency capture used here.

### Naming note

- Use `Glyde or Crash` for current internal naming in this file because that is what the Transparency section shows.
- Preserve `Glyder or Crash` as an alias when matching against docs or UI strings derived from the official docs page.

---

## Primes

### Official gameplay summary

- Random-number game.
- Not implemented in this repo. The official docs say the player wins if the result is a **prime number** or **zero**.
- Prime results use the standard win multiplier; zero is a jackpot case.
- Difficulty changes win probability and payout structure.

### Transparency live metrics

- House Profit: **-12,401 APE**
- Running RTP: **105.64%**
- Total Wagered: **219,787 APE**
- Total Games Played: **6,484**

### Transparency base rule

The Transparency section explicitly says:

- digits are rolled **with leading zeros**;
- example: `0011 = 11`;
- prime numbers win;
- zero has a jackpot payout.

| Mode | Roll Space | Prime Win | Probability | Zero Jackpot | Probability | Total Win Chance |
| --- | --- | --- | --- | --- | --- | --- |
| Easy (1 digit) | 0-9 | 1.9x | 40% | 2.2x | 10% | 50% |
| Medium (2 digits) | 00-99 | 3.5x | 25% | 10.5x | 1% | 26% |
| Hard (3 digits) | 000-999 | 5.5x | 16.8% | 56x | 0.1% | 16.9% |
| Extreme (4 digits) | 0000-9999 | 7.57x | 12.29% | 500x | 0.01% | 12.3% |

---

## 4.3 Transparency-only games in the supplied source set

These games appear in the Transparency section but are not described in the two official docs pages the user asked to integrate here.

## Reel Pirates

### Transparency live metrics

- House Profit: **7,536 APE**
- Running RTP: **99.81%**
- Total Wagered: **3,922,681 APE**
- Total Games Played: **23,622**

### Coverage

- Aggregate metrics only.
- No official description was provided in the linked docs pages.

---

## Dino Dough

### Transparency live metrics

- House Profit: **38,582 APE**
- Running RTP: **97.80%**
- Total Wagered: **1,755,176 APE**
- Total Games Played: **25,154**

### Slot payout normalization

Normalized symbols:

- `A` = blue dinosaur icon
- `B` = gold square-like icon
- `C` = round emblem icon

Only combinations clearly visible in the Transparency capture are transcribed below.

| Visible Pattern | Payout |
| --- | --- |
| A A A | 333x |
| A A B | 60x |
| A B A | 60x |
| B A A | 60x |
| C A A | 53.33x |
| B B B | 50x |
| A B B | 40x |

---

## Sushi Showdown

### Transparency live metrics

- House Profit: **61,508 APE**
- Running RTP: **95.99%**
- Total Wagered: **1,533,650 APE**
- Total Games Played: **22,063**

### Slot payout normalization

Normalized symbols:

- `A` = orange circular icon
- `B` = blue square-like icon

Only patterns clearly visible in the Transparency capture are transcribed below.

| Visible Pattern | Payout |
| --- | --- |
| A A A | 500x |
| A A B | 100x |
| A B A | 100x |
| B A A | 100x |
| B B B | 55x |
| A B B | 50x |
| B A B | 50x |

---

## Geez Diggerz

### Transparency live metrics

- House Profit: **28,427 APE**
- Running RTP: **97.25%**
- Total Wagered: **1,034,711 APE**
- Total Games Played: **18,145**

### Slot payout normalization

The Transparency section header shows **97.8% Calculated RTP**.

Normalized symbols:

- `A` = gold / treasure icon
- `B` = monkey icon

Only patterns clearly visible in the Transparency capture are transcribed below.

| Visible Pattern | Payout |
| --- | --- |
| A A A | 50x |
| A A B | 10x |
| A B A | 10x |
| B A A | 10x |
| B B B | 10x |
| A B B | 8x |
| B A B | 8x |

---

## Bubblegum Heist

### Transparency live metrics

- House Profit: **20,985 APE**
- Running RTP: **97.26%**
- Total Wagered: **765,169 APE**
- Total Games Played: **16,609**

### Slot payout normalization

The Transparency section header shows **97.8% Calculated RTP**.

Normalized symbols:

- `A` = pink octopus-like icon
- `B` = purple square icon

| Visible Pattern | Payout |
| --- | --- |
| A A A | 100x |
| A A B | 25x |
| A B A | 25x |
| B A A | 25x |
| A B B | 12x |
| B A B | 12x |
| B B A | 12x |

---

## Rico's Revenge

### Transparency live metrics

- House Profit: **24,281 APE**
- Running RTP: **90.94%**
- Total Wagered: **267,873 APE**
- Total Games Played: **3,270**

### Coverage

- Aggregate metrics only.
- No official description was provided in the linked docs pages.

---

# 5. Derived notes for agent design

## 5.1 Explicitly documented vs derived

### Explicitly documented in the Transparency section

- Some games show direct **probabilities** for outcomes.
- Some games show **Calculated RTP** in the section header.
- All visible Game Mechanics cards show a snapshot of:
  - House Profit
  - Running RTP
  - Total Wagered
  - Total Games Played

### Derived from the Transparency numbers in this Markdown

The table below contains either direct Transparency-section theoretical RTP labels or simple expected-value reconstructions from published payout/probability tables.

| Game / Mode | Theoretical or reconstructed RTP | Basis | Type |
| --- | --- | --- | --- |
| Cosmic Plinko — Low | ~97.64% | sum of payout × probability | derived |
| Cosmic Plinko — Moderate | ~98.30% | sum of payout × probability | derived |
| Cosmic Plinko — High | ~99.29% | sum of payout × probability | derived |
| Blocks — Easy | ~98.41% | sum of payout × probability | derived |
| Blocks — Hard | ~98.55% | sum of payout × probability | derived |
| Monkey Match — Easy | ~98.15% | sum of payout × probability | derived |
| Monkey Match — Hard | ~98.20% | sum of payout × probability | derived |
| Primes — Easy | 98.00% | sum of payout × probability | derived |
| Primes — Medium | 98.00% | sum of payout × probability | derived |
| Primes — Hard | ~98.00% | sum of payout × probability | derived |
| Primes — Extreme | ~98.04% | sum of payout × probability | derived |
| Roulette | 97.10% | stated in Transparency section header | explicit in Transparency section |
| Hi-Lo Nebula | 97.5% | stated in Transparency section header | explicit in Transparency section |
| Bubblegum Heist | 97.8% | stated in Transparency section header | explicit in Transparency section |
| Geez Diggerz | 97.8% | stated in Transparency section header | explicit in Transparency section |
| Sushi Showdown | 97.8% | inferred from visible header treatment / slot layout, but not separately re-proven here | partially inferred |
| Dino Dough | 97.8% | inferred from visible header treatment / slot layout, but not separately re-proven here | partially inferred |

### Caution on the last two entries

For `Sushi Showdown` and `Dino Dough`, keep the RTP line as **lower-confidence than the games where the header was explicitly readable in the extracted crop**.
Do not treat those two RTP values as equally strong unless you re-check the original Transparency capture directly.

## 5.2 Live-snapshot outliers worth flagging

| Game | Running RTP | Interpretation |
| --- | --- | --- |
| Primes | 105.64% | observed snapshot above 100%; not proof of stable edge |
| Glyde or Crash | 105.59% | observed snapshot above 100%; not proof of stable edge |
| Reel Pirates | 99.81% | snapshot near break-even |
| Gimboz Smash | 99.42% | snapshot near break-even |

## 5.3 Conservative operating heuristics for an agent

1. **Never treat live Running RTP as theoretical EV.**
2. **Prefer games with explicit paytables and probabilities** when modeling EV, variance, or bankroll policy.
3. **Keep theoretical RTP and observed live RTP separate** in memory and decision logic.
4. **Mark missing details as missing** instead of filling gaps by assumption.
5. For icon-based slot games (`Sushi Showdown`, `Dino Dough`, `Bubblegum Heist`, `Geez Diggerz`), **do not invent unseen symbol names or unseen combo payouts**.
6. For `Blackjack+`, do not silently replace the Transparency-section side-bet model with standard finite-deck blackjack math, because the Transparency section explicitly frames those side-bet odds using **independent draws / with replacement**.
7. For `Glyde or Crash`, preserve both spellings in aliases when scraping or matching external references.

## 5.4 Document gaps that remain open

This source set is still insufficient to fully document:

- optimal strategy for `Blackjack+`;
- full probability structure of `Glyde or Crash`, `Ape Strong`, `Reel Pirates`, `Jungle Plinko`, `Gimboz Smash`, `Cash Dash`, `Bear-A-Dice`, `Rico's Revenge`, and `Cult Quest`;
- complete symbol catalogs and full paytables for the slot-style games shown only by icons;
- the exact current progressive-jackpot formula for `Gimboz Poker` / `video-poker`.

---

# 6. Suggested normalized aliases for an AI agent

| Canonical name in this file | Useful aliases |
| --- | --- |
| Blackjack+ | Blackjack, Blackjack Plus |
| Glyde or Crash | Glyder or Crash, Crash |
| Hi-Lo Nebula | Hi Lo Nebula, Hilo Nebula |
| Bear-A-Dice | Bear -A-Dice, Bear A Dice |
| Gimboz Poker / Video Poker | video-poker, gimboz-poker, Video Poker, vp |
| Cosmic Plinko | Plinko |
| Jungle Plinko | Jungle-themed Plinko |
| Speed Keno | Fast Keno |

---

# 7. Provenance notes

## Primary Transparency mirror groups used

These group numbers refer to the local extraction / mirror organization used for this Markdown, not to website pagination.

- Group 1: catalog tiles
- Group 2: Keno, Blocks, Cosmic Plinko, Sushi Showdown, Gimboz Poker, Dino Dough, Roulette
- Group 3: Hi-Lo Nebula, Monkey Match, Speed Keno, Bubblegum Heist, Primes, Blackjack+, Geez Diggerz, Baccarat
- Group 4: Ape Strong, Reel Pirates, Jungle Plinko, Gimboz Smash, Glyde or Crash, Cash Dash, Bear-A-Dice, Rico's Revenge, Cult Quest

## Official docs integrated

- Classic Games: https://docs.ape.church/games/player-vs-house/classic-games
- Original Games: https://docs.ape.church/games/player-vs-house/original-games
