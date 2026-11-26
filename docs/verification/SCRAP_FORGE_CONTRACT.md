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
observed submission payload carried five nested 32-byte words. The second
word matched the forge count. The third matched the decimal replay
ID and game submission logs. The fifth matched the provider's
`RandomnessRequested` user contribution. The first is exposed as raw data
until its domain and type are proven. The fourth fits an address word. Its
semantics are unverified. These observations do not specify a write ABI.

The event `RandomnessRequested(uint64,address,bytes32,uint64,uint64,uint32)`
indexes sequence number and requester. The inspector correlates the
provider, wrapper and user contribution. When one cVOL mint to the play
recipient matches a UI tier times the observed count word, it reports the
inferred wager and the transaction value above it. This difference is
labelled as additional value because a receipt does not include internal
native transfers. Gas uses receipt gas consumed times effective gas price.
[cVOL token](https://apescan.io/token/0xb90636359a683fcd9bc2f54623b5c52e48604f08).

## Settlement boundary

A successful submission receipt confirms acceptance only. A
[historical provider reveal](https://apescan.io/tx/0x3960ba7a5bd77dc49c7e159ee70f769fc7b01796d304af0867ed55310d3dba0c)
shows the game transferring 49 APE through ClaimManager to a recipient
and 9.5 APE to the house. It illustrates the asynchronous path without
establishing the full result event, a payout getter, or AMP accounting.
The inspector links the official replay and leaves settlement unknown.

Before enabling writes, reproduce tuple fields and validation boundaries
from an official ABI or corroborating calldata and read-only simulation.
Identify the fee getter and callback gas schedule, then correlate both
metal-only and AMP settlements including ordered outcomes, cash transfers,
NFT transfers, and retry/pending semantics. No wallet access is required
for this evidence. See [wagers, payout table and probability limits](../analytics/SCRAP_FORGE_ANALYTICS.md).
