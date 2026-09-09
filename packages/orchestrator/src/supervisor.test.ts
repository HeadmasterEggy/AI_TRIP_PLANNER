import { FakeToolCallingModel } from "langchain";
import { describe, expect, it, vi } from "vitest";
import type { Agent, MemoryStore, ToolGateway, TripBrief } from "@trip/shared";
import { createSupervisorTools, dispatchWithSupervisor } from "./supervisor";

const brief: TripBrief = {
  tripId: "supervisor-test",
  userId: "user-1",
  destination: "Sydney",
  dates: ["2026-10-01", "2026-10-04"],
  groupSize: 2,
  budgetTotal: 1800,
};

const tools: ToolGateway = {
  maps: { route: vi.fn(async () => []), places: vi.fn(async () => []) },
  booking: { searchStays: vi.fn(async () => []), searchFlights: vi.fn(async () => []) },
};
const mem: MemoryStore = {
  getShortTerm: vi.fn(async () => []),
  appendShortTerm: vi.fn(async () => {}),
  getLongTerm: vi.fn(async () => []),
  setLongTerm: vi.fn(async () => {}),
  promote: vi.fn(async () => {}),
};
const itinerary: Agent = {
  name: "itinerary",
  label: "Day plan",
  run: vi.fn(async () => ({
    agent: "itinerary" as const,
    summary: "Three-day plan",
    items: [],
    assumptions: [],
    conflictsWith: [],
  })),
};
const context = { tripId: brief.tripId, round: 1, tools, mem };

describe("LangChain supervisor", () => {
  it("exposes specialists as schema-validated tools without accepting a replacement brief", async () => {
    const received: string[] = [];
    const [itineraryTool] = createSupervisorTools(
      { brief, agents: [itinerary], context },
      (proposal) => received.push(proposal.agent),
    );

    expect(itineraryTool!.name).toBe("ask_itinerary_specialist");
    await itineraryTool!.invoke({ objective: "Build the daily schedule" });
    expect(itinerary.run).toHaveBeenCalledWith(brief, context);
    expect(received).toEqual(["itinerary"]);
  });

  it("uses createAgent's tool loop and returns only the specialist selected by the model", async () => {
    const model = new FakeToolCallingModel({
      toolCalls: [
        [
          {
            name: "ask_itinerary_specialist",
            args: { objective: "Build the daily schedule" },
            id: "call-1",
          },
        ],
        [],
      ],
    });

    const proposals = await dispatchWithSupervisor({
      brief,
      agents: [itinerary],
      context,
      model,
    });
    expect(proposals.map((proposal) => proposal.agent)).toEqual(["itinerary"]);
  });
});
