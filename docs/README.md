# Documentation Map

> Summary: Index of the repository documentation layout. Explains which files are canonical, which docs are active references, and which ones are preserved only for archival context.

This repo keeps only one canonical copy of the agent install bundle in the project root:

- `README.md` - primary project overview for humans browsing the repo or npm.
- `SKILL.md` - full agent-facing operating manual copied by `apechurch-cli install`.
- `HEARTBEAT.md` - focused notes for autonomous play scheduling and control loops.
- `STRATEGY.md` - persona and risk-profile reference copied with the agent bundle.
- `skill.json` - metadata for agent-framework installs.
- `CHANGELOG.md` - release history.

Everything else lives under `docs/` or next to the code it explains.

## Active Docs

| File | Audience | Usefulness | Keep? | Notes |
|------|----------|------------|-------|-------|
| `docs/COMMAND_REFERENCE.md` | Users / maintainers | High | Yes | Canonical CLI command surface, including top-level commands, options, aliases, and shared BNF. |
| `docs/ADDING_GAMES.md` | Maintainers | High | Yes | Source of truth for extending the game registry and CLI handlers. |
| `docs/ABI_VERIFICATION.md` | Maintainers | High | Yes | Promotion checklist for deciding when a supported game may be marked `ABI verified` and shown with `✔︎`. |
| `docs/GAMES_REFERENCE.md` | Users / maintainers | High | Yes | Comparison-first syntax and RTP summary for supported games, with a compact appendix for public-but-unsupported titles. |
| `docs/PUBLISHING.md` | Maintainers | High | Yes | Release and packaging checklist. |
| `docs/FEATURES.md` | Marketing / product | Medium | Maybe | Useful as a product snapshot, but some sections overlap with `README.md`. |
| `docs/THESIS.md` | Marketing / narrative | Low | Maybe | Positioning document, not operational documentation. |
| `docs/verification/README.md` | Maintainers | High | Yes | Index of the canonical per-game ABI verification notes. |
| `docs/verification/*.md` | Maintainers | High | Yes | Canonical per-game verification trail for every `ABI verified` title, including mechanics, tuple layout, and contract-backed RTP notes. |
| `docs/odds/README.md` | Users / maintainers | High | Yes | Index of exact probability/payout notes for games with compact, fully documentable outcome surfaces. |
| `docs/odds/*.md` | Users / maintainers | High | Yes | Exact odds and payout distributions intended to support game-selection decisions. |
| `tests/README.md` | Maintainers | High | Yes | Test entry point; keep it next to the tests. |

## Archive

Historical notes that are not current source of truth live in `docs/archive/`:

- `docs/archive/REFACTOR_PLAN.md`
- `docs/archive/agent_nodes.md`
- `docs/archive/TRANSPARENCY_REFERENCE.md`

These are worth keeping for context, but they should not drive current implementation or release steps. `TRANSPARENCY_REFERENCE.md` stays archived as the fuller extraction snapshot after the supported-game details were folded into `docs/GAMES_REFERENCE.md` and `docs/verification/`.

## Layout Policy

- Do not duplicate install-bundle files under `assets/`; root files are canonical.
- Keep user-facing entry points in root only when they matter on GitHub/npm.
- Put maintainer/reference material under `docs/`.
- Put highly local notes next to the code they describe, such as `tests/README.md`.
