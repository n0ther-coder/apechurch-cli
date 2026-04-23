# Games: Payouts vs. Odds comparison

> Summary: Complete exact-mode comparison for supported Ape Church CLI games where win rate, minimum/maximum payout multiplier, and RTP can be compared on the same game mode.

These tables expand the compact comparison in [GAMES_REFERENCE.md](./GAMES_REFERENCE.md). Each row is one supported game mode, and every metric in that row refers to that same mode.

- **Win Rate** means exact net-profit frequency, i.e. payout strictly greater than `1x`. This matches the CLI history/status win-rate semantics and does not count partial refunds as wins.
- **RTP** means exact expected gross return for that same mode.
- **Max X** means the highest gross payout multiplier available inside that same mode. **Min X** means the lowest gross payout multiplier at or above `1x` inside that same mode. `Mode X` is the most likely qualifying payout between `Min X` and `Max X`. `Min X`, `Mode X`, and `Max X` include the unconditional probability of that payout, rounded to two decimals.
- `Video Poker` uses the fixed base paytable; live progressive jackpot uplift is excluded.
- `ApeStrong` and `Gimboz Smash` are combined only for shared `5-74` and `76-94` variants where their odds and payouts match exactly. They are not identical across the whole shared surface: at `75`, ApeStrong is `1.2999x` / `97.4925%` RTP while Gimboz Smash is `1.3x` / `97.5000%`; at `95`, ApeStrong is `1.025x` / `97.3750%` while Gimboz Smash is `1.0263x` / `97.4985%`. Gimboz-only `1-4` variants remain separate. `Bear-A-Dice` and `Blocks` are expanded across every supported configured mode.

## Table Index

- [All Modes by Odds of Mode X, Ordered by Max X Tiebreak](#all-modes-by-odds-of-mode-x-ordered-by-max-x-tiebreak)
- [Consecutive Mode X While Odds Stay At Least 50%](#consecutive-mode-x-while-odds-stay-at-least-50)
- [Consecutive Exact-Finite Full-Mode X While Odds Stay At Least 5%](#consecutive-exact-finite-full-mode-x-while-odds-stay-at-least-5)
- [All Modes by Win Rate, Ordered by Max X Tiebreak](#all-modes-by-win-rate-ordered-by-max-x-tiebreak)
- [All Modes by Max X, Ordered by Win Rate Tiebreak](#all-modes-by-max-x-ordered-by-win-rate-tiebreak)
- [Not Included](#not-included)

## All Modes by Odds of Mode X, Ordered by Max X Tiebreak

This table is filtered to the efficient frontier of qualifying payouts. It starts from every supported `Game + Mode` row sorted by `Odds of Mode X` descending, with `Max X` descending as the tiebreak. A row is kept only if its `Mode X` is at least as high as the best `Mode X` already seen above it; rows with a lower `Mode X` and no higher `Odds of Mode X` are excluded as dominated.

| Game | Mode | Win Rate | Min X | Mode X | Max X | RTP |
|------|------|----------|-------|-------|-------|-----|
| Gimboz Smash ✔︎ | `Cover 95` | `95.00%` | `1.0263x` @ `95.00%` | **`1.0263x` @ `95.00%`** | `1.0263x` @ `95.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 94` | `94.00%` | `1.0372x` @ `94.00%` | `1.0372x` @ `94.00%` | `1.0372x` @ `94.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 93` | `93.00%` | `1.0483x` @ `93.00%` | `1.0483x` @ `93.00%` | `1.0483x` @ `93.00%` | `97.49%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 92` | `92.00%` | `1.0597x` @ `92.00%` | `1.0597x` @ `92.00%` | `1.0597x` @ `92.00%` | `97.49%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 91` | `91.00%` | `1.0714x` @ `91.00%` | `1.0714x` @ `91.00%` | `1.0714x` @ `91.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 90` | `90.00%` | `1.0833x` @ `90.00%` | `1.0833x` @ `90.00%` | `1.0833x` @ `90.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 89` | `89.00%` | `1.0955x` @ `89.00%` | `1.0955x` @ `89.00%` | `1.0955x` @ `89.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 88` | `88.00%` | `1.1079x` @ `88.00%` | `1.1079x` @ `88.00%` | `1.1079x` @ `88.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 87` | `87.00%` | `1.1206x` @ `87.00%` | `1.1206x` @ `87.00%` | `1.1206x` @ `87.00%` | `97.49%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 86` | `86.00%` | `1.1337x` @ `86.00%` | `1.1337x` @ `86.00%` | `1.1337x` @ `86.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 85` | `85.00%` | `1.147x` @ `85.00%` | `1.147x` @ `85.00%` | `1.147x` @ `85.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 84` | `84.00%` | `1.1607x` @ `84.00%` | `1.1607x` @ `84.00%` | `1.1607x` @ `84.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 83` | `83.00%` | `1.1746x` @ `83.00%` | `1.1746x` @ `83.00%` | `1.1746x` @ `83.00%` | `97.49%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 82` | `82.00%` | `1.189x` @ `82.00%` | `1.189x` @ `82.00%` | `1.189x` @ `82.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 81` | `81.00%` | `1.2037x` @ `81.00%` | `1.2037x` @ `81.00%` | `1.2037x` @ `81.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 80` | `80.00%` | `1.2187x` @ `80.00%` | `1.2187x` @ `80.00%` | `1.2187x` @ `80.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 79` | `79.00%` | `1.2341x` @ `79.00%` | `1.2341x` @ `79.00%` | `1.2341x` @ `79.00%` | `97.49%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 78` | `78.00%` | `1.25x` @ `78.00%` | `1.25x` @ `78.00%` | `1.25x` @ `78.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 77` | `77.00%` | `1.2662x` @ `77.00%` | `1.2662x` @ `77.00%` | `1.2662x` @ `77.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 76` | `76.00%` | `1.2828x` @ `76.00%` | `1.2828x` @ `76.00%` | `1.2828x` @ `76.00%` | `97.49%` |
| Gimboz Smash ✔︎ | `Cover 75` | `75.00%` | `1.3x` @ `75.00%` | `1.3x` @ `75.00%` | `1.3x` @ `75.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 74` | `74.00%` | `1.3175x` @ `74.00%` | `1.3175x` @ `74.00%` | `1.3175x` @ `74.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 73` | `73.00%` | `1.3356x` @ `73.00%` | `1.3356x` @ `73.00%` | `1.3356x` @ `73.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 72` | `72.00%` | `1.3541x` @ `72.00%` | `1.3541x` @ `72.00%` | `1.3541x` @ `72.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 71` | `71.00%` | `1.3732x` @ `71.00%` | `1.3732x` @ `71.00%` | `1.3732x` @ `71.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 70` | `70.00%` | `1.3928x` @ `70.00%` | `1.3928x` @ `70.00%` | `1.3928x` @ `70.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 69` | `69.00%` | `1.413x` @ `69.00%` | `1.413x` @ `69.00%` | `1.413x` @ `69.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 68` | `68.00%` | `1.4338x` @ `68.00%` | `1.4338x` @ `68.00%` | `1.4338x` @ `68.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 67` | `67.00%` | `1.4552x` @ `67.00%` | `1.4552x` @ `67.00%` | `1.4552x` @ `67.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 66` | `66.00%` | `1.4772x` @ `66.00%` | `1.4772x` @ `66.00%` | `1.4772x` @ `66.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 65` | `65.00%` | `1.5x` @ `65.00%` | `1.5x` @ `65.00%` | `1.5x` @ `65.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 64` | `64.00%` | `1.5234x` @ `64.00%` | `1.5234x` @ `64.00%` | `1.5234x` @ `64.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 63` | `63.00%` | `1.5476x` @ `63.00%` | `1.5476x` @ `63.00%` | `1.5476x` @ `63.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 62` | `62.00%` | `1.5725x` @ `62.00%` | `1.5725x` @ `62.00%` | `1.5725x` @ `62.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 61` | `61.00%` | `1.5983x` @ `61.00%` | `1.5983x` @ `61.00%` | `1.5983x` @ `61.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 60` | `60.00%` | `1.625x` @ `60.00%` | `1.625x` @ `60.00%` | `1.625x` @ `60.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 59` | `59.00%` | `1.6525x` @ `59.00%` | `1.6525x` @ `59.00%` | `1.6525x` @ `59.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 58` | `58.00%` | `1.681x` @ `58.00%` | `1.681x` @ `58.00%` | `1.681x` @ `58.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 57` | `57.00%` | `1.7105x` @ `57.00%` | `1.7105x` @ `57.00%` | `1.7105x` @ `57.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 56` | `56.00%` | `1.741x` @ `56.00%` | `1.741x` @ `56.00%` | `1.741x` @ `56.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 55` | `55.00%` | `1.7727x` @ `55.00%` | `1.7727x` @ `55.00%` | `1.7727x` @ `55.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 54` | `54.00%` | `1.8055x` @ `54.00%` | `1.8055x` @ `54.00%` | `1.8055x` @ `54.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 53` | `53.00%` | `1.8396x` @ `53.00%` | `1.8396x` @ `53.00%` | `1.8396x` @ `53.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 52` | `52.00%` | `1.875x` @ `52.00%` | `1.875x` @ `52.00%` | `1.875x` @ `52.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 51` | `51.00%` | `1.9117x` @ `51.00%` | `1.9117x` @ `51.00%` | `1.9117x` @ `51.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 50` | `50.00%` | `1.95x` @ `50.00%` | `1.95x` @ `50.00%` | `1.95x` @ `50.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 49` | `49.00%` | `1.9897x` @ `49.00%` | `1.9897x` @ `49.00%` | `1.9897x` @ `49.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 48` | `48.00%` | `2.0312x` @ `48.00%` | `2.0312x` @ `48.00%` | `2.0312x` @ `48.00%` | `97.50%` |
| Roulette ✔︎ | `Even / Odd` / `Half` / `Red / Black` | `47.37%` | `2.05x` @ `47.37%` | `2.05x` @ `47.37%` | `2.05x` @ `47.37%` | `97.11%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 47` | `47.00%` | `2.0744x` @ `47.00%` | `2.0744x` @ `47.00%` | `2.0744x` @ `47.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 46` | `46.00%` | `2.1195x` @ `46.00%` | `2.1195x` @ `46.00%` | `2.1195x` @ `46.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 45` | `45.00%` | `2.1666x` @ `45.00%` | `2.1666x` @ `45.00%` | `2.1666x` @ `45.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 44` | `44.00%` | `2.2159x` @ `44.00%` | `2.2159x` @ `44.00%` | `2.2159x` @ `44.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 43` | `43.00%` | `2.2674x` @ `43.00%` | `2.2674x` @ `43.00%` | `2.2674x` @ `43.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 42` | `42.00%` | `2.3214x` @ `42.00%` | `2.3214x` @ `42.00%` | `2.3214x` @ `42.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 41` | `41.00%` | `2.378x` @ `41.00%` | `2.378x` @ `41.00%` | `2.378x` @ `41.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 40` | `40.00%` | `2.4375x` @ `40.00%` | `2.4375x` @ `40.00%` | `2.4375x` @ `40.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 39` | `39.00%` | `2.5x` @ `39.00%` | `2.5x` @ `39.00%` | `2.5x` @ `39.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 38` | `38.00%` | `2.5657x` @ `38.00%` | `2.5657x` @ `38.00%` | `2.5657x` @ `38.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 37` | `37.00%` | `2.6351x` @ `37.00%` | `2.6351x` @ `37.00%` | `2.6351x` @ `37.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 36` | `36.00%` | `2.7083x` @ `36.00%` | `2.7083x` @ `36.00%` | `2.7083x` @ `36.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 35` | `35.00%` | `2.7857x` @ `35.00%` | `2.7857x` @ `35.00%` | `2.7857x` @ `35.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 34` | `34.00%` | `2.8676x` @ `34.00%` | `2.8676x` @ `34.00%` | `2.8676x` @ `34.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 33` | `33.00%` | `2.9545x` @ `33.00%` | `2.9545x` @ `33.00%` | `2.9545x` @ `33.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 32` | `32.00%` | `3.0468x` @ `32.00%` | `3.0468x` @ `32.00%` | `3.0468x` @ `32.00%` | `97.50%` |
| Roulette ✔︎ | `Dozen / Column` | `31.58%` | `3.075x` @ `31.58%` | `3.075x` @ `31.58%` | `3.075x` @ `31.58%` | `97.11%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 31` | `31.00%` | `3.1451x` @ `31.00%` | `3.1451x` @ `31.00%` | `3.1451x` @ `31.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 30` | `30.00%` | `3.25x` @ `30.00%` | `3.25x` @ `30.00%` | `3.25x` @ `30.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 29` | `29.00%` | `3.362x` @ `29.00%` | `3.362x` @ `29.00%` | `3.362x` @ `29.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 28` | `28.00%` | `3.4821x` @ `28.00%` | `3.4821x` @ `28.00%` | `3.4821x` @ `28.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 27` | `27.00%` | `3.6111x` @ `27.00%` | `3.6111x` @ `27.00%` | `3.6111x` @ `27.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 26` | `26.00%` | `3.75x` @ `26.00%` | `3.75x` @ `26.00%` | `3.75x` @ `26.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 25` | `25.00%` | `3.9x` @ `25.00%` | `3.9x` @ `25.00%` | `3.9x` @ `25.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 24` | `24.00%` | `4.0625x` @ `24.00%` | `4.0625x` @ `24.00%` | `4.0625x` @ `24.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 23` | `23.00%` | `4.2391x` @ `23.00%` | `4.2391x` @ `23.00%` | `4.2391x` @ `23.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 22` | `22.00%` | `4.4318x` @ `22.00%` | `4.4318x` @ `22.00%` | `4.4318x` @ `22.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 21` | `21.00%` | `4.6428x` @ `21.00%` | `4.6428x` @ `21.00%` | `4.6428x` @ `21.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 20` | `20.00%` | `4.875x` @ `20.00%` | `4.875x` @ `20.00%` | `4.875x` @ `20.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 19` | `19.00%` | `5.1315x` @ `19.00%` | `5.1315x` @ `19.00%` | `5.1315x` @ `19.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 18` | `18.00%` | `5.4166x` @ `18.00%` | `5.4166x` @ `18.00%` | `5.4166x` @ `18.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 17` | `17.00%` | `5.7352x` @ `17.00%` | `5.7352x` @ `17.00%` | `5.7352x` @ `17.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 16` | `16.00%` | `6.0937x` @ `16.00%` | `6.0937x` @ `16.00%` | `6.0937x` @ `16.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 15` | `15.00%` | `6.5x` @ `15.00%` | `6.5x` @ `15.00%` | `6.5x` @ `15.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 14` | `14.00%` | `6.9642x` @ `14.00%` | `6.9642x` @ `14.00%` | `6.9642x` @ `14.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 13` | `13.00%` | `7.5x` @ `13.00%` | `7.5x` @ `13.00%` | `7.5x` @ `13.00%` | `97.50%` |
| Primes ✔︎ | `Extreme` | `12.30%` | `7.57x` @ `12.29%` | `7.57x` @ `12.29%` | `500x` @ `0.01%` | **`98.04%`** |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 12` | `12.00%` | `8.125x` @ `12.00%` | `8.125x` @ `12.00%` | `8.125x` @ `12.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 11` | `11.00%` | `8.8636x` @ `11.00%` | `8.8636x` @ `11.00%` | `8.8636x` @ `11.00%` | `97.50%` |
| Roulette ✔︎ | `Corner` | `10.53%` | `9.225x` @ `10.53%` | `9.225x` @ `10.53%` | `9.225x` @ `10.53%` | `97.11%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 10` | `10.00%` | `9.75x` @ `10.00%` | `9.75x` @ `10.00%` | `9.75x` @ `10.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 9` | `9.00%` | `10.8333x` @ `9.00%` | `10.8333x` @ `9.00%` | `10.8333x` @ `9.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 8` | `8.00%` | `12.1875x` @ `8.00%` | `12.1875x` @ `8.00%` | `12.1875x` @ `8.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 7` | `7.00%` | `13.9285x` @ `7.00%` | `13.9285x` @ `7.00%` | `13.9285x` @ `7.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 6` | `6.00%` | `16.25x` @ `6.00%` | `16.25x` @ `6.00%` | `16.25x` @ `6.00%` | `97.50%` |
| Bear-A-Dice ✔︎ | `Master / 1 roll` | `5.56%` | `17.62x` @ `5.56%` | `17.62x` @ `5.56%` | `17.62x` @ `5.56%` | **`97.89%`** |
| Roulette ✔︎ | `Split` | `5.26%` | `18.45x` @ `5.26%` | `18.45x` @ `5.26%` | `18.45x` @ `5.26%` | `97.11%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 5` | `5.00%` | `19.5x` @ `5.00%` | `19.5x` @ `5.00%` | `19.5x` @ `5.00%` | `97.50%` |
| Gimboz Smash ✔︎ | `Cover 4` | `4.00%` | `24.375x` @ `4.00%` | `24.375x` @ `4.00%` | `24.375x` @ `4.00%` | `97.50%` |
| Gimboz Smash ✔︎ | `Cover 3` | `3.00%` | `32.5x` @ `3.00%` | `32.5x` @ `3.00%` | `32.5x` @ `3.00%` | `97.50%` |
| Roulette ✔︎ | `Single Number` | `2.63%` | `36.9x` @ `2.63%` | `36.9x` @ `2.63%` | `36.9x` @ `2.63%` | `97.11%` |
| Gimboz Smash ✔︎ | `Cover 2` | `2.00%` | `48.75x` @ `2.00%` | `48.75x` @ `2.00%` | `48.75x` @ `2.00%` | `97.50%` |
| Gimboz Smash ✔︎ | `Cover 1` | `1.00%` | `97.5x` @ `1.00%` | `97.5x` @ `1.00%` | `97.5x` @ `1.00%` | `97.50%` |
| Bear-A-Dice ✔︎ | `Master / 2 rolls` | `0.3086%` | `316.84x` @ `0.31%` | `316.84x` @ `0.31%` | `316.84x` @ `0.31%` | **`97.79%`** |
| Bear-A-Dice ✔︎ | `Expert / 4 rolls` | `0.0772%` | `263.77x` @ `0.02%` | `644.04x` @ `0.03%` | `9,375.2x` @ `0.00%` | **`97.80%`** |
| Bear-A-Dice ✔︎ | `Master / 3 rolls` | `0.0171%` | `5,706.55x` @ `0.02%` | `5,706.55x` @ `0.02%` | `5,706.55x` @ `0.02%` | **`97.85%`** |
| Bear-A-Dice ✔︎ | `Master / 5 rolls` | `0.000053%` | `1,847,949.19x` @ `0.00%` | `1,847,949.19x` @ `0.00%` | `1,847,949.19x` @ `0.00%` | **`97.80%`** |

Notes:

1. Progressive jackpot excluded.

[Back to Index](#table-index)

## Consecutive Mode X While Odds Stay At Least 50%

This table is derived from the filtered Mode X frontier above and excludes every row where the single-repeat odds of `Mode X` already start below `50%`. For each remaining row, `N @ ≥50%` is the maximum number of consecutive `Mode X` repeats whose cumulative probability remains at least `50%`; `X @ N` reports the compounded Mode X payout and probability.

| Game | Mode | N @ ≥50% | X @ N | RTP |
|------|------|------------|-------|-----|
| Gimboz Smash ✔︎ | `Cover 95` | `13` | `1.401413x` @ `51.33%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 94` | `11` | `1.494471x` @ `50.63%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 93` | `9` | `1.528869x` @ `52.04%` | `97.49%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 92` | `8` | `1.590243x` @ `51.32%` | `97.49%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 91` | `7` | `1.620546x` @ `51.68%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 90` | `6` | `1.61619x` @ `53.14%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 88` | `5` | `1.669179x` @ `52.77%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 89` | `5` | `1.577836x` @ `55.84%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 85` | `4` | `1.730827x` @ `52.20%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 86` | `4` | `1.651934x` @ `54.70%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 87` | `4` | `1.576894x` @ `57.29%` | `97.49%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 80` | `3` | `1.810049x` @ `51.20%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 81` | `3` | `1.744033x` @ `53.14%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 82` | `3` | `1.680914x` @ `55.14%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 83` | `3` | `1.620578x` @ `57.18%` | `97.49%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 84` | `3` | `1.563723x` @ `59.27%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 71` | `2` | `1.885678x` @ `50.41%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 72` | `2` | `1.833587x` @ `51.84%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 73` | `2` | `1.783827x` @ `53.29%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 74` | `2` | `1.735806x` @ `54.76%` | `97.50%` |
| Gimboz Smash ✔︎ | `Cover 75` | `2` | `1.69x` @ `56.25%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 76` | `2` | `1.645576x` @ `57.76%` | `97.49%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 77` | `2` | `1.603262x` @ `59.29%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 78` | `2` | `1.5625x` @ `60.84%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 79` | `2` | `1.523003x` @ `62.41%` | `97.49%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 50` | `1` | `1.95x` @ `50.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 51` | `1` | `1.9117x` @ `51.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 52` | `1` | `1.875x` @ `52.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 53` | `1` | `1.8396x` @ `53.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 54` | `1` | `1.8055x` @ `54.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 55` | `1` | `1.7727x` @ `55.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 56` | `1` | `1.741x` @ `56.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 57` | `1` | `1.7105x` @ `57.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 58` | `1` | `1.681x` @ `58.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 59` | `1` | `1.6525x` @ `59.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 60` | `1` | `1.625x` @ `60.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 61` | `1` | `1.5983x` @ `61.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 62` | `1` | `1.5725x` @ `62.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 63` | `1` | `1.5476x` @ `63.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 64` | `1` | `1.5234x` @ `64.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 65` | `1` | `1.5x` @ `65.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 66` | `1` | `1.4772x` @ `66.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 67` | `1` | `1.4552x` @ `67.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 68` | `1` | `1.4338x` @ `68.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 69` | `1` | `1.413x` @ `69.00%` | `97.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 70` | `1` | `1.3928x` @ `70.00%` | `97.50%` |

Notes:

1. Progressive jackpot excluded.

[Back to Index](#table-index)

## Consecutive Exact-Finite Full-Mode X While Odds Stay At Least 5%

This table uses only documented `Game + Mode` pairs whose complete outcome surface is finite and exact in the local analytics/reference set. Each repetition is the complete mode distribution, not a forced repeat of `Max X`. `Win Rate` is the exact single-play net-profit frequency (`payout > 1x`) for that same mode. `Min X` is the lowest single-play payout at or above `1x` for that same mode. For each tested `N`, `X @ N` is the highest cumulative payout threshold whose tail probability across `N` consecutive plays of the same mode remains at least `5%`; the row keeps the `N` that maximizes that threshold. Rows are ordered by `X @ N` descending, then by `N @ ≥5%` descending. If no positive cumulative payout reaches `5%`, the highest qualifying threshold is `0x`. `Video Poker` / `Gimboz Poker` is excluded from this specific table because the repo documents final-hand/paytable odds, not a strategy-independent full-mode outcome surface.

| Game | Mode | Win Rate | Min X | N @ ≥5% | X @ N |
|------|------|----------|-------|----------|-------|
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 5` | `5.00%` | `19.5x` @ `5.00%` | `1` | `19.5x` @ `5.00%` |
| Roulette ✔︎ | `Split` | `5.26%` | `18.45x` @ `5.26%` | `1` | `18.45x` @ `5.26%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 37` | `37.00%` | `2.6351x` @ `37.00%` | `3` | `18.2975x` @ `5.07%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 23` | `23.00%` | `4.2391x` @ `23.00%` | `2` | `17.97x` @ `5.29%` |
| Roulette ✔︎ | `Even / Odd` / `Half` / `Red / Black` | `47.37%` | `2.05x` @ `47.37%` | `4` | `17.661x` @ `5.03%` |
| Bear-A-Dice ✔︎ | `Master / 1 roll` | `5.56%` | `17.62x` @ `5.56%` | `1` | `17.62x` @ `5.56%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 55` | **`55.00%`** | `1.7727x` @ **`55.00%`** | `5` | `17.5056x` @ `5.03%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 48` | `48.00%` | `2.0312x` @ `48.00%` | `4` | `17.022x` @ `5.31%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 38` | `38.00%` | `2.5657x` @ `38.00%` | `3` | `16.8895x` @ `5.49%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 61` | **`61.00%`** | `1.5983x` @ **`61.00%`** | `6` | `16.6705x` @ `5.15%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 24` | `24.00%` | `4.0625x` @ `24.00%` | `2` | `16.5039x` @ `5.76%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 6` | `6.00%` | `16.25x` @ `6.00%` | `1` | `16.25x` @ `6.00%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 56` | **`56.00%`** | `1.741x` @ **`56.00%`** | `5` | `15.9954x` @ `5.51%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 69` | **`69.00%`** | `1.413x` @ **`69.00%`** | `8` | `15.8905x` @ `5.14%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 49` | `49.00%` | `1.9897x` @ `49.00%` | `4` | `15.6729x` @ `5.76%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 39` | `39.00%` | `2.5x` @ `39.00%` | `3` | `15.625x` @ `5.93%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 66` | **`66.00%`** | `1.4772x` @ **`66.00%`** | `7` | `15.3488x` @ `5.46%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 72` | **`72.00%`** | `1.3541x` @ **`72.00%`** | `9` | `15.3058x` @ `5.20%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 25` | `25.00%` | `3.9x` @ `25.00%` | `2` | `15.21x` @ `6.25%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 62` | **`62.00%`** | `1.5725x` @ **`62.00%`** | `6` | `15.1197x` @ `5.68%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 57` | **`57.00%`** | `1.7105x` @ **`57.00%`** | `5` | `14.6425x` @ `6.02%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 78` | **`78.00%`** | `1.25x` @ **`78.00%`** | `12` | `14.5519x` @ `5.07%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 40` | `40.00%` | `2.4375x` @ `40.00%` | `3` | `14.4822x` @ `6.40%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 50` | **`50.00%`** | `1.95x` @ **`50.00%`** | `4` | `14.459x` @ `6.25%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 70` | **`70.00%`** | `1.3928x` @ **`70.00%`** | `8` | `14.1615x` @ `5.76%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 26` | `26.00%` | `3.75x` @ `26.00%` | `2` | `14.0625x` @ `6.76%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 7` | `7.00%` | `13.9285x` @ `7.00%` | `1` | `13.9285x` @ `7.00%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 67` | **`67.00%`** | `1.4552x` @ **`67.00%`** | `7` | `13.8184x` @ `6.06%` |
| Gimboz Smash ✔︎ | `Cover 75` | **`75.00%`** | `1.3x` @ **`75.00%`** | `10` | `13.7858x` @ `5.63%` |
| ApeStrong ✔︎ | `Range 75` | **`75.00%`** | `1.2999x` @ **`75.00%`** | `10` | `13.7752x` @ `5.63%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 63` | **`63.00%`** | `1.5476x` @ **`63.00%`** | `6` | `13.7389x` @ `6.25%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 73` | **`73.00%`** | `1.3356x` @ **`73.00%`** | `9` | `13.5235x` @ `5.89%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 41` | `41.00%` | `2.378x` @ `41.00%` | `3` | `13.4473x` @ `6.89%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 58` | **`58.00%`** | `1.681x` @ **`58.00%`** | `5` | `13.4227x` @ `6.56%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 82` | **`82.00%`** | `1.189x` @ **`82.00%`** | `15` | `13.4192x` @ `5.10%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 77` | **`77.00%`** | `1.2662x` @ **`77.00%`** | `11` | `13.413x` @ `5.64%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 81` | **`81.00%`** | `1.2037x` @ **`81.00%`** | `14` | `13.4047x` @ `5.23%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 51` | **`51.00%`** | `1.9117x` @ **`51.00%`** | `4` | `13.3561x` @ `6.77%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 83` | **`83.00%`** | `1.1746x` @ **`83.00%`** | `16` | `13.1293x` @ `5.07%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 80` | **`80.00%`** | `1.2187x` @ **`80.00%`** | `13` | `13.0815x` @ `5.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 27` | `27.00%` | `3.6111x` @ `27.00%` | `2` | `13.04x` @ `7.29%` |
| Primes ✔︎ | `Easy` | **`50.00%`** | `1.9x` @ `40.00%` | `4` | `13.0321x` @ `6.25%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 71` | **`71.00%`** | `1.3732x` @ **`71.00%`** | `8` | `12.6436x` @ `6.46%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 84` | **`84.00%`** | `1.1607x` @ **`84.00%`** | `17` | `12.5962x` @ `5.16%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 42` | `42.00%` | `2.3214x` @ `42.00%` | `3` | `12.5098x` @ `7.41%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 64` | **`64.00%`** | `1.5234x` @ **`64.00%`** | `6` | `12.4992x` @ `6.87%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 79` | **`79.00%`** | `1.2341x` @ **`79.00%`** | `12` | `12.4797x` @ `5.91%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 68` | **`68.00%`** | `1.4338x` @ **`68.00%`** | `7` | `12.4572x` @ `6.72%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 52` | **`52.00%`** | `1.875x` @ **`52.00%`** | `4` | `12.3596x` @ `7.31%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 59` | **`59.00%`** | `1.6525x` @ **`59.00%`** | `5` | `12.3227x` @ `7.15%` |
| Primes ✔︎ | `Medium` | `26.00%` | `3.5x` @ `25.00%` | `2` | `12.25x` @ `6.76%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 8` | `8.00%` | `12.1875x` @ `8.00%` | `1` | `12.1875x` @ `8.00%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 28` | `28.00%` | `3.4821x` @ `28.00%` | `2` | `12.125x` @ `7.84%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 76` | **`76.00%`** | `1.2828x` @ **`76.00%`** | `10` | `12.0667x` @ `6.43%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 74` | **`74.00%`** | `1.3175x` @ **`74.00%`** | `9` | `11.9607x` @ `6.65%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 85` | **`85.00%`** | `1.147x` @ **`85.00%`** | `18` | `11.8071x` @ `5.36%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 43` | `43.00%` | `2.2674x` @ `43.00%` | `3` | `11.6569x` @ `7.95%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 53` | **`53.00%`** | `1.8396x` @ **`53.00%`** | `4` | `11.4523x` @ `7.89%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 65` | **`65.00%`** | `1.5x` @ **`65.00%`** | `6` | `11.3906x` @ `7.54%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 60` | **`60.00%`** | `1.625x` @ **`60.00%`** | `5` | `11.331x` @ `7.78%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 29` | `29.00%` | `3.362x` @ `29.00%` | `2` | `11.303x` @ `8.41%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 87` | **`87.00%`** | `1.1206x` @ **`87.00%`** | `21` | `10.926x` @ `5.37%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 44` | `44.00%` | `2.2159x` @ `44.00%` | `3` | `10.8805x` @ `8.52%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 86` | **`86.00%`** | `1.1337x` @ **`86.00%`** | `19` | `10.8509x` @ `5.69%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 9` | `9.00%` | `10.8333x` @ `9.00%` | `1` | `10.8333x` @ `9.00%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 54` | **`54.00%`** | `1.8055x` @ **`54.00%`** | `4` | `10.6265x` @ `8.50%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 30` | `30.00%` | `3.25x` @ `30.00%` | `2` | `10.5625x` @ `9.00%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 88` | **`88.00%`** | `1.1079x` @ **`88.00%`** | `23` | `10.5563x` @ `5.29%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 45` | `45.00%` | `2.1666x` @ `45.00%` | `3` | `10.1704x` @ `9.11%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 31` | `31.00%` | `3.1451x` @ `31.00%` | `2` | `9.891654x` @ `9.61%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 89` | **`89.00%`** | `1.0955x` @ **`89.00%`** | `25` | `9.77934x` @ `5.43%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 10` | `10.00%` | `9.75x` @ `10.00%` | `1` | `9.75x` @ `10.00%` |
| Bear-A-Dice ✔︎ | `Expert / 1 roll` | `16.67%` | `3.95x` @ `11.11%` | `1` | `9.72x` @ `5.56%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 46` | `46.00%` | `2.1195x` @ `46.00%` | `3` | `9.521388x` @ `9.73%` |
| Roulette ✔︎ | `Dozen / Column` | `31.58%` | `3.075x` @ `31.58%` | `2` | `9.455625x` @ `9.97%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 90` | **`90.00%`** | `1.0833x` @ **`90.00%`** | `28` | `9.396472x` @ `5.23%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 32` | `32.00%` | `3.0468x` @ `32.00%` | `2` | `9.28299x` @ `10.24%` |
| Roulette ✔︎ | `Corner` | `10.53%` | `9.225x` @ `10.53%` | `1` | `9.225x` @ `10.53%` |
| Baccarat ✔︎ | `TIE` | `9.54%` | `9x` @ `9.54%` | `1` | `9x` @ `9.54%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 47` | `47.00%` | `2.0744x` @ `47.00%` | `3` | `8.926424x` @ `10.38%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 11` | `11.00%` | `8.8636x` @ `11.00%` | `1` | `8.8636x` @ `11.00%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 33` | `33.00%` | `2.9545x` @ `33.00%` | `2` | `8.72907x` @ `10.89%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 91` | **`91.00%`** | `1.0714x` @ **`91.00%`** | `31` | `8.482051x` @ `5.37%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 34` | `34.00%` | `2.8676x` @ `34.00%` | `2` | `8.22313x` @ `11.56%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 12` | `12.00%` | `8.125x` @ `12.00%` | `1` | `8.125x` @ `12.00%` |
| Baccarat ✔︎ | `PLAYER` | `44.61%` | `1x` @ `9.54%` | `3` | `8x` @ `8.88%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 35` | `35.00%` | `2.7857x` @ `35.00%` | `2` | `7.760124x` @ `12.25%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 92` | **`92.00%`** | `1.0597x` @ **`92.00%`** | `35` | `7.610316x` @ `5.40%` |
| Primes ✔︎ | `Extreme` | `12.30%` | `7.57x` @ `12.29%` | `1` | `7.57x` @ `12.30%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 13` | `13.00%` | `7.5x` @ `13.00%` | `1` | `7.5x` @ `13.00%` |
| Bear-A-Dice ✔︎ | `Easy / 5 rolls` | `40.19%` | `1.216653x` @ `0.17%` | `3` | `7.439791x` @ `5.00%` |
| Baccarat ✔︎ | `BANKER` | `45.84%` | `1x` @ `9.54%` | `3` | `7.414875x` @ `9.63%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 36` | `36.00%` | `2.7083x` @ `36.00%` | `2` | `7.334889x` @ `12.96%` |
| Bear-A-Dice ✔︎ | `Easy / 4 rolls` | `48.23%` | `1.125509x` @ `0.60%` | `3` | `7.26801x` @ `5.01%` |
| Bear-A-Dice ✔︎ | `Easy / 3 rolls` | **`57.87%`** | `1.092727x` @ `2.14%` | `4` | `7.151411x` @ `5.03%` |
| Bear-A-Dice ✔︎ | `Easy / 2 rolls` | **`69.44%`** | `1.0404x` @ `7.72%` | `7` | `7.023842x` @ `5.00%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 14` | `14.00%` | `6.9642x` @ `14.00%` | `1` | `6.9642x` @ `14.00%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 93` | **`93.00%`** | `1.0483x` @ **`93.00%`** | `41` | `6.916861x` @ `5.10%` |
| Speed Keno ✔︎ | `Picks 1` | `25.00%` | `2.4x` @ `25.00%` | `4` | `6.912x` @ `5.08%` |
| Bear-A-Dice ✔︎ | `Medium / 4 rolls` | `9.53%` | `2.005339x` @ `0.24%` | `1` | `6.717099x` @ `5.41%` |
| Bear-A-Dice ✔︎ | `Medium / 2 rolls` | `30.86%` | `1.3924x` @ `4.94%` | `2` | `6.602481x` @ `5.41%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 15` | `15.00%` | `6.5x` @ `15.00%` | `1` | `6.5x` @ `15.00%` |
| Bear-A-Dice ✔︎ | `Medium / 1 roll` | **`55.56%`** | `1.17x` @ `22.22%` | `4` | `6.324581x` @ `5.41%` |
| Bear-A-Dice ✔︎ | `Hard / 1 roll` | `33.33%` | `1.77x` @ `16.67%` | `1` | `6.3x` @ `5.56%` |
| Bear-A-Dice ✔︎ | `Easy / 1 roll` | **`83.33%`** | `1.01x` @ `27.78%` | `13` | `6.136522x` @ `5.01%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 16` | `16.00%` | `6.0937x` @ `16.00%` | `1` | `6.0937x` @ `16.00%` |
| Bear-A-Dice ✔︎ | `Medium / 3 rolls` | `17.15%` | `1.643032x` @ `1.10%` | `1` | `6.080422x` @ `5.40%` |
| Monkey Match ✔︎ | `High` | `35.03%` | `2x` @ `18.74%` | `2` | `6x` @ `8.76%` |
| Keno ✔︎ | `Picks 2` | `44.23%` | `1.8x` @ `38.46%` | `3` | `5.832x` @ `8.65%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 94` | **`94.00%`** | `1.0372x` @ **`94.00%`** | `48` | `5.772984x` @ `5.13%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 17` | `17.00%` | `5.7352x` @ `17.00%` | `1` | `5.7352x` @ `17.00%` |
| Keno ✔︎ | `Picks 1` | `25.00%` | `2.25x` @ `25.00%` | `4` | `5.695313x` @ `5.08%` |
| Primes ✔︎ | `Hard` | `16.90%` | `5.5x` @ `16.80%` | `1` | `5.5x` @ `16.90%` |
| Bear-A-Dice ✔︎ | `Hard / 2 rolls` | `11.11%` | `3.2041x` @ `2.78%` | `1` | `5.4237x` @ `8.33%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 18` | `18.00%` | `5.4166x` @ `18.00%` | `1` | `5.4166x` @ `18.00%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 19` | `19.00%` | `5.1315x` @ `19.00%` | `1` | `5.1315x` @ `19.00%` |
| Geez Diggerz ✔︎ | `Any spin count 1-15` | `30.00%` | `1x` @ `1.94%` | `1` | `5x` @ `6.32%` |
| Speed Keno ✔︎ | `Picks 2` | `44.74%` | `1.45x` @ `39.47%` | `1` | `5x` @ `5.26%` |
| Monkey Match ✔︎ | `Low` | `44.44%` | `1.25x` @ `23.15%` | `3` | `5x` @ `5.20%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 20` | `20.00%` | `4.875x` @ `20.00%` | `1` | `4.875x` @ `20.00%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 21` | `21.00%` | `4.6428x` @ `21.00%` | `1` | `4.6428x` @ `21.00%` |
| Gimboz Smash ✔︎ | `Cover 95` | **`95.00%`** | `1.0263x` @ **`95.00%`** | `58` | `4.507244x` @ `5.10%` |
| Ape Strong / Gimboz Smash ✔︎ | `Range / Cover 22` | `22.00%` | `4.4318x` @ `22.00%` | `1` | `4.4318x` @ `22.00%` |
| Bear-A-Dice ✔︎ | `Medium / 5 rolls` | `5.29%` | `2.386354x` @ `0.05%` | `1` | `4.206831x` @ `5.03%` |
| ApeStrong ✔︎ | `Range 95` | **`95.00%`** | `1.025x` @ **`95.00%`** | `58` | `4.187783x` @ `5.10%` |
| Jungle Plinko ✔︎ | `Risk 0 / Low` | **`53.33%`** | `1.2x` @ `38.10%` | `6` | `4.18176x` @ `5.24%` |
| Keno ✔︎ | `Picks 4` | `25.59%` | `2x` @ `21.42%` | `2` | `4x` @ `6.55%` |
| Keno ✔︎ | `Picks 10` | `23.23%` | `1.2x` @ `14.71%` | `1` | `4x` @ `8.52%` |
| Jungle Plinko ✔︎ | `Risk 4 / Ultra Degen` | `22.18%` | `1.4x` @ `9.87%` | `1` | `4x` @ `6.38%` |
| Keno ✔︎ | `Picks 7` | `33.75%` | `1.25x` @ `17.64%` | `1` | `4x` @ `5.20%` |
| Jungle Plinko ✔︎ | `Risk 1 / Moderate` | `40.00%` | `1.25x` @ `26.67%` | `3` | `3.90625x` @ `5.31%` |
| Sushi Showdown ✔︎ | `Any spin count 1-15` | `23.91%` | `1.25x` @ `3.97%` | `1` | `3.8194x` @ `7.66%` |
| Jungle Plinko ✔︎ | `Risk 2 / High` | `30.85%` | `1.2x` @ `16.95%` | `3` | `3.75x` @ `5.19%` |
| Keno ✔︎ | `Picks 5` | **`58.35%`** | `1.1x` @ `27.77%` | `3` | `3.4375x` @ `5.96%` |
| Speed Keno ✔︎ | `Picks 4` | `24.87%` | `1.5x` @ `21.67%` | `3` | `3.375x` @ `5.07%` |
| Jungle Plinko ✔︎ | `Risk 3 / Degen` | `23.33%` | `1.5x` @ `11.70%` | `2` | `3.15x` @ `5.65%` |
| Speed Keno ✔︎ | `Picks 3` | `14.04%` | `2.5x` @ `13.16%` | `3` | `3.125x` @ `7.30%` |
| Cosmic Plinko ✔︎ | `Mode 2 / High` | `14.37%` | `1.5x` @ `6.19%` | `1` | `3x` @ `8.18%` |
| Keno ✔︎ | `Picks 9` | `19.03%` | `1.5x` @ `10.94%` | `1` | `3x` @ `8.09%` |
| Speed Keno ✔︎ | `Picks 5` | `26.63%` | `1.25x` @ `19.37%` | `1` | `3x` @ `7.26%` |
| Cosmic Plinko ✔︎ | `Risk 0 / Low` | `17.20%` | `1.2x` @ `6.62%` | `1` | `3x` @ `6.17%` |
| Keno ✔︎ | `Picks 6` | `30.74%` | `1.5x` @ `15.47%` | `2` | `3x` @ `8.72%` |
| Keno ✔︎ | `Picks 3` | `14.88%` | `2.5x` @ `13.66%` | `1` | `2.5x` @ `14.88%` |
| Keno ✔︎ | `Picks 8` | `38.78%` | `1.1x` @ `22.24%` | `3` | `2.42x` @ `6.41%` |
| Blocks ✔︎ | `High / 1 roll` | `10.47%` | `2.25x` @ `8.09%` | `1` | `2.25x` @ `10.47%` |
| Cosmic Plinko ✔︎ | `Risk 1 / Modest` | `9.87%` | `2x` @ `5.74%` | `1` | `2x` @ `9.87%` |
| Blocks ✔︎ | `Low / 2 rolls` | `14.34%` | `1.0201x` @ `7.51%` | `1` | `1.212x` @ `6.83%` |
| Blocks ✔︎ | `Low / 1 roll` | `37.87%` | `1.01x` @ `27.40%` | `2` | `1.212x` @ `6.83%` |
| Blocks ✔︎ | `Low / 3 rolls` | `5.43%` | `1.030301x` @ `2.06%` | `1` | `1.030301x` @ `5.43%` |
| Bear-A-Dice ✔︎ | `Expert / 2 rolls` | `2.78%` | `16x` @ `1.23%` | `1` | `0x` @ `100.00%` |
| Bear-A-Dice ✔︎ | `Expert / 3 rolls` | `0.463%` | `64.4812x` @ `0.14%` | `1` | `0x` @ `100.00%` |
| Bear-A-Dice ✔︎ | `Expert / 4 rolls` | `0.0772%` | `263.767x` @ `0.02%` | `1` | `0x` @ `100.00%` |
| Bear-A-Dice ✔︎ | `Expert / 5 rolls` | `0.0129%` | `1,062.98x` @ `0.00%` | `1` | `0x` @ `100.00%` |
| Bear-A-Dice ✔︎ | `Hard / 3 rolls` | `3.70%` | `5.735339x` @ `0.46%` | `1` | `0x` @ `100.00%` |
| Bear-A-Dice ✔︎ | `Hard / 4 rolls` | `1.23%` | `10.2663x` @ `0.08%` | `1` | `0x` @ `100.00%` |
| Bear-A-Dice ✔︎ | `Hard / 5 rolls` | `0.4115%` | `18.3766x` @ `0.01%` | `1` | `0x` @ `100.00%` |
| Bear-A-Dice ✔︎ | `Master / 2 rolls` | `0.3086%` | `316.84x` @ `0.31%` | `1` | `0x` @ `100.00%` |
| Bear-A-Dice ✔︎ | `Master / 3 rolls` | `0.0171%` | `5,706.55x` @ `0.02%` | `1` | `0x` @ `100.00%` |
| Bear-A-Dice ✔︎ | `Master / 4 rolls` | `0.000953%` | `102,433.35x` @ `0.00%` | `1` | `0x` @ `100.00%` |
| Bear-A-Dice ✔︎ | `Master / 5 rolls` | `0.000053%` | `1,847,949.19x` @ `0.00%` | `1` | `0x` @ `100.00%` |
| Blocks ✔︎ | `High / 2 rolls` | `1.10%` | `5.0625x` @ `0.65%` | `1` | `0x` @ `100.00%` |
| Blocks ✔︎ | `High / 3 rolls` | `0.1148%` | `11.3906x` @ `0.05%` | `1` | `0x` @ `100.00%` |
| Blocks ✔︎ | `High / 4 rolls` | `0.012%` | `25.6289x` @ `0.00%` | `1` | `0x` @ `100.00%` |
| Blocks ✔︎ | `High / 5 rolls` | `0.001259%` | `57.665x` @ `0.00%` | `1` | `0x` @ `100.00%` |
| Blocks ✔︎ | `Low / 4 rolls` | `2.06%` | `1.040604x` @ `0.56%` | `1` | `0x` @ `100.00%` |
| Blocks ✔︎ | `Low / 5 rolls` | `0.7786%` | `1.05101x` @ `0.15%` | `1` | `0x` @ `100.00%` |
| Gimboz Smash ✔︎ | `Cover 1` | `1.00%` | `97.5x` @ `1.00%` | `1` | `0x` @ `100.00%` |
| Gimboz Smash ✔︎ | `Cover 2` | `2.00%` | `48.75x` @ `2.00%` | `1` | `0x` @ `100.00%` |
| Gimboz Smash ✔︎ | `Cover 3` | `3.00%` | `32.5x` @ `3.00%` | `1` | `0x` @ `100.00%` |
| Gimboz Smash ✔︎ | `Cover 4` | `4.00%` | `24.375x` @ `4.00%` | `1` | `0x` @ `100.00%` |
| Roulette ✔︎ | `Single Number` | `2.63%` | `36.9x` @ `2.63%` | `1` | `0x` @ `100.00%` |

Notes:

1. Progressive jackpot excluded.

[Back to Index](#table-index)

## All Modes by Win Rate, Ordered by Max X Tiebreak

| Game | Mode | Win Rate | Min X | Mode X | Max X | RTP |
|------|------|----------|-------|-------|-------|-----|
| Gimboz Smash ✔︎ | `Cover 95` | `95.00%` | `1.0263x` @ `95.00%` | `1.0263x` @ `95.00%` | `1.0263x` @ `95.00%` | `97.50%` |
| ApeStrong ✔︎ | `Range 95` | `95.00%` | `1.025x` @ `95.00%` | `1.025x` @ `95.00%` | `1.025x` @ `95.00%` | `97.38%` |
| Bear-A-Dice ✔︎ | `Easy / 1 roll` | `83.33%` | `1.01x` @ `27.78%` | `1.01x` @ `27.78%` | `1.83x` @ `5.56%` | **`97.89%`** |
| Gimboz Smash ✔︎ | `Cover 75` | `75.00%` | `1.3x` @ `75.00%` | `1.3x` @ `75.00%` | `1.3x` @ `75.00%` | `97.50%` |
| ApeStrong ✔︎ | `Range 75` | `75.00%` | `1.2999x` @ `75.00%` | `1.2999x` @ `75.00%` | `1.2999x` @ `75.00%` | `97.49%` |
| Bear-A-Dice ✔︎ | `Easy / 2 rolls` | `69.44%` | `1.04x` @ `7.72%` | `1.12x` @ `12.35%` | `3.35x` @ `0.31%` | **`97.90%`** |
| Keno ✔︎ | `Picks 5` | `58.35%` | `1.1x` @ `27.77%` | `1.1x` @ `27.77%` | `200x` @ `0.04%` | `94.68%` |
| Bear-A-Dice ✔︎ | `Easy / 3 rolls` | `57.87%` | `1.09x` @ `2.14%` | `1.38x` @ `6.17%` | `6.23x` @ `0.02%` | **`97.85%`** |
| Bear-A-Dice ✔︎ | `Medium / 1 roll` | `55.56%` | `1.17x` @ `22.22%` | `1.17x` @ `22.22%` | `3.8x` @ `5.56%` | **`97.94%`** |
| Jungle Plinko ✔︎ | `Risk 0 / Low` | `53.33%` | `1.2x` @ `38.10%` | `1.2x` @ `38.10%` | `2.2x` @ `15.24%` | **`98.00%`** |
| Primes ✔︎ | `Easy` | `50.00%` | `1.9x` @ `40.00%` | `1.9x` @ `40.00%` | `2.2x` @ `10.00%` | **`98.00%`** |
| Bear-A-Dice ✔︎ | `Easy / 4 rolls` | `48.23%` | `1.13x` @ `0.60%` | `1.42x` @ `3.43%` | `12.23x` @ `0.00%` | **`97.80%`** |
| Roulette ✔︎ | `Even / Odd` / `Half` / `Red / Black` | `47.37%` | `2.05x` @ `47.37%` | `2.05x` @ `47.37%` | `2.05x` @ `47.37%` | `97.11%` |
| Baccarat ✔︎ | `BANKER` | `45.84%` | `1.95x` @ `45.84%` | `1.95x` @ `45.84%` | `1.95x` @ `45.84%` | **`98.94%`** |
| Speed Keno ✔︎ | `Picks 2` | `44.74%` | `1.45x` @ `39.47%` | `1.45x` @ `39.47%` | `5x` @ `5.26%` | `97.37%` |
| Baccarat ✔︎ | `PLAYER` | `44.61%` | `2x` @ `44.61%` | `2x` @ `44.61%` | `2x` @ `44.61%` | **`98.77%`** |
| Monkey Match ✔︎ | `Low` | `44.44%` | `1.25x` @ `23.15%` | `1.25x` @ `23.15%` | `50x` @ `0.08%` | **`97.99%`** |
| Keno ✔︎ | `Picks 2` | `44.23%` | `1.8x` @ `38.46%` | `1.8x` @ `38.46%` | `4.25x` @ `5.77%` | `93.75%` |
| Bear-A-Dice ✔︎ | `Easy / 5 rolls` | `40.19%` | `1.22x` @ `0.17%` | `1.6x` @ `1.91%` | `21.09x` @ `0.00%` | **`97.80%`** |
| Jungle Plinko ✔︎ | `Risk 1 / Moderate` | `40.00%` | `1.25x` @ `26.67%` | `1.25x` @ `26.67%` | `5x` @ `2.67%` | **`97.97%`** |
| Keno ✔︎ | `Picks 8` | `38.78%` | `1.1x` @ `22.24%` | `1.1x` @ `22.24%` | `10000x` @ `0.00%` | `94.19%` |
| Blocks ✔︎ | `Low / 1 roll` | `37.87%` | `1.01x` @ `27.40%` | `1.01x` @ `27.40%` | `2500.00x` @ `0.00%` | `44.77%` |
| Monkey Match ✔︎ | `High` | `35.03%` | `2x` @ `18.74%` | `2x` @ `18.74%` | `50x` @ `0.04%` | **`98.29%`** |
| Keno ✔︎ | `Picks 7` | `33.75%` | `1.25x` @ `17.64%` | `1.25x` @ `17.64%` | `2500x` @ `0.00%` | `94.29%` |
| Bear-A-Dice ✔︎ | `Hard / 1 roll` | `33.33%` | `1.77x` @ `16.67%` | `1.77x` @ `16.67%` | `6.3x` @ `5.56%` | **`97.83%`** |
| Roulette ✔︎ | `Dozen / Column` | `31.58%` | `3.075x` @ `31.58%` | `3.075x` @ `31.58%` | `3.075x` @ `31.58%` | `97.11%` |
| Bear-A-Dice ✔︎ | `Medium / 2 rolls` | `30.86%` | `1.39x` @ `4.94%` | `1.85x` @ `7.41%` | `14.75x` @ `0.31%` | **`97.90%`** |
| Jungle Plinko ✔︎ | `Risk 2 / High` | `30.85%` | `1.2x` @ `16.95%` | `1.2x` @ `16.95%` | `15x` @ `0.34%` | **`97.97%`** |
| Keno ✔︎ | `Picks 6` | `30.74%` | `1.5x` @ `15.47%` | `1.5x` @ `15.47%` | `500x` @ `0.01%` | `93.90%` |
| Geez Diggerz ✔︎ | `Any spin count 1-15` | `30.00%` | `1x` @ `1.94%` | `2x` @ `8.55%` | `50x` @ `0.18%` | **`97.69%`** |
| Speed Keno ✔︎ | `Picks 5` | `26.63%` | `1.25x` @ `19.37%` | `1.25x` @ `19.37%` | `2000x` @ `0.01%` | **`97.84%`** |
| Primes ✔︎ | `Medium` | `26.00%` | `3.5x` @ `25.00%` | `3.5x` @ `25.00%` | `10.5x` @ `1.00%` | **`98.00%`** |
| Keno ✔︎ | `Picks 4` | `25.59%` | `2x` @ `21.42%` | `2x` @ `21.42%` | `100x` @ `0.23%` | `93.39%` |
| Speed Keno ✔︎ | `Picks 1` | `25.00%` | `2.4x` @ `25.00%` | `2.4x` @ `25.00%` | `2.4x` @ `25.00%` | `97.50%` |
| Keno ✔︎ | `Picks 1` | `25.00%` | `2.25x` @ `25.00%` | `2.25x` @ `25.00%` | `2.25x` @ `25.00%` | `93.75%` |
| Speed Keno ✔︎ | `Picks 4` | `24.87%` | `1.5x` @ `21.67%` | `1.5x` @ `21.67%` | `100x` @ `0.10%` | `97.42%` |
| Video Poker ✔︎ / Gimboz Poker ¹ | `Base paytable` | `23.99%` | `1x` @ `21.46%` | `1x` @ `21.46%` | `250x` @ `0.00%` | **`98.16%`** |
| Sushi Showdown ✔︎ | `Any spin count 1-15` | `23.91%` | `1.25x` @ `3.97%` | `1.75x` @ `5.31%` | `500x` @ `0.01%` | **`97.87%`** |
| Jungle Plinko ✔︎ | `Risk 3 / Degen` | `23.33%` | `1.5x` @ `11.70%` | `1.5x` @ `11.70%` | `100x` @ `0.06%` | **`97.94%`** |
| Keno ✔︎ | `Picks 10` | `23.23%` | `1.2x` @ `14.71%` | `1.2x` @ `14.71%` | `1000000x` @ `0.00%` | `93.83%` |
| Jungle Plinko ✔︎ | `Risk 4 / Ultra Degen` | `22.18%` | `1.4x` @ `9.87%` | `1.4x` @ `9.87%` | `1000x` @ `0.00%` | **`97.99%`** |
| Keno ✔︎ | `Picks 9` | `19.03%` | `1.5x` @ `10.94%` | `1.5x` @ `10.94%` | `500000x` @ `0.00%` | `93.32%` |
| Cosmic Plinko ✔︎ | `Risk 0 / Low` | `17.20%` | `1.2x` @ `6.62%` | `1.2x` @ `6.62%` | `50x` @ `0.22%` | **`97.73%`** |
| Bear-A-Dice ✔︎ | `Medium / 3 rolls` | `17.15%` | `1.64x` @ `1.10%` | `2.2x` @ `2.47%` | `57.07x` @ `0.02%` | **`97.52%`** |
| Primes ✔︎ | `Hard` | `16.90%` | `5.5x` @ `16.80%` | `5.5x` @ `16.80%` | `56x` @ `0.10%` | **`98.00%`** |
| Bear-A-Dice ✔︎ | `Expert / 1 roll` | `16.67%` | `3.95x` @ `11.11%` | `3.95x` @ `11.11%` | `9.72x` @ `5.56%` | **`97.89%`** |
| Keno ✔︎ | `Picks 3` | `14.88%` | `2.5x` @ `13.66%` | `2.5x` @ `13.66%` | `20x` @ `1.21%` | `93.67%` |
| Cosmic Plinko ✔︎ | `Mode 2 / High` | `14.37%` | `1.5x` @ `6.19%` | `1.5x` @ `6.19%` | `250x` @ `0.03%` | **`97.80%`** |
| Blocks ✔︎ | `Low / 2 rolls` | `14.34%` | `1.02x` @ `7.50%` | `1.02x` @ `7.50%` | `6250000.00x` @ `0.00%` | `20.04%` |
| Speed Keno ✔︎ | `Picks 3` | `14.04%` | `2.5x` @ `13.16%` | `2.5x` @ `13.16%` | `25x` @ `0.88%` | **`97.81%`** |
| Primes ✔︎ | `Extreme` | `12.30%` | `7.57x` @ `12.29%` | `7.57x` @ `12.29%` | `500x` @ `0.01%` | **`98.04%`** |
| Bear-A-Dice ✔︎ | `Hard / 2 rolls` | `11.11%` | `3.2x` @ `2.78%` | `5.42x` @ `3.70%` | `40.58x` @ `0.31%` | **`97.79%`** |
| Roulette ✔︎ | `Corner` | `10.53%` | `9.225x` @ `10.53%` | `9.225x` @ `10.53%` | `9.225x` @ `10.53%` | `97.11%` |
| Blocks ✔︎ | `High / 1 roll` | `10.47%` | `2.25x` @ `8.09%` | `2.25x` @ `8.09%` | `5000.00x` @ `0.00%` | `42.37%` |
| Cosmic Plinko ✔︎ | `Risk 1 / Modest` | `9.87%` | `2x` @ `5.74%` | `2x` @ `5.74%` | `100x` @ `0.11%` | **`97.76%`** |
| Baccarat ✔︎ | `TIE` | `9.54%` | `9x` @ `9.54%` | `9x` @ `9.54%` | `9x` @ `9.54%` | `85.88%` |
| Bear-A-Dice ✔︎ | `Medium / 4 rolls` | `9.53%` | `2.01x` @ `0.24%` | `5.09x` @ `1.10%` | `219.71x` @ `0.00%` | **`97.80%`** |
| Bear-A-Dice ✔︎ | `Master / 1 roll` | `5.56%` | `17.62x` @ `5.56%` | `17.62x` @ `5.56%` | `17.62x` @ `5.56%` | **`97.89%`** |
| Blocks ✔︎ | `Low / 3 rolls` | `5.43%` | `1.03x` @ `2.06%` | `1.03x` @ `2.06%` | `15625000000.00x` @ `0.00%` | `8.97%` |
| Bear-A-Dice ✔︎ | `Medium / 5 rolls` | `5.29%` | `2.39x` @ `0.05%` | `8.02x` @ `0.46%` | `856.91x` @ `0.00%` | `97.25%` |
| Roulette ✔︎ | `Split` | `5.26%` | `18.45x` @ `5.26%` | `18.45x` @ `5.26%` | `18.45x` @ `5.26%` | `97.11%` |
| Bear-A-Dice ✔︎ | `Hard / 3 rolls` | `3.70%` | `5.74x` @ `0.46%` | `9.77x` @ `0.93%` | `262.14x` @ `0.02%` | **`97.85%`** |
| Bear-A-Dice ✔︎ | `Expert / 2 rolls` | `2.78%` | `16x` @ `1.23%` | `16x` @ `1.23%` | `96.04x` @ `0.31%` | **`97.79%`** |
| Roulette ✔︎ | `Single Number` | `2.63%` | `36.9x` @ `2.63%` | `36.9x` @ `2.63%` | `36.9x` @ `2.63%` | `97.11%` |
| Blocks ✔︎ | `Low / 4 rolls` | `2.06%` | `1.04x` @ `0.56%` | `1.04x` @ `0.56%` | `39062500000000.00x` @ `0.00%` | `4.02%` |
| Bear-A-Dice ✔︎ | `Hard / 4 rolls` | `1.23%` | `10.27x` @ `0.08%` | `17.49x` @ `0.21%` | `1,709.4x` @ `0.00%` | **`97.80%`** |
| Blocks ✔︎ | `High / 2 rolls` | `1.10%` | `5.06x` @ `0.65%` | `5.06x` @ `0.65%` | `25000000.00x` @ `0.00%` | `17.96%` |
| Blocks ✔︎ | `Low / 5 rolls` | `0.7786%` | `1.05x` @ `0.15%` | `1.05x` @ `0.15%` | `97656250000000000.00x` @ `0.00%` | `1.80%` |
| Bear-A-Dice ✔︎ | `Expert / 3 rolls` | `0.463%` | `64.48x` @ `0.14%` | `157.91x` @ `0.21%` | `946.97x` @ `0.02%` | `97.36%` |
| Bear-A-Dice ✔︎ | `Hard / 5 rolls` | `0.4115%` | `18.38x` @ `0.01%` | `53.7x` @ `0.06%` | `10,991.45x` @ `0.00%` | **`97.80%`** |
| Bear-A-Dice ✔︎ | `Master / 2 rolls` | `0.3086%` | `316.84x` @ `0.31%` | `316.84x` @ `0.31%` | `316.84x` @ `0.31%` | **`97.79%`** |
| Blocks ✔︎ | `High / 3 rolls` | `0.1148%` | `11.39x` @ `0.05%` | `11.39x` @ `0.05%` | `125000000000.00x` @ `0.00%` | `7.61%` |
| Bear-A-Dice ✔︎ | `Expert / 4 rolls` | `0.0772%` | `263.77x` @ `0.02%` | `644.04x` @ `0.03%` | `9,375.2x` @ `0.00%` | **`97.80%`** |
| Bear-A-Dice ✔︎ | `Master / 3 rolls` | `0.0171%` | `5,706.55x` @ `0.02%` | `5,706.55x` @ `0.02%` | `5,706.55x` @ `0.02%` | **`97.85%`** |
| Bear-A-Dice ✔︎ | `Expert / 5 rolls` | `0.0129%` | `1,062.98x` @ `0.00%` | `1,062.98x` @ `0.00%` | `93,193.28x` @ `0.00%` | **`97.80%`** |
| Blocks ✔︎ | `High / 4 rolls` | `0.012%` | `25.63x` @ `0.00%` | `25.63x` @ `0.00%` | `625000000000000.00x` @ `0.00%` | `3.22%` |
| Blocks ✔︎ | `High / 5 rolls` | `0.001259%` | `57.67x` @ `0.00%` | `57.67x` @ `0.00%` | `3125000000000000000.00x` @ `0.00%` | `1.37%` |
| Bear-A-Dice ✔︎ | `Master / 4 rolls` | `0.000953%` | `102,433.35x` @ `0.00%` | `102,433.35x` @ `0.00%` | `102,433.35x` @ `0.00%` | **`97.58%`** |
| Bear-A-Dice ✔︎ | `Master / 5 rolls` | `0.000053%` | `1,847,949.19x` @ `0.00%` | `1,847,949.19x` @ `0.00%` | `1,847,949.19x` @ `0.00%` | **`97.80%`** |

Notes:

1. Progressive jackpot excluded.

[Back to Index](#table-index)

## All Modes by Max X, Ordered by Win Rate Tiebreak

| Game | Mode | Win Rate | Min X | Mode X | Max X | RTP |
|------|------|----------|-------|-------|-------|-----|
| Blocks ✔︎ | `High / 5 rolls` | `0.001259%` | `57.67x` @ `0.00%` | `57.67x` @ `0.00%` | `3125000000000000000.00x` @ `0.00%` | `1.37%` |
| Blocks ✔︎ | `Low / 5 rolls` | `0.7786%` | `1.05x` @ `0.15%` | `1.05x` @ `0.15%` | `97656250000000000.00x` @ `0.00%` | `1.80%` |
| Blocks ✔︎ | `High / 4 rolls` | `0.012%` | `25.63x` @ `0.00%` | `25.63x` @ `0.00%` | `625000000000000.00x` @ `0.00%` | `3.22%` |
| Blocks ✔︎ | `Low / 4 rolls` | `2.06%` | `1.04x` @ `0.56%` | `1.04x` @ `0.56%` | `39062500000000.00x` @ `0.00%` | `4.02%` |
| Blocks ✔︎ | `High / 3 rolls` | `0.1148%` | `11.39x` @ `0.05%` | `11.39x` @ `0.05%` | `125000000000.00x` @ `0.00%` | `7.61%` |
| Blocks ✔︎ | `Low / 3 rolls` | `5.43%` | `1.03x` @ `2.06%` | `1.03x` @ `2.06%` | `15625000000.00x` @ `0.00%` | `8.97%` |
| Blocks ✔︎ | `High / 2 rolls` | `1.10%` | `5.06x` @ `0.65%` | `5.06x` @ `0.65%` | `25000000.00x` @ `0.00%` | `17.96%` |
| Blocks ✔︎ | `Low / 2 rolls` | `14.34%` | `1.02x` @ `7.50%` | `1.02x` @ `7.50%` | `6250000.00x` @ `0.00%` | `20.04%` |
| Bear-A-Dice ✔︎ | `Master / 5 rolls` | `0.000053%` | `1,847,949.19x` @ `0.00%` | `1,847,949.19x` @ `0.00%` | `1,847,949.19x` @ `0.00%` | **`97.80%`** |
| Keno ✔︎ | `Picks 10` | `23.23%` | `1.2x` @ `14.71%` | `1.2x` @ `14.71%` | `1000000x` @ `0.00%` | `93.83%` |
| Keno ✔︎ | `Picks 9` | `19.03%` | `1.5x` @ `10.94%` | `1.5x` @ `10.94%` | `500000x` @ `0.00%` | `93.32%` |
| Bear-A-Dice ✔︎ | `Master / 4 rolls` | `0.000953%` | `102,433.35x` @ `0.00%` | `102,433.35x` @ `0.00%` | `102,433.35x` @ `0.00%` | **`97.58%`** |
| Bear-A-Dice ✔︎ | `Expert / 5 rolls` | `0.0129%` | `1,062.98x` @ `0.00%` | `1,062.98x` @ `0.00%` | `93,193.28x` @ `0.00%` | **`97.80%`** |
| Bear-A-Dice ✔︎ | `Hard / 5 rolls` | `0.4115%` | `18.38x` @ `0.01%` | `53.7x` @ `0.06%` | `10,991.45x` @ `0.00%` | **`97.80%`** |
| Keno ✔︎ | `Picks 8` | `38.78%` | `1.1x` @ `22.24%` | `1.1x` @ `22.24%` | `10000x` @ `0.00%` | `94.19%` |
| Bear-A-Dice ✔︎ | `Expert / 4 rolls` | `0.0772%` | `263.77x` @ `0.02%` | `644.04x` @ `0.03%` | `9,375.2x` @ `0.00%` | **`97.80%`** |
| Bear-A-Dice ✔︎ | `Master / 3 rolls` | `0.0171%` | `5,706.55x` @ `0.02%` | `5,706.55x` @ `0.02%` | `5,706.55x` @ `0.02%` | **`97.85%`** |
| Blocks ✔︎ | `High / 1 roll` | `10.47%` | `2.25x` @ `8.09%` | `2.25x` @ `8.09%` | `5000.00x` @ `0.00%` | `42.37%` |
| Blocks ✔︎ | `Low / 1 roll` | `37.87%` | `1.01x` @ `27.40%` | `1.01x` @ `27.40%` | `2500.00x` @ `0.00%` | `44.77%` |
| Keno ✔︎ | `Picks 7` | `33.75%` | `1.25x` @ `17.64%` | `1.25x` @ `17.64%` | `2500x` @ `0.00%` | `94.29%` |
| Speed Keno ✔︎ | `Picks 5` | `26.63%` | `1.25x` @ `19.37%` | `1.25x` @ `19.37%` | `2000x` @ `0.01%` | **`97.84%`** |
| Bear-A-Dice ✔︎ | `Hard / 4 rolls` | `1.23%` | `10.27x` @ `0.08%` | `17.49x` @ `0.21%` | `1,709.4x` @ `0.00%` | **`97.80%`** |
| Jungle Plinko ✔︎ | `Risk 4 / Ultra Degen` | `22.18%` | `1.4x` @ `9.87%` | `1.4x` @ `9.87%` | `1000x` @ `0.00%` | **`97.99%`** |
| Bear-A-Dice ✔︎ | `Expert / 3 rolls` | `0.463%` | `64.48x` @ `0.14%` | `157.91x` @ `0.21%` | `946.97x` @ `0.02%` | `97.36%` |
| Bear-A-Dice ✔︎ | `Medium / 5 rolls` | `5.29%` | `2.39x` @ `0.05%` | `8.02x` @ `0.46%` | `856.91x` @ `0.00%` | `97.25%` |
| Keno ✔︎ | `Picks 6` | `30.74%` | `1.5x` @ `15.47%` | `1.5x` @ `15.47%` | `500x` @ `0.01%` | `93.90%` |
| Sushi Showdown ✔︎ | `Any spin count 1-15` | `23.91%` | `1.25x` @ `3.97%` | `1.75x` @ `5.31%` | `500x` @ `0.01%` | **`97.87%`** |
| Primes ✔︎ | `Extreme` | `12.30%` | `7.57x` @ `12.29%` | `7.57x` @ `12.29%` | `500x` @ `0.01%` | **`98.04%`** |
| Bear-A-Dice ✔︎ | `Master / 2 rolls` | `0.3086%` | `316.84x` @ `0.31%` | `316.84x` @ `0.31%` | `316.84x` @ `0.31%` | **`97.79%`** |
| Bear-A-Dice ✔︎ | `Hard / 3 rolls` | `3.70%` | `5.74x` @ `0.46%` | `9.77x` @ `0.93%` | `262.14x` @ `0.02%` | **`97.85%`** |
| Video Poker ✔︎ / Gimboz Poker ¹ | `Base paytable` | `23.99%` | `1x` @ `21.46%` | `1x` @ `21.46%` | `250x` @ `0.00%` | **`98.16%`** |
| Cosmic Plinko ✔︎ | `Mode 2 / High` | `14.37%` | `1.5x` @ `6.19%` | `1.5x` @ `6.19%` | `250x` @ `0.03%` | **`97.80%`** |
| Bear-A-Dice ✔︎ | `Medium / 4 rolls` | `9.53%` | `2.01x` @ `0.24%` | `5.09x` @ `1.10%` | `219.71x` @ `0.00%` | **`97.80%`** |
| Keno ✔︎ | `Picks 5` | `58.35%` | `1.1x` @ `27.77%` | `1.1x` @ `27.77%` | `200x` @ `0.04%` | `94.68%` |
| Keno ✔︎ | `Picks 4` | `25.59%` | `2x` @ `21.42%` | `2x` @ `21.42%` | `100x` @ `0.23%` | `93.39%` |
| Speed Keno ✔︎ | `Picks 4` | `24.87%` | `1.5x` @ `21.67%` | `1.5x` @ `21.67%` | `100x` @ `0.10%` | `97.42%` |
| Jungle Plinko ✔︎ | `Risk 3 / Degen` | `23.33%` | `1.5x` @ `11.70%` | `1.5x` @ `11.70%` | `100x` @ `0.06%` | **`97.94%`** |
| Cosmic Plinko ✔︎ | `Risk 1 / Modest` | `9.87%` | `2x` @ `5.74%` | `2x` @ `5.74%` | `100x` @ `0.11%` | **`97.76%`** |
| Bear-A-Dice ✔︎ | `Expert / 2 rolls` | `2.78%` | `16x` @ `1.23%` | `16x` @ `1.23%` | `96.04x` @ `0.31%` | **`97.79%`** |
| Bear-A-Dice ✔︎ | `Medium / 3 rolls` | `17.15%` | `1.64x` @ `1.10%` | `2.2x` @ `2.47%` | `57.07x` @ `0.02%` | **`97.52%`** |
| Primes ✔︎ | `Hard` | `16.90%` | `5.5x` @ `16.80%` | `5.5x` @ `16.80%` | `56x` @ `0.10%` | **`98.00%`** |
| Monkey Match ✔︎ | `Low` | `44.44%` | `1.25x` @ `23.15%` | `1.25x` @ `23.15%` | `50x` @ `0.08%` | **`97.99%`** |
| Monkey Match ✔︎ | `High` | `35.03%` | `2x` @ `18.74%` | `2x` @ `18.74%` | `50x` @ `0.04%` | **`98.29%`** |
| Geez Diggerz ✔︎ | `Any spin count 1-15` | `30.00%` | `1x` @ `1.94%` | `2x` @ `8.55%` | `50x` @ `0.18%` | **`97.69%`** |
| Cosmic Plinko ✔︎ | `Risk 0 / Low` | `17.20%` | `1.2x` @ `6.62%` | `1.2x` @ `6.62%` | `50x` @ `0.22%` | **`97.73%`** |
| Bear-A-Dice ✔︎ | `Hard / 2 rolls` | `11.11%` | `3.2x` @ `2.78%` | `5.42x` @ `3.70%` | `40.58x` @ `0.31%` | **`97.79%`** |
| Roulette ✔︎ | `Single Number` | `2.63%` | `36.9x` @ `2.63%` | `36.9x` @ `2.63%` | `36.9x` @ `2.63%` | `97.11%` |
| Speed Keno ✔︎ | `Picks 3` | `14.04%` | `2.5x` @ `13.16%` | `2.5x` @ `13.16%` | `25x` @ `0.88%` | **`97.81%`** |
| Bear-A-Dice ✔︎ | `Easy / 5 rolls` | `40.19%` | `1.22x` @ `0.17%` | `1.6x` @ `1.91%` | `21.09x` @ `0.00%` | **`97.80%`** |
| Keno ✔︎ | `Picks 3` | `14.88%` | `2.5x` @ `13.66%` | `2.5x` @ `13.66%` | `20x` @ `1.21%` | `93.67%` |
| Roulette ✔︎ | `Split` | `5.26%` | `18.45x` @ `5.26%` | `18.45x` @ `5.26%` | `18.45x` @ `5.26%` | `97.11%` |
| Bear-A-Dice ✔︎ | `Master / 1 roll` | `5.56%` | `17.62x` @ `5.56%` | `17.62x` @ `5.56%` | `17.62x` @ `5.56%` | **`97.89%`** |
| Jungle Plinko ✔︎ | `Risk 2 / High` | `30.85%` | `1.2x` @ `16.95%` | `1.2x` @ `16.95%` | `15x` @ `0.34%` | **`97.97%`** |
| Bear-A-Dice ✔︎ | `Medium / 2 rolls` | `30.86%` | `1.39x` @ `4.94%` | `1.85x` @ `7.41%` | `14.75x` @ `0.31%` | **`97.90%`** |
| Bear-A-Dice ✔︎ | `Easy / 4 rolls` | `48.23%` | `1.13x` @ `0.60%` | `1.42x` @ `3.43%` | `12.23x` @ `0.00%` | **`97.80%`** |
| Primes ✔︎ | `Medium` | `26.00%` | `3.5x` @ `25.00%` | `3.5x` @ `25.00%` | `10.5x` @ `1.00%` | **`98.00%`** |
| Bear-A-Dice ✔︎ | `Expert / 1 roll` | `16.67%` | `3.95x` @ `11.11%` | `3.95x` @ `11.11%` | `9.72x` @ `5.56%` | **`97.89%`** |
| Roulette ✔︎ | `Corner` | `10.53%` | `9.225x` @ `10.53%` | `9.225x` @ `10.53%` | `9.225x` @ `10.53%` | `97.11%` |
| Baccarat ✔︎ | `TIE` | `9.54%` | `9x` @ `9.54%` | `9x` @ `9.54%` | `9x` @ `9.54%` | `85.88%` |
| Bear-A-Dice ✔︎ | `Hard / 1 roll` | `33.33%` | `1.77x` @ `16.67%` | `1.77x` @ `16.67%` | `6.3x` @ `5.56%` | **`97.83%`** |
| Bear-A-Dice ✔︎ | `Easy / 3 rolls` | `57.87%` | `1.09x` @ `2.14%` | `1.38x` @ `6.17%` | `6.23x` @ `0.02%` | **`97.85%`** |
| Speed Keno ✔︎ | `Picks 2` | `44.74%` | `1.45x` @ `39.47%` | `1.45x` @ `39.47%` | `5x` @ `5.26%` | `97.37%` |
| Jungle Plinko ✔︎ | `Risk 1 / Moderate` | `40.00%` | `1.25x` @ `26.67%` | `1.25x` @ `26.67%` | `5x` @ `2.67%` | **`97.97%`** |
| Keno ✔︎ | `Picks 2` | `44.23%` | `1.8x` @ `38.46%` | `1.8x` @ `38.46%` | `4.25x` @ `5.77%` | `93.75%` |
| Bear-A-Dice ✔︎ | `Medium / 1 roll` | `55.56%` | `1.17x` @ `22.22%` | `1.17x` @ `22.22%` | `3.8x` @ `5.56%` | **`97.94%`** |
| Bear-A-Dice ✔︎ | `Easy / 2 rolls` | `69.44%` | `1.04x` @ `7.72%` | `1.12x` @ `12.35%` | `3.35x` @ `0.31%` | **`97.90%`** |
| Roulette ✔︎ | `Dozen / Column` | `31.58%` | `3.075x` @ `31.58%` | `3.075x` @ `31.58%` | `3.075x` @ `31.58%` | `97.11%` |
| Speed Keno ✔︎ | `Picks 1` | `25.00%` | `2.4x` @ `25.00%` | `2.4x` @ `25.00%` | `2.4x` @ `25.00%` | `97.50%` |
| Keno ✔︎ | `Picks 1` | `25.00%` | `2.25x` @ `25.00%` | `2.25x` @ `25.00%` | `2.25x` @ `25.00%` | `93.75%` |
| Jungle Plinko ✔︎ | `Risk 0 / Low` | `53.33%` | `1.2x` @ `38.10%` | `1.2x` @ `38.10%` | `2.2x` @ `15.24%` | **`98.00%`** |
| Primes ✔︎ | `Easy` | `50.00%` | `1.9x` @ `40.00%` | `1.9x` @ `40.00%` | `2.2x` @ `10.00%` | **`98.00%`** |
| Roulette ✔︎ | `Even / Odd` / `Half` / `Red / Black` | `47.37%` | `2.05x` @ `47.37%` | `2.05x` @ `47.37%` | `2.05x` @ `47.37%` | `97.11%` |
| Baccarat ✔︎ | `PLAYER` | `44.61%` | `2x` @ `44.61%` | `2x` @ `44.61%` | `2x` @ `44.61%` | **`98.77%`** |
| Baccarat ✔︎ | `BANKER` | `45.84%` | `1.95x` @ `45.84%` | `1.95x` @ `45.84%` | `1.95x` @ `45.84%` | **`98.94%`** |
| Bear-A-Dice ✔︎ | `Easy / 1 roll` | `83.33%` | `1.01x` @ `27.78%` | `1.01x` @ `27.78%` | `1.83x` @ `5.56%` | **`97.89%`** |
| Gimboz Smash ✔︎ | `Cover 75` | `75.00%` | `1.3x` @ `75.00%` | `1.3x` @ `75.00%` | `1.3x` @ `75.00%` | `97.50%` |
| ApeStrong ✔︎ | `Range 75` | `75.00%` | `1.2999x` @ `75.00%` | `1.2999x` @ `75.00%` | `1.2999x` @ `75.00%` | `97.49%` |
| Gimboz Smash ✔︎ | `Cover 95` | `95.00%` | `1.0263x` @ `95.00%` | `1.0263x` @ `95.00%` | `1.0263x` @ `95.00%` | `97.50%` |
| ApeStrong ✔︎ | `Range 95` | `95.00%` | `1.025x` @ `95.00%` | `1.025x` @ `95.00%` | `1.025x` @ `95.00%` | `97.38%` |

Notes:

1. Progressive jackpot excluded.

[Back to Index](#table-index)

## Not Included

The following supported games are not included because the local repo does not currently keep a comparable exact net-profit win-rate surface for each mode:

| Game | Reason |
|------|--------|
| Blackjack ✔︎ | Main game is statistical/policy-dependent and side-bet win-rate surfaces are not represented as reusable exact mode rows. |
| Hi-Lo Nebula ✔︎ | Whole-run results depend on cash-out policy, current-rank decisions, and live jackpot state. |
| Dino Dough ✔︎ | Exact RTP and max payout are documented, but a reusable exact net-profit win-rate distribution is not currently persisted locally. |
| Bubblegum Heist ✔︎ | Exact RTP and max payout are documented, but a reusable exact net-profit win-rate distribution is not currently persisted locally. |

Public games not yet supported by this CLI remain outside this file for the same reason as in [GAMES_REFERENCE.md](./GAMES_REFERENCE.md): the local source set does not provide a complete exact mode surface.
