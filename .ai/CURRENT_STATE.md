# Current state

## Last updated

2026-09-21

## Current milestone

The post-PR #23 product-closure sequence is complete on the upstream repository. PRs #31–#36 were
merged in Todo order through their stacked bases, then PR #37 integrated the cumulative result into
`main`. The web production code is grouped by responsibility and all tests are separated into `tests/`
directories.

## Recently completed

- PR #23 is present on `main`; Google Places grounding and SerpApi hotel/flight adapters are in the
  codebase behind configuration flags.
- Product closure documentation covers real provider verification, AUD semantics, weather, UI states,
  persistence, and the generic branch/PR sequence.
- Web production code is grouped under `components/{workspace,chat,trip,map,preferences,ui}` and
  `lib/{integrations,map,planning,trip,workspace}`.
- Web and package tests are grouped under separate `tests/` directories, with package typechecks also
  including their tests.
- PR #31 makes specialist degradation visible; PR #32 adds durable storage and its clean-workspace
  dependency fix; PR #33 adds the weather provider and 14-day forecast/climate boundary; PR #34 adds
  provider provenance; PR #35 adds AI progress UI; PR #36 adds source-aware result cards. PR #37 brings
  the cumulative stacked result into `main`. All of these PRs are merged upstream.

## Working tree

- The current working tree is on `main` after the PR #37 mainline integration. Preserve unrelated
  `.gitignore` and `output/` changes.

## Next recommended actions

1. Run a real-provider Sydney → Tokyo smoke test with `USE_MOCK_TOOLS=false` and credentials configured
   in the environment actually read by Next.js.
2. Configure the durable-store variables in Vercel before treating persistence as production-ready.
3. Consider the deferred P2 capabilities only when needed: flight operational status, affiliate inventory,
   booking/payment fulfillment, and weather history.

## Validation status

| Check | Status | Notes |
|---|---|---|
| `pnpm typecheck` | Passed | All six packages, including separated package tests |
| `pnpm lint` | Passed | Next.js reports only existing deprecation/workspace-root warnings |
| `pnpm test` | Passed | Web: 20 files / 188 tests; package suites also passed |
| `git diff --check` | Passed | No whitespace errors |
| `pnpm build` | Passed | Production build completed before mainline integration |
| Browser smoke | Passed | HTTP 200; preferences/calendar open; 375×812 layout usable; no console errors after interaction |
