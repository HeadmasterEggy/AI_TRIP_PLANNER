# API entry points

The Next.js route handlers live under `apps/web/app/api/`. All responses are JSON and planning
outputs are validated against the shared Zod contracts.

## `POST /api/chat`

Send a user message and optionally the latest trip brief. The route extracts explicit updates,
runs the planner and returns a user-facing reply plus the current plan.

```json
{
  "tripId": "trip-demo",
  "message": "Make the budget 2500",
  "brief": {
    "tripId": "trip-demo",
    "userId": "demo-user",
    "destination": "Tokyo",
    "dates": ["2026-10-01", "2026-10-04"],
    "groupSize": 2,
    "budgetTotal": 3000
  }
}
```

Response shape: `{ reply, plan }`.

Optional `mode` values:

- `"chat"` (default): extract explicit updates from `message` and apply them to `brief`. Without a
  brief, the legacy demo brief is the baseline.
- `"plan"`: `brief` is required and is planned as submitted, without extraction.
- `"start"`: a blank conversation. `brief` is omitted and the destination, dates, traveller count and
  total budget must all be stated in `message`. Missing fields are reported in an `error` frame
  (for example “To start planning, include the start and end dates …”) and are never borrowed from
  the demo or a previous trip.

## Stage 5.3 routes

The Stage 5.3 prototype contains planned `POST /api/hitl` and `POST /api/trips` routes for HITL
decisions and saved trip workspaces. They are not present on this refactor branch yet; they will be
reconnected after the specialist migration so the new Specialist boundary remains the source of truth.

## Related contracts

- Chat request/response: `packages/shared/src/chat.ts`
- Trip and plan contracts: `packages/shared/src/trip.ts`, `packages/shared/src/plan.ts`
- Shared ports: `packages/shared/src/ports.ts`
