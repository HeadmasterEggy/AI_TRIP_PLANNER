// Owner: D — DiningAgent
// TODO(D): cuisine recommendations that respect dietary restrictions
//   (halal / vegetarian / allergies from brief.interests or long-term memory).

import type { Agent, AgentProposal, TripBrief, AgentContext } from "@trip/shared";

export const diningAgent: Agent = {
  name: "dining",
  async run(brief: TripBrief, _ctx: AgentContext): Promise<AgentProposal> {
    return {
      agent: "dining",
      summary: `Food picks for ${brief.destination} — STUB`,
      items: [{ kind: "meal", detail: "TODO(D): real dining recommendations", estCost: 0 }],
      assumptions: ["STUB IMPLEMENTATION — replace in packages/agents/src/dining"],
      conflictsWith: [],
    };
  },
};
