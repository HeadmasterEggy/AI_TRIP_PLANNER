import { describe, it, expect, vi } from "vitest";
import { previewEdit } from "./trip-edit";
import { applyHitl } from "@trip/orchestrator";
import { localInstant, googleRoute, searchPlaces } from "./google";
import { plan as fixture, snapshot } from "./test-fixtures";
import { identifyActivities, parseSnapshot } from "./workspace";
function plan() {
  const p = structuredClone(fixture);
  p.sections[0]!.proposal!.items = [
    {
      id: "a",
      kind: "activity",
      detail: "Museum",
      day: 1,
      startTime: "09:00",
      endTime: "10:00",
      placeId: "place-a",
      estCost: 100,
    },
    {
      id: "b",
      kind: "activity",
      detail: "Park",
      day: 1,
      startTime: "10:00",
      endTime: "11:00",
      placeId: "place-b",
      estCost: 100,
    },
  ];
  p.hitl = [
    { id: "confirm-brief", type: "confirm_brief", title: "Brief", detail: "", status: "approved" },
    { id: "confirm-plan", type: "confirm_plan", title: "Final", detail: "", status: "approved" },
  ];
  return p;
}
const dependencies = () => ({
  placeDetails: vi.fn(async (id: string) => ({
    id,
    location: { latitude: -33.8, longitude: 151.2 },
  })),
  timeZone: vi.fn(async () => "Australia/Sydney"),
  googleRoute: vi.fn(
    async (from: string, to: string, _departure: string, mode: "WALK" | "TRANSIT") => ({
      from,
      to,
      mode,
      status: "ok" as const,
      durationMin: 20,
    }),
  ),
});
describe("P3 edit boundary", () => {
  it("preserves IDs across repeated serialization and reordering", () => {
    // Migration from older snapshots is gone: they carry the pre-AUD `pricePerNightUsd`
    // field and USD amounts, so parseSnapshot rejects them outright.
    const migrated = parseSnapshot(snapshot);
    expect(migrated.version).toBe(3);
    const id = migrated.plan.sections[0]!.proposal!.items[0]!.id;
    expect(id).toBeTruthy();
    expect(
      parseSnapshot(JSON.parse(JSON.stringify(migrated))).plan.sections[0]!.proposal!.items[0]!.id,
    ).toBe(id);
    expect(identifyActivities(migrated.plan)).toEqual(migrated.plan);
  });
  it("preserves identities, uses actual local departure and a 15-minute buffer", async () => {
    const p = plan(),
      deps = dependencies();
    const result = await previewEdit(
      { plan: p, baseVersion: 0, operation: { kind: "move", id: "b", day: 1, index: 0 } },
      deps,
    );
    expect(result.blockers).toEqual([]);
    expect(result.plan.sections[0]!.proposal!.items.map((a) => a.id)).toEqual(["b", "a"]);
    expect(result.plan.sections[0]!.proposal!.items[1]!.startTime).toBe("10:35");
    expect(deps.googleRoute.mock.calls[0]![2]).toBe("2026-10-01T00:00:00.000Z");
    expect(result.plan.hitl.find((h) => h.id === "confirm-brief")!.status).toBe("approved");
    expect(result.plan.hitl.find((h) => h.id === "confirm-plan")!.status).toBe("pending");
    expect(p.sections[0]!.proposal!.items[0]!.id).toBe("a");
  });
  it("rejects stale versions and invalid dates/targets", async () => {
    for (const operation of [
      { kind: "move", id: "bad", day: 1, index: 0 },
      { kind: "move", id: "a", day: 4, index: 0 },
    ])
      await expect(
        previewEdit({ plan: plan(), baseVersion: 0, operation }, dependencies()),
      ).rejects.toThrow();
    await expect(
      previewEdit(
        { plan: plan(), baseVersion: 2, operation: { kind: "move", id: "a", day: 1, index: 0 } },
        dependencies(),
      ),
    ).rejects.toThrow("stale");
  });
  it("blocks unknown automatic routes and day overflow without changing input", async () => {
    const deps = dependencies();
    deps.googleRoute.mockImplementation(async (from, to, _date, mode) => ({
      from,
      to,
      mode,
      status: "unavailable" as never,
      durationMin: undefined as never,
    }));
    const p = plan();
    const result = await previewEdit(
      { plan: p, baseVersion: 0, operation: { kind: "move", id: "b", day: 1, index: 0 } },
      deps,
    );
    expect(result.blockers).toContain("Route unavailable");
    expect(p).toEqual(plan());
  });
  it("allows binding an initially unresolved place as a reviewable draft", async () => {
    const p = plan();
    delete p.sections[0]!.proposal!.items[1]!.placeId;
    const result = await previewEdit(
      { plan: p, baseVersion: 0, operation: { kind: "place", id: "a", placeId: "new" } },
      dependencies(),
    );
    expect(result.blockers).toEqual([]);
    expect(result.plan.conflicts?.length).toBeGreaterThan(0);
    expect(result.plan.sections[0]!.proposal!.items[0]!.priceNeedsReview).toBe(true);
  });
  it("rejects nonexistent and ambiguous DST wall times", () => {
    expect(() => localInstant("2026-10-04", "02:30", "Australia/Sydney")).toThrow(
      "ambiguous or nonexistent",
    );
    expect(() => localInstant("2026-04-05", "02:30", "Australia/Sydney")).toThrow(
      "ambiguous or nonexistent",
    );
    expect(localInstant("2026-10-05", "09:00", "Australia/Sydney")).toBe(
      "2026-10-04T22:00:00.000Z",
    );
  });
  it("reports HTTP failures and unknown fare without making up prices", async () => {
    vi.stubEnv("MAPS_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ routes: [{ duration: "90s", polyline: { encodedPolyline: "abc" } }] }),
          ),
      ),
    );
    const route = await googleRoute("a", "b", new Date().toISOString(), "WALK");
    expect(route.durationMin).toBe(2);
    expect(route.fare).toBeUndefined();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 429 })),
    );
    expect((await googleRoute("a", "b", new Date().toISOString(), "WALK")).status).toBe(
      "unavailable",
    );
    await expect(searchPlaces("museum", "Sydney")).rejects.toThrow("429");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("does not query transit outside the supported date window", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const result = await googleRoute("a", "b", "2020-01-01T09:00:00Z", "TRANSIT");
    expect(result.status).toBe("unavailable");
    expect(result.error).toContain("date window");
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("blocks midnight overflow while allowing manual unresolved schedules", async () => {
    const p = plan();
    p.sections[0]!.proposal!.items[0]!.startTime = "22:00";
    p.sections[0]!.proposal!.items[0]!.endTime = "23:00";
    const result = await previewEdit(
      { plan: p, baseVersion: 0, operation: { kind: "move", id: "b", day: 1, index: 1 } },
      dependencies(),
    );
    expect(result.blockers.some((b) => b.includes("beyond the day"))).toBe(true);
  });
  it("restores the price-review state when undoing place replacement", async () => {
    const p = plan(),
      deps = dependencies();
    const changed = await previewEdit(
      { plan: p, baseVersion: 0, operation: { kind: "place", id: "a", placeId: "new" } },
      deps,
    );
    const restored = await previewEdit(
      {
        plan: changed.plan,
        baseVersion: 1,
        operation: {
          kind: "undo",
          activities: p.sections[0]!.proposal!.items.map((a) => ({
            id: a.id!,
            day: a.day!,
            startTime: a.startTime!,
            endTime: a.endTime!,
            placeId: a.placeId,
            priceNeedsReview: a.priceNeedsReview,
          })),
        },
      },
      deps,
    );
    expect(restored.plan.sections[0]!.proposal!.items[0]!.priceNeedsReview).toBeUndefined();
    expect(restored.plan.sections[0]!.proposal!.items[0]!.placeId).toBe("place-a");
  });
  it.each([0, -1, NaN, Infinity])(
    "rejects invalid duration %s at the preview boundary",
    async (durationMin) => {
      const deps = dependencies();
      deps.googleRoute.mockImplementation(async (from, to, _date, mode) => ({
        from,
        to,
        mode,
        status: "ok",
        durationMin,
      }));
      const result = await previewEdit(
        { plan: plan(), baseVersion: 0, operation: { kind: "move", id: "b", day: 1, index: 0 } },
        deps,
      );
      expect(result.blockers).toContain("Route unavailable");
    },
  );
  it("completes the edit → conflict acceptance → final confirmation loop", async () => {
    const edited = await previewEdit(
      { plan: plan(), baseVersion: 0, operation: { kind: "place", id: "a", placeId: "new" } },
      dependencies(),
    );
    const escalation = edited.plan.hitl.find((h) => h.type === "escalation")!;
    expect(escalation.id).toBe("escalation");
    const accepted = await applyHitl({
      plan: edited.plan,
      checkpointId: escalation.id,
      action: "approve",
    });
    const confirmed = await applyHitl({
      plan: accepted,
      checkpointId: "confirm-plan",
      action: "approve",
    });
    expect(confirmed.hitl.every((h) => h.status === "approved")).toBe(true);
    expect(confirmed.editVersion).toBe(1);
  });
  it("keeps unresolved route issues on an untouched day", async () => {
    const p = plan();
    p.sections[0]!.proposal!.items.push({
      id: "c",
      kind: "activity",
      detail: "Unresolved day",
      day: 2,
      startTime: "09:00",
      endTime: "10:00",
    });
    p.editIssues = [
      { code: "route_unavailable", message: "Day 2 route unavailable", activityIds: ["c"] },
    ];
    p.sections[0]!.proposal!.conflictsWith = ["Day 2 route unavailable"];
    const result = await previewEdit(
      {
        plan: p,
        baseVersion: 0,
        operation: { kind: "time", id: "a", startTime: "08:00", endTime: "09:00" },
      },
      dependencies(),
    );
    expect(result.plan.conflicts?.some((c) => c.reason.includes("Day 2 route unavailable"))).toBe(
      true,
    );
  });
});
