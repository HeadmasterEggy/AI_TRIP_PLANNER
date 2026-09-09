# Agent architecture and migration

## Runtime model

```text
user message
  -> supervisor agent (`createAgent`)
     -> typed specialist tools / agents
        -> destination, itinerary, dining, transport, accommodation
     -> validated proposals
  -> LangGraph state, conflict checks, HITL and persistence
```

An agent owns a durable role definition: model, `name`, `systemPrompt`, tools and output schema.
The supervisor chooses which specialist tools to call. It must not rewrite the TripBrief or invent
facts. Tool inputs are typed and specialist outputs are validated with Zod.

## UML diagrams

The design-time UML set remains under [`docs/diagrams/`](diagrams/):

| Diagram | File |
| --- | --- |
| Architecture spine | [`class-1-spine.svg`](diagrams/class-1-spine.svg) |
| Domain model | [`class-2-domain.svg`](diagrams/class-2-domain.svg) |
| Agents and orchestration | [`class-3-agents.svg`](diagrams/class-3-agents.svg) |
| Ports and adapters | [`class-4-ports.svg`](diagrams/class-4-ports.svg) |
| Class model with use cases | [`class-5-with-use-cases.svg`](diagrams/class-5-with-use-cases.svg) |
| Combined architecture map | [`combined-architecture-map.svg`](diagrams/combined-architecture-map.svg) |
| Use-case diagram | [`use-case-diagram.svg`](diagrams/use-case-diagram.svg) |

The explanatory model and relationship notes are in [`docs/class-diagram.md`](class-diagram.md).

## Migration rules

1. Use LangChain JS/TypeScript `createAgent`; do not add a Python runtime or another agent framework.
2. Keep prompts limited to durable role and safety instructions. Pass trip data as messages, context
   or typed tool results rather than serializing the entire workflow into a new prompt per call.
3. Keep LangGraph for durable state, retries, conflict validation, HITL interrupts, memory and plan
   persistence.
4. Preserve deterministic fallbacks and validate every model/tool boundary.
5. Keep the public `TripBrief`, `AgentProposal` and `TripPlan` contracts stable during migration.

## Migration status

Implemented on `codex/langchain-agent-refactor` (not yet merged into `main`):

- `packages/orchestrator/src/supervisor.ts` provides a named supervisor and typed delegation tools.
- Destination, itinerary, dining, transport and accommodation model generation use named agents
  with typed evidence/calculator tools and Zod structured responses.
- Revision requests use immutable, targeted supervisor delegation tools.
- Legacy Agent adapters remain as a compatibility seam for tests and offline fallback.

Next before merge:

- Remove the legacy `Agent.run()` dispatch once all specialists and tests use the new path.
- Add supervisor checkpoint persistence and fine-grained UI tool-loop streaming.

## Contracts

Shared contracts live in `packages/shared/src/`:

- `TripBrief`: destination, dates, group size, budget and nationality.
- `AgentProposal`: a specialist summary, plan items, assumptions and conflicts.
- `RevisionRequest`: a targeted constraint for a specialist revision.
- `TripPlan`: the validated plan shown by the UI.
- `ToolGateway` and `MemoryStore`: injectable ports for tools and persistence.

The workflow should continue to validate proposals before aggregation and persistence.

## Specialist responsibilities

| Agent | Responsibility |
| --- | --- |
| Itinerary | Grounded day-by-day schedule, pacing and route feasibility |
| Destination | Attractions, customs, safety, entry/health checks and packing context |
| Dining | Grounded venues, dietary preferences and meal budget |
| Transport | Flights, inter-city/local routes and timing |
| Accommodation | Lodging search, comparison and room allocation |
