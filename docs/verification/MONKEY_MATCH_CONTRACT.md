# Monkey Match Contract Verification Notes

> Summary: Contract-backed five-draw settlement model, live mode constants, and exact RTP notes used to keep Monkey Match marked `ABI verified`.

## Source Basis

- Contract used by the CLI: `0x59EBd3406b76DCc74102AFa2cA5284E9AAB6bA28`
- Explorer address page: `https://apescan.io/address/0x59EBd3406b76DCc74102AFa2cA5284E9AAB6bA28#code`
- Local write-path reference: `lib/games/monkeymatch.js`
- Local RTP/reference model: `lib/rtp.js`

This note consolidates the verified contract-facing behavior that was previously embedded inline in `docs/GAMES_REFERENCE.md`.

## Contract Identity

- Game name in the repo: `Monkey Match`
- Aliases: `monkey`, `mm`
- Public risk surface:
  - `0 = Low` maps to on-chain mode `1`
  - `1 = High` maps to on-chain mode `2`

## Verified Runtime Surface

The CLI encodes `gameData` as:

```text
(uint8 gameMode, uint256 gameId, address ref, bytes32 userRandomWord)
```

Settlement requests exactly `5` VRF words and resolves each monkey independently:

```text
monkey_i = (randomWord_i % totalMonkeys(mode)) + 1
```

The five resolved monkeys are then scored as multiplicity hands:

- Five of a Kind
- Four of a Kind
- Full House
- Three of a Kind
- Two Pair
- One Pair
- No Match

There is no redraw phase and no post-deal action tree. Exact EV therefore reduces entirely to mode selection.

## Verified Live Runtime Reads

Live reads recorded on **2026-04-02**:

- `platformFee = 200`
- `partnerFeeCut = 0`
- `getTotalMonkeys(1) = 6`
- `getTotalMonkeys(2) = 7`
- payout denominator `PAYOUT_DENOM = 1000`

## Fee Notes

- The repo treats Monkey Match as a single-draw static-fee game and calls one live `getVRFFee()` at entry.
- Live runtime reads also show `platformFee = 200`, i.e. a `2%` platform fee surface.
- Mode choice changes the payout distribution, not the fee model.

## Verified Paytable

| Outcome | Low (6 monkeys) | Exact Probability | High (7 monkeys) | Exact Probability |
|---------|----------------------|-------------------|--------------------------|-------------------|
| Five of a Kind | `50x` | `0.07716%` | `50x` | `0.04165%` |
| Four of a Kind | `5x` | `1.92901%` | `5x` | `1.24948%` |
| Full House | `4x` | `3.85802%` | `4x` | `2.49896%` |
| Three of a Kind | `2x` | `15.43210%` | `3x` | `12.49479%` |
| Two Pair | `1.25x` | `23.14815%` | `2x` | `18.74219%` |
| One Pair | `0.2x` | `46.29630%` | `0.1x` | `49.97918%` |
| No Match | `0x` | `9.25926%` | `0x` | `14.99375%` |

## Exact RTP by Mode

Let `M = totalMonkeys(mode)`. Because the contract draws `5` independent monkeys, the exact hand counts are:

```text
five = M
four = 5 * M * (M - 1)
fullHouse = 10 * M * (M - 1)
three = 10 * M * (M - 1) * (M - 2)
twoPair = 15 * M * (M - 1) * (M - 2)
onePair = 10 * M * (M - 1) * (M - 2) * (M - 3)
noMatch = M * (M - 1) * (M - 2) * (M - 3) * (M - 4)
```

with total outcomes `M^5`.

So:

```text
RTP(mode) = sum_hand(count(hand, M) / M^5 * payoutMultiplier(hand, mode))
```

Verified exact references:

| Mode | Exact RTP | Top Multiplier |
|------|-----------|----------------|
| Low | `97.99%` | `50x` |
| High | `98.29%` | `50x` |

At displayed precision, the only omitted effect is negligible modulo bias from `% 6` and `% 7`.

## Transparency Snapshot

- House Profit: `9,169 APE`
- Running RTP: `97.34%`
- Total Wagered: `345,257 APE`
- Total Games Played: `12,405`

## Promotion Outcome

Monkey Match qualifies for `ABI verified` in this repo because:

- the encoded mode tuple and draw model are documented in the local integration
- the live mode constants and combinatorial payout surface are recorded explicitly
- the exact RTP references in `lib/rtp.js` now line up with the verified five-draw multiplicity model
