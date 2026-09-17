"use client";
import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { RouteResult } from "@/lib/google";
import type { TripPlaces } from "./useTripPlaces";

const TripMap = dynamic(() => import("./TripMap").then((m) => m.TripMap), {
  ssr: false,
  loading: () => <p className="trip-map-loading">Loading map…</p>,
});

/**
 * The persistent right-hand canvas. It shows only the map, markers, map status and map
 * controls — timelines, editors and trip cards live in the Your Trip drawer.
 */
export function TripMapCanvas({
  blank,
  viewKey,
  tripPlaces,
  selectedActivity,
  onSelectActivity,
  routes,
}: {
  blank: boolean;
  viewKey?: string;
  tripPlaces: TripPlaces;
  selectedActivity?: string;
  onSelectActivity(id: string): void;
  routes: RouteResult[];
}) {
  const { activities, markers, loading, error, unmatched, retry, activityForPlace } = tripPlaces;
  const places = useMemo(() => markers.map((marker) => marker.place), [markers]);
  const selected = markers.find((marker) => marker.activityId === selectedActivity)?.place.id;
  const status = blank
    ? "Start planning to see your trip's places here."
    : loading
      ? "Finding Google places for this trip…"
      : !activities.length
        ? "This trip has no activities to map yet."
        : !markers.length && !error
          ? "No activity places could be shown on the map."
          : "";
  return (
    <section className="trip-map-canvas" aria-label="Trip map">
      <TripMap
        places={places}
        selected={selected}
        onSelect={(placeId) => {
          const activityId = activityForPlace(placeId);
          if (activityId) onSelectActivity(activityId);
        }}
        routes={routes}
        viewKey={viewKey}
      />
      {markers.length > 0 && (error || unmatched > 0) ? (
        // Some places loaded: keep the map usable and report the rest without covering it.
        <div className="trip-map-status trip-map-status--partial" role="status" title={error}>
          <p>
            {unmatched || "Some"} {unmatched === 1 ? "activity" : "activities"} could not be placed
            on the map.
          </p>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      ) : (
        (status || error) && (
          <div className="trip-map-status" role={error ? "alert" : "status"}>
            <p>{error || status}</p>
            {error && (
              <button type="button" onClick={retry}>
                Retry places
              </button>
            )}
          </div>
        )
      )}
    </section>
  );
}
