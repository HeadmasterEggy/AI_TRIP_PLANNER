import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSerpApiCacheForTests,
  resetSerpApiUsageForTests,
  searchFlightsSerpApi,
  searchHotelsSerpApi,
  SerpApiError,
  serpApiUsage,
} from "./serpapi";

const hotelQuery = { city: "Sydney", checkIn: "2026-11-01", checkOut: "2026-11-04", guests: 2 };
const flightQuery = { from: "Sydney", to: "Tokyo", depart: "2026-11-01", passengers: 2 };

function stub(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

beforeEach(() => {
  vi.stubEnv("SERPAPI_KEY", "test-key");
  resetSerpApiUsageForTests();
  clearSerpApiCacheForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("searchHotelsSerpApi", () => {
  it("maps a real property, converting Google's 1.0-5.0 rating to this project's 0-10 scale", async () => {
    stub(200, {
      properties: [
        {
          name: "Park Hyatt Sydney",
          rate_per_night: { extracted_lowest: 650 },
          overall_rating: 4.6,
          gps_coordinates: { latitude: -33.86, longitude: 151.21 },
          serpapi_property_details_link: "https://serpapi.com/search?...",
        },
      ],
    });

    const [option] = await searchHotelsSerpApi(hotelQuery);

    expect(option).toMatchObject({
      name: "Park Hyatt Sydney",
      pricePerNight: 650,
      // The exact conversion every rating rule in this codebase assumes —
      // missing it silently misjudges every real hotel while still being a
      // "valid" 0-10 number, so this is asserted explicitly, not just ranged.
      rating: 9.2,
      grounded: true,
      location: { latitude: -33.86, longitude: 151.21 },
      detailsUrl: "https://serpapi.com/search?...",
    });
  });

  it("omits location/detailsUrl rather than fabricating them when the provider doesn't report them", async () => {
    stub(200, { properties: [{ name: "Some Hotel", rate_per_night: { extracted_lowest: 200 } }] });

    const [option] = await searchHotelsSerpApi(hotelQuery);

    expect(option).not.toHaveProperty("location");
    expect(option).not.toHaveProperty("detailsUrl");
  });

  it("drops candidates with no name or no usable price", async () => {
    stub(200, {
      properties: [
        { rate_per_night: { extracted_lowest: 200 } }, // no name
        { name: "Free-text only", rate_per_night: {} }, // no price
        { name: "Good Hotel", rate_per_night: { extracted_lowest: 300 } },
      ],
    });

    const options = await searchHotelsSerpApi(hotelQuery);

    expect(options).toHaveLength(1);
    expect(options[0]!.name).toBe("Good Hotel");
  });

  it("throws a typed no_results error instead of returning an empty list silently", async () => {
    stub(200, { properties: [] });

    const error = await searchHotelsSerpApi(hotelQuery).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SerpApiError);
    expect((error as SerpApiError).reason).toBe("no_results");
  });
});

describe("searchFlightsSerpApi", () => {
  it("scales SerpApi's per-passenger price to this project's whole-group-total convention", async () => {
    stub(200, {
      best_flights: [
        {
          price: 450,
          total_duration: 600,
          layovers: [{ name: "Singapore" }],
          flights: [{ airline: "Qantas" }],
        },
      ],
    });

    const [option] = await searchFlightsSerpApi(flightQuery); // 2 passengers

    expect(option).toMatchObject({
      carrier: "Qantas",
      price: 900, // 450 * 2 passengers, not 450
      stops: 1,
      durationMin: 600,
    });
  });

  it("reads from both best_flights and other_flights", async () => {
    stub(200, {
      best_flights: [{ price: 100, flights: [{ airline: "A" }] }],
      other_flights: [{ price: 200, flights: [{ airline: "B" }] }],
    });

    const options = await searchFlightsSerpApi({ ...flightQuery, passengers: 1 });

    expect(options.map((o) => o.carrier)).toEqual(["A", "B"]);
  });

  it("marks a nonstop flight with zero stops rather than leaving it undefined", async () => {
    stub(200, { best_flights: [{ price: 100, flights: [{ airline: "A" }] }] });

    expect((await searchFlightsSerpApi({ ...flightQuery, passengers: 1 }))[0]!.stops).toBe(0);
  });

  it("throws a typed no_results error when nothing comes back", async () => {
    stub(200, { best_flights: [], other_flights: [] });

    const error = await searchFlightsSerpApi(flightQuery).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SerpApiError);
    expect((error as SerpApiError).reason).toBe("no_results");
  });
});

describe("error classification (empirically verified against the real SerpApi error shape)", () => {
  it("classifies an invalid key", async () => {
    stub(401, { error: "Invalid API key. Your API key should be here: https://serpapi.com/manage-api-key" });

    const error = await searchHotelsSerpApi(hotelQuery).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SerpApiError);
    expect((error as SerpApiError).reason).toBe("invalid_key");
  });

  it("classifies an account-limit error distinctly from an invalid key", async () => {
    stub(401, { error: "Your account has run out of searches." });

    const error = await searchHotelsSerpApi(hotelQuery).catch((e: unknown) => e);

    expect((error as SerpApiError).reason).toBe("quota_exceeded");
  });

  it("classifies an unrecognized failure as request_failed rather than crashing on it", async () => {
    stub(500, {});

    const error = await searchHotelsSerpApi(hotelQuery).catch((e: unknown) => e);

    expect((error as SerpApiError).reason).toBe("request_failed");
  });

  it("classifies a network failure (fetch itself rejects) as request_failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      }),
    );

    const error = await searchHotelsSerpApi(hotelQuery).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SerpApiError);
    expect((error as SerpApiError).reason).toBe("request_failed");
  });

  it("refuses to call SerpApi at all when SERPAPI_KEY is unset", async () => {
    vi.unstubAllEnvs();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const error = await searchHotelsSerpApi(hotelQuery).catch((e: unknown) => e);

    expect((error as SerpApiError).reason).toBe("not_configured");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("shared monthly quota (hotels + flights count against the same total)", () => {
  it("increments the shared counter only on a real, successful search", async () => {
    stub(200, { properties: [{ name: "A", rate_per_night: { extracted_lowest: 100 } }] });
    await searchHotelsSerpApi(hotelQuery);
    expect(serpApiUsage().count).toBe(1);

    stub(200, { best_flights: [{ price: 100, flights: [{ airline: "A" }] }] });
    await searchFlightsSerpApi({ ...flightQuery, to: "Osaka" }); // distinct key, not a cache hit
    expect(serpApiUsage().count).toBe(2);
  });

  it("does not spend a credit on a rejected request (invalid key, quota already exceeded)", async () => {
    stub(401, { error: "Invalid API key." });
    await searchHotelsSerpApi(hotelQuery).catch(() => {});
    expect(serpApiUsage().count).toBe(0);
  });

  it("refuses new searches once the shared limit is reached, without calling SerpApi again", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ properties: [{ name: "A", rate_per_night: { extracted_lowest: 100 } }] }),
    );
    vi.stubGlobal("fetch", fetcher);
    for (let i = 0; i < 230; i += 1) {
      await searchHotelsSerpApi({ ...hotelQuery, city: `City-${i}` }); // distinct key every time
    }
    expect(serpApiUsage().count).toBe(230);

    const error = await searchHotelsSerpApi({ ...hotelQuery, city: "One-too-many" }).catch(
      (e: unknown) => e,
    );

    expect((error as SerpApiError).reason).toBe("quota_exceeded");
    expect(fetcher).toHaveBeenCalledTimes(230);
  });
});

describe("shared cache (hotels + flights use the same mechanism)", () => {
  it("serves a repeat hotel search from cache instead of calling SerpApi again", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ properties: [{ name: "A", rate_per_night: { extracted_lowest: 100 } }] }),
    );
    vi.stubGlobal("fetch", fetcher);

    await searchHotelsSerpApi(hotelQuery);
    await searchHotelsSerpApi(hotelQuery);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(serpApiUsage().count).toBe(1);
  });

  it("does not cache across a different query (different city)", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ properties: [{ name: "A", rate_per_night: { extracted_lowest: 100 } }] }),
    );
    vi.stubGlobal("fetch", fetcher);

    await searchHotelsSerpApi(hotelQuery);
    await searchHotelsSerpApi({ ...hotelQuery, city: "Melbourne" });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
