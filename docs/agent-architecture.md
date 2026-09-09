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

## Migration rules

1. Use LangChain JS/TypeScript `createAgent`; do not add a Python runtime or another agent framework.
2. Keep prompts limited to durable role and safety instructions. Pass trip data as messages, context
   or typed tool results rather than serializing the entire workflow into a new prompt per call.
3. Keep LangGraph for durable state, retries, conflict validation, HITL interrupts, memory and plan
   persistence.
4. Preserve deterministic fallbacks and validate every model/tool boundary.
5. Keep the public `TripBrief`, `AgentProposal` and `TripPlan` contracts stable during migration.

## Migration status

Completed on `codex/langchain-agent-refactor`:

- `packages/orchestrator/src/supervisor.ts` provides a named supervisor and typed delegation tools.
- Destination and itinerary model generation use named agents with typed evidence tools and Zod
  structured responses.
- Legacy Agent adapters remain as a compatibility seam for tests and offline fallback.

Next:

- Migrate dining, transport and accommodation to named agents.
- Move revision requests into typed supervisor/delegation tools.
- Remove the legacy `Agent.run()` dispatch once all specialists and tests use the new path.

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
