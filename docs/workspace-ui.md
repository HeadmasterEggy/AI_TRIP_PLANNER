# Workspace UI

The web app (`apps/web`) is a single-user planning workspace. This document describes how it behaves
now. Implementation history and browser acceptance for each phase are in the
[session logs](session-logs/README.md).

## Layout

| Area                    | Content                                                                                                                        | Implementation                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Sidebar                 | Logo, New chat, search, Chats and Trips history with counts, Saved trips, Language, Local account                              | `WorkspaceSidebar`, `BrandMark`, `icons.tsx` |
| Top bar                 | Destination with days, travellers and budget (real plan values only); Preferences; Trip with pending-decision count, rightmost | `Workspace`                                  |
| Chat                    | Conversation, planning progress, decision cards; a starter prompt in a blank chat                                              | `ChatPanel`                                  |
| Map                     | Only the map, numbered markers, a place list, map status, View all places and Show my location                                 | `TripMapCanvas`, `TripMap`                   |
| Your Trip drawer        | Budget; Overview (sections, stay choices, confirmations); Timeline & routes (editor); Review plan and Save trip                | `Drawer`, `TripPanel`, `TripEditor`          |
| Trip Preferences drawer | Structured brief form: destination, dates, travellers, budget, nationality, accommodation                                      | `Drawer`, `FiltersPanel`                     |

- **Sidebar.**
  - Expands to 240 px or collapses to a 64 px icon rail. The toggle uses `aria-expanded`, and the
    preference is saved in the catalog layout.
  - Collapsed icons keep `aria-label`, a tooltip and focus styles. Search, Chats and Trips expand the
    sidebar.
  - The current section is shown by background, bold text, a filled icon and a bar, plus
    `aria-current`. History supports search, select, rename and delete.
  - The logo is `apps/web/public/brand/ai-trip-planner-logo.svg`, referenced by URL. Its alt text is
    empty next to the product name and “AI Trip Planner” when shown alone.
- **Drawers.**
  - Preferences, Your Trip and the narrow-screen navigation are overlay drawers below the top bar.
    They never cover the logo or top-bar buttons, and the chat and map keep their width.
  - `Drawer` provides `role="dialog"`, `aria-modal`, `aria-hidden` and `inert` when closed, focus on
    the close button, a Tab loop, Escape (nested edit previews and native dialogs first) and focus
    return to the trigger.
  - Only one drawer is open at a time. Closed drawers are translated fully outside the viewport, and
    the shell uses `overflow: clip` so they cannot be scrolled into view.
  - The Trip drawer is `min(max(62vw, 560px), 100% - 24px)` wide. Animations are 240 ms and respect
    `prefers-reduced-motion`.
- **Narrow screens (≤1000 px).**
  - The top bar keeps the menu, summary, Preferences and Trip on one row, with a Chat/Map switch below.
  - Navigation opens as a drawer, and Preferences and Trip span the content width.
  - At ≤520 px the top-bar buttons show icons only but keep their accessible names.

## Conversations, trips and storage

- **Start state.**
  - The page always opens on a blank planning entry and never loads a demo plan or reopens the last
    trip.
  - An unfinished blank chat (form and input) is continued. Otherwise an untouched blank chat is
    reused, so refreshing does not add empty chats.
  - Saved chats and trips open only when chosen from the sidebar or Saved trips.
- **New chat** creates an independent conversation with an empty form, input and map. A trip record is
  created and linked (`tripId`) only when a plan is produced; the chat title then becomes the
  destination and dates.
- **Starting to plan.**
  - Submitting Preferences sends `mode: "plan"` with the brief.
  - A first chat message sends `mode: "start"`, and the server reports any missing destination,
    dates, travellers or budget instead of borrowing values.
  - The blank form's minimum rating defaults to `0` (no minimum).
- **Requests.**
  - `Workspace` owns chat, plan and decision requests. Failures keep the current plan and offer retry.
  - Switching chat or trip, or New chat, first flushes the pending autosave, then aborts in-flight
    requests and clears progress, errors, selection and map routes. Late responses are ignored.
- **Storage.**
  - Everything is saved in the browser only, with a debounced autosave state in the sidebar.
  - The catalog (`trip-workspace-catalog-v3`) keeps conversations and trips separately, with stable
    links and an optional conversation `draft`. Legacy version 1 and 2 snapshots are migrated.
  - Corrupt data is never overwritten automatically, and layout fields fall back to defaults instead
    of making history unreadable.
  - When storage is full or unavailable, the plan stays in memory with a visible retry.
  - Saved trips are independent snapshots, and “Restore last workspace” lives in the Saved trips
    dialog.

## Decisions and review

- HITL checkpoints (`confirm-brief`, `select-<stayId>`, `escalation`, `confirm-plan`) render in chat,
  in the Trip drawer and in Review plan.
- Actions are approve, reject (opens Preferences), defer (still pending) and select stay. The final
  confirmation is blocked until the other decisions are resolved.
- Changing a stay or replanning resets the confirmations that depend on it, and accepted conflicts stay
  visible.
- The client is not a source of supplier facts: stay selections re-query the booking port and totals
  are recomputed from proposal items. Booking data is fictional and labelled as simulated.

## Map and places

- **Place lookups** (`useTripPlaces`, `lib/place-query.ts`):
  - A lookup uses, in order, a saved `placeId`, the activity's `location`, or a title that is itself a
    place name.
  - Descriptive activity text and mock placeholders (“Mock attraction near …”) are never sent to
    Places, and nothing is invented.
  - Destination cities (split on `&`) are looked up separately for framing.
  - Results are applied one by one and stay in memory; provider details and coordinates are not
    persisted.
- **Failure handling.**
  - Activities without a usable name or a Google match are “no confirmed place yet”; the timeline
    shows “Location to be confirmed”.
  - Rate limits, timeouts and outages are retryable, and Retry places repeats only those lookups.
  - The map shows a compact status; located markers stay visible and there is no blocking error.
- **Framing** (`lib/map-view.ts`):
  - The map frames the destination first: zoom 12 for one city, or bounds capped at zoom 12 for
    several, widened as cities resolve.
  - Once markers exist it fits them once, capped at zoom 15 (zoom 14 for a single place).
  - It reframes only on a trip or destination change or View all places. Drag, zoom and Show my
    location count as user moves and are never taken back.
  - No Google map is created before there is somewhere to show; a neutral placeholder is shown
    instead. Container resizes keep the centre.
- **Selection.** Selecting a marker or list item selects the activity in the timeline and jumps to its
  day, and the reverse also works.
- **Location.** Show my location runs only on request and handles denied, unavailable, timeout and
  unsupported cases. The position stays in component memory and is never saved or written into the
  plan. Route from my location requests a verified duration and distance for the selected place.
- **Controls.** Google's map-type, Street View and fullscreen controls are disabled so the map stays
  below the top bar.

## Timeline editing

The Timeline & routes tab edits activities through `POST /api/trip/preview-edit`. Previews are
deterministic and make no LLM calls.

- Activities receive stable IDs once, retained on reorder and restore. `editVersion` is independent of
  the orchestrator round, and a preview applies only if its base version still matches.
- Moves, time changes and place replacements preserve activity duration. Following activities start
  at the later of their original start or previous end + route duration + 15 minutes. Empty target
  days start at 09:00 local, and moves stay within the same lodging destination segment.
- An unknown route blocks automatic shifting (users can adjust time or mode). Overflow beyond the day
  blocks apply. Fixed transport and stays are read-only, and overlaps stay visible in review.
- Replacing a place marks the activity price for verification. Route fares are separate estimates,
  never added to transport twice, and an unknown fare is not zero.
- Edits invalidate itinerary and final confirmation and regenerate conflicts, keeping unaffected brief
  and hotel decisions. Undo revalidates instead of restoring old approvals. Chat replanning replaces
  manual activities.
- Routes use real local departure times from the Google Time Zone API; ambiguous or nonexistent DST
  times are rejected. Transit queries respect Google's supported departure window.

## Google Maps configuration

| Variable                          | Used by                                                                   |
| --------------------------------- | ------------------------------------------------------------------------- |
| `MAPS_API_KEY`                    | Server: Places search and details, Routes, Time Zone                      |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Browser: Maps JavaScript API                                              |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`  | Browser: vector map ID for advanced markers (falls back to `DEMO_MAP_ID`) |

Restrict the browser key by HTTP referrer and the server key by API. Map loading never delays the
first render; without a browser key the map shows a fallback and the itinerary stays usable.

## Out of scope

Real booking and payments, multi-user collaboration and on-trip mode. Mock places and bookings must
never be presented as real supplier data.

## Verification

`pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` must pass. Component tests cover drawers,
blank start, history restore, sidebar collapse, place lookup failures, request races and storage
recovery; `lib/map-view.test.ts` and `lib/place-query.test.ts` cover framing and lookup rules. Live
Google checks are reported separately in session logs and are never inferred from mocks. The
historical P0–P3 plan is in [`archive/p3-implementation.md`](archive/p3-implementation.md) and the
session logs.
