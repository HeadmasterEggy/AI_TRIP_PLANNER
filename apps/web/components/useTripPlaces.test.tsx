import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TripPlan } from "@trip/shared";
import { useTripPlaces } from "./useTripPlaces";
import { plan as seed } from "@/lib/test-fixtures";
import { identifyActivities } from "@/lib/workspace";

const withActivity = (tripId: string, detail: string): TripPlan => {
  const plan = identifyActivities(structuredClone(seed));
  plan.tripId = tripId;
  plan.brief.tripId = tripId;
  plan.sections[0]!.proposal!.items[0]!.detail = detail;
  return plan;
};
const place = (id: string, name: string) => ({
  id,
  displayName: { text: name },
  location: { latitude: -33.86, longitude: 151.21 },
});

function Probe({ plan }: { plan?: TripPlan }) {
  const { markers, loading } = useTripPlaces(plan);
  return (
    <p data-testid="markers" data-loading={loading}>
      {markers.map((marker) => marker.place.displayName?.text).join(",")}
    </p>
  );
}

describe("trip place resolution", () => {
  it("matches a named activity at runtime without writing a place ID into the plan", async () => {
    const plan = withActivity("a", "Museum");
    const fetcher = vi.fn(async (_url: string) =>
      Response.json({ places: [place("g-1", "Verified")] }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<Probe plan={plan} />);
    await waitFor(() => expect(screen.getByTestId("markers").textContent).toBe("Verified"));
    expect(fetcher.mock.calls[0]![0]).toBe("/api/places/search");
    expect(plan.sections[0]!.proposal!.items[0]!.placeId).toBeUndefined();
  });

  it("ignores a late lookup for the previous trip", async () => {
    const resolvers: Record<string, (response: Response) => void> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((resolve) => {
            resolvers[JSON.parse(init.body as string).text] = resolve;
          }),
      ),
    );
    const view = render(<Probe plan={withActivity("old", "Old museum")} />);
    view.rerender(<Probe plan={withActivity("new", "New gallery")} />);
    await act(async () => {
      resolvers["Old museum"]!(Response.json({ places: [place("old", "Old museum")] }));
    });
    // The stale answer neither adds a marker nor ends the current trip's loading state.
    expect(screen.getByTestId("markers").textContent).toBe("");
    expect(screen.getByTestId("markers").dataset.loading).toBe("true");
    await act(async () => {
      resolvers["New gallery"]!(Response.json({ places: [place("new", "New gallery")] }));
    });
    await waitFor(() => expect(screen.getByTestId("markers").textContent).toBe("New gallery"));
    expect(screen.getByTestId("markers").dataset.loading).toBe("false");
  });

  it("does not look anything up for a blank conversation", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<Probe />);
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByTestId("markers").textContent).toBe("");
  });
});
