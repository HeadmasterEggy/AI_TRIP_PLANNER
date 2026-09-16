import { describe, it, expect, vi } from "vitest";
import type { TripBrief, MemoryStore } from "@trip/shared";
import { accommodationAgent } from "@trip/agents";
import { createToolGateway } from "@trip/tools";
import { runOrchestrator } from "./workflow";
import { applyHitl } from "./hitl";
import { runTripChat } from "./chat";
const brief: TripBrief = {
  tripId: "decision-trip",
  userId: "local",
  destination: "Sydney",
  dates: ["2026-10-01", "2026-10-04"],
  groupSize: 3,
  budgetTotal: 5000,
  accommodation: { roomAllocation: "shared", minRating: 0, freeCancellation: true },
};
const mem: MemoryStore = {
  getShortTerm: async () => [],
  appendShortTerm: async () => {},
  getLongTerm: async () => [],
  setLongTerm: async () => {},
  promote: async () => {},
};
const options = { specialists: [accommodationAgent], tools: createToolGateway(), mem };
const initial = () => runOrchestrator(brief, options);

describe("human decisions", () => {
  it("recalculates provider prices, rooms and nights instead of trusting snapshot totals", async () => {
    const plan = await initial();
    const stay = plan.sections[0]!.proposal!.stays![0]!;
    const choice = stay.candidates.find((c) => c.name.includes("Economy"))!;
    choice.pricePerNightUsd = 1;
    stay.rooms = 99;
    stay.nights = 99;
    plan.estTotal = 1;
    plan.sections[0]!.estCost = 1;
    const next = await applyHitl(
      { plan, checkpointId: `select-${stay.id}`, action: "select_stay", candidateId: choice.id },
      options.tools,
    );
    expect(next.estTotal).toBe(150 * 2 * 3);
    expect(next.hitl.find((c) => c.type === "select_stay")?.status).toBe("approved");
    expect(next.sections[0]!.proposal!.stays![0]!.rooms).toBe(2);
  });
  it("requires prerequisite decisions and treats defer / reject as unresolved", async () => {
    let plan = await initial();
    await expect(
      applyHitl({ plan, checkpointId: "confirm-plan", action: "approve" }),
    ).rejects.toThrow("Resolve");
    plan = await applyHitl({ plan, checkpointId: "confirm-brief", action: "defer" });
    expect(plan.hitl[0]!.status).toBe("deferred");
    plan = await applyHitl({ plan, checkpointId: "confirm-brief", action: "reject" });
    expect(plan.hitl[0]!.status).toBe("rejected");
    await expect(
      applyHitl({
        plan,
        checkpointId: "select-stay-1",
        action: "select_stay",
        candidateId: "missing",
      }),
    ).rejects.toThrow("candidate");
  });
  it("is idempotent and resets confirmation after a different hotel is selected", async () => {
    let plan = await initial();
    const stay = plan.sections[0]!.proposal!.stays![0]!;
    plan = await applyHitl({ plan, checkpointId: "confirm-brief", action: "approve" });
    plan = await applyHitl({
      plan,
      checkpointId: `select-${stay.id}`,
      action: "select_stay",
      candidateId: stay.selectedId,
    });
    plan = await applyHitl({ plan, checkpointId: "confirm-plan", action: "approve" });
    expect(plan.sections[0]!.status).toBe("confirmed");
    expect(await applyHitl({ plan, checkpointId: "confirm-plan", action: "approve" })).toEqual(
      plan,
    );
    const next = await applyHitl({
      plan,
      checkpointId: `select-${stay.id}`,
      action: "select_stay",
      candidateId: stay.candidates.find((c) => c.id !== stay.selectedId)!.id,
    });
    expect(next.hitl.find((c) => c.type === "confirm_plan")?.status).toBe("pending");
  });
  it("surfaces budget conflicts and only confirms after explicit acceptance", async () => {
    let plan = await runOrchestrator({ ...brief, budgetTotal: 100 }, options);
    expect(plan.conflicts?.length).toBeGreaterThan(0);
    for (const checkpoint of plan.hitl.filter((c) => c.type !== "confirm_plan")) {
      const selectedId = plan.sections[0]!.proposal!.stays![0]!.selectedId;
      plan = await applyHitl({
        plan,
        checkpointId: checkpoint.id,
        action: checkpoint.type === "select_stay" ? "select_stay" : "approve",
        candidateId: selectedId,
      });
    }
    plan = await applyHitl({ plan, checkpointId: "confirm-plan", action: "approve" });
    expect(plan.sections[0]!.status).toBe("confirmed");
    expect(plan.conflicts?.length).toBeGreaterThan(0);
  });
  it("plans submitted brief directly and keeps request preferences isolated", async () => {
    const extractor = { extract: vi.fn(async () => ({ destination: "Wrong city" })) };
    const replyGenerator = { generate: async () => "Updated" };
    const request = {
      tripId: brief.tripId,
      mode: "plan" as const,
      message: "Sydney with shared rooms",
      brief,
    };
    const result = await runTripChat(request, { ...options, extractor, replyGenerator });
    expect(extractor.extract).not.toHaveBeenCalled();
    expect(result.plan.brief).toEqual(brief);
    expect(result.plan.hitl.every((c) => c.status === "pending")).toBe(true);
    const individual = await runTripChat(
      {
        ...request,
        brief: {
          ...brief,
          accommodation: { ...brief.accommodation!, roomAllocation: "individual" },
        },
      },
      { ...options, extractor, replyGenerator },
    );
    expect(individual.plan.estTotal).toBe(result.plan.estTotal * 1.5);
    expect((await initial()).estTotal).toBe(result.plan.estTotal);
  });
});
