# Multi-panel workspace and interactive map follow-up

## Session summary

- Author: Codex
- Date: 2026-09-17
- Modules: `apps/web/components`, `apps/web/lib`, `apps/web/app/globals.css`
- Goal: Move the map into the right-hand planning workspace, make preferences and trip panels collapsible/resizable, add local Chats/Trips history, and add user-triggered geolocation.

## What changed

- Replaced the separate P3 screen with a responsive workspace: history, preferences, chat, map/timeline, and Your Trip. Preferences and Your Trip collapse, restore, resize by pointer or keyboard, and persist their layout.
- Added a version 3 local catalog for multiple conversations and trips. It migrates version 1/2 snapshots, keeps stable linkage and active records, supports search/rename/delete, and preserves corrupt legacy data instead of replacing it.
- Added debounced `Saving…` / `Saved locally` / `Save failed` feedback. Trip or conversation switches abort active network work before restoring a snapshot.
- Google Places now resolves named activities without saved place IDs into runtime-only map candidates. Provider details and inferred coordinates are not written into the plan or local catalog.
- Map markers are numbered and selectable. Automatic fit runs only for the first valid set; an explicit View all places action restores the overview.
- Added click-only browser geolocation with success, denied, timeout, unavailable and unsupported states. The location uses a separate blue marker, centers once, and is never persisted or used to modify the trip.
- After locating, the user can explicitly request a Google Routes estimate from the in-memory position to the selected activity; verified duration and distance are displayed without changing the plan.
- Added empty and map-failure fallbacks so the itinerary remains readable and editable without Google Maps.

## Verification

- `pnpm typecheck`: passed, 6 packages.
- `pnpm lint`: passed with no ESLint warnings or errors.
- `pnpm test`: passed, including 48 web tests plus the existing agent, orchestrator and tools suites.
- `pnpm build`: passed; Next.js generated all application and API routes.
- Live browser: Google Places converted the current activity into a map marker and the Maps JavaScript API rendered the map, View all places, and Show my location controls.
- Live Routes smoke: a user-location-shaped coordinate near Tokyo Tower returned a verified 12-minute, 755-metre walking route. No device position was requested or stored for this check.
- Browser layout: at 1660 px the document width stayed below the viewport. Both side panels collapsed, survived reload in the collapsed state, and reopened successfully.
- Geolocation permission was not requested during smoke testing; all permission/error paths were exercised with deterministic browser API tests so the user was not prompted for precise location during development.

## Boundaries

- Automatically matched activities remain explicitly unverified until the user chooses a Google place.
- Simulated hotels are not mapped or converted into real suppliers.
- Precise device position stays in component memory only. No database, account, booking, payment or production deployment was added.
