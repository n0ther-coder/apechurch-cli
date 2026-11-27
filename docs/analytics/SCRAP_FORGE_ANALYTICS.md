# Scrap Forge analytics

Source: [Ape Church Scrap Forge, Full rules and odds and Potential Output](https://www.ape.church/games/hv-mtl-scrapyard/forge), 2026-11-26. See [contract evidence](../verification/SCRAP_FORGE_CONTRACT.md) and [shared Vault analytics](HV-MTL_SCRAPYARD_ANALYTICS.md).

## Wager and rewards

Each round batches forges at a single denomination. The UI limits below are
base wagers in native APE before randomness and network gas.

| APE per forge | Forges | Maximum base wager | Capsules per AMP |
|---:|---:|---:|---|
| 10 | 1–15 | 150 | 1 Standard |
| 50 | 1–15 | 750 | 5 Standard |
| 100 | 1–15 | 1,500 | 10 Standard |
| 500 | 1–8 | 4,000 | 5 Premium |
| 1,000 | 1–4 | 4,000 | 10 Premium |

| Material | Rarity | Gross multiple of the per-forge wager | Frontend weight per million |
|---|---|---:|---:|
| Cast Iron | Common | 0.2× | 370,835 |
| Steel | Common | 0.5× | 289,164 |
| Zinc | Common | 1× | 142,001 |
| Lead | Uncommon | 1.5× | 93,400 |
| Aluminum | Uncommon | 2× | 59,000 |
| Stainless Steel | Rare | 4× | 25,600 |
| Brass | Rare | 10× | 7,500 |
| Copper | Epic | 25× | 1,930 |
| Tungsten Carbide | Premium | 50× | 570 |
| AMP | Special | Vault pull | 10,000 |

Material multipliers are component awards. The AMP Vault has a separate
payout distribution, so 50× does not establish a total round maximum.

The official rules say that one VRF word determines a round and advertise an
AMP marginal of 1% per forge at every denomination. A round with no AMP
settles through the game's metal payout. The rules describe the Vault itself
as drawing and sending AMP prizes. The public wording does not establish
independence between forges or between capsules, exclusive metal versus AMP
accounting, or how concurrent AMP hits settle.

## Probability and expected return

Let `b` be the denomination, `n` the count, `m_j` material multipliers,
`p_j` their unconditional probabilities, `q = 0.01` the advertised AMP
marginal, and `S_c` the total return from `c` capsules of the selected class.
Under an exclusive material-or-AMP model, one forge return `X` satisfies:

```text
E[X] = b × sum(p_j × m_j) + q × E[S_c]
E[X²] = b² × sum(p_j × m_j²) + q × E[S_c²]
Var(X) = E[X²] − E[X]²
E[AMP count] = n × q
P(at least one AMP) = 1 − (1 − q)^n    [if forge outcomes are independent]
```

Conditional on independence, the chance of any AMP at 1, 4, 8 and 15 forges
is 1.00%, 3.94%, 7.73% and 13.99%, respectively. Expected capsule count is
`n × q × c` if every AMP settles its full allocation. Without independence,
round variance includes pairwise covariances. Without a verified full
distribution, a hit-rate statement cannot be converted into a probability
that a round finishes in profit.

If every capsule of a class has the same marginal EV `μ`, its Vault
contribution to gross RTP is `q × c × μ / b`. This is `0.001 × μ_standard`
or `0.0001 × μ_premium` for the published tiers. Equality requires
`μ_premium = 10 × μ_standard`. The two prize supports and probabilities
differ, and the published value ratio does not prove that equality.

The official frontend's model weights sum to 1,000,000. Its weighted
material return is **87.3%** of wager. Its default Vault valuation
parameter of 0.9 adds 9.0 percentage points for **96.3%** modeled return,
before randomness and gas. This reproduces the advertised number.
Contract RNG and the actual complete Vault odds and valuation are still
unverified, so the model cannot establish exact all-in RTP, complete
round bounds, variance, or profit odds.

## Accounting

```text
base wager = b × n
submitted value = base wager + randomness fee
cash PnL = cash payouts − submitted value − sender gas
marked PnL = cash PnL + separately sourced, timestamped NFT marks
```

Observed transfers route 2.5% of the base wager to the fee receiver. This is
within the wager and never added to the submitted value a second time.
Network gas is additional. Given a fixed extra cost `F` and a compatible
valuation of cash and any NFT payout, all-in RTP would be
`n × E[X] / (n × b + F)`. An unknown NFT mark leaves marked PnL unknown.

The live stake and VRF fee come from the Forge Lens. At block 55,949,865,
one 10 APE forge quoted 0.121 APE in VRF fees, or 1.21% of the base wager
before gas. Each round is quoted separately. The CLI's realized cash
results use metal payouts and delivered APE prizes. The Vault's listing
marks describe the reported in-kind awards separately.

The CLI can read observed payments to the player through documented Forge
and ClaimManager paths in a matching reveal. It also lists NFT-shaped
receipt transfers to the player. These are partial observations and do not
establish AMP payout attribution, complete gross return, or realized PnL.
Use `game forge --round <id>` to read the separate metal payout,
reported total payout, capsule spend, and linked Vault draw. An NFT's
Vault value and actual sale proceeds are distinct cash flows.
Use `--vault-reveal` with the submission and separate Vault reveal hashes
to correlate the pull events and confirm NFT transfers to the recipient.
