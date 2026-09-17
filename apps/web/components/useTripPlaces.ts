"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TripPlan } from "@trip/shared";
import type { GooglePlace } from "@/lib/google";
import { itineraryActivities } from "@/lib/workspace";

type Activity = ReturnType<typeof itineraryActivities>[number];

/** One numbered map marker and the activity that owns it. */
export type TripMarker = { activityId: string; place: GooglePlace; verified: boolean };

export type TripPlaces = {
  activities: Activity[];
  markers: TripMarker[];
  places: Record<string, GooglePlace>;
  loading: boolean;
  error: string;
  /** Activities whose place could not be loaded or matched in the latest lookup. */
  unmatched: number;
  placeIdFor(activity: Activity): string | undefined;
  activityForPlace(placeId: string): string | undefined;
  rememberPlace(place: GooglePlace): void;
  retry(): void;
};

const matchKey = (destination: string, detail: string) => `${destination} :: ${detail}`;

/**
 * Resolve the active trip's activities into Google places for the map and the timeline.
 *
 * Saved place IDs load their details; named activities without one are matched by text
 * search. Matches live only in memory and are never written into the plan. Every change to
 * the activity list aborts in-flight lookups, so a response for a previous trip or chat can
 * never add markers to the current one.
 */
export function useTripPlaces(plan: TripPlan | undefined): TripPlaces {
  const activities = useMemo(() => itineraryActivities(plan), [plan]);
  const destination = plan?.brief.destination ?? "";
  const [places, setPlaces] = useState<Record<string, GooglePlace>>({});
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unmatched, setUnmatched] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const known = useRef({ places, matches });
  known.current = { places, matches };
  const failed = useRef(new Set<string>());

  useEffect(() => {
    const { places: loaded, matches: matched } = known.current;
    const detailIds = [
      ...new Set(
        activities.flatMap((item) =>
          item.placeId && !loaded[item.placeId] && !failed.current.has(item.placeId)
            ? [item.placeId]
            : [],
        ),
      ),
    ];
    const searches = [
      ...new Set(
        activities.flatMap((item) => {
          const key = matchKey(destination, item.detail);
          return !item.placeId && !matched[key] && !failed.current.has(key) ? [item.detail] : [];
        }),
      ),
    ];
    const failures = () =>
      activities.filter((item) =>
        failed.current.has(item.placeId ?? matchKey(destination, item.detail)),
      ).length;
    if (!detailIds.length && !searches.length) {
      // Everything is cached: report only this trip's failures, never a previous trip's error.
      const count = failures();
      setLoading(false);
      setUnmatched(count);
      if (!count) setError("");
      return;
    }
    const controller = new AbortController();
    const post = async (url: string, body: unknown) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Google place lookup failed.");
      return json;
    };
    setLoading(true);
    setError("");
    setUnmatched(0);
    void Promise.allSettled([
      ...detailIds.map(async (placeId) => {
        try {
          const body = await post("/api/places/details", { placeId });
          return { place: body.place as GooglePlace };
        } catch (cause) {
          if (!controller.signal.aborted) failed.current.add(placeId);
          throw cause;
        }
      }),
      ...searches.map(async (detail) => {
        const key = matchKey(destination, detail);
        try {
          const body = await post("/api/places/search", { text: detail, destination });
          const place = (body.places as GooglePlace[] | undefined)?.find((item) => item.location);
          if (!place) throw new Error(`No Google place matched ${detail}.`);
          return { place, key };
        } catch (cause) {
          if (!controller.signal.aborted) failed.current.add(key);
          throw cause;
        }
      }),
    ]).then((results) => {
      if (controller.signal.aborted) return;
      const found = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      if (found.length)
        setPlaces((old) => ({
          ...old,
          ...Object.fromEntries(found.map(({ place }) => [place.id, place])),
        }));
      const matchedNow = found.flatMap((item) => ("key" in item ? [item] : []));
      if (matchedNow.length)
        setMatches((old) => ({
          ...old,
          ...Object.fromEntries(matchedNow.map(({ key, place }) => [key, place.id])),
        }));
      setUnmatched(failures());
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected?.status === "rejected")
        setError(
          rejected.reason instanceof Error
            ? rejected.reason.message
            : "Some places could not be loaded from Google.",
        );
      setLoading(false);
    });
    return () => controller.abort();
  }, [activities, destination, attempt]);

  const placeIdFor = useCallback(
    (activity: Activity) =>
      activity.placeId ?? matches[matchKey(destination, activity.detail)] ?? undefined,
    [destination, matches],
  );

  const markers = useMemo(() => {
    const seen = new Set<string>();
    return activities.flatMap((activity) => {
      const placeId = placeIdFor(activity);
      const place = placeId ? places[placeId] : undefined;
      if (!activity.id || !place?.location || seen.has(place.id)) return [];
      seen.add(place.id);
      return [{ activityId: activity.id, place, verified: !!activity.placeId }];
    });
  }, [activities, places, placeIdFor]);

  const activityForPlace = useCallback(
    (placeId: string) => markers.find((marker) => marker.place.id === placeId)?.activityId,
    [markers],
  );
  const rememberPlace = useCallback((place: GooglePlace) => {
    failed.current.delete(place.id);
    setPlaces((old) => ({ ...old, [place.id]: place }));
  }, []);
  const retry = useCallback(() => {
    failed.current.clear();
    setError("");
    setAttempt((value) => value + 1);
  }, []);

  return {
    activities,
    markers,
    places,
    loading,
    error,
    unmatched,
    placeIdFor,
    activityForPlace,
    rememberPlace,
    retry,
  };
}
