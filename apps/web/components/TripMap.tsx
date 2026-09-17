"use client";
import { useEffect, useRef, useState } from "react";
import type { GooglePlace, RouteResult } from "@/lib/google";
// Minimal runtime boundary: the Maps SDK is loaded only when this view mounts.
type MapsSDK = {
  Map: new (el: HTMLElement, options: object) => { fitBounds(bounds: unknown): void };
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
    host.tripGoogleMapsReady = () => {
      resolve(host.google.maps);
      delete host.tripGoogleMapsReady;
    };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=marker,geometry&v=weekly&loading=async&callback=tripGoogleMapsReady`;
    script.async = true;

    script.onerror = () => {
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
export function TripMap({
  places,
  selected,
  onSelect,
  routes,
}: {
  places: GooglePlace[];
  selected?: string;
  onSelect(id: string): void;
  routes: RouteResult[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [runtime, setRuntime] = useState<{ maps: MapsSDK; map: InstanceType<MapsSDK["Map"]> }>();
  useEffect(() => {
    let disposed = false;
    setError("");
    void loadMaps()
      .then((maps) => {
        if (disposed || !root.current) return;
        const map = new maps.Map(root.current, {
          center: { lat: 0, lng: 0 },
          zoom: 2,
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
        });
        setRuntime({ maps, map });
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
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
    const bounds = new maps.LatLngBounds();
    places.forEach((place) => {
      if (!place.location) return;
      const position = { lat: place.location.latitude, lng: place.location.longitude };
      bounds.extend(position);
      const content = document.createElement("span");
      content.textContent = place.id === selected ? "●" : "📍";
      const marker = new maps.marker.AdvancedMarkerElement({
        map,
        position,
        title: place.displayName?.text ?? "Activity",
        content,
      });
      marker.addListener("click", () => onSelect(place.id));
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
    if (!bounds.isEmpty()) map.fitBounds(bounds);
    return () => cleanup.forEach((fn) => fn());
  }, [runtime, places, selected, onSelect, routes]);
  return (
    <>
      <div ref={root} className="google-map" aria-label="Google activity map" />
      {error && (
        <p role="alert">
          {error} <button onClick={() => setRetry((r) => r + 1)}>Retry map</button>
        </p>
      )}
    </>
  );
}
