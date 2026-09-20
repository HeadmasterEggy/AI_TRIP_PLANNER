import { afterEach, describe, expect, it, vi } from "vitest";
import { searchFlights, searchStays } from "./booking";

const stay = { city: "Tokyo", checkIn: "2026-06-15", checkOut: "2026-06-19", guests: 2 };
const flight = { from: "Sydney", to: "Tokyo", depart: "2026-06-15", passengers: 2 };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Booking mock: stays", () => {
  it("offers distinct, clearly labelled mock hotel choices with per-room prices", async () => {
    const result = await searchStays(stay);
    expect(result).toHaveLength(4);
    expect(result.every((option) => option.name.startsWith("Mock "))).toBe(true);
    expect(new Set(result.map((option) => option.pricePerNight)).size).toBe(4);
    expect(await searchStays({ ...stay, guests: 5 })).toEqual(result);
    expect(await searchStays({ ...stay, city: "Kyoto" })).not.toEqual(result);
  });

  it("returns deterministic, independent fixtures and supports a generic city", async () => {
    const first = await searchStays(stay);
    first[0]!.pricePerNight = 1;
    expect((await searchStays(stay))[0]!.pricePerNight).toBe(240);
    const unknown = await searchStays({ ...stay, city: "Osaka" });
    expect(unknown[0]!.name).toBe("Mock Osaka Economy");
    expect(unknown[0]!.pricePerNight).toBe(100);
  });

  it.each([
    { checkIn: "2026-02-30" },
    { checkOut: "2026-06-15" },
    { guests: 0 },
    { guests: 1.5 },
    { city: " " },
  ])("rejects invalid stay searches: %j", async (override) => {
    await expect(searchStays({ ...stay, ...override })).rejects.toThrow();
  });
});

describe("Google-grounded lodging (real mode)", () => {
  function google(data: unknown) {
    vi.stubEnv("USE_MOCK_TOOLS", "false");
    vi.stubEnv("MAPS_PROVIDER", "google");
    vi.stubEnv("MAPS_API_KEY", "test-only");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
  }

  it("converts Google's 1.0-5.0 rating to this project's 0-10 scale", async () => {
    google({ places: [{ displayName: { text: "Park Hyatt Tokyo" }, rating: 4.6 }] });

    const [option] = await searchStays(stay);

    // This is the conversion every rating filter/sort in the codebase
    // assumes (StayCandidate.rating, minRating, chooseInitial's >= 8) — a
    // missed *2 here would silently misjudge every real hotel's quality
    // while still passing schema validation (4.6 is a "valid" 0-10 number).
    expect(option!.rating).toBe(9.2);
  });

  it.each([
    ["PRICE_LEVEL_INEXPENSIVE", 135],
    ["PRICE_LEVEL_MODERATE", 225],
    ["PRICE_LEVEL_EXPENSIVE", 390],
    ["PRICE_LEVEL_VERY_EXPENSIVE", 630],
    [undefined, 225], // Places often omits price_level for lodging.
  ])("maps Google's price_level bucket %s to an AUD planning estimate of $%d/night", async (
    priceLevel,
    expected,
  ) => {
    google({ places: [{ displayName: { text: "Some Hotel" }, priceLevel, rating: 4 }] });

    expect((await searchStays(stay))[0]!.pricePerNight).toBe(expected);
  });

  it("marks real properties as grounded and never claims free cancellation it can't verify", async () => {
    google({ places: [{ displayName: { text: "Some Hotel" }, rating: 4 }] });

    const [option] = await searchStays(stay);

    expect(option).toMatchObject({ grounded: true, freeCancellation: false });
  });

  it("uses the formatted address as area, falling back to the queried city", async () => {
    google({
      places: [
        { displayName: { text: "A" }, rating: 4, formattedAddress: "1 Chome, Shibuya, Tokyo" },
        { displayName: { text: "B" }, rating: 4 },
      ],
    });

    const options = await searchStays(stay);
    expect(options[0]!.area).toBe("1 Chome, Shibuya, Tokyo");
    expect(options[1]!.area).toBe("Tokyo");
  });

  it("drops candidates with no usable name instead of returning a blank room", async () => {
    google({ places: [{ rating: 4 }, { displayName: { text: "  " }, rating: 4 }] });

    await expect(searchStays(stay)).rejects.toThrow("no lodging");
  });

  it("still validates dates/guests before ever calling Google", async () => {
    vi.stubEnv("USE_MOCK_TOOLS", "false");
    vi.stubEnv("MAPS_PROVIDER", "google");
    vi.stubEnv("MAPS_API_KEY", "test-only");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    await expect(searchStays({ ...stay, guests: 0 })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Booking mock: flights", () => {
  it("quotes flights for the whole group, scaling passengers and return legs exactly once", async () => {
    expect((await searchFlights({ ...flight, passengers: 1 }))[0]!.price).toBe(310);
    expect((await searchFlights(flight))[0]!.price).toBe(620);
    const roundTrip = await searchFlights({ ...flight, return: "2026-06-22" });
    expect(roundTrip[0]!.price).toBe(1240);
    expect(roundTrip[0]!.note).toContain("round-trip group total");
  });

  it.each([
    { passengers: 0 },
    { return: "2026-06-14" },
    { depart: "bad-date" },
    { to: " sydney " },
    { from: "" },
  ])("rejects invalid flight searches: %j", async (override) => {
    await expect(searchFlights({ ...flight, ...override })).rejects.toThrow();
  });
});
