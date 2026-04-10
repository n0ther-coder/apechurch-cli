# Verification Notes

> Summary: Canonical home for the per-game ABI verification trail used by this repo when a supported game is marked `ABI verified`.

Each `*_CONTRACT.md` file below is the maintainer-facing evidence bundle for one promoted game. `docs/GAMES_REFERENCE.md` is now intentionally lighter and comparison-oriented; deep mechanics, write/read-path details, and contract-backed RTP notes live here.

| Game | Note | Focus |
|------|------|-------|
| ApeStrong | `APESTRONG_CONTRACT.md` | Exact-match source trail, live range payout table, and contract-backed RTP surface |
| Roulette | `ROULETTE_CONTRACT.md` | Bet encoding, leg-allocation constraints, and exact 38-pocket RTP |
| Baccarat | `BACCARAT_CONTRACT.md` | Combined bet tuple, draw-tree rules, and exact side RTPs |
| Jungle Plinko | `JUNGLE_PLINKO_CONTRACT.md` | Weighted-bucket model, VRF gas formula, and exact mode RTPs |
| Cosmic Plinko | `COSMIC_PLINKO_CONTRACT.md` | Weighted-bucket model, mode tables, and exact RTPs |
| Keno | `KENO_CONTRACT.md` | Draw model, payout matrix, and exact hypergeometric RTPs |
| Speed Keno | `SPEED_KENO_CONTRACT.md` | Batched draw model, custom gas limit, and exact RTPs |
| Dino Dough | `DINO_DOUGH_CONTRACT.md` | Exact-match slots source trail, live reels, ordered paytable, and exact RTP |
| Bubblegum Heist | `BUBBLEGUM_HEIST_CONTRACT.md` | Similar-match slots trail, live reels, ordered paytable, and exact RTP |
| Geez Diggerz | `GEEZ_DIGGERZ_CONTRACT.md` | Exact-match slots source trail, symmetric reels, ordered paytable, and exact RTP |
| Sushi Showdown | `SUSHI_SHOWDOWN_CONTRACT.md` | Similar-match slots trail, `7`-symbol asymmetric reels, ordered paytable, and exact RTP |
| Monkey Match | `MONKEY_MATCH_CONTRACT.md` | Five-draw multiplicity model, live mode constants, and exact combinatorial RTP |
| Bear-A-Dice | `BEAR_DICE_CONTRACT.md` | Verified 2d6 payout table, custom gas limit, and difficulty/run matrices |
| Blocks | `BLOCKS_CONTRACT.md` | Verified tuple layout, batched run fee path, and exact mode RTP from the published cluster table |
| Primes | `PRIMES_CONTRACT.md` | Difficulty table, prime-or-zero payout model, and exact RTP by mode |
| Blackjack | `BLACKJACK_CONTRACT.md` | Public ABI trail, action costs, state layout, and solver-rule alignment |
| Video Poker | `VIDEO_POKER_CONTRACT.md` | Stateful ABI surface, redraw flow, paytable, and jackpot-aware RTP |
