# Product roadmap

The near-term target is a reliable single-user workspace: discover places, edit a plan, confirm
decisions, save the trip and use it while travelling.

## Current sequence

1. Finish the LangChain Agent migration for all five specialists and revision routing.
2. Complete the single-user UI: controlled filters, detail cards, review flow and clear loading/error states.
3. Persist trips, preferences, chat turns and HITL decisions in durable storage.
4. Add editable timeline/map interactions with route, time and budget checks.
5. Add source imports, then real search and booking hand-offs with freshness labels.
6. Consider on-trip mode after the save/edit/confirm/travel loop is stable.

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
