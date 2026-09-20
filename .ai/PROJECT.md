# Project: AI_TRIP_PLANNER

## One-sentence description

AI_TRIP_PLANNER is a single-user travel workspace that turns trip requirements into a grounded,
constraint-aware plan with specialist agents, editable itinerary details, provider evidence, and
human-in-the-loop decisions.

## Core user flow

1. The traveller provides destination, dates, group, budget, and preferences in chat or the form.
2. Chat extraction produces only explicit brief updates.
3. The orchestrator delegates to itinerary, transport, accommodation, destination, and dining agents.
4. Contracts, budget, schedule, route, and conflict checks validate the result.
5. The workspace shows the plan, sources, warnings, map details, edits, and HITL decisions.

## Current scope

- Next.js workspace UI and API routes in `apps/web`.
- LangGraph orchestration, LangChain specialist agents, shared Zod contracts, provider tools, and
  memory adapters in `packages/`.
- Mock-first local development, with Google Maps/Places/Routes/Time Zone and SerpApi behind environment
  flags for real traffic.
- AUD as the product currency for travel prices.

## Important boundaries

- The product is not a booking or payment system.
- Real provider results must be labelled with source, freshness, and estimate/availability limits.
- Provider failure must be visible; fictional prices must not silently replace failed live results.
- Durable server-side storage, weather evidence, and richer result/progress UI are still follow-up work.
