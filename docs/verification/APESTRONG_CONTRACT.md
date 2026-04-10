# ApeStrong Contract Verification Notes

> Summary: Public source and live-getter evidence used to promote ApeStrong to `ABI verified` on 2026-04-09.

## Public Source Trail

- Verified ApeScan contract page:
  - `https://apescan.io/address/0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600#code`
- Blockscan IDE mirror for the same verified address:
  - `https://vscode.blockscan.com/33139/0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600`
- Current public Ape Church docs page:
  - `https://docs.ape.church/games/player-vs-house/ape-strong`
- Swarm source hash shown by ApeScan at verification time:
  - `ipfs://24c9925682ff758cc5b181f18f0ecd3c8efad1f48cfc25b0a3faf1c76209b28b`

As of **2026-04-09**, the public Ape Church docs page still describes Ape Strong as a hammer / target-score game. The verified contract at the address above is instead a range-based VRF game, which matches this repo's `ape-strong` command. Treat the verified contract and the live getters as the source of truth for the CLI integration.

## Contract Identity

- Verified contract name on ApeScan: `ApeStrong`
- Contract used by the CLI: `0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600`
- Compiler: `v0.8.28+commit.7893614a`
- Optimization: enabled with `200` runs
- EVM / license: `paris`, `MIT`

The repo constant `APESTRONG_CONTRACT`, the docs, and the live verified source all point to the same address.

## Verified Write Path

The verified contract exposes:

- `function play(address player, bytes calldata gameData) external payable`
- `function getVRFFee() public view returns (uint256)`

Its `_playGame(...)` implementation decodes:

```text
(uint8 edgeFlipRange, uint256 gameId, address ref, bytes32 userRandomWord)
```

The verified behavior is:

- `msg.value` must be at least `getVRFFee()`
- `gameId` must satisfy `isValidGameId(gameId) == true`
- `edgeFlipRangeToPayout[edgeFlipRange]` must be non-zero
- `totalBetAmount = msg.value - getVRFFee()`
- `platformFeeAmount = totalBetAmount * platformFee / 10_000`
- exactly one random word is requested via `_requestRandom(gameId, 1, userRandomWord)`

This exactly matches the CLI write path in [lib/games/apestrong.js](/Users/fluoro/Downloads/Clones/n0ther-coder/apechurch-cli/lib/games/apestrong.js), including the encoded tuple order and the fixed-fee `getVRFFee()` read.

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
  uint8 edgeFlipRange,
  uint8 winningNumber,
  uint256 totalPayout,
  bool hasEnded,
  uint256 timestamp
)
```

That matches the generic simple-game history path used by the repo for pending settlement refreshes and cached history reconstruction.

## Verified Settlement Logic

The verified contract settles with:

```text
winningNumber = uint8(randomWords[0] % 100)
if (winningNumber < edgeFlipRange) {
  totalToPayout = edgeFlipRangeToPayout[edgeFlipRange] * betAmount / 10_000
} else {
  totalToPayout = 0
}
```

Important consequences:

- `winningNumber` lives in `0..99`, not `1..100`
- the exact win probability is therefore `edgeFlipRange / 100`
- `range = 50` wins on `0..49`
- `range = 95` wins on `0..94`
- the payout rule is table-driven through `edgeFlipRangeToPayout`, not hardcoded as a Solidity formula

The contract then stores `totalPayout`, calls `_handlePayout(...)`, and emits:

```text
GameEnded(address user, uint256 gameId, uint256 buyIn, uint256 payout)
```

## Live Getter Snapshot

The mutable runtime values below were read from live ApeChain getters on **2026-04-09**:

- `oddsLocked = false`
- `platformFee = 220` (`2.2%`)
- `partnerFeeCut = 0`
- `getVRFFee() = 93,248,194,793,600,000 wei`

Because `oddsLocked` is currently `false`, a future maintainer should re-read the live table before assuming the payout surface is unchanged.

## Exact Range Payout Rule

For the CLI-supported surface `5..95`, the live getter snapshot on **2026-04-09** showed:

- every supported range had a non-zero `edgeFlipRangeToPayout(range)` entry
- for almost every supported range, the live table equals `floor(975000 / range)`
- the current live exceptions are:
  - `range 75 -> 12999`
  - `range 95 -> 10250`

That compact rule is enough to reconstruct the full supported payout table as of the read date.

Selected exact live entries:

| Range | Multiplier | Exact RTP |
|------:|-----------:|----------:|
| `5` | `19.5x` | `97.50%` |
| `10` | `9.75x` | `97.50%` |
| `25` | `3.9x` | `97.50%` |
| `50` | `1.95x` | `97.50%` |
| `75` | `1.2999x` | `97.4925%` |
| `95` | `1.025x` | `97.3750%` |

Exact RTP for any supported range is:

```text
RTP(range) = range * edgeFlipRangeToPayout(range) / 10_000
```

Across the current supported surface, that yields:

- best observed exact RTP: `97.50%`
- worst observed exact RTP: `97.375%`

## Promotion Outcome

ApeStrong now qualifies for `ABI verified` because:

- the contract source is explorer-verified and readable
- the CLI's encoded tuple and static `getVRFFee()` path match the verified source
- the generic read path used by history/status matches the verified getters and struct layout
- the repo docs now record the exact win rule, the live payout table rule, and the current mutable getter snapshot
- the old invariant `97.5 / range` wording has been replaced with the verified contract-backed interpretation, including the current `75` and `95` live-table exceptions
