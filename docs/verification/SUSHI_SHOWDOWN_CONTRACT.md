# Sushi Showdown Contract Verification Notes

> Summary: Public source trail and live-getter evidence used to promote Sushi Showdown to `ABI verified` on 2026-04-10.

## Public Source Trail

- ApeScan contract page for the live Sushi Showdown address:
  - `https://apescan.io/address/0x7B53Ec7A5e1C30D4b91D2c3Ec0472a6E4818a657#code`
- Sushi ApeScan status on **2026-04-10**:
  - `Similar Match Source Code`
  - linked exact-match source address: `0x9ebb4Df257B971582BAf096b62CA41DE7723F3CB`
- Exact-match Dino Dough source page used as the readable verified source:
  - `https://apescan.io/address/0x9ebb4Df257B971582BAf096b62CA41DE7723F3CB#code`
- Current public Ape Church slots docs page:
  - `https://docs.ape.church/games/player-vs-house/slots-games`
- Swarm source hash shown by ApeScan for the linked source:
  - `ipfs://5e8743371fed897511ecad57fea6c30eee379dd9761ab3cc9470c08449010353`

The public Ape Church slots docs page places Sushi Showdown in the same multi-spin slots family as Dino Dough, Bubblegum Heist, and Geez Diggerz. ApeScan links the Sushi address to the exact-match Dino Dough `Slots` source, so the readable slot implementation is public even though Sushi itself is currently marked `Similar Match`.

## Why Similar Match Is Sufficient Here

The shared source uses `immutable` constructor parameters in `GameMasterclass`:

```text
uint256 public immutable GAME_ID;
IHistoryManager public immutable history;
```

Those deployment-time values can change the deployed runtime bytecode without changing the slot logic, which is why ApeScan warns that the constructor portion may differ.

For Sushi Showdown, that means the promotion standard relies on both:

- the public readable `Slots` source linked by ApeScan
- live getter reads on the Sushi address itself for the mutable slot surface: reels, fees, spin cap, and paytable

## Contract Identity

- ApeScan contract name: `Slots`
- Contract used by the CLI: `0x7B53Ec7A5e1C30D4b91D2c3Ec0472a6E4818a657`
- Compiler / optimization / EVM / license shown by ApeScan:
  - `v0.8.28+commit.7893614a`
  - optimized with `200` runs
  - `paris`
  - `MIT`

The repo constant `SUSHI_SHOWDOWN_CONTRACT` and the docs now point to that exact Sushi address.

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

The CLI uses the same shared slot handler in [slots.js](/Users/fluoro/Downloads/Clones/n0ther-coder/apechurch-cli/lib/games/slots.js), so the Sushi write path matches the linked verified source exactly.

The example transaction supplied during promotion:

- `https://apescan.io/tx/0x5d25fd140f65304071ebd5341329ac4b7fd191ed81ab428e071f74068e10cb71`

decodes as the same `(uint256 gameId, uint8 numSpins, address ref, bytes32 userRandomWord)` tuple.

## Verified Live Getter Snapshot

The Sushi Showdown contract's live getters on **2026-04-10** returned:

- `GAME_ID = 3`
- `history = 0xFa296156dAc165Af92F7Fdb012B61a874670e1AA`
- `MAX_SPINS = 15`
- `platformFee = 200` (`2.00%`)
- `oddsLocked = false`
- `getVRFFee() = 108,937,437,930,200,000 wei`

As with the other promoted slot-family games, `oddsLocked = false` means a future maintainer should re-read the live reel and payout surface before assuming it is unchanged.

## Verified Read Path

The linked verified source exposes:

- `function getGameInfo(uint256 gameId) public view returns (GameInfoReturnType memory)`
- `function batchGameInfo(uint256[] calldata gameIds) external view returns (GameInfoReturnType[] memory)`
- `function batchRawGameInfo(uint256[] calldata gameIds) external view returns (bytes[] memory)`
- `function getEssentialGameInfo(uint256[] calldata gameIds) external view returns (address[] memory, uint256[] memory, uint256[] memory, uint256[] memory, bool[] memory)`

Sushi uses the same getter layout as the other promoted slot-family games:

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

Sushi Showdown has `7` live symbol indexes and asymmetric reel weights.

| Symbol index | Reel 1 end | Reel 1 stops | Reel 2 end | Reel 2 stops | Reel 3 end | Reel 3 stops |
|-------------:|-----------:|-------------:|-----------:|-------------:|-----------:|-------------:|
| `0` | `9` | `9` | `9` | `9` | `9` | `9` |
| `1` | `29` | `20` | `29` | `20` | `29` | `20` |
| `2` | `59` | `30` | `69` | `40` | `69` | `40` |
| `3` | `99` | `40` | `109` | `40` | `109` | `40` |
| `4` | `139` | `40` | `144` | `35` | `149` | `40` |
| `5` | `179` | `40` | `184` | `40` | `189` | `40` |
| `6` | `229` | `50` | `234` | `50` | `249` | `60` |

That means the live total reel lengths are `229`, `234`, and `249` stops respectively.

## Verified Payout Logic

Sushi uses the same ordered-triple payout rule as the rest of the verified slot family:

```text
symbol0 = numToCoinReel1[randomWords[i * 3] % numOptionsReel1()]
symbol1 = numToCoinReel2[randomWords[i * 3 + 1] % numOptionsReel2()]
symbol2 = numToCoinReel3[randomWords[i * 3 + 2] % numOptionsReel3()]
spinPayout = payout[symbol0][symbol1][symbol2] * betAmountPerSpin / 10_000
```

The paytable is ordered and reel-specific.

Selected exact live entries read from `getPayout(...)` on **2026-04-10**:

| Ordered triple | Multiplier |
|----------------|-----------:|
| `0,0,0` | `500x` |
| `0,0,1` | `100x` |
| `0,1,0` | `100x` |
| `1,0,0` | `100x` |
| `1,1,1` | `55x` |
| `0,1,1` | `50x` |
| `1,0,1` | `50x` |
| `1,1,0` | `50x` |
| `0,0,2` | `30x` |
| `0,0,3` | `30x` |
| `0,0,4` | `30x` |
| `0,0,5` | `30x` |
| `2,0,0` | `22.6337x` |

The current live max payout is `500x` from ordered triple `0,0,0`.

## Exact RTP

Using the live Sushi reel-stop tables and the full live `getPayout(symbol0, symbol1, symbol2)` matrix read on **2026-04-10** gives:

- exact per-spin RTP: `97.87165381190353%`
- displayed rounded RTP in repo/docs: `97.87%`

As with the other promoted slot-family games, effective RTP versus the full pre-fee buy-in is slightly reduced when `totalBetAmount` is not evenly divisible by `numSpins`, because the contract uses:

```text
betAmountPerSpin = floor(totalBetAmount / numSpins)
```

## Promotion Outcome

Sushi Showdown now qualifies for `ABI verified` because:

- ApeScan links the live Sushi address to a public readable verified `Slots` source
- the CLI's encoded tuple and static `getVRFFee()` path match that verified source
- the repo's generic history getter path matches the verified getter surface
- the live Sushi contract's reel tables, fee constants, spin cap, and payout matrix were read directly from the deployed address
- the docs now make the `Similar Match` status explicit and capture the full exact slot surface instead of relying on partial transparency material
