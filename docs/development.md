# Development environment

## Local setup

```bash
corepack enable              # uses pnpm 9.15.0 from packageManager
pnpm install
cp .env.example .env.local
pnpm dev                     # http://localhost:3000
```

Keep real credentials in `.env.local` and never commit them. Without provider keys the app still
runs: agent tools use in-process mock fixtures (`USE_MOCK_TOOLS=true`) and agents fall back to
deterministic output. The workspace map needs `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in the browser and
`MAPS_API_KEY` on the server for Places and Routes; without them the map shows a fallback and the
itinerary stays usable. Every variable is described in `.env.example`.

`pnpm mock-server` starts an optional stub HTTP server on port 4000. Current code does not call it
(`MOCK_API_URL` is not read); it is kept for adapter experiments and is started by Docker Compose.

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

Use `pnpm` only so the workspace lockfile stays consistent. If you run `pnpm build` while
`pnpm dev` is running, set `NEXT_DIST_DIR=.next-dev` for the dev server so the two do not share the
`.next` output directory.
