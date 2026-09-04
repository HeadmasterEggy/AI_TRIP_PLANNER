// Owner: C — AccommodationAgent
// TODO(C): lodging search + comparison, individual vs group room allocation.
//   - call `ctx.tools.booking.searchStays(...)`
//   - emit a `needs_you` HITL item when the user must pick a hotel
//   - flesh out revise() for real (right now it just drops to a cheaper tier)

import type { Agent, AgentProposal, TripBrief, AgentContext, RevisionRequest } from "@trip/shared";

export const accommodationAgent: Agent = {
  name: "accommodation",
  label: "Stay",

  async run(brief: TripBrief, _ctx: AgentContext): Promise<AgentProposal> {
    return {
      agent: "accommodation",
      summary: `Stay for ${brief.groupSize} in ${brief.destination} — STUB`,
      items: [{ kind: "hotel", detail: "TODO(C): real lodging options", estCost: 2600 }],
      assumptions: ["STUB IMPLEMENTATION — replace in packages/agents/src/accommodation"],
      conflictsWith: [],
    };
  },

  // TODO(C): real re-planning — cheaper room tier / further-out area / fewer nights.
  async revise(
    brief: TripBrief,
    _ctx: AgentContext,
    req: RevisionRequest,
  ): Promise<AgentProposal> {
    const budgetCut = /budget/i.test(req.reason);
    return {
      agent: "accommodation",
      summary: `Stay for ${brief.groupSize} in ${brief.destination} — STUB (${
        budgetCut ? "budget tier" : "revised"
      })`,
      items: [
        {
          kind: "hotel",
          detail: "TODO(C): cheaper lodging",
          estCost: budgetCut ? 1700 : 2600,
        },
      ],
      assumptions: [`revised for: ${req.reason}`],
      conflictsWith: [],
    };
  },
};
