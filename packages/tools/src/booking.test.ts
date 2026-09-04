import { describe, expect, it } from "vitest";
import { searchFlights, searchStays } from "./booking";

const stay = { city: "Tokyo", checkIn: "2026-06-15", checkOut: "2026-06-19", guests: 2 };
const flight = { from: "Sydney", to: "Tokyo", depart: "2026-06-15", passengers: 2 };

describe("Booking mock", () => {
  it("offers distinct, clearly labelled mock hotel choices with per-room prices", async () => {
    const result = await searchStays(stay);
    expect(result).toHaveLength(4);
    expect(result.every((option) => option.name.startsWith("Mock "))).toBe(true);
    expect(new Set(result.map((option) => option.pricePerNightUsd)).size).toBe(4);
    expect(await searchStays({ ...stay, guests: 5 })).toEqual(result);
    expect(await searchStays({ ...stay, city: "Kyoto" })).not.toEqual(result);
  });

  it("returns deterministic, independent fixtures and supports a generic city", async () => {
    const first = await searchStays(stay);
    first[0]!.pricePerNightUsd = 1;
    expect((await searchStays(stay))[0]!.pricePerNightUsd).toBe(240);
    const unknown = await searchStays({ ...stay, city: "Osaka" });
    expect(unknown[0]!.name).toBe("Mock Osaka Economy");
    expect(unknown[0]!.pricePerNightUsd).toBe(100);
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

  it("quotes flights for the whole group, scaling passengers and return legs exactly once", async () => {
    expect((await searchFlights({ ...flight, passengers: 1 }))[0]!.priceUsd).toBe(310);
    expect((await searchFlights(flight))[0]!.priceUsd).toBe(620);
    const roundTrip = await searchFlights({ ...flight, return: "2026-06-22" });
    expect(roundTrip[0]!.priceUsd).toBe(1240);
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
