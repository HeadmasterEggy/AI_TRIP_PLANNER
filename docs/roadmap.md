# Product roadmap

The near-term target is a reliable single-user workspace: discover places, edit a plan, confirm
decisions, save the trip and use it while travelling.

## Current sequence

Status as of 2026-09-21 (`main`; see [workspace UI](workspace-ui.md) and the
[product closure TODO](todo-product-closure.md)):

1. **Done** — LangChain Agent migration for all five specialists and revision routing (merged in
   PR #10).
2. **Done on `main`** — single-user UI: controlled filters, detail cards, review flow, HITL
   decisions and clear loading/error states.
3. **Partly done** — trips, chats, forms and HITL results are saved in browser storage with
   versioned migration; durable server-side storage of trips, preferences, chat turns and decisions
   is still open (`MemoryStore` is in process).
4. **Done on `main`** — editable timeline and Google map with route, time and budget checks.
5. **Partly done** — real Google Places grounding and SerpApi hotel/flight search are implemented behind
   environment flags; live smoke verification, source labels and visible degradation remain.
6. **P0 open** — visible specialist/provider degradation and durable storage for chats, preferences,
   trips, decisions and provider usage/cache. The detailed order is in the product closure TODO.
7. **P1 open** — weather evidence and short-range forecast support, with the 14-day forecast boundary.
8. **P1 open** — BeautifulUI-inspired model-thinking/answer states and the remaining workspace visual polish.
9. **P2 later** — consider on-trip mode after the save/edit/confirm/travel loop is stable.

## Definition of done for the MVP

- Users can enter destination, dates, travellers, budget and preferences.
- Recommendations are grounded and labelled with source/freshness assumptions, including real, estimated
  and mock provider states.
- Users can inspect and edit real detail cards rather than raw JSON.
- Time, route and budget conflicts are visible after edits.
- HITL decisions are persisted, versioned and recoverable.
- Saved trips reopen after refresh.
- Provider failures degrade visibly and safely without silently substituting fictional prices.
- Typecheck, tests, lint and production build pass before merge.

## Out of scope for now

Multi-user collaboration, social features, creator marketplace, in-app payments, refunds and booking
fulfilment should not block the single-user product.
