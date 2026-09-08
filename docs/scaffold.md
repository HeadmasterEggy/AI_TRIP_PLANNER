# Scaffold map — where everyone codes

This repo is an end-to-end scaffold with a real LangGraph workflow, incremental chat
intake, and an implemented accommodation agent. The other four specialist agents still
return stub proposals, the memory store is an in-memory `Map`, and tools return canned
data. You can build each remaining slice against a real `TripPlan` shape from day one.

### What already works (so you have a pattern to copy)

- **Dependency injection**: agents receive `ctx.tools` (`ToolGateway`) and `ctx.mem`
  (`MemoryStore`) via `AgentContext`. Don't `import` the singletons — take them from
  `ctx` so your unit tests can pass fakes. Interfaces live in `packages/shared/src/ports.ts`.
- **The LangGraph K-round negotiation loop actually fires.** The compiled graph in
  `packages/orchestrator/src/workflow.ts` makes dispatch, conflict detection, targeted revision and
  aggregation observable nodes. With `DEMO_BRIEF` the round-1 estimate is ~17% over budget, so
  `detectConflicts` asks the two priciest agents (transport, accommodation) to cut; their revisions
  run in parallel; round 2 converges. `plan.round` shows how many rounds ran.
- **`AgentName`** is a union of the 5 ids; `Agent` now has a `label` (the panel
  section title) so `SECTION_LABELS` is gone from the orchestrator.
- **Chat contract**: `POST /api/chat` takes `ChatRequest` and returns `ChatResponse`
  (`{ reply, plan }`) — both Zod schemas in `packages/shared/src/chat.ts`. The web
  client includes its latest optional `brief`, then swaps the returned `plan` into state
  (`components/Workspace.tsx`). The route uses LangChain structured extraction when an
  Anthropic key is configured and a conservative English/Chinese parser otherwise.
  Streaming can be layered on later without changing the response shape.

## Run it

```bash
corepack enable
pnpm install
pnpm dev            # http://localhost:3000
```

Optional local mock API server (adapters already return canned data without it):

```bash
pnpm mock-server    # http://localhost:4000
```

Checks:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Who owns what

| Path | Owner | Fill in |
|---|---|---|
| `packages/shared/src/**` | A | contracts — freeze early, announce changes |
| `packages/orchestrator/src/workflow.ts` | A | LangGraph workflow; add real time/geo conflicts, status promotion, richer HITL |
| `apps/web/app/api/chat/route.ts`, `packages/orchestrator/src/chat.ts` | A | enrich chat clarification/extraction and move from process-local to durable memory (structured extraction + fallback + loop wiring done) |
| `packages/tools/src/gateway.ts` + `mock-server.mjs` | A | real-vs-mock routing |
| `packages/agents/src/itinerary/**` | B | day-by-day plan |
| `packages/agents/src/transport/**` | B | transport options + time/geo conflict helper |
| `packages/tools/src/maps.ts` | B | real Maps / Places adapter |
| `packages/agents/src/accommodation/**` | C | lodging search + room allocation |
| `packages/tools/src/booking.ts` | C | real Booking / Price adapter (mock only for payment) |
| cost roll-up threshold in `orchestrator` `rollUpCost` / `buildHitl` | C | budget overrun % + escalation cutoff |
| `packages/agents/src/destination-guide/**` | D | attractions, customs, safety, visa/vaccine, weather+packing sub-function |
| `packages/agents/src/dining/**` | D | cuisine + dietary restrictions |
| `apps/web/components/**`, `apps/web/app/globals.css` | E | UI: chat, filters, "Your trip" panel, HITL cards |
| `packages/services/src/memory/**` | E | real short/long-term memory store |
| `packages/services/src/{notification,auth}/**` | E | real notifications + auth |

Search the codebase for `TODO(` to see every open slot.

## Rules

- One branch per slot: `feature/<module>-<short-desc>`.
- Don't edit `packages/shared` without telling the team — everything depends on it.
- After each AI-assisted session, add `docs/session-logs/YYYY-MM-DD-name.md` from `TEMPLATE.md`.
