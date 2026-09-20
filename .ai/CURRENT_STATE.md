# Current state

## Last updated

2026-09-21

## Current milestone

The project is completing the post-PR #23 product-closure sequence directly on the upstream repository.
The web production code is grouped by responsibility and all tests are separated into `tests/` directories.

## Recently completed

- PR #23 is present on `main`; Google Places grounding and SerpApi hotel/flight adapters are in the
  codebase behind configuration flags.
- Product closure documentation covers real provider verification, AUD semantics, weather, UI states,
  persistence, and the generic branch/PR sequence.
- Web production code is grouped under `components/{workspace,chat,trip,map,preferences,ui}` and
  `lib/{integrations,map,planning,trip,workspace}`.
- Web and package tests are grouped under separate `tests/` directories, with package typechecks also
  including their tests.
- Upstream PR #31 makes specialist degradation visible; upstream PR #32 adds durable storage and its
  clean-workspace dependency fix; upstream PR #33 adds the weather provider and 14-day forecast/climate
  boundary. These PRs are intentionally open and stacked; none should be merged automatically.

## In progress / not yet committed

- The current working tree is on the stacked provider-provenance branch. It contains structured provider
  metadata for SerpApi, Google Places estimates, and mock booking candidates plus source-label tests.
  Preserve unrelated `.gitignore` and `output/` changes.

## Next recommended actions

1. Finish and verify the provider-provenance PR, then continue with the AI progress UI branch.
2. Build the grounded hotel, flight, weather, budget, and HITL result cards.
3. Keep durable storage configured with deployment environment variables before treating production as
   ready.

## Validation status

| Check | Status | Notes |
|---|---|---|
| `pnpm typecheck` | Passed | All six packages, including separated package tests |
| `pnpm lint` | Passed | Next.js reports only existing deprecation/workspace-root warnings |
| `pnpm test` | Passed | Web: 20 files / 187 tests; package suites also passed |
| `git diff --check` | Passed | No whitespace errors |
| `pnpm build` | Not run | Run before merge/deployment |
