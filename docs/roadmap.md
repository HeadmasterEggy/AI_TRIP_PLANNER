# Product roadmap

The near-term target is a reliable single-user workspace: discover places, edit a plan, confirm
decisions, save the trip and use it while travelling.

## Current sequence

Status as of 2026-09-17 (`codex/ui-improvements`; see `docs/ui-improvements.md`):

1. **Done** — LangChain Agent migration for all five specialists and revision routing (merged in
   PR #10).
2. **Done on the UI branch** — single-user UI: controlled filters, detail cards, review flow, HITL
   decisions and clear loading/error states.
3. **Partly done** — trips, chats, forms and HITL results are saved in browser storage with
   versioned migration; durable server-side storage of trips, preferences, chat turns and decisions
   is still open (`MemoryStore` is in process).
4. **Done on the UI branch** — editable timeline and Google map with route, time and budget checks.
5. **Open** — source imports, then real search and booking hand-offs with freshness labels (booking
   is still fictional mock data).
6. **Open** — consider on-trip mode after the save/edit/confirm/travel loop is stable.

## Definition of done for the MVP

- Users can enter destination, dates, travellers, budget and preferences.
- Recommendations are grounded and labelled with source/freshness assumptions.
- Users can inspect and edit real detail cards rather than raw JSON.
- Time, route and budget conflicts are visible after edits.
- HITL decisions are persisted, versioned and recoverable.
- Saved trips reopen after refresh.
- Provider failures degrade visibly and safely.
- Typecheck, tests, lint and production build pass before merge.

## Out of scope for now

Multi-user collaboration, social features, creator marketplace, in-app payments, refunds and booking
fulfilment should not block the single-user product.
