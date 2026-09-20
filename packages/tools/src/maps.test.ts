import { afterEach, describe, expect, it, vi } from "vitest";
import { route } from "./maps";

const q = {
  from: "Tokyo",
  to: "Kyoto",
  date: "2026-10-03",
  departureTime: "2026-10-03T00:00:00.000Z",
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("B route provider boundaries", () => {
  function google(data: unknown) {
    vi.stubEnv("USE_MOCK_TOOLS", "false");
    vi.stubEnv("MAPS_PROVIDER", "google");
    vi.stubEnv("MAPS_API_KEY", "test-only");
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => data });
    vi.stubGlobal("fetch", fetcher);
    return fetcher;
  }
  it.each([undefined, "", "oops", "0s", "-1s", "Infinitys"])(
    "rejects invalid Google duration %s instead of inventing a minute",
    async (duration) => {
      google({ routes: [{ duration }] });
      await expect(route(q)).rejects.toThrow("invalid route duration");
    },
  );
  it("retains fractional seconds and marks a missing fare", async () => {
    const fetcher = google({ routes: [{ duration: "60.5s" }] });
    expect(await route(q)).toEqual([
      expect.objectContaining({
        durationMin: 2,
        price: 0,
        note: expect.stringContaining("fare unavailable"),
      }),
    ]);
    expect(fetcher.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("distinguishes no route from a provider error", async () => {
    google({ routes: [] });
    expect(await route(q)).toEqual([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(route(q)).rejects.toThrow("503");
  });
  it("resolves a date-only departure in the origin timezone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T00:00:00.000Z"));
    vi.stubEnv("USE_MOCK_TOOLS", "false");
    vi.stubEnv("MAPS_PROVIDER", "google");
    vi.stubEnv("MAPS_API_KEY", "test-only");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ places: [{ location: { latitude: -33.86, longitude: 151.2 } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "OK", timeZoneId: "Australia/Sydney" }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ routes: [{ duration: "60s" }] }) });
    vi.stubGlobal("fetch", fetcher);

    await route({ from: "Sydney", to: "Sydney CBD", date: "2026-10-05", localTime: "09:00" });
    expect(String(fetcher.mock.calls[0]![0])).toContain(
      "places.googleapis.com/v1/places:searchText",
    );
    expect(String(fetcher.mock.calls[1]![0])).toContain(
      "maps.googleapis.com/maps/api/timezone/json",
    );
    expect(String(fetcher.mock.calls[2]![1].body)).toContain("2026-10-04T22:00:00.000Z");
  });
  it("rejects missing and out-of-window transit departure times", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T00:00:00.000Z"));
    const fetcher = google({ routes: [{ duration: "60s" }] });
    await expect(route({ from: "Tokyo", to: "Kyoto" })).rejects.toThrow("requires a date");
    await expect(
      route({ from: "Tokyo", to: "Kyoto", departureTime: "2026-01-01T00:00:00.000Z" }),
    ).rejects.toThrow("outside");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["2026-02-30T09:00:00Z", "2026-10-03T09:00:00+15:00"])(
    "rejects invalid RFC 3339 departure instant %s",
    async (departureTime) => {
      const fetcher = google({ routes: [{ duration: "60s" }] });
      await expect(route({ from: "Tokyo", to: "Kyoto", departureTime })).rejects.toThrow(
        "ISO instant",
      );
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("rejects a nonexistent local departure during a DST gap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T00:00:00.000Z"));
    vi.stubEnv("USE_MOCK_TOOLS", "false");
    vi.stubEnv("MAPS_PROVIDER", "google");
    vi.stubEnv("MAPS_API_KEY", "test-only");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ places: [{ location: { latitude: -33.86, longitude: 151.2 } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "OK", timeZoneId: "Australia/Sydney" }),
      });
    vi.stubGlobal("fetch", fetcher);

    await expect(
      route({ from: "Sydney", to: "Sydney CBD", date: "2026-10-04", localTime: "02:30" }),
    ).rejects.toThrow("ambiguous or nonexistent");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects invalid geocoding before requesting a road route", async () => {
    vi.stubEnv("USE_MOCK_TOOLS", "false");
    vi.stubEnv("MAPS_PROVIDER", "osm");
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "NaN", lon: "140", display_name: "invalid" }],
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(route(q)).rejects.toThrow("coordinates");
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes("route/v1"))).toBe(true);
  });
  it("labels OSRM as driving-only rather than free transit", async () => {
    vi.stubEnv("USE_MOCK_TOOLS", "false");
    vi.stubEnv("MAPS_PROVIDER", "osm");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url.includes("route/v1")
            ? { routes: [{ duration: 60, distance: 500 }] }
            : [{ lat: "35", lon: "139", display_name: "city" }],
      })),
    );
    expect((await route(q))[0]!.note).toContain("driving-only");
  });
});
