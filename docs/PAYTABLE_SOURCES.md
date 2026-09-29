# Paytable sources and coverage

`lib/payout-tables.js` is the checked-in source for payout values used by the CLI. `lib/game-paytable.js`, `lib/rtp.js`, `lib/loop-estimate.js`, and the stateful game modules read those values or derive their bounds from them. It contains fixed contract rules alongside values read from public getters on the verification dates cited below. Gross multipliers exclude transaction fees. The four slot matrices and reel mappings were reread from their public contracts at ApeChain block `50311380` on 2026-09-25; that block is not a common snapshot date for the other games. `--paytable` uses the checked-in values rather than querying the live contracts.

| Game | Source of the payout rule or table | Coverage and remaining limit |
| --- | --- | --- |
| Keno | [Verified contract matrix](verification/KENO_CONTRACT.md), indexed by picks and hits. | Complete single-draw table; RTP is calculated from this matrix and the 40-number hypergeometric draw. |
| Speed Keno | [Verified contract matrix](verification/SPEED_KENO_CONTRACT.md), indexed by picks and hits. | Complete mini-game table; split output uses wager-level integer rounding. |
| ApeStrong | [Verified `edgeFlipRangeToPayout` getter snapshot](verification/APESTRONG_CONTRACT.md). | All supported cover values are reconstructed from the checked numerator and two observed overrides. The verified owner payout setter does not check `oddsLocked`, so the flag is not a payout freeze; live values need rechecking. |
| Baccarat | [Verified payout constants](verification/BACCARAT_CONTRACT.md) for Player, Banker and Tie. | Complete three-outcome rule for a specified bet and wager; Banker uses integer rounding. |
| Roulette | [Verified contract multipliers](verification/ROULETTE_CONTRACT.md) and 38-pocket bet mapping. | Complete pocket outcomes for a specified bet and wager; the contract's per-leg wager split and one-wei single-leg adjustment affect exact multipliers. |
| Jungle Plinko | [Verified mode bucket getters](verification/JUNGLE_PLINKO_CONTRACT.md). | Complete buckets for each risk mode; weights and multipliers share one table. |
| Cosmic Plinko | [Verified mode bucket getters](verification/COSMIC_PLINKO_CONTRACT.md). | Complete buckets for each risk mode; weights and multipliers share one table. |
| Blocks | [Verified grid/risk tables](verification/BLOCKS_CONTRACT.md). | Complete six base tables; `survive` compounds them and `split` requires wager-level rounding. |
| Dino Dough | [Verified ordered-triple payout and reel getters](verification/DINO_DOUGH_CONTRACT.md). | Complete 216-triple matrix and reel weights; distinct payouts, probabilities and RTP derive from these values. The dated getter check reported `oddsLocked = false`. |
| Bubblegum Heist | [Verified ordered-triple payout and reel getters](verification/BUBBLEGUM_HEIST_CONTRACT.md). | Complete 125-triple matrix and reel weights; its 35 distinct payouts and probabilities are now enumerable. The dated getter check reported `oddsLocked = false`. |
| Geez Diggerz | [Verified ordered-triple payout and reel getters](verification/GEEZ_DIGGERZ_CONTRACT.md). | Complete 216-triple matrix and reel weights; distinct payouts, probabilities and RTP derive from these values. The dated getter check reported `oddsLocked = false`. |
| Gimboz Smash | [Verified `getPayoutFromRange` getter snapshot](verification/GIMBOZ_SMASH_CONTRACT.md). | Complete rule for the supported covered-number counts, reconstructed from the checked numerator. The getter values were recorded on 2026-04-20 and are not queried live by `--paytable`. |
| Glyde or Crash | [Verified target-multiplier settlement rule](verification/GLYDE_OR_CRASH_CONTRACT.md). | The chosen target determines the winning payout; there is no separate fixed paytable. |
| Sushi Showdown | [Verified ordered-triple payout and reel getters](verification/SUSHI_SHOWDOWN_CONTRACT.md). | Complete 343-triple matrix and reel weights; distinct payouts, probabilities and RTP derive from these values. The dated getter check reported `oddsLocked = false`. |
| Reel Pirates | [Official game rules and public UI snapshot](verification/REEL_PIRATES_CONTRACT.md). | Partial visible paytable only. Contract source is unverified; bonus rounds prevent a verified finite overall maximum. |
| Monkey Match | [Verified mode payout constants](verification/MONKEY_MATCH_CONTRACT.md). | Complete payouts for both modes; outcome probabilities derive from hand combinatorics. |
| Bear-A-Dice | [Verified difficulty, roll and dice-sum tables](verification/BEAR_DICE_CONTRACT.md). | Complete supported survival tables; a losing roll zeroes the sequence. |
| Primes | [Verified `gameModes` table](verification/PRIMES_CONTRACT.md). | Complete fixed prime, zero and losing outcomes for each risk mode. |
| Blackjack | [Public game ABI and frontend rules](verification/BLACKJACK_CONTRACT.md). | Main-hand and player-side payout constants are shared with the solver/simulator. The action tree changes total stake; a complete static outcome table for an entire session is unavailable. |
| Video Poker | [Verified final-hand table](verification/VIDEO_POKER_CONTRACT.md). | Complete static base-hand payouts; the highest configured wager index receives a dynamic progressive jackpot on Royal Flush (`400 APE` in the checked-in denomination list). |
| Hi-Lo Nebula | [Verified card/rank and push table](verification/HI_LO_NEBULA_CONTRACT.md). | Base factors are shared with gameplay; repeated guesses compound and the jackpot changes, so no finite static overall maximum is reported. |
| Cash Dash | [Contract `rowPayouts` getter and row rule](verification/CASH_DASH_CONTRACT.md). | Checked-in row factors are a fallback snapshot, not final cashout payouts. Rows compound the prior cash-out as the next wager; subsequent guesses pay VRF fees without adding wallet principal. Live row factors can change, so no static overall maximum is reported. |

The cited slot getter checks reported `oddsLocked = false`; this was the observed state on those checks, not a claim about the current block. The checked-in slot values matched the earlier public readings when reread at block `50311380`. Re-read the public getters before treating `--paytable` output for mutable tables as a current live guarantee. Slot outcome probabilities derive from the checked-in integer reel weights and payout matrices; no separately rounded probability table is maintained.

## Contract change controls

- The four ordered-triple slots and both Plinko games expose `oddsLocked`. While false, owner setters can change both outcome weights and gross payouts; when true, those setters reject updates. A changed table invalidates checked-in probabilities, RTP, and variance until it is reread.
- ApeStrong also exposes `oddsLocked`, but its `setRangeToPayout` does not check it. The selected-range win probability is fixed by the draw rule, while the owner can change the winning payout and RTP regardless of that flag.
- Gimboz Smash uses `oddsLocked` only to guard the accepted cover-count bounds. Its payout formula and win probability for an accepted count are hard-coded. Monkey Match exposes an `oddsLocked` flag without a verified odds-table setter or `lockOdds` function.
- Other change controls differ by game: Primes guards prime-classification edits with internal `fullyLive`; Cash Dash can update row multipliers; Glyde or Crash can update `houseEdge`; Video Poker and Hi-Lo Nebula have dynamic jackpot terms. Each analytics note distinguishes gross outcome changes from fees and player-selected parameters.

All contract-state observations are dated. `--paytable` reports the checked-in model; it does not certify that mutable live values remain identical.
