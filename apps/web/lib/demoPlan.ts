// Owner: E — the home page always plans the same DEMO_BRIEF, so computing it
// per request re-pays ~14s of model latency for a byte-identical result.
//
// The promise (not the resolved plan) is memoised, which also collapses
// concurrent first hits into one negotiation instead of N. Work starts only
// when a request asks for the demo, avoiding model calls during build imports.
//
// In `next dev` the module is re-evaluated when its dependencies change, so
// editing an agent naturally invalidates this — no manual cache busting.
import { runOrchestrator, DEMO_BRIEF } from "@trip/orchestrator";
import type { TripPlan } from "@trip/shared";

const TTL_MS = 10 * 60 * 1000;

let inFlight: Promise<TripPlan> | undefined;
let computedAt = 0;

export function getDemoPlan(): Promise<TripPlan> {
  if (!inFlight || Date.now() - computedAt >= TTL_MS) {
    computedAt = Date.now();
    inFlight = runOrchestrator(DEMO_BRIEF).catch((error: unknown) => {
      // Never cache a failure: the next request should retry.
      inFlight = undefined;
      throw error;
    });
  }
  return inFlight;
}
