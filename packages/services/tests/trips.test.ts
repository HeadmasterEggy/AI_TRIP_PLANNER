import { describe, expect, it } from "vitest";
import type { TripPlan } from "@trip/shared";
import { tripStore } from "../src/trips";

const plan: TripPlan = {
  tripId: "durable-trip-test",
  brief: {
    tripId: "durable-trip-test",
    userId: "durable-user",
    destination: "Sydney",
    dates: ["2026-10-01", "2026-10-03"],
    groupSize: 2,
    budgetTotal: 1200,
  },
  round: 1,
  budgetTotal: 1200,
  estTotal: 0,
  overrunPct: -100,
  sections: [],
  hitl: [
    {
      id: "confirm-plan",
      type: "confirm_plan",
      title: "Confirm this plan",
      detail: "Confirm the reviewed itinerary.",
      status: "approved",
    },
  ],
  conflicts: [],
};

describe("durable trip store", () => {
  it("round-trips a plan together with its HITL decisions", async () => {
    await tripStore.set(plan);
    expect(await tripStore.get(plan.tripId)).toEqual(plan);
  });
});
