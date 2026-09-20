# Current state

## Last updated

2026-09-21

## Current milestone

The project is consolidating documentation and repository structure after PR #23. The web production
code is grouped by responsibility and all tests are separated into `tests/` directories.

## Recently completed

- PR #23 is present on `main`; Google Places grounding and SerpApi hotel/flight adapters are in the
  codebase behind configuration flags.
- Product closure documentation covers real provider verification, AUD semantics, weather, UI states,
  persistence, and the generic branch/PR sequence.
- Web production code is grouped under `components/{workspace,chat,trip,map,preferences,ui}` and
  `lib/{integrations,map,planning,trip,workspace}`.
- Web and package tests are grouped under separate `tests/` directories, with package typechecks also
  including their tests.

## In progress / not yet committed

- The current working tree contains the documentation, code organization, and test relocation changes
  from the ongoing cleanup task. Preserve unrelated `.gitignore` and `output/` changes.

## Next recommended actions

1. Review and commit the documentation and repository-organization changes as a focused PR.
2. Implement weather capability and provider provenance according to
   [`docs/todo-product-closure.md`](../docs/todo-product-closure.md).
3. Move chat, preference, trip, and provider state from process memory to durable storage before
   deployment is treated as production-ready.

## Validation status

| Check | Status | Notes |
|---|---|---|
| `pnpm typecheck` | Passed | All six packages, including separated package tests |
| `pnpm lint` | Passed | Next.js reports only existing deprecation/workspace-root warnings |
| `pnpm test` | Passed | Web: 20 files / 187 tests; package suites also passed |
| `git diff --check` | Passed | No whitespace errors |
| `pnpm build` | Not run | Run before merge/deployment |
