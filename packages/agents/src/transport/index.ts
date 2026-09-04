// Owner: B — TransportAgent
// TODO(B): inter-city + local transport options, timing, price ranges.
//   - call `ctx.tools.maps.route(...)`
//   - expose a time/geo conflict-check helper the Orchestrator can call
//   - flesh out revise() for real (right now it just drops to a cheaper mode)

import type { Agent, AgentProposal, TripBrief, AgentContext, RevisionRequest } from "@trip/shared";

export const transportAgent: Agent = {
  name: "transport",
  label: "Getting around",

  async run(brief: TripBrief, ctx: AgentContext): Promise<AgentProposal> {
    // demo: flights + rail — deliberately pricey so the budget loop has
    // something to trim in round 2.
    const legs = await ctx.tools.maps.route({ from: "home", to: brief.destination });
    const railCost = legs.reduce((s, l) => s + l.priceUsd, 0);
    return {
      agent: "transport",
      summary: `Getting around ${brief.destination} — STUB (flights + rail)`,
      items: [
        { kind: "transport", detail: "TODO(B): real transport options", estCost: 1800 + railCost },
      ],
      assumptions: ["STUB IMPLEMENTATION — replace in packages/agents/src/transport"],
      conflictsWith: [],
    };
  },

  // Example revise(): a budget cut swaps the pricey option for a cheaper one.
  // TODO(B): real re-planning against req.constraints (mode, timing, comfort).
  async revise(
    brief: TripBrief,
    _ctx: AgentContext,
    req: RevisionRequest,
  ): Promise<AgentProposal> {
    const budgetCut = /budget/i.test(req.reason);
    return {
      agent: "transport",
      summary: budgetCut
        ? `Getting around ${brief.destination} — STUB (rail only, cheaper)`
        : `Getting around ${brief.destination} — STUB (revised)`,
      items: [
        {
          kind: "transport",
          detail: "TODO(B): cheaper transport plan",
          estCost: budgetCut ? 700 : 1800,
        },
      ],
      assumptions: [`revised for: ${req.reason}`],
      conflictsWith: [],
    };
  },
};
