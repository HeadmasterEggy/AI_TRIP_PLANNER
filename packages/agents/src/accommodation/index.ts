// Owner: C — AccommodationAgent
// TODO(C): lodging search + comparison, individual vs group room allocation.
//   - call `createToolGateway().booking.searchStays(...)`
//   - emit a `needs_you` HITL item when the user must pick a hotel

import type { Agent, AgentProposal, TripBrief, AgentContext } from "@trip/shared";

export const accommodationAgent: Agent = {
  name: "accommodation",
  async run(brief: TripBrief, _ctx: AgentContext): Promise<AgentProposal> {
    return {
      agent: "accommodation",
      summary: `Stay for ${brief.groupSize} in ${brief.destination} — STUB`,
      items: [{ kind: "hotel", detail: "TODO(C): real lodging options", estCost: 0 }],
      assumptions: ["STUB IMPLEMENTATION — replace in packages/agents/src/accommodation"],
      conflictsWith: [],
    };
  },
};
