# Dino Dough Contract Verification Notes

> Summary: Public source and live-getter evidence used to promote Dino Dough to `ABI verified` on 2026-04-09.

## Public Source Trail

- Verified ApeScan contract page:
  - `https://apescan.io/address/0x9ebb4Df257B971582BAf096b62CA41DE7723F3CB#code`
- Blockscan IDE mirror for the same verified address:
  - `https://vscode.blockscan.com/33139/0x9ebb4Df257B971582BAf096b62CA41DE7723F3CB`
- Current public Ape Church slots docs page:
  - `https://docs.ape.church/games/player-vs-house/slots-games`
- Swarm source hash shown by ApeScan at verification time:
  - `ipfs://5e8743371fed897511ecad57fea6c30eee379dd9761ab3cc9470c08449010353`

The public Ape Church slots page lists Dino Dough and Bubblegum Heist as members of the same multi-spin slots family. The verified Dino Dough contract at the address above is the source of truth for the ABI surface and settlement logic used by this repo.

## Contract Identity

- Verified contract name on ApeScan: `Slots`
- Contract used by the CLI: `0x9ebb4Df257B971582BAf096b62CA41DE7723F3CB`
- Verification status: `Contract Source Code Verified (Exact Match)`
- Compiler: `v0.8.28+commit.7893614a`
- Optimization: enabled with `200` runs
- EVM / license: `paris`, `MIT`

The repo constant `DINO_DOUGH_CONTRACT` and the docs now point to that exact verified address.

## Verified Write Path

The verified contract exposes:

- `function play(address player, bytes calldata gameData) external payable`
- `function getVRFFee() public view returns (uint256)`

Its `_playGame(...)` implementation decodes:

```text
(uint256 gameId, uint8 numSpins, address ref, bytes32 userRandomWord)
```

The verified behavior is:

- `msg.value` must be at least `getVRFFee()`
- `gameId` must satisfy `isValidGameId(gameId) == true`
- `numSpins` must be in `1..MAX_SPINS`
- `totalBetAmount = msg.value - getVRFFee()`
- `betAmountPerSpin = floor(totalBetAmount / numSpins)`
- `platformFeeAmount = totalBetAmount * platformFee / 10_000`
- exactly `numSpins * 3` random words are requested, one reel stop per word

This exactly matches the CLI write path in [slots.js](/Users/fluoro/Downloads/Clones/n0ther-coder/apechurch-cli/lib/games/slots.js), including the tuple order and the static-fee `getVRFFee()` read.

## Verified Live Getter Snapshot

The mutable runtime values below were read from live ApeChain getters on **2026-04-09**:

- `MAX_SPINS = 15`
- `platformFee = 200` (`2.00%`)
- `oddsLocked = false`
- `getVRFFee() = 93,248,194,793,600,000 wei`

Because `oddsLocked` is currently `false`, a future maintainer should re-read the reels and payout table before assuming the live slot surface is unchanged.

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
  uint256 betAmountPerSpin,
  uint256 totalBetAmount,
  uint8[] num0,
  uint8[] num1,
  uint8[] num2,
  uint256 totalPayout,
  bool hasEnded,
  uint256 timestamp
)
```

Important consequences:

- `num0`, `num1`, and `num2` store resolved symbol indexes, not raw stop offsets
- `totalBetAmount` is reconstructed on-chain as `betAmountPerSpin * num0.length`
- the generic `getEssentialGameInfo(...)` history path used by this repo matches the verified getter surface exactly

## Verified Reel Mapping

The contract does not store per-stop symbol names. Instead it stores cumulative reel boundaries and derives symbol indexes through `numToCoinReel{1,2,3}`.

The live cumulative tables on **2026-04-09** were:

| Symbol index | Reel 1 end | Reel 1 stops | Reel 2 end | Reel 2 stops | Reel 3 end | Reel 3 stops |
|-------------:|-----------:|-------------:|-----------:|-------------:|-----------:|-------------:|
| `0` | `10` | `10` | `5` | `5` | `5` | `5` |
| `1` | `25` | `15` | `15` | `10` | `15` | `10` |
| `2` | `55` | `30` | `55` | `40` | `55` | `40` |
| `3` | `95` | `40` | `95` | `40` | `95` | `40` |
| `4` | `140` | `45` | `140` | `45` | `135` | `40` |
| `5` | `190` | `50` | `190` | `50` | `190` | `55` |

That means each reel has `190` total stops, but the stop weights differ by reel and by symbol index.

Example:

- reel 1 stop `0..9` resolves to symbol `0`
- reel 1 stop `10..24` resolves to symbol `1`
- reel 1 stop `140..189` resolves to symbol `5`

## Verified Payout Logic

Settlement does:

```text
symbol0 = numToCoinReel1[randomWords[i * 3] % numOptionsReel1()]
symbol1 = numToCoinReel2[randomWords[i * 3 + 1] % numOptionsReel2()]
symbol2 = numToCoinReel3[randomWords[i * 3 + 2] % numOptionsReel3()]
spinPayout = payout[symbol0][symbol1][symbol2] * betAmountPerSpin / 10_000
```

The paytable is ordered and reel-specific. It is not "any three matching icons anywhere": `payout[a][b][c]` is keyed by the exact left-to-right triple.

The public transparency crop only showed a small subset of the higher-value outcomes. The live contract actually exposes `6` symbol indexes per reel and a much broader non-zero payout matrix than the screenshot suggested.

Selected exact live entries read from `getPayout(...)` on **2026-04-09**:

| Ordered triple | Multiplier |
|----------------|-----------:|
| `0,0,0` | `333x` |
| `0,0,1` | `60x` |
| `0,1,0` | `60x` |
| `1,0,0` | `60x` |
| `2,0,0` | `53.3333x` |
| `1,1,1` | `50x` |
| `0,1,1` | `40x` |
| `3,0,0` | `40x` |
| `1,0,1` | `40x` |
| `1,1,0` | `40x` |

The current live max payout is `333x` from ordered triple `0,0,0`.

## Exact RTP

Using the live reel-stop tables and the full live `getPayout(symbol0, symbol1, symbol2)` matrix read on **2026-04-09** gives:

- exact per-spin RTP: `97.89751366817333%`
- displayed rounded RTP in repo/docs: `97.90%`

That closed form ignores only the already-known Solidity dust effect from:

```text
betAmountPerSpin = floor(totalBetAmount / numSpins)
```

If the buy-in is not evenly divisible across `numSpins`, the effective RTP versus the full pre-fee buy-in is scaled by:

```text
floor(totalBetAmount / numSpins) * numSpins / totalBetAmount
```

At normal APE-denominated wagers that gap is negligible, but it exists.

## Promotion Outcome

Dino Dough now qualifies for `ABI verified` because:

- the contract source is explorer-verified and readable
- the CLI's encoded tuple and static `getVRFFee()` path match the verified source
- the repo's generic history getter path matches the verified read surface and struct layout
- the live reels, fees, spin cap, and payout matrix were read directly from the deployed contract
- the repo docs now record the actual reel mapping and the exact contract-derived RTP instead of relying on transparency-only screenshots
