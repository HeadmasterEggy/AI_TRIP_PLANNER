// @trip/agents — the specialist agent registry the Orchestrator dispatches to.
// Each agent lives in its own folder; owners: B / C / D (see folder headers).
// This file is a stable registry — avoid churn here so nobody blocks each other.

import type { Agent } from "@trip/shared";
import { itineraryAgent } from "./itinerary";
import { transportAgent } from "./transport";
import { accommodationAgent } from "./accommodation";
import { destinationGuideAgent } from "./destination-guide";
import { diningAgent } from "./dining";

export const allAgents: Agent[] = [
  itineraryAgent,
  transportAgent,
  accommodationAgent,
  destinationGuideAgent,
  diningAgent,
];

export {
  itineraryAgent,
  createItineraryAgent,
  type ItineraryAgentOptions,
  type ItineraryDraft,
  type ItineraryGenerator,
} from "./itinerary";
export { transportAgent, accommodationAgent, destinationGuideAgent, diningAgent };
