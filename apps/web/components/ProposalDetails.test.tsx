import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TripSection } from "./TripSection";
import { TripPanel } from "./TripPanel";
import { plan } from "@/lib/test-fixtures";

describe("Trip drawer details", () => {
  it.each([
    [undefined, "Budget not set"],
    [0, "Budget not set"],
    [100, /over the USD\s*100.00 budget/],
  ])("keeps a %s budget safe", (budgetTotal, expected) => {
    const trip = { ...plan, budgetTotal: budgetTotal as number, estTotal: 200 };
    const { container } = render(
      <TripPanel
        plan={trip}
        busy={false}
        tab="overview"
        onTab={() => {}}
        timeline={null}
        onReview={() => {}}
        onDecision={() => {}}
        onEdit={() => {}}
        onSave={() => {}}
      />,
    );
    expect(screen.getByLabelText("Trip budget").textContent).toMatch(expected);
    expect(container.querySelector(".bar > span")?.getAttribute("style")).not.toMatch(/NaN|-/);
  });

  it("shows chronological day groups, missing prices and honest source fallback", () => {
    const section = structuredClone(plan.sections[0]!);
    section.proposal!.items = [
      { kind: "activity", day: 2, detail: "Second day", location: "Park" },
      { kind: "activity", day: 1, detail: "First day", location: "Museum", estCost: 0.01 },
    ];
    render(<TripSection section={section} onEdit={() => {}} onReview={() => {}} />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Day 1",
      "Day 2",
    ]);
    expect(screen.getByText("Price not provided")).toBeTruthy();
    expect(screen.getByText(/USD\s*0.01/)).toBeTruthy();
    expect(screen.getByText("Source not recorded")).toBeTruthy();
  });
  it("keeps restaurant suggestions unpriced alongside the meal budget", () => {
    const section = structuredClone(plan.sections[0]!);
    section.id = "dining";
    section.proposal!.items = [
      { kind: "meal-budget", detail: "Whole trip", estCost: 150 },
      { kind: "meal", location: "Example cafe", detail: "Suggested venue" },
    ];
    render(<TripSection section={section} onEdit={() => {}} onReview={() => {}} />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText(/not added again to the total/)).toBeTruthy();
    expect(screen.getByText("Price not provided")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Example cafe" })).toBeTruthy();
  });
  it("renders selected lodging facts and opens the hotel review action", () => {
    const section = structuredClone(plan.sections[0]!);
    section.id = "accommodation";
    section.proposal!.stays = [
      {
        id: "stay-1",
        city: "Sydney",
        day: 1,
        checkIn: "2026-10-01",
        checkOut: "2026-10-04",
        nights: 3,
        rooms: 2,
        selectedId: "hotel-a",
        candidates: [
          {
            id: "hotel-a",
            name: "Mock stay",
            area: "Central",
            rating: 8.5,
            freeCancellation: true,
            pricePerNightUsd: 100,
          },
        ],
      },
    ];
    const review = vi.fn();
    render(<TripSection section={section} onEdit={() => {}} onReview={review} />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText(/USD\s*600.00/)).toBeTruthy();
    expect(screen.getByText("2026-10-04")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review hotel choices" }));
    expect(review).toHaveBeenCalledOnce();
  });
});
