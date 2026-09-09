# Development environment

## Local setup

```bash
corepack enable
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local`. Keep real credentials local and never commit them. Mock maps,
booking and planning fallbacks are enabled for development when provider keys are absent.

## Docker

```bash
docker compose up
```

The compose file provides the web app and mock API server. Redis is optional and commented out.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

Run focused packages with `pnpm --filter @trip/agents test` or
`pnpm --filter @trip/orchestrator test`.

Use `pnpm` only so the workspace lockfile stays consistent.
