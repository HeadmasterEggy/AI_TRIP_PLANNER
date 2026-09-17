import { describe, expect, it } from "vitest";
import { destinationCities, placeQueryFor } from "./place-query";

describe("place query strategy", () => {
  it("never searches descriptive activity prose", () => {
    for (const detail of [
      "Arrival-day orientation walk at the single grounded candidate; low-key start to settle in.",
      "Morning visit at the grounded candidate place, followed by a slow lunch",
      "Free time",
      "Afternoon stroll around the neighbourhood",
      "Kyoto-side morning visit at the grounded candidate place.",
    ])
      expect(placeQueryFor({ detail })).toEqual({ kind: "none" });
  });

  it("prefers a saved place ID, then an explicit location, then a title that is a place name", () => {
    expect(placeQueryFor({ placeId: "abc", location: "Louvre", detail: "Louvre" })).toEqual({
      kind: "id",
      placeId: "abc",
    });
    expect(
      placeQueryFor({ location: "Sensō-ji", detail: "Morning visit before the crowds arrive." }),
    ).toEqual({ kind: "search", text: "Sensō-ji" });
    expect(placeQueryFor({ detail: "Musée d'Orsay" })).toEqual({
      kind: "search",
      text: "Musée d'Orsay",
    });
    expect(placeQueryFor({ detail: "伏見稲荷大社" })).toEqual({
      kind: "search",
      text: "伏見稲荷大社",
    });
  });

  it("ignores placeholder locations from mock tools", () => {
    expect(
      placeQueryFor({ location: "Mock attraction near Tokyo & Kyoto", detail: "Visit the sight." }),
    ).toEqual({ kind: "none" });
  });

  it("splits multi-city destinations", () => {
    expect(destinationCities(" Tokyo & Kyoto &Tokyo ")).toEqual(["Tokyo", "Kyoto"]);
    expect(destinationCities("")).toEqual([]);
  });
});
