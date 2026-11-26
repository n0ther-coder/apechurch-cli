# HV-MTL Scrapyard and AMP Prize Vault

[HV-MTL Scrapyard](https://www.ape.church/games/hv-mtl-scrapyard) offers
Scrap Forge and Scrap Crusher with a shared AMP Prize Vault. The Vault also
offers Pull Pass redemption. Game wagers, settlement, and odds require
separate evidence for each game. See [Scrap Forge](SCRAP_FORGE_ANALYTICS.md).

## Capsule snapshots

Each capsule awards a prize. Standard and Premium use different odds and
eligibility, including different ranges of ApeCoin prizes. The UI's odds
are per capsule. Its inventory lists NFT and APE entries under Common,
Uncommon, Rare, and Epic. The inventory can change with replenishment and
awards. Exact sampling, depletion and the treatment of multiple capsules
require contract evidence.

The UI describes an NFT's displayed value as the lower of floor and best
offer. An indicative mark can differ from realized proceeds. Keep APE
prizes and NFT transfers separate, and record a mark's source and timestamp
when calculating a marked return.

Given a complete timestamped snapshot of prize entries with probability
`p_i` and value `V_i` in the same unit:

```text
Inventory share by rarity = count of that rarity / count of all entries
Drop probability by rarity = sum(p_i) in that rarity
Capsule EV = sum(p_i × V_i)
Capsule variance = sum(p_i × V_i²) − EV²
```

Sum the reciprocals of displayed “1 in N” denominators to get approximate
rarity odds when every eligible entry in that category has been captured.
Report missing probability mass and rounding. A partial EV is the measured
contribution of its entries, not the EV of the capsule.

[Scrap Forge Full rules and odds](https://www.ape.church/games/hv-mtl-scrapyard/forge)
describes the Premium capsule as worth ten Standard capsules. Exact expected
values depend on both complete distributions and the marks at a given time.
No shared RTP or wagering-statistics interpretation follows from sharing a
Vault.
