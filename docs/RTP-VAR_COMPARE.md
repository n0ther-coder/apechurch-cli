# RTP / Variance Compare

This table compares only rows where RTP/EV and variance are available as exact closed-form values in the local analytics notes, or from the same exact formulas documented there. No Monte Carlo or sampled running RTP values are used.

Definitions:

- `RTP` is gross expected payout divided by stake.
- `EV` is net expected value in stake units, computed as `RTP - 100%`.
- `VARIANCE` is over `X = payout / stake` or, for batched games, over `X = total payout / total stake` for the count shown in `mode`.
- Rows are sorted by `RTP` descending, then by `VARIANCE` ascending.
- ApeStrong and Gimboz Smash are expanded across their complete finite supported surfaces. Large or policy-dependent surfaces use the exact representative rows documented in their analytics notes.

| game | mode | RTP | EV | VARIANCE |
|---|---|---:|---:|---:|
| Baccarat | BANKER | 98.936000% | -1.064000% | 0.859764 |
| Baccarat | PLAYER | 98.771900% | -1.228100% | 0.904424 |
| Monkey Match | High | 98.292400% | -1.707600% | 2.666514 |
| Baccarat | BANKER+TIE, tie share 5% | 98.283400% | -1.716600% | 0.794285 |
| Video Poker | base paytable, jackpot excluded | 98.164900% | -1.835100% | 5.255198 |
| Baccarat | PLAYER+TIE, tie share 5% | 98.127400% | -1.872600% | 0.834724 |
| Primes | Extreme / 20 runs | 98.035300% | -1.964700% | 1.554084 |
| Primes | Extreme / 10 runs | 98.035300% | -1.964700% | 3.108168 |
| Primes | Extreme / 1 run | 98.035300% | -1.964700% | 31.081680 |
| Jungle Plinko | Low / 100 balls | 98.000000% | -2.000000% | 0.004044 |
| Jungle Plinko | Low / 50 balls | 98.000000% | -2.000000% | 0.008087 |
| Primes | Easy / 20 runs | 98.000000% | -2.000000% | 0.048380 |
| Primes | Easy / 10 runs | 98.000000% | -2.000000% | 0.096760 |
| Primes | Medium / 20 runs | 98.000000% | -2.000000% | 0.160230 |
| Primes | Medium / 10 runs | 98.000000% | -2.000000% | 0.320460 |
| Primes | Hard / 20 runs | 98.000000% | -2.000000% | 0.362880 |
| Jungle Plinko | Low / 1 ball | 98.000000% | -2.000000% | 0.404362 |
| Primes | Hard / 10 runs | 98.000000% | -2.000000% | 0.725760 |
| Primes | Easy / 1 run | 98.000000% | -2.000000% | 0.967600 |
| Primes | Medium / 1 run | 98.000000% | -2.000000% | 3.204600 |
| Primes | Hard / 1 run | 98.000000% | -2.000000% | 7.257600 |
| Monkey Match | Low | 97.993800% | -2.006200% | 3.065763 |
| Jungle Plinko | Ultra Degen / 100 balls | 97.992800% | -2.007200% | 0.609535 |
| Jungle Plinko | Ultra Degen / 50 balls | 97.992800% | -2.007200% | 1.219069 |
| Jungle Plinko | Ultra Degen / 1 ball | 97.992800% | -2.007200% | 60.953465 |
| Jungle Plinko | Moderate / 100 balls | 97.973300% | -2.026700% | 0.009032 |
| Jungle Plinko | Moderate / 50 balls | 97.973300% | -2.026700% | 0.018063 |
| Jungle Plinko | Moderate / 1 ball | 97.973300% | -2.026700% | 0.903163 |
| Jungle Plinko | High / 100 balls | 97.966100% | -2.033900% | 0.021100 |
| Jungle Plinko | High / 50 balls | 97.966100% | -2.033900% | 0.042201 |
| Jungle Plinko | High / 1 ball | 97.966100% | -2.033900% | 2.110027 |
| Bear-A-Dice | Medium / 1 roll | 97.944400% | -2.055600% | 1.110027 |
| Jungle Plinko | Degen / 100 balls | 97.940200% | -2.059800% | 0.118760 |
| Jungle Plinko | Degen / 50 balls | 97.940200% | -2.059800% | 0.237520 |
| Jungle Plinko | Degen / 1 ball | 97.940200% | -2.059800% | 11.875999 |
| Bear-A-Dice | Easy / 2 rolls | 97.900000% | -2.100000% | 0.512698 |
| Bear-A-Dice | Medium / 2 rolls | 97.900000% | -2.100000% | 3.502032 |
| Bear-A-Dice | Easy / 1 roll | 97.888900% | -2.111100% | 0.229888 |
| Bear-A-Dice | Expert / 1 roll | 97.888900% | -2.111100% | 6.024188 |
| Bear-A-Dice | Master / 1 roll | 97.888900% | -2.111100% | 16.289799 |
| Sushi Showdown | 15 spins | 97.871654% | -2.128346% | 1.687774 |
| Sushi Showdown | 5 spins | 97.871654% | -2.128346% | 5.063323 |
| Sushi Showdown | 1 spin | 97.871654% | -2.128346% | 25.316614 |
| Bear-A-Dice | Easy / 3 rolls | 97.848900% | -2.151100% | 0.861261 |
| Bear-A-Dice | Hard / 3 rolls | 97.848900% | -2.151100% | 55.806600 |
| Bear-A-Dice | Master / 3 rolls | 97.848900% | -2.151100% | 5582.841856 |
| Hi-Lo Nebula | 12/13 hit count | 97.846200% | -2.153800% | 0.079782 |
| Speed Keno | 5 picks / 20 games | 97.837700% | -2.162300% | 13.198487 |
| Speed Keno | 5 picks / 10 games | 97.837700% | -2.162300% | 26.396975 |
| Speed Keno | 5 picks / 1 game | 97.837700% | -2.162300% | 263.969746 |
| Bear-A-Dice | Hard / 1 roll | 97.833300% | -2.166700% | 2.770014 |
| Speed Keno | 3 picks / 20 games | 97.807000% | -2.193000% | 0.278156 |
| Speed Keno | 3 picks / 10 games | 97.807000% | -2.193000% | 0.556312 |
| Speed Keno | 3 picks / 1 game | 97.807000% | -2.193000% | 5.563116 |
| Cosmic Plinko | High / 30 balls | 97.799200% | -2.200800% | 1.240526 |
| Cosmic Plinko | High / 10 balls | 97.799200% | -2.200800% | 3.721578 |
| Cosmic Plinko | High / 1 ball | 97.799200% | -2.200800% | 37.215781 |
| Bear-A-Dice | Easy / 5 rolls | 97.797400% | -2.202600% | 1.817787 |
| Bear-A-Dice | Hard / 5 rolls | 97.797400% | -2.202600% | 868.635093 |
| Bear-A-Dice | Expert / 5 rolls | 97.797400% | -2.202600% | 19424.033121 |
| Bear-A-Dice | Master / 5 rolls | 97.797400% | -2.202600% | 1807246.107012 |
| Bear-A-Dice | Easy / 4 rolls | 97.796200% | -2.203800% | 1.308894 |
| Bear-A-Dice | Medium / 4 rolls | 97.796200% | -2.203800% | 19.691121 |
| Bear-A-Dice | Hard / 4 rolls | 97.796200% | -2.203800% | 222.094097 |
| Bear-A-Dice | Expert / 4 rolls | 97.796200% | -2.203800% | 2662.241842 |
| Bear-A-Dice | Hard / 2 rolls | 97.790100% | -2.209900% | 13.547535 |
| Bear-A-Dice | Expert / 2 rolls | 97.790100% | -2.209900% | 49.643220 |
| Bear-A-Dice | Master / 2 rolls | 97.790100% | -2.209900% | 308.881936 |
| Cosmic Plinko | Modest / 30 balls | 97.761200% | -2.238800% | 0.709560 |
| Cosmic Plinko | Modest / 10 balls | 97.761200% | -2.238800% | 2.128681 |
| Cosmic Plinko | Modest / 1 ball | 97.761200% | -2.238800% | 21.286812 |
| Cosmic Plinko | Low / 30 balls | 97.728800% | -2.271200% | 0.286009 |
| Cosmic Plinko | Low / 10 balls | 97.728800% | -2.271200% | 0.858026 |
| Cosmic Plinko | Low / 1 ball | 97.728800% | -2.271200% | 8.580256 |
| Geez Diggerz | 15 spins | 97.694552% | -2.305448% | 0.472349 |
| Geez Diggerz | 5 spins | 97.694552% | -2.305448% | 1.417048 |
| Geez Diggerz | 1 spin | 97.694552% | -2.305448% | 7.085240 |
| Baccarat | BANKER+TIE, tie share 10% | 97.630700% | -2.369300% | 0.767973 |
| Bear-A-Dice | Master / 4 rolls | 97.577900% | -2.422100% | 99951.327607 |
| Bear-A-Dice | Medium / 3 rolls | 97.520800% | -2.479200% | 8.597412 |
| Speed Keno | 1 pick / 20 games | 97.500000% | -2.500000% | 0.033844 |
| Speed Keno | 1 pick / 10 games | 97.500000% | -2.500000% | 0.067687 |
| ApeStrong | range 78 | 97.500000% | -2.500000% | 0.268125 |
| Gimboz Smash | cover 78 | 97.500000% | -2.500000% | 0.268125 |
| Gimboz Smash | cover 75 | 97.500000% | -2.500000% | 0.316875 |
| ApeStrong | range 65 | 97.500000% | -2.500000% | 0.511875 |
| Gimboz Smash | cover 65 | 97.500000% | -2.500000% | 0.511875 |
| ApeStrong | range 60 | 97.500000% | -2.500000% | 0.633750 |
| Gimboz Smash | cover 60 | 97.500000% | -2.500000% | 0.633750 |
| Speed Keno | 1 pick / 1 game | 97.500000% | -2.500000% | 0.676875 |
| ApeStrong | range 52 | 97.500000% | -2.500000% | 0.877500 |
| Gimboz Smash | cover 52 | 97.500000% | -2.500000% | 0.877500 |
| ApeStrong | range 50 | 97.500000% | -2.500000% | 0.950625 |
| Gimboz Smash | cover 50 | 97.500000% | -2.500000% | 0.950625 |
| ApeStrong | range 40 | 97.500000% | -2.500000% | 1.425938 |
| Gimboz Smash | cover 40 | 97.500000% | -2.500000% | 1.425938 |
| ApeStrong | range 39 | 97.500000% | -2.500000% | 1.486875 |
| Gimboz Smash | cover 39 | 97.500000% | -2.500000% | 1.486875 |
| ApeStrong | range 30 | 97.500000% | -2.500000% | 2.218125 |
| Gimboz Smash | cover 30 | 97.500000% | -2.500000% | 2.218125 |
| ApeStrong | range 26 | 97.500000% | -2.500000% | 2.705625 |
| Gimboz Smash | cover 26 | 97.500000% | -2.500000% | 2.705625 |
| ApeStrong | range 25 | 97.500000% | -2.500000% | 2.851875 |
| Gimboz Smash | cover 25 | 97.500000% | -2.500000% | 2.851875 |
| ApeStrong | range 24 | 97.500000% | -2.500000% | 3.010312 |
| Gimboz Smash | cover 24 | 97.500000% | -2.500000% | 3.010312 |
| ApeStrong | range 20 | 97.500000% | -2.500000% | 3.802500 |
| Gimboz Smash | cover 20 | 97.500000% | -2.500000% | 3.802500 |
| ApeStrong | range 15 | 97.500000% | -2.500000% | 5.386875 |
| Gimboz Smash | cover 15 | 97.500000% | -2.500000% | 5.386875 |
| ApeStrong | range 13 | 97.500000% | -2.500000% | 6.361875 |
| Gimboz Smash | cover 13 | 97.500000% | -2.500000% | 6.361875 |
| ApeStrong | range 12 | 97.500000% | -2.500000% | 6.971250 |
| Gimboz Smash | cover 12 | 97.500000% | -2.500000% | 6.971250 |
| ApeStrong | range 10 | 97.500000% | -2.500000% | 8.555625 |
| Gimboz Smash | cover 10 | 97.500000% | -2.500000% | 8.555625 |
| ApeStrong | range 8 | 97.500000% | -2.500000% | 10.932187 |
| Gimboz Smash | cover 8 | 97.500000% | -2.500000% | 10.932187 |
| ApeStrong | range 6 | 97.500000% | -2.500000% | 14.893125 |
| Gimboz Smash | cover 6 | 97.500000% | -2.500000% | 14.893125 |
| ApeStrong | range 5 | 97.500000% | -2.500000% | 18.061875 |
| Gimboz Smash | cover 5 | 97.500000% | -2.500000% | 18.061875 |
| Gimboz Smash | cover 4 | 97.500000% | -2.500000% | 22.815000 |
| Gimboz Smash | cover 3 | 97.500000% | -2.500000% | 30.736875 |
| Gimboz Smash | cover 2 | 97.500000% | -2.500000% | 46.580625 |
| Gimboz Smash | cover 1 | 97.500000% | -2.500000% | 94.111875 |
| ApeStrong | range 81 | 97.499700% | -2.500300% | 0.222985 |
| Gimboz Smash | cover 81 | 97.499700% | -2.500300% | 0.222985 |
| ApeStrong | range 27 | 97.499700% | -2.500300% | 2.570193 |
| Gimboz Smash | cover 27 | 97.499700% | -2.500300% | 2.570193 |
| ApeStrong | range 9 | 97.499700% | -2.500300% | 9.611816 |
| Gimboz Smash | cover 9 | 97.499700% | -2.500300% | 9.611816 |
| ApeStrong | range 44 | 97.499600% | -2.500400% | 1.209876 |
| Gimboz Smash | cover 44 | 97.499600% | -2.500400% | 1.209876 |
| ApeStrong | range 22 | 97.499600% | -2.500400% | 3.370370 |
| Gimboz Smash | cover 22 | 97.499600% | -2.500400% | 3.370370 |
| ApeStrong | range 11 | 97.499600% | -2.500400% | 7.691357 |
| Gimboz Smash | cover 11 | 97.499600% | -2.500400% | 7.691357 |
| ApeStrong | range 89 | 97.499500% | -2.500500% | 0.117492 |
| Gimboz Smash | cover 89 | 97.499500% | -2.500500% | 0.117492 |
| ApeStrong | range 35 | 97.499500% | -2.500500% | 1.765428 |
| Gimboz Smash | cover 35 | 97.499500% | -2.500500% | 1.765428 |
| ApeStrong | range 7 | 97.499500% | -2.500500% | 12.629603 |
| Gimboz Smash | cover 7 | 97.499500% | -2.500500% | 12.629603 |
| ApeStrong | range 23 | 97.499300% | -2.500700% | 3.182481 |
| Gimboz Smash | cover 23 | 97.499300% | -2.500700% | 3.182481 |
| ApeStrong | range 16 | 97.499200% | -2.500800% | 4.990699 |
| Gimboz Smash | cover 16 | 97.499200% | -2.500800% | 4.990699 |
| ApeStrong | range 84 | 97.498800% | -2.501200% | 0.181067 |
| Gimboz Smash | cover 84 | 97.498800% | -2.501200% | 0.181067 |
| ApeStrong | range 73 | 97.498800% | -2.501200% | 0.351592 |
| Gimboz Smash | cover 73 | 97.498800% | -2.501200% | 0.351592 |
| ApeStrong | range 63 | 97.498800% | -2.501200% | 0.558290 |
| Gimboz Smash | cover 63 | 97.498800% | -2.501200% | 0.558290 |
| ApeStrong | range 53 | 97.498800% | -2.501200% | 0.842986 |
| Gimboz Smash | cover 53 | 97.498800% | -2.501200% | 0.842986 |
| ApeStrong | range 42 | 97.498800% | -2.501200% | 1.312736 |
| Gimboz Smash | cover 42 | 97.498800% | -2.501200% | 1.312736 |
| ApeStrong | range 36 | 97.498800% | -2.501200% | 1.689958 |
| Gimboz Smash | cover 36 | 97.498800% | -2.501200% | 1.689958 |
| ApeStrong | range 28 | 97.498800% | -2.501200% | 2.444404 |
| Gimboz Smash | cover 28 | 97.498800% | -2.501200% | 2.444404 |
| ApeStrong | range 21 | 97.498800% | -2.501200% | 3.576073 |
| Gimboz Smash | cover 21 | 97.498800% | -2.501200% | 3.576073 |
| ApeStrong | range 18 | 97.498800% | -2.501200% | 4.330518 |
| Gimboz Smash | cover 18 | 97.498800% | -2.501200% | 4.330518 |
| ApeStrong | range 14 | 97.498800% | -2.501200% | 5.839410 |
| Gimboz Smash | cover 14 | 97.498800% | -2.501200% | 5.839410 |
| ApeStrong | range 37 | 97.498700% | -2.501300% | 1.618589 |
| Gimboz Smash | cover 37 | 97.498700% | -2.501300% | 1.618589 |
| Gimboz Smash | cover 95 | 97.498500% | -2.501500% | 0.050031 |
| ApeStrong | range 57 | 97.498500% | -2.501500% | 0.717116 |
| Gimboz Smash | cover 57 | 97.498500% | -2.501500% | 0.717116 |
| ApeStrong | range 55 | 97.498500% | -2.501500% | 0.777760 |
| Gimboz Smash | cover 55 | 97.498500% | -2.501500% | 0.777760 |
| ApeStrong | range 33 | 97.498500% | -2.501500% | 1.929997 |
| Gimboz Smash | cover 33 | 97.498500% | -2.501500% | 1.929997 |
| ApeStrong | range 19 | 97.498500% | -2.501500% | 4.052540 |
| Gimboz Smash | cover 19 | 97.498500% | -2.501500% | 4.052540 |
| ApeStrong | range 68 | 97.498400% | -2.501600% | 0.447338 |
| Gimboz Smash | cover 68 | 97.498400% | -2.501600% | 0.447338 |
| ApeStrong | range 67 | 97.498400% | -2.501600% | 0.468203 |
| Gimboz Smash | cover 67 | 97.498400% | -2.501600% | 0.468203 |
| ApeStrong | range 34 | 97.498400% | -2.501600% | 1.845270 |
| Gimboz Smash | cover 34 | 97.498400% | -2.501600% | 1.845270 |
| ApeStrong | range 17 | 97.498400% | -2.501600% | 4.641134 |
| Gimboz Smash | cover 17 | 97.498400% | -2.501600% | 4.641134 |
| ApeStrong | range 86 | 97.498200% | -2.501800% | 0.154747 |
| Gimboz Smash | cover 86 | 97.498200% | -2.501800% | 0.154747 |
| ApeStrong | range 43 | 97.498200% | -2.501800% | 1.260084 |
| Gimboz Smash | cover 43 | 97.498200% | -2.501800% | 1.260084 |
| ApeStrong | range 31 | 97.498100% | -2.501900% | 2.115825 |
| Gimboz Smash | cover 31 | 97.498100% | -2.501900% | 2.115825 |
| ApeStrong | range 82 | 97.498000% | -2.502000% | 0.208665 |
| Gimboz Smash | cover 82 | 97.498000% | -2.502000% | 0.208665 |
| ApeStrong | range 58 | 97.498000% | -2.502000% | 0.688355 |
| Gimboz Smash | cover 58 | 97.498000% | -2.502000% | 0.688355 |
| ApeStrong | range 41 | 97.498000% | -2.502000% | 1.367916 |
| Gimboz Smash | cover 41 | 97.498000% | -2.502000% | 1.367916 |
| ApeStrong | range 29 | 97.498000% | -2.502000% | 2.327297 |
| Gimboz Smash | cover 29 | 97.498000% | -2.502000% | 2.327297 |
| ApeStrong | range 64 | 97.497600% | -2.502400% | 0.534700 |
| Gimboz Smash | cover 64 | 97.497600% | -2.502400% | 0.534700 |
| ApeStrong | range 48 | 97.497600% | -2.502400% | 1.029793 |
| Gimboz Smash | cover 48 | 97.497600% | -2.502400% | 1.029793 |
| ApeStrong | range 32 | 97.497600% | -2.502400% | 2.019979 |
| Gimboz Smash | cover 32 | 97.497600% | -2.502400% | 2.019979 |
| ApeStrong | range 59 | 97.497500% | -2.502500% | 0.660570 |
| Gimboz Smash | cover 59 | 97.497500% | -2.502500% | 0.660570 |
| ApeStrong | range 91 | 97.497400% | -2.502600% | 0.094013 |
| Gimboz Smash | cover 91 | 97.497400% | -2.502600% | 0.094013 |
| ApeStrong | range 77 | 97.497400% | -2.502600% | 0.283938 |
| Gimboz Smash | cover 77 | 97.497400% | -2.502600% | 0.283938 |
| ApeStrong | range 71 | 97.497200% | -2.502800% | 0.388261 |
| Gimboz Smash | cover 71 | 97.497200% | -2.502800% | 0.388261 |
| ApeStrong | range 90 | 97.497000% | -2.503000% | 0.105619 |
| Gimboz Smash | cover 90 | 97.497000% | -2.503000% | 0.105619 |
| ApeStrong | range 69 | 97.497000% | -2.503000% | 0.427066 |
| Gimboz Smash | cover 69 | 97.497000% | -2.503000% | 0.427066 |
| ApeStrong | range 54 | 97.497000% | -2.503000% | 0.809742 |
| Gimboz Smash | cover 54 | 97.497000% | -2.503000% | 0.809742 |
| ApeStrong | range 46 | 97.497000% | -2.503000% | 1.115882 |
| Gimboz Smash | cover 46 | 97.497000% | -2.503000% | 1.115882 |
| ApeStrong | range 45 | 97.497000% | -2.503000% | 1.161804 |
| Gimboz Smash | cover 45 | 97.497000% | -2.503000% | 1.161804 |
| ApeStrong | range 94 | 97.496800% | -2.503200% | 0.060674 |
| Gimboz Smash | cover 94 | 97.496800% | -2.503200% | 0.060674 |
| ApeStrong | range 47 | 97.496800% | -2.503200% | 1.071911 |
| Gimboz Smash | cover 47 | 97.496800% | -2.503200% | 1.071911 |
| ApeStrong | range 51 | 97.496700% | -2.503300% | 0.913284 |
| Gimboz Smash | cover 51 | 97.496700% | -2.503300% | 0.913284 |
| ApeStrong | range 38 | 97.496600% | -2.503400% | 1.550912 |
| Gimboz Smash | cover 38 | 97.496600% | -2.503400% | 1.550912 |
| ApeStrong | range 61 | 97.496300% | -2.503700% | 0.607731 |
| Gimboz Smash | cover 61 | 97.496300% | -2.503700% | 0.607731 |
| ApeStrong | range 80 | 97.496000% | -2.504000% | 0.237637 |
| Gimboz Smash | cover 80 | 97.496000% | -2.504000% | 0.237637 |
| ApeStrong | range 70 | 97.496000% | -2.504000% | 0.407377 |
| Gimboz Smash | cover 70 | 97.496000% | -2.504000% | 0.407377 |
| ApeStrong | range 56 | 97.496000% | -2.504000% | 0.746858 |
| Gimboz Smash | cover 56 | 97.496000% | -2.504000% | 0.746858 |
| ApeStrong | range 49 | 97.495300% | -2.504700% | 0.989331 |
| Gimboz Smash | cover 49 | 97.495300% | -2.504700% | 0.989331 |
| ApeStrong | range 88 | 97.495200% | -2.504800% | 0.129618 |
| Gimboz Smash | cover 88 | 97.495200% | -2.504800% | 0.129618 |
| ApeStrong | range 72 | 97.495200% | -2.504800% | 0.369651 |
| Gimboz Smash | cover 72 | 97.495200% | -2.504800% | 0.369651 |
| ApeStrong | range 66 | 97.495200% | -2.504800% | 0.489668 |
| Gimboz Smash | cover 66 | 97.495200% | -2.504800% | 0.489668 |
| ApeStrong | range 85 | 97.495000% | -2.505000% | 0.167740 |
| Gimboz Smash | cover 85 | 97.495000% | -2.505000% | 0.167740 |
| ApeStrong | range 74 | 97.495000% | -2.505000% | 0.333969 |
| Gimboz Smash | cover 74 | 97.495000% | -2.505000% | 0.333969 |
| ApeStrong | range 62 | 97.495000% | -2.505000% | 0.582581 |
| Gimboz Smash | cover 62 | 97.495000% | -2.505000% | 0.582581 |
| ApeStrong | range 79 | 97.493900% | -2.506100% | 0.252666 |
| Gimboz Smash | cover 79 | 97.493900% | -2.506100% | 0.252666 |
| ApeStrong | range 76 | 97.492800% | -2.507200% | 0.300153 |
| Gimboz Smash | cover 76 | 97.492800% | -2.507200% | 0.300153 |
| ApeStrong | range 75 | 97.492500% | -2.507500% | 0.316826 |
| ApeStrong | range 92 | 97.492400% | -2.507600% | 0.082650 |
| Gimboz Smash | cover 92 | 97.492400% | -2.507600% | 0.082650 |
| ApeStrong | range 87 | 97.492200% | -2.507800% | 0.142025 |
| Gimboz Smash | cover 87 | 97.492200% | -2.507800% | 0.142025 |
| ApeStrong | range 93 | 97.491900% | -2.508100% | 0.071541 |
| Gimboz Smash | cover 93 | 97.491900% | -2.508100% | 0.071541 |
| ApeStrong | range 83 | 97.491800% | -2.508200% | 0.194674 |
| Gimboz Smash | cover 83 | 97.491800% | -2.508200% | 0.194674 |
| Baccarat | PLAYER+TIE, tie share 10% | 97.483000% | -2.517000% | 0.804401 |
| Speed Keno | 4 picks / 20 games | 97.420000% | -2.580000% | 0.549141 |
| Speed Keno | 4 picks / 10 games | 97.420000% | -2.580000% | 1.098282 |
| Speed Keno | 4 picks / 1 game | 97.420000% | -2.580000% | 10.982823 |
| ApeStrong | range 95 | 97.375000% | -2.625000% | 0.049905 |
| Speed Keno | 2 picks / 20 games | 97.368400% | -2.631600% | 0.061610 |
| Speed Keno | 2 picks / 10 games | 97.368400% | -2.631600% | 0.123220 |
| Speed Keno | 2 picks / 1 game | 97.368400% | -2.631600% | 1.232202 |
| Bear-A-Dice | Expert / 3 rolls | 97.357000% | -2.643000% | 363.663708 |
| Bear-A-Dice | Medium / 5 rolls | 97.252900% | -2.747100% | 43.005703 |
| Roulette | Even / Odd | 97.105300% | -2.894700% | 1.047715 |
| Roulette | Halves | 97.105300% | -2.894700% | 1.047715 |
| Roulette | Red / Black | 97.105300% | -2.894700% | 1.047715 |
| Roulette | Columns | 97.105300% | -2.894700% | 2.043044 |
| Roulette | Thirds / Dozens | 97.105300% | -2.894700% | 2.043044 |
| Roulette | Single Number | 97.105300% | -2.894700% | 34.888899 |
| Glyde or Crash | 2x | 97.000000% | -3.000000% | 0.999100 |
| Glyde or Crash | 5x | 97.000000% | -3.000000% | 3.909100 |
| Glyde or Crash | 10x | 97.000000% | -3.000000% | 8.759100 |
| Glyde or Crash | 25x | 97.000000% | -3.000000% | 23.309100 |
| Glyde or Crash | 50x | 97.000000% | -3.000000% | 47.559100 |
| Glyde or Crash | 100x | 97.000000% | -3.000000% | 96.059100 |
| Glyde or Crash | 250x | 97.000000% | -3.000000% | 241.559100 |
| Glyde or Crash | 500x | 97.000000% | -3.000000% | 484.059100 |
| Glyde or Crash | 1000x | 97.000000% | -3.000000% | 969.059100 |
| Glyde or Crash | 10000x | 97.000000% | -3.000000% | 9699.059100 |
| Glyde or Crash | 1.01x | 96.999996% | -3.000004% | 0.038800 |
| Glyde or Crash | 1.5x | 96.999900% | -3.000100% | 0.514100 |
| Glyde or Crash | 3x | 96.999900% | -3.000100% | 1.969099 |
| Hi-Lo Nebula | 10/13 hit count | 96.153800% | -3.846200% | 0.277367 |
| Hi-Lo Nebula | 8/13 hit count | 96.153800% | -3.846200% | 0.577848 |
| Hi-Lo Nebula | 5/13 hit count | 96.153800% | -3.846200% | 1.479290 |
| Hi-Lo Nebula | 4/13 hit count | 96.153800% | -3.846200% | 2.080251 |
| Hi-Lo Nebula | 2/13 hit count | 96.153800% | -3.846200% | 5.085059 |
| Hi-Lo Nebula | 1/13 hit count | 96.153800% | -3.846200% | 11.094675 |
| Hi-Lo Nebula | 7/13 hit count | 96.153100% | -3.846900% | 0.792464 |
| Hi-Lo Nebula | 6/13 hit count | 96.152300% | -3.847700% | 1.078614 |
| Hi-Lo Nebula | 3/13 hit count | 96.152300% | -3.847700% | 3.081755 |
| Hi-Lo Nebula | 11/13 hit count | 96.148500% | -3.851500% | 0.168082 |
| Hi-Lo Nebula | 9/13 hit count | 96.147700% | -3.852300% | 0.410861 |
| Glyde or Crash | 9897.9592x | 96.010204% | -3.989796% | 9502.129048 |
| Cash Dash | one-step, 5 tiles | 96.000000% | -4.000000% | 0.230400 |
| Cash Dash | one-step, 4 tiles | 96.000000% | -4.000000% | 0.307200 |
| Cash Dash | one-step, 3 tiles | 96.000000% | -4.000000% | 0.460800 |
| Cash Dash | one-step, 2 tiles | 96.000000% | -4.000000% | 0.921600 |
| Cash Dash | one-step, 6 tiles | 95.833300% | -4.166700% | 0.183681 |
| Baccarat | BANKER+TIE, tie share 25% | 95.672800% | -4.327200% | 0.924037 |
| Baccarat | PLAYER+TIE, tie share 25% | 95.549600% | -4.450400% | 0.949686 |
| Keno | 5 picks | 94.680100% | -5.319900% | 16.550138 |
| Keno | 7 picks | 94.287200% | -5.712800% | 70.171795 |
| Cash Dash | cash out after 1 safe row, seed 0 | 94.285714% | -5.714286% | 0.148163 |
| Cash Dash | one-step, 7 tiles | 94.285700% | -5.714300% | 0.148163 |
| Keno | 8 picks | 94.188500% | -5.811500% | 74.589278 |
| Keno | 6 picks | 93.897000% | -6.103000% | 19.822186 |
| Keno | 10 picks | 93.829700% | -6.170300% | 2197.637725 |
| Keno | 1 pick | 93.750000% | -6.250000% | 0.574219 |
| Keno | 2 picks | 93.750000% | -6.250000% | 1.409315 |
| Keno | 3 picks | 93.674100% | -6.325900% | 5.116595 |
| Keno | 4 picks | 93.391000% | -6.609000% | 24.893214 |
| Keno | 9 picks | 93.316900% | -6.683100% | 9324.147853 |
| Baccarat | BANKER+TIE, tie share 50% | 92.409500% | -7.590500% | 1.967481 |
| Baccarat | PLAYER+TIE, tie share 50% | 92.327400% | -7.672600% | 1.979350 |
| Cash Dash | cash out after 2 safe rows, seed 0 | 90.357143% | -9.642857% | 0.326577 |
| Cash Dash | cash out after 3 safe rows, seed 0 | 86.742857% | -13.257143% | 0.564324 |
| Baccarat | TIE | 85.883000% | -14.117000% | 6.991882 |
| Cash Dash | cash out after 4 safe rows, seed 0 | 83.273143% | -16.726857% | 0.924589 |
| Blackjack | dealer side bet | 82.020900% | -17.979100% | 0.967675 |
| Cash Dash | cash out after 5 safe rows, seed 0 | 79.942217% | -20.057783% | 1.597690 |
| Blackjack | player side bet | 79.881700% | -20.118300% | 100.545324 |
| Cash Dash | cash out after 10 safe rows, seed 0 | 63.907581% | -36.092419% | 4.594701 |
| Cash Dash | cash out after 15 safe rows, seed 0 | 51.089137% | -48.910863% | 10.929793 |
| Blocks | Low / 1 roll | 44.770700% | -55.229300% | 5.348428 |
| Blocks | High / 1 roll | 42.374000% | -57.626000% | 29.483781 |
| Cash Dash | cash out after 20 safe rows, seed 0 | 40.841789% | -59.158211% | 24.864396 |
| Cash Dash | cash out after 21 safe rows, seed 0 | 39.208117% | -60.791883% | 45.983782 |
| Blocks | Low / 2 rolls | 20.044100% | -79.955900% | 30.749773 |
| Blocks | High / 2 rolls | 17.955500% | -82.044500% | 879.881262 |
| Blocks | Low / 5 rolls | 1.798700% | -98.201300% | 5260.444465 |
| Blocks | High / 5 rolls | 1.366100% | -98.633900% | 22966771.791480 |

## Omitted Or Policy-Dependent Rows

- Bubblegum Heist and Dino Dough have exact per-spin RTP in the local docs, but the complete ordered paytable snapshot is not persisted, so exact variance is not recoverable from local files.
- Reel Pirates has only observed running statistics in the current public source set; exact RTP and variance are not defensible without the verified settlement source or a complete stochastic surface snapshot.
- Blackjack main-hand, Hi-Lo Nebula whole-run, Cash Dash whole-run, and Video Poker pre-draw strategy are policy/state dependent. Baccarat arbitrary main-plus-tie splits are parameter-dependent, so only documented split examples are listed.
- Glyde or Crash has a large target surface; this summary lists the exact representative targets documented in its analytics note, not every possible basis-point target.

## Sources

- [docs/analytics](./analytics/) - per-game exact analytics notes and formulas used to build this comparison.
- [lib/rtp.js](../lib/rtp.js) - shared exact RTP helpers for games with formula-generated surfaces.
