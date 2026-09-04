import { describe, expect, it, vi } from "vitest";
import {
  AgentProposal,
  type AgentContext,
  type TripBrief,
  type StayOption,
  type UserPreference,
} from "@trip/shared";
import { accommodationAgent } from "./index";

const brief: TripBrief = {
  tripId: "stay-test",
  userId: "user-test",
  destination: "Sydney",
  dates: ["2026-10-01", "2026-10-05"],
  groupSize: 3,
  budgetTotal: 4000,
  travelStyle: "P",
};
const options: StayOption[] = [
  { name: "Standard", area: "Central", pricePerNightUsd: 100, rating: 8.7, freeCancellation: true },
  { name: "Comfort", area: "Central", pricePerNightUsd: 140, rating: 9.3, freeCancellation: true },
  { name: "Economy", area: "Outer", pricePerNightUsd: 60, rating: 7.6, freeCancellation: false },
];
const request = {
  tripId: brief.tripId,
  targetAgent: "accommodation" as const,
  reason: "plan is 17% over budget",
  constraints: ["cut accommodation cost by ~30%"],
};

function context(stays = options, prefs: UserPreference[] = []) {
  const searchStays = vi.fn(async () => stays);
  const getLongTerm = vi.fn(async () => prefs);
  const ctx: AgentContext = {
    tripId: brief.tripId,
    round: 1,
    tools: {
      booking: { searchStays, searchFlights: vi.fn(async () => []) },
      maps: { route: vi.fn(async () => []), places: vi.fn(async () => []) },
    },
    mem: {
      getLongTerm,
      getShortTerm: vi.fn(async () => []),
      appendShortTerm: vi.fn(async () => {}),
      setLongTerm: vi.fn(async () => {}),
      promote: vi.fn(async () => {}),
    },
  };
  return { ctx, searchStays, getLongTerm };
}

describe("accommodation proposals", () => {
  it("charges only the selected stay: 3 guests, 2 rooms, 4 nights = USD 800", async () => {
    const { ctx, searchStays, getLongTerm } = context();
    const result = await accommodationAgent.run(brief, ctx);
    expect(AgentProposal.safeParse(result).success).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ kind: "hotel", day: 1, estCost: 800 });
    expect(result.items[0]!.detail).toContain("Standard");
    expect(searchStays).toHaveBeenCalledWith({
      city: "Sydney",
      checkIn: "2026-10-01",
      checkOut: "2026-10-05",
      guests: 3,
    });
    expect(getLongTerm).toHaveBeenCalledWith("user-test");
  });

  it("uses one room per traveller for a confirmed individual allocation", async () => {
    const { ctx } = context(options, [
      { key: "accommodation.roomAllocation", value: "individual", source: "filter" },
    ]);
    expect((await accommodationAgent.run(brief, ctx)).items[0]!.estCost).toBe(1200);
  });

  it("partitions seven nights into adjacent city stays without double-counting", async () => {
    const { ctx, searchStays } = context();
    const result = await accommodationAgent.run(
      { ...brief, groupSize: 2, destination: "Tokyo & Kyoto", dates: ["2026-06-15", "2026-06-22"] },
      ctx,
    );
    expect(searchStays.mock.calls).toEqual([
      [{ city: "Tokyo", checkIn: "2026-06-15", checkOut: "2026-06-19", guests: 2 }],
      [{ city: "Kyoto", checkIn: "2026-06-19", checkOut: "2026-06-22", guests: 2 }],
    ]);
    expect(result.items.map(({ estCost, day }) => ({ estCost, day }))).toEqual([
      { estCost: 400, day: 1 },
      { estCost: 300, day: 5 },
    ]);
    expect(result.assumptions.join(" ")).toContain("split evenly");
  });

  it("counts leap-day nights using calendar dates and keeps cents", async () => {
    const { ctx } = context([{ ...options[0]!, pricePerNightUsd: 99.99 }]);
    const result = await accommodationAgent.run(
      { ...brief, dates: ["2028-02-28", "2028-03-01"] },
      ctx,
    );
    expect(result.items[0]!.estCost).toBe(399.96);
  });

  it.each([
    { dates: ["2026-02-30", "2026-03-05"] },
    { dates: ["2026-10-01", "2026-10-01"] },
    { dates: ["2026-10-05", "2026-10-01"] },
    { groupSize: 0 },
    { groupSize: 1.5 },
    { destination: " " },
    { destination: "Tokyo & Kyoto", dates: ["2026-10-01", "2026-10-02"] },
  ])("rejects unplannable inputs before searching: %j", async (override) => {
    const { ctx, searchStays } = context();
    await expect(
      accommodationAgent.run({ ...brief, ...override } as TripBrief, ctx),
    ).rejects.toThrow();
    expect(searchStays).not.toHaveBeenCalled();
  });

  it("does not turn missing or invalid lodging prices into a successful zero-cost stay", async () => {
    for (const stays of [
      [],
      [{ ...options[0]!, pricePerNightUsd: NaN }],
      [{ ...options[0]!, pricePerNightUsd: -1 }],
    ]) {
      await expect(accommodationAgent.run(brief, context(stays).ctx)).rejects.toThrow(
        "No valid stays",
      );
    }
  });

  it("rejects unsupported preference values instead of silently relaxing them", async () => {
    const { ctx } = context(options, [
      { key: "accommodation.minRating", value: "unknown", source: "filter" },
    ]);
    await expect(accommodationAgent.run(brief, ctx)).rejects.toThrow("minRating");
  });

  it("honours cancellation before starting tool calls", async () => {
    const { ctx, searchStays } = context();
    const controller = new AbortController();
    controller.abort();
    await expect(
      accommodationAgent.run(brief, { ...ctx, signal: controller.signal }),
    ).rejects.toThrow();
    expect(searchStays).not.toHaveBeenCalled();
  });
});

describe("accommodation revisions", () => {
  it("reduces cost by choosing real alternatives while keeping dates and guests", async () => {
    const { ctx, searchStays } = context();
    const result = await accommodationAgent.revise!(brief, { ...ctx, round: 2 }, request);
    expect(result.items[0]!.estCost).toBe(480);
    expect(result.items[0]!.detail).toContain("Economy");
    expect(result.items[0]!.detail).toContain("no free cancellation");
    expect(result.assumptions.join(" ")).toContain("saved USD 320.00");
    expect(result.assumptions.join(" ")).toContain("Target met");
    expect(searchStays).toHaveBeenCalledWith(
      expect.objectContaining({ guests: 3, checkIn: brief.dates[0], checkOut: brief.dates[1] }),
    );
  });

  it("preserves mandatory rating and cancellation even when the target is impossible", async () => {
    const { ctx } = context(options, [
      { key: "accommodation.minRating", value: "8", source: "chat_confirmed" },
      { key: "accommodation.freeCancellation", value: "true", source: "filter" },
    ]);
    const result = await accommodationAgent.revise!(brief, ctx, request);
    expect(result.items[0]!.estCost).toBe(800);
    expect(result.assumptions.join(" ")).toContain("Target cannot be met");
    expect(result.assumptions.join(" ")).toContain("No cheaper eligible stay");
  });

  it("does not keep applying fictional discounts in later rounds", async () => {
    const { ctx } = context();
    const second = await accommodationAgent.revise!(brief, { ...ctx, round: 2 }, request);
    const third = await accommodationAgent.revise!(brief, { ...ctx, round: 3 }, request);
    expect(third.items).toEqual(second.items);
  });

  it("does not claim a price change resolves an unsupported time conflict", async () => {
    const result = await accommodationAgent.revise!(brief, context().ctx, {
      ...request,
      reason: "time overlap",
      constraints: [],
    });
    expect(result.items[0]!.estCost).toBe(800);
    expect(result.assumptions.join(" ")).toContain("updated brief");
  });

  it("rejects a revision addressed to another trip", async () => {
    await expect(
      accommodationAgent.revise!(brief, context().ctx, { ...request, tripId: "someone-else" }),
    ).rejects.toThrow("target this trip");
  });
});
