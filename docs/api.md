# API entry points

The Next.js route handlers live under `apps/web/app/api/`. All six are `POST` handlers. Request bodies
are validated with Zod, and planning outputs are validated against the shared contracts in
`packages/shared/src/`.

| Path                                                        | Purpose                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| [`/api/chat`](#post-apichat)                                | Extract brief updates or plan a submitted brief, streaming progress |
| [`/api/hitl`](#post-apihitl)                                | Apply a human-in-the-loop decision to a plan                        |
| [`/api/places/search`](#post-apiplacessearch)               | Google Places text search                                           |
| [`/api/places/details`](#post-apiplacesdetails)             | Google place details for a place ID                                 |
| [`/api/routes/from-location`](#post-apiroutesfrom-location) | Route from a user-approved location to a place                      |
| [`/api/trip/preview-edit`](#post-apitrippreview-edit)       | Preview an itinerary edit with route and budget checks              |

The server is stateless for plans: the browser sends the current plan or brief with each request and
keeps its workspace in local storage. Short-term chat turns are recorded in the in-process
`MemoryStore` from `packages/services`.

## `POST /api/chat`

Contract: `ChatRequest`, `ChatResponse` and `AgentProgressEvent` in `packages/shared/src/chat.ts`.

```json
{
  "tripId": "trip-123",
  "message": "Make the budget 2500",
  "brief": {
    "tripId": "trip-123",
    "userId": "demo-user",
    "destination": "Tokyo",
    "dates": ["2026-10-01", "2026-10-04"],
    "groupSize": 2,
    "budgetTotal": 3000
  }
}
```

Optional `mode` values:

- `"chat"` (default): extract explicit updates from `message` and apply them to `brief`. Without a
  brief, the orchestrator's legacy `DEMO_BRIEF` is the baseline; the web workspace always sends a
  brief or uses `"start"`.
- `"plan"`: `brief` is required and is planned as submitted, without extraction.
- `"start"`: a blank conversation. `brief` is omitted and the destination, dates, traveller count and
  total budget must all be stated in `message`. Missing fields are reported in an `error` frame
  (for example “To start planning, include the start and end dates …”) and are never borrowed from a
  demo or a previous trip.

The response is `application/x-ndjson`, one JSON object per line:

- progress events with `type` `coordinator`, `agent_started`, `agent_completed` or `agent_failed`;
- a final `{ "type": "complete", "response": { "reply": "…", "plan": { … } } }`;
- or `{ "type": "error", "error": "…" }` with a user-facing message.

An invalid request body returns HTTP 400 JSON before streaming starts.

## `POST /api/hitl`

Contract: `HitlRequest` in `packages/shared/src/plan.ts`; implementation `applyHitl` in
`packages/orchestrator/src/hitl.ts`.

```json
{
  "plan": { "…": "current TripPlan" },
  "checkpointId": "select-stay-1",
  "action": "select_stay",
  "candidateId": "stay-1-2"
}
```

Checkpoint IDs come from `checkpointsFor`: `confirm-brief`, `select-<stayId>`, `escalation` and
`confirm-plan`. `action` is `approve`, `reject`, `defer` or `select_stay` (with `candidateId`). Stay selections re-query
the booking port and recompute costs rather than trusting client prices. The response is
`{ "plan": TripPlan }`; invalid input returns 400 and a decision that cannot be applied returns 422.

## `POST /api/places/search`

Implementation: `searchPlaces` in `apps/web/lib/google.ts` (requires the server `MAPS_API_KEY`).

```json
{ "text": "To-ji Temple", "destination": "Kyoto" }
```

`destination` is optional; omit it to look up a city itself. The response is
`{ "places": GooglePlace[] }`. The workspace only sends saved place names, explicit activity locations
or titles that are themselves place names (`apps/web/lib/place-query.ts`), never descriptive activity
text. Errors: 400 invalid input, 429 Google rate limit, 502 other upstream failures. Error messages do
not include the query or provider details.

## `POST /api/places/details`

```json
{ "placeId": "ChIJ…" }
```

Returns `{ "place": GooglePlace }`. Errors: 400 invalid input, 404 the place ID is no longer
available, 429 rate limit, 502 other upstream failures.

## `POST /api/routes/from-location`

```json
{ "latitude": -33.86, "longitude": 151.21, "placeId": "ChIJ…", "mode": "WALK" }
```

Returns a `RouteResult` (`status` `ok` with `durationMin` and `distanceMeters`, or `unavailable` with
`error`). The coordinate is sent only after the user asks for their location; it is not stored or
written into the plan. Invalid input returns 400.

## `POST /api/trip/preview-edit`

Contract: `EditRequest` and `EditPreview` in `apps/web/lib/trip-edit.ts`.

```json
{
  "plan": { "…": "current TripPlan" },
  "baseVersion": 3,
  "mode": "WALK",
  "operation": { "kind": "time", "id": "activity-id", "startTime": "10:00", "endTime": "12:00" }
}
```

`operation.kind` is `verify` (a day's routes), `move`, `time`, `place` or `undo`. The response is
`{ plan, baseVersion, routes, differences, blockers }`. It is a preview only: the client applies it
when the user confirms and rejects it if `baseVersion` no longer matches. Invalid edits return 400.

## Related contracts

- Chat request/response and progress events: `packages/shared/src/chat.ts`
- Trip brief, proposals and ports: `packages/shared/src/contracts.ts`, `packages/shared/src/ports.ts`
- Trip plan, HITL checkpoints and requests: `packages/shared/src/plan.ts`
- Specialist contract: `packages/shared/src/agent.ts`
