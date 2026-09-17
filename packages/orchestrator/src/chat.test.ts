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

  it("normalises the date shapes people actually type", () => {
    const ranges = [
      "Sydney, 2026-10-01 to 2026-10-05",
      "Sydney, 2026/10/01 to 2026/10/05",
      "Sydney, 2026.10.01 - 2026.10.05",
      "Sydney, Oct 1 to Oct 5 2026",
      "Sydney, October 1, 2026 to October 5, 2026",
      "Sydney, 1 Oct 2026 to 5 Oct 2026",
      "Sydney, 2026-10-01 ~ 2026-10-05",
      "Sydney, 2026-10-01 through 2026-10-05",
      "悉尼，2026年10月1日到10月5日",
      "悉尼，2026-10-01 至 2026-10-05",
      "Sydney, 2026年10月1日 到 2026年10月5日",
    ];
    for (const message of ranges)
      expect(extractBriefPatchLocally(message).dates, message).toEqual([
        "2026-10-01",
        "2026-10-05",
      ]);
  });

  it("borrows the year from the other side of the range, and only from there", () => {
    // One stated year is enough for “10月1日到10月5日”.
    expect(extractBriefPatchLocally("悉尼，2026年10月1日到10月5日").dates).toEqual([
      "2026-10-01",
      "2026-10-05",
    ]);
    // With no year anywhere there is nothing to normalise to, so the dates stay unset rather
    // than borrowing a budget figure or today's date.
    expect(extractBriefPatchLocally("悉尼，10月1日到10月5日，预算3000")).toEqual({
      destination: "悉尼",
      budgetTotal: 3000,
    });
  });

  it("reads a numeric date only when a component settles the order", () => {
    // 13 cannot be a month, so this is a day.
    expect(extractBriefPatchLocally("Sydney, 13/10/2026 to 15/10/2026").dates).toEqual([
      "2026-10-13",
      "2026-10-15",
    ]);
    // 13 in second position can only be a day, so the first is the month.
    expect(extractBriefPatchLocally("Sydney, 10/13/2026 to 10/15/2026").dates).toEqual([
      "2026-10-13",
      "2026-10-15",
    ]);
    // Fully ambiguous, so the offline parser asks rather than picking a month. The routed model is
    // told to read it day first and shows the dates it chose in the plan.
    expect(extractBriefPatchLocally("Sydney, 05/10/2026 to 08/10/2026").dates).toBeUndefined();
  });

  it("reads traveller counts written as 人, 个人, 位 or a number word", () => {
    const counts = [
      "Sydney, 2026-10-01 to 2026-10-05, 2 people",
      "Sydney, 2026-10-01 to 2026-10-05, two travellers",
      "悉尼，2026-10-01 到 2026-10-05，2人",
      "悉尼，2026-10-01 到 2026-10-05，2个人",
      "悉尼，2026-10-01 到 2026-10-05，2 位",
      "悉尼，2026-10-01 到 2026-10-05，2名",
    ];
    for (const message of counts)
      expect(extractBriefPatchLocally(message).groupSize, message).toBe(2);
    // A duration is not a traveller count.
    expect(extractBriefPatchLocally("悉尼，2026-10-01 到 2026-10-05，3个月，2人").groupSize).toBe(
      2,
    );
  });

  it("finds a destination named without a lead-in word", () => {
    expect(extractBriefPatchLocally("悉尼，2026-10-01 到 2026-10-05，2人").destination).toBe(
      "悉尼",
    );
    expect(extractBriefPatchLocally("Tokyo, Oct 1 to Oct 5 2026, 2 people").destination).toBe(
      "Tokyo",
    );
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
      "include the start and end dates, number of travellers, total budget",
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
