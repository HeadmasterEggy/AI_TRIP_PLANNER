import { afterEach, describe, expect, it, vi } from "vitest";
import { googleRouteFromCoordinates } from "./google";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MAPS_API_KEY;
});

describe("current-location route boundary", () => {
  it("sends runtime coordinates to Google Routes and returns verified distance and time", async () => {
    process.env.MAPS_API_KEY = "test-key";
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ routes: [{ duration: "725s", distanceMeters: 1800 }] }),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      googleRouteFromCoordinates({ latitude: -33.86, longitude: 151.21 }, "place-1", "WALK"),
    ).resolves.toMatchObject({
      status: "ok",
      durationMin: 13,
      distanceMeters: 1800,
    });
    const request = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
    expect(request.origin.location.latLng).toEqual({ latitude: -33.86, longitude: 151.21 });
    expect(request.destination.placeId).toBe("place-1");
  });
});
