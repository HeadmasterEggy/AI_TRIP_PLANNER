# Documentation restructure

## Session summary

- Author: Claude Code (Opus 5)
- Date: 2026-09-17
- Baseline: `codex/ui-improvements` at `d6f0725`.
- Modules: `README.md`, `docs/`.
- Goal: merge overlapping documents, separate current documentation from historical plans and
  audits, and move operational detail out of the README.
- Contract impact: none; documentation only.

## What changed

| Before                                                                                                         | After                                                                                                         |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `agent-architecture.md` + `langgraph-orchestration.md` + the “What already works” part of `scaffold.md`        | `architecture.md` (rewritten; git records a new file)                                                         |
| `scaffold.md` ownership table and rules                                                                        | `team-workflow.md`; `scaffold.md` deleted, its “Run it” section duplicated `development.md`                   |
| `ui-improvements.md` (P0–P3 checklists and three change histories) + lasting rules from `p3-implementation.md` | `workspace-ui.md`, current behaviour only (rewritten; git records a new file)                                 |
| `p3-implementation.md`, `elec5620-lab-1-6-gap-analysis.md`                                                     | `archive/`, each with a banner pointing to the current document                                               |
| `b-reliability.md`, `accommodation.md`                                                                         | `modules/`, content unchanged                                                                                 |
| `class-diagram.md`, `diagrams/`                                                                                | `design/`; the diagram SVGs have no relative links, so nothing inside changed                                 |
| README environment table, mock-server note, Windows note, CI commands                                          | `development.md`                                                                                              |
| README API table, detailed diagram and model roles                                                             | `api.md` and `architecture.md`; README keeps a six-node diagram, a four-line Quick start and a document table |
| —                                                                                                              | `session-logs/README.md`, an index grouped by phase                                                           |

Session logs and archived documents were not rewritten. Their old file names are explained in the
session-log index and archive banners. `docs/` now has six top-level documents plus `modules/`,
`design/`, `archive/` and `session-logs/`, and the README went from about 155 to about 90 lines.

## Verification

- Pure moves used `git mv`; `git diff -M` shows them as renames with only the two archive banners added.
- Every relative link in the README and in the non-historical documents resolves.
- Claims added to `architecture.md` were re-checked against code: revision falls back to
  deterministic routing (`workflow.ts`), round-2 convergence and `K = 3` escalation are asserted in
  `budget.test.ts`, and contract locations match `packages/shared/src/`.
- Prettier passes for the new and rewritten documents.
- Not checked: whether the ELEC5620 submission expects `docs/class-diagram.md` at its old path, and
  GitHub rendering of the two Mermaid diagrams.
