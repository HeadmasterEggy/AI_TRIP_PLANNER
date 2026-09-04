// Owner: B — TransportAgent
// TODO(B): inter-city + local transport options, timing, price ranges.
//   - call `createToolGateway().maps.route(...)`
//   - expose a time/geo conflict-check helper the Orchestrator can call

import type { Agent, AgentProposal, TripBrief, AgentContext } from "@trip/shared";

export const transportAgent: Agent = {
  name: "transport",
  async run(brief: TripBrief, _ctx: AgentContext): Promise<AgentProposal> {
    return {
      agent: "transport",
      summary: `Getting around ${brief.destination} — STUB`,
      items: [{ kind: "transport", detail: "TODO(B): real transport options", estCost: 0 }],
      assumptions: ["STUB IMPLEMENTATION — replace in packages/agents/src/transport"],
      conflictsWith: [],
    };
  },
};
