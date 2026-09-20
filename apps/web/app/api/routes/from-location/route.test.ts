import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/google", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google")>("@/lib/google");
  return { ...actual, googleRouteFromCoordinates: vi.fn() };
});

function request(body: unknown) {
  return new Request("http://localhost/api/routes/from-location", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.clearAllMocks());

const validBody = { latitude: -33.86, longitude: 151.21, placeId: "place-1", mode: "WALK" };

describe("POST /api/routes/from-location", () => {
  it("forwards valid coordinates and returns the computed route", async () => {
    const { googleRouteFromCoordinates } = await import("@/lib/google");
    vi.mocked(googleRouteFromCoordinates).mockResolvedValue({
      from: "current-location",
      to: "place-1",
      mode: "WALK",
      status: "ok",
      durationMin: 5,
    });

    const response = await POST(request(validBody));

    expect(googleRouteFromCoordinates).toHaveBeenCalledWith(
      { latitude: -33.86, longitude: 151.21 },
      "place-1",
      "WALK",
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", durationMin: 5 });
  });

  it.each([
    { ...validBody, latitude: 91 }, // out of range
    { ...validBody, longitude: -181 }, // out of range
    { ...validBody, placeId: "" }, // empty
    { ...validBody, mode: "DRIVE" }, // unsupported mode
    { latitude: -33.86, longitude: 151.21 }, // missing placeId/mode
  ])("rejects an invalid request body with 400 instead of calling Google", async (body) => {
    const { googleRouteFromCoordinates } = await import("@/lib/google");

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(googleRouteFromCoordinates).not.toHaveBeenCalled();
  });

  it("returns 400 with the original message when the lookup itself fails", async () => {
    const { googleRouteFromCoordinates } = await import("@/lib/google");
    vi.mocked(googleRouteFromCoordinates).mockRejectedValue(new Error("boom"));

    const response = await POST(request(validBody));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "boom" });
  });
});
