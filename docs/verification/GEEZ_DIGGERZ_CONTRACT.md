# Geez Diggerz Contract Verification Notes

> Summary: Public source and live-getter evidence used to promote Geez Diggerz to `ABI verified` on 2026-04-10.

## Public Source Trail

- Verified ApeScan contract page:
  - `https://apescan.io/address/0xB02b13Adb8eAaFe1F41ec942612C4a4862b74d1D#code`
- Blockscan IDE mirror for the same verified address:
  - `https://vscode.blockscan.com/33139/0xB02b13Adb8eAaFe1F41ec942612C4a4862b74d1D`
- Current public Ape Church slots docs page:
  - `https://docs.ape.church/games/player-vs-house/slots-games`
- Swarm source hash shown by ApeScan at verification time:
  - `ipfs://c8332fb41d9b222dca99b73cfef63c2e804e98411a053f05f731ed5a63013821`

Geez Diggerz is publicly verified as an exact-match `Slots` deployment, so the source trail is sufficient for both the ABI surface and the slot settlement logic used by this repo.

## Contract Identity

- Verified contract name on ApeScan: `Slots`
- Contract used by the CLI: `0xB02b13Adb8eAaFe1F41ec942612C4a4862b74d1D`
- Verification status: `Contract Source Code Verified (Exact Match)`
- Compiler: `v0.8.28+commit.7893614a`
- Optimization: enabled with `200` runs
- EVM / license: `paris`, `MIT`

The repo constant `GEEZ_DIGGERZ_CONTRACT` and the docs now point to that exact verified address.

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

The CLI uses the same shared slot handler in [slots.js](/Users/fluoro/Downloads/Clones/n0ther-coder/apechurch-cli/lib/games/slots.js), so the Geez Diggerz write path matches the verified source surface exactly.

The example transaction supplied during promotion:

- `https://apescan.io/tx/0xacf8e9da5df85dfbbec8361c139e209632e35be08bcbcd7c67f7d9a5cbd7a7b4`

decodes as the same `(uint256 gameId, uint8 numSpins, address ref, bytes32 userRandomWord)` tuple.

## Verified Live Getter Snapshot

The mutable runtime values below were read from live ApeChain getters on **2026-04-10**:

- `GAME_ID = 9`
- `history = 0xFa296156dAc165Af92F7Fdb012B61a874670e1AA`
- `MAX_SPINS = 15`
- `platformFee = 200` (`2.00%`)
- `oddsLocked = false`
- `getVRFFee() = 108,937,437,930,200,000 wei`

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

Geez Diggerz currently uses the same cumulative reel table on all `3` reels.

| Symbol index | Reel 1 end | Reel 1 stops | Reel 2 end | Reel 2 stops | Reel 3 end | Reel 3 stops |
|-------------:|-----------:|-------------:|-----------:|-------------:|-----------:|-------------:|
| `0` | `10` | `10` | `10` | `10` | `10` | `10` |
| `1` | `21` | `11` | `21` | `11` | `21` | `11` |
| `2` | `34` | `13` | `34` | `13` | `34` | `13` |
| `3` | `48` | `14` | `48` | `14` | `48` | `14` |
| `4` | `64` | `16` | `64` | `16` | `64` | `16` |
| `5` | `82` | `18` | `82` | `18` | `82` | `18` |

That means each reel has `82` total stops and the exact same symbol weights.

## Verified Payout Logic

Settlement does:

```text
symbol0 = numToCoinReel1[randomWords[i * 3] % numOptionsReel1()]
symbol1 = numToCoinReel2[randomWords[i * 3 + 1] % numOptionsReel2()]
symbol2 = numToCoinReel3[randomWords[i * 3 + 2] % numOptionsReel3()]
spinPayout = payout[symbol0][symbol1][symbol2] * betAmountPerSpin / 10_000
```

The paytable is ordered and reel-specific. It is not a generic "any three matching icons" rule: `payout[a][b][c]` is keyed by the exact left-to-right triple.

Selected exact live entries read from `getPayout(...)` on **2026-04-10**:

| Ordered triple | Multiplier |
|----------------|-----------:|
| `0,0,0` | `50x` |
| `1,1,1` | `10x` |
| `0,0,1` | `10x` |
| `0,1,0` | `10x` |
| `1,0,0` | `10x` |
| `1,1,0` | `8x` |
| `0,1,1` | `8x` |
| `1,0,1` | `8x` |
| `0,0,2` | `6x` |
| `0,2,0` | `6x` |
| `2,0,0` | `6x` |

The current live max payout is `50x` from ordered triple `0,0,0`.

## Exact RTP

Using the live Geez reel-stop tables and the full live `getPayout(symbol0, symbol1, symbol2)` matrix read on **2026-04-10** gives:

- exact per-spin RTP: `97.694552458612%`
- displayed rounded RTP in repo/docs: `97.69%`

As with the other promoted slot-family games, effective RTP versus the full pre-fee buy-in is slightly reduced when `totalBetAmount` is not evenly divisible by `numSpins`, because the contract uses:

```text
betAmountPerSpin = floor(totalBetAmount / numSpins)
```

## Promotion Outcome

Geez Diggerz now qualifies for `ABI verified` because:

- the contract source is explorer-verified and readable
- the CLI's encoded tuple and static `getVRFFee()` path match the verified source
- the repo's generic history getter path matches the verified getter surface and struct layout
- the live Geez Diggerz reels, fees, spin cap, and full ordered paytable were read directly from the deployed contract
- the repo docs now record the exact slot surface and exact contract-derived RTP instead of depending on transparency-only crops
