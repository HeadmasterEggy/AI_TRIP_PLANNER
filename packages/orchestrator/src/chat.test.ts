import { describe, expect, it, vi } from "vitest";
import type { MemoryStore, Specialist, ToolGateway, TripBrief } from "@trip/shared";
import {
  applyBriefPatch,
  extractBriefPatchLocally,
  replyPrompt,
  runTripChat,
  type BriefExtractor,
  type ReplyGenerator,
} from "./chat";

const brief: TripBrief = {
  tripId: "chat-test",
  userId: "chat-user",
  destination: "Tokyo",
  dates: ["2026-06-15", "2026-06-22"],
  groupSize: 2,
  budgetTotal: 4000,
};

describe("local TripBrief extraction", () => {
  it("extracts explicit English trip fields without a model", () => {
    expect(
      extractBriefPatchLocally(
        "Plan a trip to Sydney for 3 people, 2026-10-01 to 2026-10-05, budget $2,500",
      ),
    ).toEqual({
      destination: "Sydney",
      dates: ["2026-10-01", "2026-10-05"],
      groupSize: 3,
      budgetTotal: 2500,
    });
  });

  it("extracts explicit Chinese updates", () => {
    expect(
      extractBriefPatchLocally(
        "2026-10-01 至 2026-10-05 去悉尼，预算改成 3000，两个人，澳大利亚护照",
      ),
    ).toEqual({
      destination: "悉尼",
      dates: ["2026-10-01", "2026-10-05"],
      groupSize: 2,
      budgetTotal: 3000,
      nationality: "澳大利亚",
    });
  });

  it("supports the concise format shown in the chat placeholder", () => {
    expect(
      extractBriefPatchLocally("Sydney, 2026-10-01 to 2026-10-05, 2 people, budget $3000."),
    ).toMatchObject({ destination: "Sydney", groupSize: 2, budgetTotal: 3000 });
  });

  it("recognises a destination introduced with visit", () => {
    expect(extractBriefPatchLocally("I want to visit Lisbon")).toEqual({ destination: "Lisbon" });
  });

  it("supports incremental destination and budget wording", () => {
    expect(
      extractBriefPatchLocally("Change the destination to Sydney and budget to $3000"),
    ).toEqual({ destination: "Sydney", budgetTotal: 3000 });
  });

  it("keeps unmentioned fields and rejects impossible date ranges", () => {
    expect(applyBriefPatch(brief, { budgetTotal: 3000 }, brief.tripId)).toEqual({
      ...brief,
      budgetTotal: 3000,
    });
    expect(() =>
      applyBriefPatch(brief, { dates: ["2026-02-30", "2026-03-05"] }, brief.tripId),
    ).toThrow("Enter a real date");
    expect(() =>
      applyBriefPatch(brief, { dates: ["2026-10-05", "2026-10-01"] }, brief.tripId),
    ).toThrow("End date must follow start date");
  });
});

describe("trip chat workflow", () => {
  it("applies an injected structured extractor, records both turns and replans", async () => {
    const extractor: BriefExtractor = {
      extract: vi.fn(async () => ({ destination: "Melbourne", budgetTotal: 5000 })),
    };
    const replyGenerator: ReplyGenerator = {
      generate: vi.fn(
        async () =>
          "Melbourne sounds like a great fit. I’ve updated the plan and kept the current budget in view.",
      ),
    };
    const turns: Array<{ role: string; content: string }> = [];
    const mem: MemoryStore = {
      getShortTerm: vi.fn(async () => []),
      appendShortTerm: vi.fn(async (_tripId, turn) => {
        turns.push(turn);
      }),
      getLongTerm: vi.fn(async () => []),
      setLongTerm: vi.fn(async () => {}),
      promote: vi.fn(async () => {}),
    };
    const tools: ToolGateway = {
      maps: { route: vi.fn(async () => []), places: vi.fn(async () => []) },
      booking: { searchStays: vi.fn(async () => []), searchFlights: vi.fn(async () => []) },
    };
    const itinerary: Specialist = {
      name: "itinerary",
      label: "Day plan",
      async invoke({ brief: updated }) {
        return {
          agent: "itinerary",
          summary: `Plan for ${updated.destination}`,
          items: [{ kind: "activity", detail: "Walk", estCost: 100 }],
          assumptions: [],
          conflictsWith: [],
        };
      },
    };

    const result = await runTripChat(
      { tripId: brief.tripId, message: "Please change the destination", brief },
      { extractor, replyGenerator, specialists: [itinerary], tools, mem },
    );

    expect(extractor.extract).toHaveBeenCalledWith("Please change the destination", brief);
    expect(result.plan.brief).toMatchObject({ destination: "Melbourne", budgetTotal: 5000 });
    expect(result.reply).toContain("Melbourne sounds like a great fit");
    expect(replyGenerator.generate).toHaveBeenCalledWith(
      expect.stringContaining("Detect the language of the traveler's latest message"),
    );
    expect(
      replyPrompt("请改成中文回复", brief, result.plan.brief, ["destination"], result.plan),
    ).toContain("reply in that exact same language");
    expect(turns.map((turn) => turn.role)).toEqual(["user", "assistant"]);
  });
});

describe("blank conversation start", () => {
  const mem: MemoryStore = {
    getShortTerm: vi.fn(async () => []),
    appendShortTerm: vi.fn(async () => {}),
    getLongTerm: vi.fn(async () => []),
    setLongTerm: vi.fn(async () => {}),
    promote: vi.fn(async () => {}),
  };
  const tools: ToolGateway = {
    maps: { route: vi.fn(async () => []), places: vi.fn(async () => []) },
    booking: { searchStays: vi.fn(async () => []), searchFlights: vi.fn(async () => []) },
  };
  const itinerary: Specialist = {
    name: "itinerary",
    label: "Day plan",
    async invoke({ brief: updated }) {
      return {
        agent: "itinerary",
        summary: `Plan for ${updated.destination}`,
        items: [{ kind: "activity", detail: "Walk", estCost: 100 }],
        assumptions: [],
        conflictsWith: [],
      };
    },
  };

  it("reports missing fields instead of borrowing them from the demo brief", async () => {
    const extractor: BriefExtractor = {
      extract: vi.fn(async () => ({ destination: "Lisbon" })),
    };
    const run = runTripChat(
      { tripId: "blank", mode: "start", message: "I want to visit Lisbon" },
      { extractor, specialists: [itinerary], tools, mem },
    );
    await expect(run).rejects.toThrow(
      "include the start and end dates (YYYY-MM-DD), number of travellers, total budget",
    );
    expect(extractor.extract).toHaveBeenCalledWith("I want to visit Lisbon", undefined);
  });

  it("plans only from the fields stated in the first message", async () => {
    const result = await runTripChat(
      {
        tripId: "blank",
        mode: "start",
        message: "Lisbon, 2026-11-02 to 2026-11-06, 3 people, budget $2400",
      },
      {
        extractor: { extract: async (message) => extractBriefPatchLocally(message) },
        replyGenerator: { generate: async () => "Lisbon is ready to review." },
        specialists: [itinerary],
        tools,
        mem,
      },
    );
    expect(result.plan.brief).toMatchObject({
      tripId: "blank",
      destination: "Lisbon",
      dates: ["2026-11-02", "2026-11-06"],
      groupSize: 3,
      budgetTotal: 2400,
    });
    expect(JSON.stringify(result.plan)).not.toMatch(/Tokyo|Kyoto|demo-trip/);
  });
});
