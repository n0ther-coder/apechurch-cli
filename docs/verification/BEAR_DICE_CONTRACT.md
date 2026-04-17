# Bear-A-Dice Contract Verification Notes

> Summary: Public source evidence used to promote Bear-A-Dice to `ABI verified` on 2026-04-09.

## Public Source Trail

- Verified ApeScan contract page:
  - `https://apescan.io/address/0x6a48A513A46955D8622C809Fce876d2f11142003#code`
- Blockscan IDE mirror for the same verified address:
  - `https://vscode.blockscan.com/33139/0x6a48A513A46955D8622C809Fce876d2f11142003`
- Swarm source hash shown by ApeScan at verification time:
  - `ipfs://3f5d097178f1296b05e371a3d1175201b7feca75e3990a64b01333047a1c71c1`

## Contract Identity

- Game name in the verified source: `BearDice`
- Contract used by the CLI: `0x6a48A513A46955D8622C809Fce876d2f11142003`
- The repo constant `BEAR_DICE_CONTRACT` and the docs now point to that exact verified address

## Verified Write Path

The verified contract exposes:

- `function play(address player, bytes calldata gameData) external payable`
- `function getVRFFee(uint32 customGasLimit) public view returns (uint256)`

Its `_playGame(...)` implementation decodes:

```text
(uint8 difficulty, uint8 numRuns, uint256 gameId, address ref, bytes32 userRandomWord)
```

The verified behavior is:

- `numRuns` must be in `1..5` because `MAX_RUNS = 5`
- there is no extra contract-side cap for difficulties `3` or `4`
- `customGasLimit = BASE_GAS + (numRuns * GAS_PER_RUN)`
- `BASE_GAS = 500000`
- `GAS_PER_RUN = 100000`
- `vrfFee = getVRFFee(customGasLimit)`
- `totalBetAmount = msg.value - vrfFee`
- `platformFee = 200 / 10000 = 2%` of `totalBetAmount`
- the contract requests `numRuns * 2` random words, one for each die in every run

This verification disproved the repo's old local assumption that Extreme and Master were capped at 3 rolls. The verified source contains non-zero payout tables for difficulty `3` and `4` at `4` and `5` rolls, so the local clamp was removed as part of the promotion.

## Fee Notes

- Bear-A-Dice adds one dynamic `getVRFFee(customGasLimit)` on top of the wager, and that fee scales with `numRuns`.
- The verified source also applies a `2%` platform fee to `totalBetAmount = msg.value - vrfFee`.
- Total cost therefore mixes a parameter-scaled VRF component with a proportional buy-in fee.

## Verified Read Path

The verified contract exposes:

- `function getGameInfo(uint256 gameId) public view returns (GameInfoReturnType memory)`
- `function batchGameInfo(uint256[] calldata gameIds) external view returns (GameInfoReturnType[] memory)`
- `function batchRawGameInfo(uint256[] calldata gameIds) external view returns (bytes[] memory)`
- `function getEssentialGameInfo(uint256[] calldata gameIds) external view returns (address[] memory, uint256[] memory, uint256[] memory, uint256[] memory, bool[] memory)`

`getGameInfo(gameId)` returns:

```text
(
  address player,
  uint256 betAmount,
  uint8 numRuns,
  uint8 difficulty,
  uint8[] dice1Results,
  uint8[] dice2Results,
  uint256 totalPayout,
  bool hasEnded,
  uint256 timestamp
)
```

The contract preallocates `dice1Results` and `dice2Results` to `numRuns`. If a losing sum occurs before the last configured roll, settlement stops immediately and the unused trailing slots remain `0`. Those `0/0` pairs are "not executed yet/anymore", not valid dice outcomes.

This also means there is no on-chain "take the current payout" branch. Once a losing sum appears, the game is over and the accumulated payout is discarded.

## Verified Payout Logic

The contract stores a 3-dimensional payout table:

```text
payouts[difficulty][numRuns][diceSum]
```

Settlement does:

```text
totalToPayout = totalBetAmount
repeat for each roll:
  multiplier = payouts[difficulty][numRuns][diceSum]
  if multiplier == 0: totalToPayout = 0 and stop
  else totalToPayout = floor(totalToPayout * multiplier / 100)
```

That fail-fast behavior changes the shape of the stored arrays, but not the EV math: losing sums already contribute a zero multiplier, so the exact RTP remains the same closed-form weighted product over the on-chain payout table.

Safe sums by difficulty:

| Difficulty | Label | Losing sums | Safe sums |
|------------|-------|-------------|-----------|
| 0 | Easy | `7` | `2-6, 8-12` |
| 1 | Normal | `6, 7, 8` | `2-5, 9-12` |
| 2 | Hard | `5-9` | `2-4, 10-12` |
| 3 | Extreme | `4-10` | `2-3, 11-12` |
| 4 | Master | `3-11` | `2, 12` |

Exact closed-form RTP used by the repo after promotion:

```text
rollEV(d, n) = Σ_sum P(2d6 = sum) * payouts[d][n][sum] / 100
RTP(d, n) = rollEV(d, n)^n * 100
```

This ignores the final wei-level truncation from Solidity's repeated `/ 100`, which only makes tiny wagers settle infinitesimally below the displayed value.

Exact game win rate is:

```text
safeProb(d) = Σ_safe sums P(2d6 = sum)
WinRate(d, n) = safeProb(d)^n * 100
```

## Exact RTP Matrix

| Difficulty | 1 roll | 2 rolls | 3 rolls | 4 rolls | 5 rolls |
|------------|--------|---------|---------|---------|---------|
| Easy | `97.89%` | `97.90%` | `97.85%` | `97.80%` | `97.80%` |
| Normal | `97.94%` | `97.90%` | `97.52%` | `97.80%` | `97.25%` |
| Hard | `97.83%` | `97.79%` | `97.85%` | `97.80%` | `97.80%` |
| Extreme | `97.89%` | `97.79%` | `97.36%` | `97.80%` | `97.80%` |
| Master | `97.89%` | `97.79%` | `97.85%` | `97.58%` | `97.80%` |

## Max Payout Matrix

| Difficulty | 1 roll | 2 rolls | 3 rolls | 4 rolls | 5 rolls |
|------------|--------|---------|---------|---------|---------|
| Easy | `1.830x` | `3.349x` | `6.230x` | `12.228x` | `21.091x` |
| Normal | `3.800x` | `14.746x` | `57.067x` | `219.707x` | `856.913x` |
| Hard | `6.300x` | `40.577x` | `262.144x` | `1,709.401x` | `10,991.447x` |
| Extreme | `9.720x` | `96.040x` | `946.966x` | `9,375.197x` | `93,193.275x` |
| Master | `17.620x` | `316.840x` | `5,706.550x` | `102,433.347x` | `1,847,949.193x` |

## Exact Win Rate Matrix

| Difficulty | 1 roll | 2 rolls | 3 rolls | 4 rolls | 5 rolls |
|------------|--------|---------|---------|---------|---------|
| Easy | `83.33%` | `69.44%` | `57.87%` | `48.23%` | `40.19%` |
| Normal | `55.56%` | `30.86%` | `17.15%` | `9.53%` | `5.29%` |
| Hard | `33.33%` | `11.11%` | `3.70%` | `1.23%` | `0.41%` |
| Extreme | `16.67%` | `2.78%` | `0.46%` | `0.08%` | `0.01%` |
| Master | `5.56%` | `0.31%` | `0.02%` | `0.00%` | `0.00%` |

## Promotion Outcome

Bear-A-Dice now qualifies for `ABI verified` because:

- the contract source is explorer-verified and readable
- the CLI's encoded tuple, VRF fee path, gas constants, and history getters match the verified source
- the stale local `3`-roll cap was removed to match the real contract surface
- the repo's RTP and max-payout references are now derived from the verified on-chain payout table rather than aggregate transparency metrics
