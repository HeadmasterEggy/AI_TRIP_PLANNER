# Team and Git workflow

This is a single deployable, so ownership is by module rather than by frontend/backend layers.

| Area                         | Owner | Ownership                                                        |
| ---------------------------- | ----- | ---------------------------------------------------------------- |
| Orchestrator and integration | A     | Graph state, supervisor, contracts, conflict policy, HITL and CI |
| Itinerary and transport      | B     | Schedule, route feasibility and maps adapter                     |
| Accommodation and budget     | C     | Lodging adapter, cost aggregation and budget policy              |
| Destination and dining       | D     | Grounded guide, customs, dining and dietary constraints          |
| Web and memory               | E     | Chat, filters, plan UI, preference memory and persistence        |

## Who owns which paths

| Path                                                                     | Owner | Fill in                                                                                                                                  |
| ------------------------------------------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/**`                                                 | A     | contracts — freeze early, announce changes                                                                                               |
| `packages/orchestrator/src/workflow.ts`                                  | A     | LangGraph workflow; add richer conflict policies, status promotion and HITL                                                              |
| `apps/web/app/api/chat/route.ts`, `packages/orchestrator/src/chat.ts`    | A     | enrich chat clarification/extraction and move from process-local to durable memory (structured extraction + fallback + loop wiring done) |
| `packages/tools/src/gateway.ts` + `mock-server.mjs`                      | A     | real-vs-mock routing                                                                                                                     |
| `packages/agents/src/itinerary/**`                                       | B     | enrich the implemented model/fallback daily plan with live opening-hour data                                                             |
| `packages/agents/src/transport/**`                                       | B     | replace injected mock fares/routes with live adapter data                                                                                |
| `packages/tools/src/maps.ts`                                             | B     | real Maps / Places adapter                                                                                                               |
| `packages/agents/src/accommodation/**`                                   | C     | lodging search + room allocation                                                                                                         |
| `packages/tools/src/booking.ts`                                          | C     | real Booking / Price adapter (mock only for payment)                                                                                     |
| cost roll-up threshold in `orchestrator` `rollUpCost` / `checkpointsFor` | C     | budget overrun % + escalation cutoff                                                                                                     |
| `packages/agents/src/destination-guide/**`                               | D     | maintain grounded attractions, customs/safety and verification-first entry/weather guidance                                              |
| `packages/agents/src/dining/**`                                          | D     | maintain grounded venue picks, dietary preferences and meal budgeting                                                                    |
| `apps/web/components/**`, `apps/web/app/globals.css`                     | E     | UI: chat, filters, "Your trip" panel, HITL cards                                                                                         |
| `packages/services/src/memory/**`                                        | E     | real short/long-term memory store                                                                                                        |
| `packages/services/src/{notification,auth}/**`                           | E     | real notifications + auth                                                                                                                |

Search the codebase for `TODO(` to see open slots. Module handoff notes are in
[`modules/`](modules/): [itinerary and transport reliability](modules/b-reliability.md) (B) and
[accommodation and budget](modules/accommodation.md) (C). How the pieces fit together is described in
[architecture](architecture.md).

## Branches and commits

Use `feature/<module>-<short-desc>` for module work or `codex/<short-desc>` for agent work. Use
conventional prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `test:` and `chore:`.

Open a pull request for `main`. CI must pass and at least one other person should review the change.
Do not force-push or delete `main`.

Don't edit `packages/shared` without telling the team; every package depends on it.

## Session logs

Every AI-assisted coding session adds a concise note in `docs/session-logs/`, named
`YYYY-MM-DD-<topic-or-name>.md` and based on [`TEMPLATE.md`](session-logs/TEMPLATE.md). The
[session-log index](session-logs/README.md) groups them by phase.
