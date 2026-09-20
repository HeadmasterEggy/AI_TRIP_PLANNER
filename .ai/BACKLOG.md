# Backlog

This is only a compact cross-agent index. Priority, acceptance criteria, and merge order are canonical
in [`docs/todo-product-closure.md`](../docs/todo-product-closure.md); do not maintain a second priority
system here.

## Current index

- [ ] Consolidate local environment files after preserving the app-only Maps variables: root `.env.local`
  should become the single source and `apps/web/.env.local` should be its symlink.
- [ ] Make specialist degradation visible in the UI.
  - Branch: `fix/degraded-visibility`
- [ ] Make chat, preferences, trips, HITL decisions, SerpApi cache, and usage counters durable.
  - Branch: `feature/durable-storage`
- [ ] Verify live hotel and flight results end to end with AUD values and visible provenance.
  - Branch: `feature/provider-provenance`

- [ ] Add Google Weather or another dedicated weather provider with the fixed ≤14-day forecast and
  >14-day climate semantics.
  - Branch: `feature/weather-capability`
- [ ] Add visible agent progress, thinking status, tool chips, degraded state, and retry UI without
  exposing model chain-of-thought.
  - Branch: `feature/ai-progress-ui`
- [ ] Build grounded hotel, flight, weather, budget, and HITL result cards.
  - Branch: `feature/travel-result-cards`

## Recently validated

- [x] Organize web production code and separate all tests into `tests/` directories.
- [x] Add the generic branch/PR sequence to the product closure documentation.
