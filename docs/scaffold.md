# Scaffold map — where everyone codes

This repo is an end-to-end scaffold with a real LangGraph workflow, incremental chat
intake, and all five specialist agents implemented. The memory store is still an in-memory
`Map`, and maps/booking tools return canned data. You can build each remaining slice
against a real `TripPlan` shape.

### What already works (so you have a pattern to copy)

- **Dependency injection**: agents receive `ctx.tools` (`ToolGateway`) and `ctx.mem`
  (`MemoryStore`) via `AgentContext`. Don't `import` the singletons — take them from
  `ctx` so your unit tests can pass fakes. Interfaces live in `packages/shared/src/ports.ts`.
- **The LangGraph K-round negotiation loop actually fires.** The compiled graph in
  `packages/orchestrator/src/workflow.ts` makes dispatch, conflict detection, targeted revision and
  aggregation observable nodes. With `DEMO_BRIEF` the round-1 estimate is over budget, so
  `detectConflicts` asks the two priciest agents (transport, accommodation) to cut; their revisions
  run in parallel; round 2 converges. `plan.round` shows how many rounds ran.
- **Specialist model routing** is explicit in `packages/agents/src/models.ts`: itinerary uses
  DeepSeek; destination guide and dining use MiniMax. Each path accepts an injected generator,
  validates structured output and falls back deterministically when credentials or results fail.
- **`AgentName`** is a union of the 5 ids; `Specialist` exposes a labelled,
  framework-neutral `invoke({ brief, context, revision? })` contract so `SECTION_LABELS` is gone
  from the orchestrator.
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

| Path                                                                  | Owner | Fill in                                                                                                                                  |
| --------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/**`                                              | A     | contracts — freeze early, announce changes                                                                                               |
| `packages/orchestrator/src/workflow.ts`                               | A     | LangGraph workflow; add richer conflict policies, status promotion and HITL                                                              |
| `apps/web/app/api/chat/route.ts`, `packages/orchestrator/src/chat.ts` | A     | enrich chat clarification/extraction and move from process-local to durable memory (structured extraction + fallback + loop wiring done) |
| `packages/tools/src/gateway.ts` + `mock-server.mjs`                   | A     | real-vs-mock routing                                                                                                                     |
| `packages/agents/src/itinerary/**`                                    | B     | enrich the implemented model/fallback daily plan with live opening-hour data                                                             |
| `packages/agents/src/transport/**`                                    | B     | replace injected mock fares/routes with live adapter data                                                                                |
| `packages/tools/src/maps.ts`                                          | B     | real Maps / Places adapter                                                                                                               |
| `packages/agents/src/accommodation/**`                                | C     | lodging search + room allocation                                                                                                         |
| `packages/tools/src/booking.ts`                                       | C     | real Booking / Price adapter (mock only for payment)                                                                                     |
| cost roll-up threshold in `orchestrator` `rollUpCost` / `buildHitl`   | C     | budget overrun % + escalation cutoff                                                                                                     |
| `packages/agents/src/destination-guide/**`                            | D     | maintain grounded attractions, customs/safety and verification-first entry/weather guidance                                              |
| `packages/agents/src/dining/**`                                       | D     | maintain grounded venue picks, dietary preferences and meal budgeting                                                                    |
| `apps/web/components/**`, `apps/web/app/globals.css`                  | E     | UI: chat, filters, "Your trip" panel, HITL cards                                                                                         |
| `packages/services/src/memory/**`                                     | E     | real short/long-term memory store                                                                                                        |
| `packages/services/src/{notification,auth}/**`                        | E     | real notifications + auth                                                                                                                |

Search the codebase for `TODO(` to see every open slot.

## Rules

- One branch per slot: `feature/<module>-<short-desc>`.
- Don't edit `packages/shared` without telling the team — everything depends on it.
- After each AI-assisted session, add `docs/session-logs/YYYY-MM-DD-name.md` from `TEMPLATE.md`.
