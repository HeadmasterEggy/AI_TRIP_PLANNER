// Owner: D — DestinationGuideAgent
// TODO(D): attractions, local customs, safety, visa / vaccine by nationality.
//   Also fold in weather + packing advice here as an LLM sub-function
//   (no weather API — just ask the model "typical weather in <place> <month>,
//   what to pack"). Use `ctx.tools.maps.places(...)` for attractions.

import type { Agent, AgentProposal, TripBrief, AgentContext } from "@trip/shared";

export const destinationGuideAgent: Agent = {
  name: "destination-guide",
  label: "Destination guide",
  async run(brief: TripBrief, _ctx: AgentContext): Promise<AgentProposal> {
    return {
      agent: "destination-guide",
      summary: `Guidance for ${brief.destination}${
        brief.nationality ? ` (${brief.nationality} passport)` : ""
      } — STUB`,
      items: [
        { kind: "note", detail: "TODO(D): attractions / customs / safety" },
        { kind: "note", detail: "TODO(D): weather + packing advice" },
      ],
      assumptions: ["STUB IMPLEMENTATION — replace in packages/agents/src/destination-guide"],
      conflictsWith: [],
    };
  },
};
