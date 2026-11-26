# Scrap Forge contract evidence

## Identity and status

- [Official game and rules](https://www.ape.church/games/hv-mtl-scrapyard/forge).
- [ApeScan deployment](https://apescan.io/address/0x4992Ad0cBc2B6320d8986B5a5d995125bF4AD95d)
  on ApeChain mainnet (33139). No verified source was visible on 2026-11-26.
- [ApeVRF provider](https://apescan.io/address/0xe892d2576bcf131e1d4a6a31e1921bb27f8f91f2)
  and [ApeVRFV2PythWrapper](https://apescan.io/address/0xa35500b5c420066d6315da0bec29246efe3660ad)
  appear in historical submissions. The game has a read-only CLI entry and
  remains outside the [ABI promotion standard](../ABI_VERIFICATION.md).

## Public submission evidence

Successful plays at blocks [55,936,833](https://apescan.io/tx/0x2a4753df5a05cf9a7540869c16ff0c14e3d6b13232bc0842b1d9a226f7debb12)
and [55,936,796](https://apescan.io/tx/0x9ba2608375707743a7d03d54316bb5fcb19cca9bc02f089050d94727c458dbf8)
left the following transfer and receipt evidence:

| Base wager | Transaction value | Routed to VRF | Routed out of base wager to FeeReceiver | Sender gas |
|---:|---:|---:|---:|---:|
| 1,000 APE | 1,000.121 APE | 0.121 APE | 25 APE | 0.07049228514932 APE |
| 1,500 APE | 1,500.123 APE | 0.123 APE | 37.5 APE | 0.0704905565424 APE |

The top-level selector is `0xc811ad71` for `play(address,bytes)`. The
[official Forge page bundle](https://www.ape.church/_next/static/chunks/app/games/hv-mtl-scrapyard/forge/page-85e67b1c0bbc7199.js)
uses five nested ABI words `(uint8 tier, uint8 forges, uint256 gameId,
address ref, bytes32 userRandomWord)`. Tier indices 0 through 4 correspond
to 10, 50, 100, 500, and 1,000 APE per forge. The recorded calldata and
provider event corroborate the observed count, round ID and entropy.
Public frontend evidence establishes the site's wire format. The target
deployment remains unverified on ApeScan.

The event `RandomnessRequested(uint64,address,bytes32,uint64,uint64,uint32)`
indexes sequence number and requester. The inspector correlates the
provider, wrapper and user contribution. When one cVOL mint to the play
recipient matches a UI tier times the observed count word, it reports the
inferred wager and the transaction value above it. This difference is
labelled as additional value because a receipt does not include internal
native transfers. Gas uses receipt gas consumed times effective gas price.
[cVOL token](https://apescan.io/token/0xb90636359a683fcd9bc2f54623b5c52e48604f08).

## Official fee and round reads

The official page uses the [Forge Lens](https://apescan.io/address/0x93dbEEE1E93dA2f1BEf8FFeF00F7bc8410e0656d).
Its `getPlayValue(uint8,uint8)` quote returns `(totalBet, vrfFee, value)`.
Observed RPC responses on 2026-11-26 returned these example quotes:

| APE per forge | Forges | Base wager | VRF | Transaction value before sender gas |
|---:|---:|---:|---:|---:|
| 10 | 1 | 10 | 0.121 | 10.121 |
| 10 | 5 | 50 | 0.125 | 50.125 |
| 500 | 5 | 2,500 | 0.125 | 2,500.125 |

`maxForgesAllowed(uint8)` returned 15, 15, 15, 8 and 4 for tiers 0–4.
The captured calls used the `latest` tag. The CLI pins the two Lens
reads and the Forge `paused()` check to one block and checks
`value == totalBet + vrfFee` and the selected wager. It reads the quote
for every request.

`getGameInfo(uint256)` on Forge exposes the ordered bucket indices,
stake per forge, total payout, metal payout, capsule spend, Vault address,
Vault request ID, and ended and owed flags. `getVaultPulls(uint256)` on
the Lens returns the linked request status, count and pull records.
`--round` checks the Lens address and request ID against the game record.
Listing ID and `amountOrValue` are carried through independently from any
ERC-721 or ERC-1155 receipt transfers. The game can end before a pending
Vault draw or delivery. `getEssentialGameInfo(uint256[])` returns a
reported game payout and an ended flag. Use the detailed round and Vault
records for the actual composition of the award.

## Settlement boundary

A successful submission receipt confirms acceptance only. A
[historical provider reveal](https://apescan.io/tx/0x3960ba7a5bd77dc49c7e159ee70f769fc7b01796d304af0867ed55310d3dba0c)
shows the game transferring 49 APE through ClaimManager to a recipient
and 9.5 APE to the house. A [second reveal at block 55,476,658](https://apescan.io/tx/0xd2846f4e76274a97756c5e1f985184ef596194a3bea0679a6a0e8d070fa6aa54)
shows the same path for 102 APE to the recipient and 44.25 APE to the house.
Both reveal inputs expose the provider's verified
`reveal(uint64,bytes32,bytes32)` ABI.

`game forge --transaction <submission-hash> --reveal <reveal-hash>`
compares the reveal sequence and contribution with one uniquely matched
request log, checks chain ordering and reads the reveal receipt. A success
status applies to the reveal transaction. It does not prove that the game
settled. In the successful receipt, the tool lists ERC-721- and
ERC-1155-shaped transfers to the original play recipient. It keeps IDs and
quantities as strings and makes no Vault attribution or valuation.
[ERC-721](https://eips.ethereum.org/EIPS/eip-721) and
[ERC-1155](https://eips.ethereum.org/EIPS/eip-1155) define the transfer layouts.

With `--trace`, the inspector asks the configured ApeChain RPC for
[`debug_traceTransaction` with `callTracer`](https://geth.ethereum.org/docs/developers/evm-tracing/built-in-tracers#calltracer).
It counts successful payments from Forge to the recipient and the final
payments from [ClaimManager](https://apescan.io/address/0xd2a5c5f58bdbed24ef919d9dfb312ca84e7b31dd)
to that recipient inside a Forge-to-ClaimManager call. The intermediate
funding transfer is never counted a second time. A trace without a successful
Forge call does not produce an amount. The sum covers these paths only.
Neither it nor the NFT list establishes complete payout or net PnL.
At release, the trace and receipt paths were exercised with synthetic RPC
fixtures. Public explorer traces corroborate the historical transfer route.
The configured live RPC was unreachable during validation.

Before enabling writes, reproduce the quoted write with a read-only RPC
simulation and verify the detailed game and Vault records for completed
metal-only and AMP rounds. Verify how delayed Vault draws, refunds and
delivery reconcile with the actual APE and NFT transfers. No wallet access
is required for this evidence.
See [wagers, payout table and probability limits](../analytics/SCRAP_FORGE_ANALYTICS.md).
