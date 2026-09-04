# Scaffold map — where everyone codes

This repo is a **skeleton**. Nothing is really implemented yet: every agent returns
a stub proposal, the memory store is an in-memory `Map`, tools return canned data.
The whole pipeline still runs end to end, so you can build your slice against a real
`TripPlan` shape from day one.

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
| `packages/orchestrator/src/index.ts` | A | conflict detection, K-round revision, HITL, escalation |
| `apps/web/app/api/chat/route.ts` | A | chat → TripBrief (LLM), run loop, persist |
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
