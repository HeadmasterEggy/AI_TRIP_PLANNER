import type { TripBrief } from "@trip/shared";

// Used by the web app for first render until real chat parsing exists.
// TODO(A): replace with a TripBrief built from the chat + short-term memory.
export const DEMO_BRIEF: TripBrief = {
  tripId: "demo-trip",
  userId: "demo-user",
  destination: "Tokyo & Kyoto",
  dates: ["2026-06-15", "2026-06-22"],
  groupSize: 2,
  budgetTotal: 4000,
  travelStyle: "P",
  nationality: undefined,
};
