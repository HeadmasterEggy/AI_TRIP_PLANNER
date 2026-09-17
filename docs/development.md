# Development environment

## Prerequisites

- Node.js 22 or newer
- pnpm 9.15.0, pinned by `packageManager`; `corepack enable` selects it
- API keys are optional for local development: mock tools and deterministic fallbacks are enabled by
  default.

## Local setup

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev                     # http://localhost:3000
```

Keep real credentials in `.env.local` and never commit them. Use `pnpm` only so the workspace
lockfile stays consistent.

## Environment variables

Every variable is described in `.env.example`. The important ones:

| Setting                                                             | Purpose                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GPT_API_KEY`                                                       | Structured extraction of trip-brief updates from chat. Without it a local rule parser is used.                                                                                                            |
| `DEEPSEEK_API_KEY`                                                  | All five specialists, the supervisor and chat replies. Without it agents use deterministic fallbacks.                                                                                                     |
| `USE_MOCK_TOOLS=true` (default)                                     | In-process map and booking fixtures; no external calls.                                                                                                                                                   |
| `USE_MOCK_TOOLS=false`                                              | Real map adapters chosen by `MAPS_PROVIDER` (`google` or `osm`). If unset, Google is used when `MAPS_API_KEY` is set, otherwise OpenStreetMap; `.env.example` sets `osm`. Booking always stays mock data. |
| `OSM_USER_AGENT`                                                    | Required contact string for Nominatim. Replace the `contact@example.com` placeholder before real traffic or you may be rate limited.                                                                      |
| `MAPS_API_KEY`                                                      | Server-side Google Places, Routes and Time Zone for the workspace map and edit previews.                                                                                                                  |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Browser Google Maps JavaScript map. Without them the workspace shows a map fallback and the itinerary stays usable.                                                                                       |

Google key restrictions and map behaviour are described in [workspace UI](workspace-ui.md#google-maps-configuration).
Model routing and fallbacks are described in [architecture](architecture.md#agents-and-models).

## Mock server

`pnpm mock-server` starts an optional stub HTTP server on port 4000. The app does not need it: mock
tools run in process, and `MOCK_API_URL` is not read by current code. It is kept for adapter
experiments and is started by Docker Compose.

## Docker

```bash
docker compose up
```

The compose file starts the web app on port 3000 (reading `.env.local`) and the stub mock server on
port 4000. Redis is optional and commented out.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

CI (`.github/workflows/ci.yml`) runs the same four commands on Node 22 for pull requests and pushes
to `main`.

Run focused packages with `pnpm --filter @trip/agents test`, `pnpm --filter @trip/orchestrator test`
or `pnpm --filter @trip/web test`. The web test script sets `NODE_OPTIONS` with POSIX shell syntax;
on Windows, run it from WSL or Git Bash.

If you run `pnpm build` while `pnpm dev` is running, start the dev server with
`NEXT_DIST_DIR=.next-dev` so the two do not share the `.next` output directory.
