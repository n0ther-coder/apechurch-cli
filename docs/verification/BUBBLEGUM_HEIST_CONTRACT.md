# Bubblegum Heist Contract Verification Notes

> Summary: Public source trail and live-getter evidence used to promote Bubblegum Heist to `ABI verified` on 2026-04-09.

## Public Source Trail

- ApeScan contract page for the live Bubblegum Heist address:
  - `https://apescan.io/address/0xB5Da735118e848130B92994Ee16377dB2AE31a4c#code`
- Bubblegum ApeScan status on **2026-04-09**:
  - `Similar Match Source Code`
  - linked exact-match source address: `0x9ebb4Df257B971582BAf096b62CA41DE7723F3CB`
- Exact-match Dino Dough source page used as the readable verified source:
  - `https://apescan.io/address/0x9ebb4Df257B971582BAf096b62CA41DE7723F3CB#code`
- Blockscan mirror for the Bubblegum address:
  - `https://vscode.blockscan.com/33139/0xB5Da735118e848130B92994Ee16377dB2AE31a4c`
- Current public Ape Church slots docs page:
  - `https://docs.ape.church/games/player-vs-house/slots-games`
- Swarm source hash shown by ApeScan for the linked source:
  - `ipfs://5e8743371fed897511ecad57fea6c30eee379dd9761ab3cc9470c08449010353`

The public Ape Church slots docs page lists Bubblegum Heist and Dino Dough as members of the same multi-spin slots family. ApeScan links the Bubblegum address to the exact-match Dino Dough `Slots` source, so the readable source is public even though Bubblegum itself is marked `Similar Match` instead of `Exact Match`.

## Why Similar Match Is Sufficient Here

The shared source uses `immutable` constructor parameters in `GameMasterclass`:

```text
uint256 public immutable GAME_ID;
IHistoryManager public immutable history;
```

Those deployment-time values can change the deployed runtime bytecode without changing the slot logic, which is why ApeScan warns that the constructor portion may differ.

For Bubblegum Heist, that means the promotion standard relies on both:

- the public readable `Slots` source linked by ApeScan
- live getter reads on the Bubblegum address itself for the mutable slot surface: reels, fees, spin cap, and paytable

## Contract Identity

- ApeScan contract name: `Slots`
- Contract used by the CLI: `0xB5Da735118e848130B92994Ee16377dB2AE31a4c`
- Compiler / optimization / EVM / license shown by ApeScan:
  - `v0.8.28+commit.7893614a`
  - optimized with `200` runs
  - `paris`
  - `MIT`

The repo constant `BUBBLEGUM_HEIST_CONTRACT` and the docs now point to that exact Bubblegum address.

## Verified Write Path

The linked verified `Slots` source exposes:

- `function play(address player, bytes calldata gameData) external payable`
- `function getVRFFee() public view returns (uint256)`

Its `_playGame(...)` implementation decodes:

```text
(uint256 gameId, uint8 numSpins, address ref, bytes32 userRandomWord)
```

The verified behavior is:

- `msg.value` must be at least `getVRFFee()`
- `numSpins` must be in `1..MAX_SPINS`
- `totalBetAmount = msg.value - getVRFFee()`
- `betAmountPerSpin = floor(totalBetAmount / numSpins)`
- `platformFeeAmount = totalBetAmount * platformFee / 10_000`
- exactly `numSpins * 3` random words are requested

The CLI uses the same shared slot handler in [slots.js](/Users/fluoro/Downloads/Clones/n0ther-coder/apechurch-cli/lib/games/slots.js), so the Bubblegum write path matches the verified source surface exactly.

## Verified Live Getter Snapshot

The Bubblegum contract's live getters on **2026-04-09** returned:

- `MAX_SPINS = 15`
- `platformFee = 200` (`2.00%`)
- `oddsLocked = false`
- `getVRFFee() = 93,248,194,793,600,000 wei`

As with Dino Dough, `oddsLocked = false` means a future maintainer should re-read the live reel and payout surface before assuming it is unchanged.

## Verified Read Path

The linked verified source exposes:

- `function getGameInfo(uint256 gameId) public view returns (GameInfoReturnType memory)`
- `function batchGameInfo(uint256[] calldata gameIds) external view returns (GameInfoReturnType[] memory)`
- `function batchRawGameInfo(uint256[] calldata gameIds) external view returns (bytes[] memory)`
- `function getEssentialGameInfo(uint256[] calldata gameIds) external view returns (address[] memory, uint256[] memory, uint256[] memory, uint256[] memory, bool[] memory)`

Bubblegum uses the same getter layout as Dino Dough:

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

That matches the generic simple-game history path used by this repo.

## Verified Reel Mapping

Bubblegum Heist has its own live reel storage. The cumulative reel tables read on **2026-04-09** were:

| Symbol index | Reel 1 end | Reel 1 stops | Reel 2 end | Reel 2 stops | Reel 3 end | Reel 3 stops |
|-------------:|-----------:|-------------:|-----------:|-------------:|-----------:|-------------:|
| `0` | `10` | `10` | `5` | `5` | `5` | `5` |
| `1` | `25` | `15` | `15` | `10` | `20` | `15` |
| `2` | `40` | `15` | `35` | `20` | `40` | `20` |
| `3` | `65` | `25` | `60` | `25` | `65` | `25` |
| `4` | `100` | `35` | `100` | `40` | `100` | `35` |

That means Bubblegum currently has `5` symbol indexes per reel and `100` total reel stops per reel.

## Verified Payout Logic

Bubblegum uses the same ordered-triple payout rule as Dino:

```text
symbol0 = numToCoinReel1[randomWords[i * 3] % numOptionsReel1()]
symbol1 = numToCoinReel2[randomWords[i * 3 + 1] % numOptionsReel2()]
symbol2 = numToCoinReel3[randomWords[i * 3 + 2] % numOptionsReel3()]
spinPayout = payout[symbol0][symbol1][symbol2] * betAmountPerSpin / 10_000
```

The public transparency crop again showed only a few outcomes. The live contract exposes a broader non-zero ordered paytable than the screenshot.

Selected exact live entries read from `getPayout(...)` on **2026-04-09**:

| Ordered triple | Multiplier |
|----------------|-----------:|
| `0,0,0` | `100x` |
| `0,0,1` | `25x` |
| `0,1,0` | `25x` |
| `1,0,0` | `25x` |
| `0,1,1` | `12x` |
| `1,0,1` | `12x` |
| `1,1,0` | `12x` |
| `2,1,0` | `12x` |
| `1,1,1` | `11x` |
| `0,0,2` | `10x` |

The current live max payout is `100x` from ordered triple `0,0,0`.

## Exact RTP

Using the live Bubblegum reel-stop tables and full live `getPayout(symbol0, symbol1, symbol2)` matrix read on **2026-04-09** gives:

- exact per-spin RTP: `97.79962375%`
- displayed rounded RTP in repo/docs: `97.80%`

As in Dino Dough, effective RTP versus the full pre-fee buy-in is slightly reduced when `totalBetAmount` is not evenly divisible by `numSpins`, because the contract uses:

```text
betAmountPerSpin = floor(totalBetAmount / numSpins)
```

## Promotion Outcome

Bubblegum Heist now qualifies for `ABI verified` because:

- ApeScan links the live Bubblegum address to a public readable verified `Slots` source
- the CLI's encoded tuple and static `getVRFFee()` path match that verified source
- the repo's generic history getter path matches the verified getter surface
- the live Bubblegum contract's reel tables, fee constants, spin cap, and payout matrix were read directly from the deployed address
- the docs now make the `Similar Match` status explicit instead of treating Bubblegum as a transparency-only slot
