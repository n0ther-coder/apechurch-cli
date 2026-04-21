# Gimboz Smash Odds and Payouts

> Summary: Exact Gimboz Smash cover-count table derived from the verified ABI surface and the live `getPayoutFromRange(winCount)` getter snapshot.

This note summarizes the exact **gross multiplier** and **theoretical RTP** for every supported Gimboz Smash target size.

## How Gimboz Smash works

Gimboz Smash is a range-selection game on a public inclusive `1..100` board.

- You choose one or two inclusive winning intervals.
- The contract pays only if the resolved number lands inside the declared winning set.
- The payout depends only on the total covered numbers, not on where the covered numbers sit on the board.
- Outside-style bets are therefore just explicit edge intervals such as `1-20,80-100`; the CLI can also accept `--out-range 21-79` and rewrite it to the same stored winning set.

The live contract currently supports total cover counts from `1` through `95`.

## Exact Formula

Let `winCount` be the total covered numbers across the declared winning intervals.

```text
P(win) = winCount / 100
P(loss) = (100 - winCount) / 100
multiplier(winCount) = floor(975000 / winCount) / 10000
RTP(winCount) = winCount * floor(975000 / winCount) / 10000
```

Important consequence: the game is almost, but not perfectly, flat-EV across cover counts. The live getter's floor division makes exact RTP range from `97.4918%` at `winCount = 83` up to `97.5000%`.

The platform analytics screenshot captured on **2026-04-20** showed a public running RTP of `97.70%` over `33,758` games. That is a realized sample statistic, not the theoretical value from the verified payout getter.

## Representative Reference Points

| Covered numbers | Example target | Win chance | Multiplier | Exact RTP |
|-----------------|----------------|------------|------------|-----------|
| `1` | `100-100` | `1.00%` | `97.5x` | `97.5000%` |
| `21` | `40-60` | `21.00%` | `4.6428x` | `97.4988%` |
| `41` | `1-20,80-100` | `41.00%` | `2.378x` | `97.4980%` |
| `53` | `48-100` | `53.00%` | `1.8396x` | `97.4988%` |
| `65` | `16-80` | `65.00%` | `1.5x` | `97.5000%` |
| `75` | `1-75` | `75.00%` | `1.3x` | `97.5000%` |
| `83` | `1-83` | `83.00%` | `1.1746x` | `97.4918%` |
| `95` | `1-95` | `95.00%` | `1.0263x` | `97.4985%` |

## Full Cover-Count Table

Gross multipliers below include the original stake.

| Cover | Win | Multiplier | RTP | Cover | Win | Multiplier | RTP | Cover | Win | Multiplier | RTP |
|------:|----:|-----------:|----:|------:|----:|-----------:|----:|------:|----:|-----------:|----:|
| 1 | 1.00% | 97.5x | 97.5000% | 2 | 2.00% | 48.75x | 97.5000% | 3 | 3.00% | 32.5x | 97.5000% |
| 4 | 4.00% | 24.375x | 97.5000% | 5 | 5.00% | 19.5x | 97.5000% | 6 | 6.00% | 16.25x | 97.5000% |
| 7 | 7.00% | 13.9285x | 97.4995% | 8 | 8.00% | 12.1875x | 97.5000% | 9 | 9.00% | 10.8333x | 97.4997% |
| 10 | 10.00% | 9.75x | 97.5000% | 11 | 11.00% | 8.8636x | 97.4996% | 12 | 12.00% | 8.125x | 97.5000% |
| 13 | 13.00% | 7.5x | 97.5000% | 14 | 14.00% | 6.9642x | 97.4988% | 15 | 15.00% | 6.5x | 97.5000% |
| 16 | 16.00% | 6.0937x | 97.4992% | 17 | 17.00% | 5.7352x | 97.4984% | 18 | 18.00% | 5.4166x | 97.4988% |
| 19 | 19.00% | 5.1315x | 97.4985% | 20 | 20.00% | 4.875x | 97.5000% | 21 | 21.00% | 4.6428x | 97.4988% |
| 22 | 22.00% | 4.4318x | 97.4996% | 23 | 23.00% | 4.2391x | 97.4993% | 24 | 24.00% | 4.0625x | 97.5000% |
| 25 | 25.00% | 3.9x | 97.5000% | 26 | 26.00% | 3.75x | 97.5000% | 27 | 27.00% | 3.6111x | 97.4997% |
| 28 | 28.00% | 3.4821x | 97.4988% | 29 | 29.00% | 3.362x | 97.4980% | 30 | 30.00% | 3.25x | 97.5000% |
| 31 | 31.00% | 3.1451x | 97.4981% | 32 | 32.00% | 3.0468x | 97.4976% | 33 | 33.00% | 2.9545x | 97.4985% |
| 34 | 34.00% | 2.8676x | 97.4984% | 35 | 35.00% | 2.7857x | 97.4995% | 36 | 36.00% | 2.7083x | 97.4988% |
| 37 | 37.00% | 2.6351x | 97.4987% | 38 | 38.00% | 2.5657x | 97.4966% | 39 | 39.00% | 2.5x | 97.5000% |
| 40 | 40.00% | 2.4375x | 97.5000% | 41 | 41.00% | 2.378x | 97.4980% | 42 | 42.00% | 2.3214x | 97.4988% |
| 43 | 43.00% | 2.2674x | 97.4982% | 44 | 44.00% | 2.2159x | 97.4996% | 45 | 45.00% | 2.1666x | 97.4970% |
| 46 | 46.00% | 2.1195x | 97.4970% | 47 | 47.00% | 2.0744x | 97.4968% | 48 | 48.00% | 2.0312x | 97.4976% |
| 49 | 49.00% | 1.9897x | 97.4953% | 50 | 50.00% | 1.95x | 97.5000% | 51 | 51.00% | 1.9117x | 97.4967% |
| 52 | 52.00% | 1.875x | 97.5000% | 53 | 53.00% | 1.8396x | 97.4988% | 54 | 54.00% | 1.8055x | 97.4970% |
| 55 | 55.00% | 1.7727x | 97.4985% | 56 | 56.00% | 1.741x | 97.4960% | 57 | 57.00% | 1.7105x | 97.4985% |
| 58 | 58.00% | 1.681x | 97.4980% | 59 | 59.00% | 1.6525x | 97.4975% | 60 | 60.00% | 1.625x | 97.5000% |
| 61 | 61.00% | 1.5983x | 97.4963% | 62 | 62.00% | 1.5725x | 97.4950% | 63 | 63.00% | 1.5476x | 97.4988% |
| 64 | 64.00% | 1.5234x | 97.4976% | 65 | 65.00% | 1.5x | 97.5000% | 66 | 66.00% | 1.4772x | 97.4952% |
| 67 | 67.00% | 1.4552x | 97.4984% | 68 | 68.00% | 1.4338x | 97.4984% | 69 | 69.00% | 1.413x | 97.4970% |
| 70 | 70.00% | 1.3928x | 97.4960% | 71 | 71.00% | 1.3732x | 97.4972% | 72 | 72.00% | 1.3541x | 97.4952% |
| 73 | 73.00% | 1.3356x | 97.4988% | 74 | 74.00% | 1.3175x | 97.4950% | 75 | 75.00% | 1.3x | 97.5000% |
| 76 | 76.00% | 1.2828x | 97.4928% | 77 | 77.00% | 1.2662x | 97.4974% | 78 | 78.00% | 1.25x | 97.5000% |
| 79 | 79.00% | 1.2341x | 97.4939% | 80 | 80.00% | 1.2187x | 97.4960% | 81 | 81.00% | 1.2037x | 97.4997% |
| 82 | 82.00% | 1.189x | 97.4980% | 83 | 83.00% | 1.1746x | 97.4918% | 84 | 84.00% | 1.1607x | 97.4988% |
| 85 | 85.00% | 1.147x | 97.4950% | 86 | 86.00% | 1.1337x | 97.4982% | 87 | 87.00% | 1.1206x | 97.4922% |
| 88 | 88.00% | 1.1079x | 97.4952% | 89 | 89.00% | 1.0955x | 97.4995% | 90 | 90.00% | 1.0833x | 97.4970% |
| 91 | 91.00% | 1.0714x | 97.4974% | 92 | 92.00% | 1.0597x | 97.4924% | 93 | 93.00% | 1.0483x | 97.4919% |
| 94 | 94.00% | 1.0372x | 97.4968% | 95 | 95.00% | 1.0263x | 97.4985% |  |  |  |  |
