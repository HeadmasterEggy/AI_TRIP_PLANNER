import type { TripBrief } from "@trip/shared";

// Used for the web app's first render and as a backward-compatible chat baseline
// when a client does not yet send its latest TripBrief.
export const DEMO_BRIEF: TripBrief = {
  tripId: "demo-trip",
  userId: "demo-user",
  destination: "Tokyo & Kyoto",
  dates: ["2026-06-15", "2026-06-22"],
  groupSize: 2,
  budgetTotal: 4000,
  nationality: undefined,
};
