# Decisions

## DEC-001: Keep detailed architecture in `docs/`

- Status: Accepted
- Date: 2026-09-21
- Scope: Documentation

### Decision

Use `.ai/` for compact cross-agent state and decisions. Keep detailed architecture, API contracts,
development instructions, UI behavior, and product plans in the existing `docs/` files.

### Consequences

- There is one detailed source for each documentation topic.
- New agents can load the small `.ai/` index first and follow links only when needed.
- A change to runtime boundaries must update `docs/architecture.md`, not create a duplicate `.ai` copy.

## DEC-002: Use generic branch names

- Status: Accepted
- Date: 2026-09-21
- Scope: Git workflow

### Decision

Use `feature/`, `fix/`, `refactor/`, and `docs/` branch prefixes. Branch names must not contain the
name of the AI tool that created them.

## DEC-003: Separate production code and tests

- Status: Accepted
- Date: 2026-09-21
- Scope: Repository structure

### Decision

Keep web tests under `apps/web/tests` and package tests under each package's `tests` directory, while
mirroring source domains inside those directories. Test fixtures and setup belong with the tests.

### Consequences

- Production directories contain implementation code only.
- Package `tsconfig` files must include both `src` and `tests` so typechecking does not silently skip tests.
- Test imports use stable source aliases or explicit `src` paths instead of same-directory imports.

## DEC-004: SerpApi is not a universal travel backend

- Status: Accepted
- Date: 2026-09-21
- Scope: External providers

### Decision

Use SerpApi for current indicative hotel and flight search, Google Maps/Places/Routes/Time Zone for
map and place grounding, and add a dedicated weather provider for weather evidence. Add Aviationstack
or Travelpayouts only when operational flight status or affiliate/booking inventory is actually needed.

### Consequences

- One SerpApi key can serve hotel and flight searches, but not maps, weather, persistence, or booking.
- Live provider results require explicit source/freshness labels and AUD guards.
- API keys stay in environment variables, never in repository docs or fixtures.

## DEC-005: Use one structured source status for provider and degradation UI

- Status: Accepted
- Date: 2026-09-21
- Scope: `packages/shared`, orchestrator, agents, and web result cards

### Decision

Extend `AgentProposal.source` with a structured `kind` enum:
`live | estimated | mock | fallback | unavailable`. Keep `label` for the provider/source name and
`freshness` for the human-readable time and limitation disclosure.

### Consequences

- The degraded-visibility, provider-provenance, and result-card branches consume one contract.
- UI badges may branch on `source.kind`; they must not parse provider labels or log messages.
- `fallback` means a deterministic substitute was used; `unavailable` means the requested data was not
  available. Neither may be represented as a silent live result.
- The shared schema and every proposal constructor/test must be migrated together before the source kind
  is made required.

## DEC-006: Carry provider provenance from adapters to proposals

- Status: Accepted
- Date: 2026-09-21
- Scope: `packages/tools`, `packages/shared`, and specialist agents

### Decision

Booking adapters attach structured provider metadata to each hotel or flight candidate: `kind`, provider
name, optional query time, and any provider that was bypassed during a visible fallback. Specialist agents
derive `AgentProposal.source` from that metadata instead of inferring the provider from environment flags or
the `grounded` boolean.

### Consequences

- SerpApi live rates, Google Places estimates, and mock fixtures cannot accidentally share a label.
- A Google Places hotel returned after a SerpApi failure can disclose both the estimate and the failed source.
- Prices remain explicitly AUD at the adapter/assumption boundary; the metadata is not a booking or
  availability guarantee.
