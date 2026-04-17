# Primes Odds and Payouts

> Summary: Exact per-run payout distributions for all verified Primes difficulties, derived from the contract-backed difficulty table and prime-count mapping.

This note summarizes the exact **per-run** payout distributions for **Primes** across all verified difficulties (`Easy`, `Medium`, `Hard`, `Extreme`).

## How Primes works

Each run draws one uniform integer from a fixed difficulty-dependent range. The outcome is then classified as:

- **Zero**: fixed top-payout case.
- **Prime**: fixed base-payout case for that difficulty.
- **Composite / non-prime non-zero**: immediate `0x`.

Run count does **not** change the underlying per-run distribution. It only adds Solidity floor-division dust because the contract splits the total wager with `floor(totalBetAmount / numRuns)`.

## How to read the table

- **Net Profit (>1x)** counts both the `Zero` and `Prime` outcomes, because both pay above stake on every verified difficulty.
- **Loss (0x)** is the exact probability of landing on a non-prime non-zero value.
- Each outcome row shows the exact multiplier together with its unconditional probability.

| Row | Easy | Medium | Hard | Extreme |
| --- | --- | --- | --- | --- |
| RTP | `98.00%` | `98.00%` | `98.00%` | `98.04%` |
| Net Profit (>1x) | `50.00%` (1/2) | `26.00%` (13/50) | `16.90%` (169/1000) | `12.30%` (123/1000) |
| Loss (0x) | `0x` @ `50.00%` (1/2) | `0x` @ `74.00%` (37/50) | `0x` @ `83.10%` (831/1000) | `0x` @ `87.70%` (877/1000) |
| Zero | `2.2x @ 10.00% (1/10)` | `10.5x @ 1.00% (1/100)` | `56x @ 0.10% (1/1000)` | `500x @ 0.01% (1/10000)` |
| Prime | `1.9x @ 40.00% (2/5)` | `3.5x @ 25.00% (1/4)` | `5.5x @ 16.80% (21/125)` | `7.57x @ 12.29% (1229/10000)` |

## Sources

1. [docs/verification/PRIMES_CONTRACT.md](../verification/PRIMES_CONTRACT.md) — verified difficulty table, prime counts, and exact RTP references.
2. [lib/rtp.js](../../lib/rtp.js) — exact Primes mode constants used by the CLI.
