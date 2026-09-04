// Owner: B — ItineraryPlannerAgent
// TODO(B): build a real day-by-day plan.
//   - J/P pacing (tight vs flexible), opening hours, holiday closures, activity ordering
//   - use `import { createToolGateway } from "@trip/tools"` for places/routes
//   - use `import { memory } from "@trip/services"` for confirmed preferences
//   - on conflict, implement `revise()` (see @trip/shared RevisionRequest)

import type { Agent, AgentProposal, TripBrief, AgentContext } from "@trip/shared";

export const itineraryAgent: Agent = {
  name: "itinerary",
  async run(brief: TripBrief, _ctx: AgentContext): Promise<AgentProposal> {
    const days = daySpan(brief.dates);
    return {
      agent: "itinerary",
      summary: `${days}-day outline for ${brief.destination} — STUB`,
      items: [{ kind: "activity", detail: "TODO(B): real day plan goes here", day: 1, estCost: 0 }],
      assumptions: ["STUB IMPLEMENTATION — replace in packages/agents/src/itinerary"],
      conflictsWith: [],
    };
  },
};

function daySpan([start, end]: [string, string]): number {
  return Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000));
}
