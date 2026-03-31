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
| `docs/ADDING_GAMES.md` | Maintainers | High | Yes | Source of truth for extending the game registry and CLI handlers. |
| `docs/GAMES_REFERENCE.md` | Users / maintainers | High | Yes | Quick syntax cookbook plus transparency-derived RTP, payout, paytable, comparison, and GP-farming notes for supported games, with a compact appendix for public-but-unsupported titles. |
| `docs/PUBLISHING.md` | Maintainers | High | Yes | Release and packaging checklist. |
| `docs/FEATURES.md` | Marketing / product | Medium | Maybe | Useful as a product snapshot, but some sections overlap with `README.md`. |
| `docs/THESIS.md` | Marketing / narrative | Low | Maybe | Positioning document, not operational documentation. |
| `docs/BLACKJACK_CONTRACT.md` | Maintainers | Medium | Maybe | Raw contract notes for blackjack integration. |
| `docs/BLACKJACK_NOTES.md` | Maintainers | Medium | Yes | Cleaner blackjack integration notes derived from the contract details. |
| `tests/README.md` | Maintainers | High | Yes | Test entry point; keep it next to the tests. |

## Archive

Historical notes that are not current source of truth live in `docs/archive/`:

- `docs/archive/REFACTOR_PLAN.md`
- `docs/archive/agent_nodes.md`
- `docs/archive/TRANSPARENCY_REFERENCE.md`

These are worth keeping for context, but they should not drive current implementation or release steps. `TRANSPARENCY_REFERENCE.md` stays archived as the fuller extraction snapshot after the supported-game details were folded into `docs/GAMES_REFERENCE.md`.

## Layout Policy

- Do not duplicate install-bundle files under `assets/`; root files are canonical.
- Keep user-facing entry points in root only when they matter on GitHub/npm.
- Put maintainer/reference material under `docs/`.
- Put highly local notes next to the code they describe, such as `tests/README.md`.
