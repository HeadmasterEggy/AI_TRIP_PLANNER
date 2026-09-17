"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GooglePlace, RouteResult } from "@/lib/google";

type Coordinate = { lat: number; lng: number };

// Minimal runtime boundary: the Maps SDK is loaded only when this view mounts.
type MapsSDK = {
  Map: new (
    el: HTMLElement,
    options: object,
  ) => {
    fitBounds(bounds: unknown): void;
    panTo(position: Coordinate): void;
  };
  LatLngBounds: new () => { extend(point: object): void; isEmpty(): boolean };
  marker: {
    AdvancedMarkerElement: new (options: object) => {
      map: unknown;
      addListener(event: string, fn: () => void): void;
    };
  };
  Polyline: new (options: object) => { setMap(map: unknown): void };
  geometry: { encoding: { decodePath(value: string): unknown } };
};

type MapRuntime = { maps: MapsSDK; map: InstanceType<MapsSDK["Map"]> };
type LocationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; position: Coordinate; message: string }
  | { status: "error"; message: string };

const markerColors = ["#345948", "#9b5d32", "#315d80", "#7b4b91", "#8a6a16"];

let sdk: Promise<MapsSDK> | undefined;

function loadMaps() {
  if (sdk) return sdk;
  sdk = new Promise<MapsSDK>((resolve, reject) => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) {
      reject(new Error("Map unavailable: configure the browser Google Maps key."));
      return;
    }
    const script = document.createElement("script");
    const host = window as unknown as {
      google: { maps: MapsSDK };
      tripGoogleMapsReady?: () => void;
    };
    const timeout = window.setTimeout(() => {
      delete host.tripGoogleMapsReady;
      script.remove();
      reject(new Error("Google Maps took too long to load. Check your connection and retry."));
    }, 10_000);
    host.tripGoogleMapsReady = () => {
      window.clearTimeout(timeout);
      resolve(host.google.maps);
      delete host.tripGoogleMapsReady;
    };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=marker,geometry&v=weekly&loading=async&callback=tripGoogleMapsReady`;
    script.async = true;

    script.onerror = () => {
      window.clearTimeout(timeout);
      delete host.tripGoogleMapsReady;
      script.remove();
      reject(new Error("Google Maps could not load. Check your connection and retry."));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    sdk = undefined;
    throw error;
  });
  return sdk;
}

function coordinate(place: GooglePlace): Coordinate | undefined {
  if (!place.location) return undefined;
  return { lat: place.location.latitude, lng: place.location.longitude };
}

function fitPlaces(runtime: MapRuntime, places: GooglePlace[]) {
  const bounds = new runtime.maps.LatLngBounds();
  for (const place of places) {
    const position = coordinate(place);
    if (position) bounds.extend(position);
  }
  if (bounds.isEmpty()) return false;
  runtime.map.fitBounds(bounds);
  return true;
}

function geolocationError(error: GeolocationPositionError) {
  if (error.code === 1)
    return "Location permission was denied. You can retry after allowing it in your browser settings.";
  if (error.code === 2)
    return "Your current location is unavailable. Check your device settings and retry.";
  if (error.code === 3) return "Finding your location timed out. Please retry.";
  return "Your current location could not be found. Please retry.";
}

function placeName(place: GooglePlace) {
  return place.displayName?.text ?? place.formattedAddress ?? "Activity";
}

export function TripMap({
  places,
  selected,
  onSelect,
  routes,
  mode = "WALK",
}: {
  places: GooglePlace[];
  selected?: string;
  onSelect(id: string): void;
  routes: RouteResult[];
  mode?: "WALK" | "TRANSIT";
}) {
  const root = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const initialFitComplete = useRef(false);
  const userLocationCentered = useRef(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [runtime, setRuntime] = useState<MapRuntime>();
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [nearbyRoute, setNearbyRoute] = useState<
    RouteResult | { status: "loading" } | { status: "error"; error: string }
  >();
  const mappedPlaces = places.filter((place) => coordinate(place));

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let disposed = false;
    initialFitComplete.current = false;
    setError("");
    setLoading(true);
    void loadMaps()
      .then((maps) => {
        if (disposed || !root.current) return;
        const map = new maps.Map(root.current, {
          center: { lat: 0, lng: 0 },
          zoom: 2,
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
        });
        setRuntime({ maps, map });
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : "Google Maps could not load.");
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
      setRuntime(undefined);
    };
  }, [retry]);

  useEffect(() => {
    if (!runtime) return;
    const { maps, map } = runtime;
    const cleanup: (() => void)[] = [];
    let markerIndex = 0;
    places.forEach((place) => {
      const position = coordinate(place);
      if (!position) return;
      const label = String(++markerIndex);
      const content = document.createElement("span");
      content.className = `trip-map-marker${place.id === selected ? " is-selected" : ""}`;
      content.textContent = label;
      content.setAttribute("aria-label", `${label}. ${placeName(place)}`);
      const markerColor = markerColors[(markerIndex - 1) % markerColors.length]!;
      content.style.setProperty("--marker-color", markerColor);
      content.style.backgroundColor = markerColor;
      content.style.border = place.id === selected ? "3px solid white" : "2px solid white";
      content.style.borderRadius = "999px";
      content.style.boxShadow = "0 1px 4px rgb(0 0 0 / 35%)";
      content.style.color = "white";
      content.style.display = "grid";
      content.style.fontWeight = "700";
      content.style.height = place.id === selected ? "2rem" : "1.75rem";
      content.style.placeItems = "center";
      content.style.width = place.id === selected ? "2rem" : "1.75rem";
      const marker = new maps.marker.AdvancedMarkerElement({
        map,
        position,
        title: `${label}. ${placeName(place)}`,
        content,
      });
      marker.addListener("click", () => onSelectRef.current(place.id));
      cleanup.push(() => {
        marker.map = null;
      });
    });
    routes.forEach((route) => {
      if (route.status !== "ok" || !route.polyline) return;
      const line = new maps.Polyline({
        map,
        path: maps.geometry.encoding.decodePath(route.polyline),
        strokeColor: "#345948",
        strokeWeight: 4,
      });
      cleanup.push(() => line.setMap(null));
    });
    if (!initialFitComplete.current && fitPlaces(runtime, places)) {
      initialFitComplete.current = true;
    }
    return () => cleanup.forEach((fn) => fn());
  }, [runtime, places, selected, routes]);

  useEffect(() => {
    if (!runtime || location.status !== "success") return;
    const content = document.createElement("span");
    content.className = "trip-map-user-marker";
    content.textContent = "●";
    content.setAttribute("aria-label", "Your current location");
    content.style.backgroundColor = "white";
    content.style.border = "3px solid #2563eb";
    content.style.borderRadius = "999px";
    content.style.boxShadow = "0 1px 5px rgb(0 0 0 / 40%)";
    content.style.color = "#2563eb";
    content.style.display = "grid";
    content.style.height = "1.25rem";
    content.style.placeItems = "center";
    content.style.width = "1.25rem";
    const marker = new runtime.maps.marker.AdvancedMarkerElement({
      map: runtime.map,
      position: location.position,
      title: "Your current location",
      content,
    });
    if (!userLocationCentered.current) {
      runtime.map.panTo(location.position);
      userLocationCentered.current = true;
    }
    return () => {
      marker.map = null;
    };
  }, [runtime, location]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocation({ status: "error", message: "Location is not supported by this browser." });
      return;
    }
    setLocation({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({
          status: "success",
          position: { lat: coords.latitude, lng: coords.longitude },
          message: "Your current location is shown on the map.",
        });
      },
      (cause) => setLocation({ status: "error", message: geolocationError(cause) }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const locationMessage =
    location.status === "loading"
      ? "Finding your location…"
      : location.status === "success" || location.status === "error"
        ? location.message
        : "";

  const routeFromLocation = useCallback(async () => {
    if (location.status !== "success" || !selected) return;
    setNearbyRoute({ status: "loading" });
    try {
      const response = await fetch("/api/routes/from-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: location.position.lat,
          longitude: location.position.lng,
          placeId: selected,
          mode,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Route lookup failed.");
      setNearbyRoute(body as RouteResult);
    } catch (cause) {
      setNearbyRoute({
        status: "error",
        error: cause instanceof Error ? cause.message : "Route lookup failed.",
      });
    }
  }, [location, mode, selected]);

  return (
    <section className="trip-map" aria-label="Trip map">
      <div className="trip-map-controls">
        <button
          type="button"
          onClick={() => runtime && fitPlaces(runtime, places)}
          disabled={!runtime || mappedPlaces.length === 0}
        >
          View all places
        </button>
        <button type="button" onClick={requestLocation} disabled={location.status === "loading"}>
          {location.status === "loading"
            ? "Finding location…"
            : location.status === "error"
              ? "Retry my location"
              : "Show my location"}
        </button>
        {location.status === "success" && selected && (
          <button
            type="button"
            onClick={() => void routeFromLocation()}
            disabled={nearbyRoute?.status === "loading"}
          >
            {nearbyRoute?.status === "loading" ? "Checking route…" : "Route from my location"}
          </button>
        )}
      </div>
      <div ref={root} className="google-map" aria-label="Google activity map" />
      {loading && <p role="status">Loading Google Maps…</p>}
      {mappedPlaces.length > 0 && (
        <ol className="trip-map-place-list" aria-label="Places shown on the map">
          {mappedPlaces.map((place, index) => (
            <li key={place.id}>
              <button
                type="button"
                aria-pressed={place.id === selected}
                onClick={() => onSelectRef.current(place.id)}
              >
                {index + 1}. {placeName(place)}
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="trip-map-location-status" aria-live="polite">
        {locationMessage}
      </p>
      {nearbyRoute?.status === "ok" && (
        <p className="trip-map-location-status" role="status">
          Google Routes verified · {nearbyRoute.mode === "WALK" ? "Walking" : "Public transit"} ·{" "}
          {nearbyRoute.durationMin} min
          {nearbyRoute.distanceMeters !== undefined
            ? ` · ${(nearbyRoute.distanceMeters / 1000).toFixed(1)} km`
            : " · Distance unavailable"}
        </p>
      )}
      {nearbyRoute?.status === "unavailable" && (
        <p className="trip-map-location-status" role="alert">
          Route could not be verified. {nearbyRoute.error}
        </p>
      )}
      {nearbyRoute?.status === "error" && (
        <p className="trip-map-location-status" role="alert">
          {nearbyRoute.error}
        </p>
      )}
      {error && (
        <div className="trip-map-fallback" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Retry map
          </button>
          {mappedPlaces.length > 0 && (
            <div aria-label="Mapped places">
              <p>Trip places remain available:</p>
              <ol>
                {mappedPlaces.map((place) => (
                  <li key={place.id}>
                    <button type="button" onClick={() => onSelectRef.current(place.id)}>
                      {placeName(place)}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
      {!error && mappedPlaces.length === 0 && (
        <p className="trip-map-empty">Add or verify an activity place to show it on the map.</p>
      )}
    </section>
  );
}
