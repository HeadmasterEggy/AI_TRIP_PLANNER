# LangGraph orchestration

The orchestrator is a deterministic LangGraph workflow. LangGraph controls the state transitions;
the five existing specialist modules implement the framework-neutral `Specialist` contract. This keeps
budget policy and human checkpoints predictable while still allowing individual nodes to call an
LLM later.

```mermaid
flowchart LR
    S((START)) --> D[dispatch_specialists]
    D --> C[detect_conflicts]
    C -->|conflicts and round < K| R[revise_conflicts]
    R --> C
    C -->|converged or round = K| B[build_plan]
    B --> E((END))
```

## State

The graph carries `brief`, `round`, `proposals`, `conflicts`, and the final `plan`. Public input and
output still use the existing `@trip/shared` Zod contracts, so the web route and specialist agents
do not need API changes. Shared Zod v3 values are validated at the graph boundaries; the graph's
internal `StateSchema` uses its local Zod v4 dependency.

## Execution rules

- `dispatch_specialists` runs all registered specialists through `invoke({ brief, context })` with `Promise.all`.
- `detect_conflicts` combines budget overruns, structured cross-agent schedule overlaps, and
  geography conflicts reported after itinerary route-duration checks.
- `revise_conflicts` runs only targeted specialists with `supportsRevision`, passing an immutable
  `revision` request through the same `invoke` entry point, also with `Promise.all`.
- A conditional edge repeats detection/revision up to `maxRounds` (default `3`).
- `build_plan` preserves the existing cost roll-up and HITL/escalation behavior.
- Specialists, tools, memory, and the round limit are injectable through `OrchestratorOptions` for tests.

This is intentionally a workflow rather than an unconstrained supervisor agent: the control path,
budget red lines, and stopping condition should not depend on a model improvising the next step.
Before graph execution, `runTripChat` uses LangChain structured output to extract only explicit
`TripBrief` updates when an Anthropic key is available, with a deterministic local fallback. Inside
the graph, the itinerary node can use DeepSeek V4 Flash through LangChain's OpenAI-compatible
adapter; schema, budget, schedule and route checks gate its output before aggregation.

## Verification

```bash
pnpm --filter @trip/orchestrator test
pnpm typecheck
pnpm build
```

The workflow tests verify the named graph topology, stable `TripPlan` output, concurrent targeted
revisions, round-limit escalation, and invalid configuration handling.
