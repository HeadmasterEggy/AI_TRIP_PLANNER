import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TripMap } from "./TripMap";

function setGeolocation(getCurrentPosition: Geolocation["getCurrentPosition"]) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "geolocation");
  vi.unstubAllGlobals();
});

describe("TripMap", () => {
  it("keeps the selected place available as a pressed list button", () => {
    render(
      <TripMap
        places={[
          {
            id: "place-1",
            displayName: { text: "Museum" },
            location: { latitude: -33.87, longitude: 151.2 },
          },
        ]}
        selected="place-1"
        routes={[]}
        onSelect={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "1. Museum", pressed: true }),
    ).toBeTruthy();
  });

  it("requests location only after the user clicks and reports success", async () => {
    const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>((success) => {
      success({ coords: { latitude: -33.86, longitude: 151.21 } } as GeolocationPosition);
    });
    setGeolocation(getCurrentPosition);

    render(<TripMap places={[]} routes={[]} onSelect={() => {}} />);
    expect(getCurrentPosition).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Show my location" }));
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByText("Your current location is shown on the map.")).toBeTruthy(),
    );
  });

  it("explains denied permission and exposes a retry action", async () => {
    const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>((_success, failure) => {
      failure?.({ code: 1 } as GeolocationPositionError);
    });
    setGeolocation(getCurrentPosition);

    render(<TripMap places={[]} routes={[]} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Show my location" }));

    await waitFor(() => expect(screen.getByText(/permission was denied/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Retry my location" }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it("handles browsers without geolocation", async () => {
    render(<TripMap places={[]} routes={[]} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Show my location" }));
    await waitFor(() => expect(screen.getByText(/not supported by this browser/i)).toBeTruthy());
  });

  it("looks up a verified route only after location and an explicit click", async () => {
    setGeolocation((success) => {
      success({ coords: { latitude: -33.86, longitude: 151.21 } } as GeolocationPosition);
    });
    const fetcher = vi.fn(async () =>
      Response.json({
        from: "current-location",
        to: "place-1",
        mode: "WALK",
        status: "ok",
        durationMin: 12,
        distanceMeters: 950,
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(
      <TripMap
        places={[
          {
            id: "place-1",
            displayName: { text: "Museum" },
            location: { latitude: -33.87, longitude: 151.2 },
          },
        ]}
        selected="place-1"
        routes={[]}
        onSelect={() => {}}
      />,
    );
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Show my location" }));
    fireEvent.click(await screen.findByRole("button", { name: "Route from my location" }));
    expect(await screen.findByText(/12 min · 0.9 km/)).toBeTruthy();
  });

  it.each([
    [2, /current location is unavailable/i],
    [3, /timed out/i],
  ])("reports geolocation error code %s", async (code, expectedMessage) => {
    setGeolocation((_success, failure) => {
      failure?.({ code } as GeolocationPositionError);
    });
    render(<TripMap places={[]} routes={[]} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Show my location" }));
    await waitFor(() => expect(screen.getByText(expectedMessage)).toBeTruthy());
  });
});
