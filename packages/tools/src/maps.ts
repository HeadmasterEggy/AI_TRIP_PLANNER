// Owner: B — Maps / Places adapter
// TODO(B): call a real routing / places API. Canned data for now so
//          TransportAgent + ItineraryPlannerAgent can be built independently.
// The interface lives in @trip/shared (MapsPort); this file implements it.

import type { RouteQuery, RouteLeg, PlaceQuery, Place } from "@trip/shared";

export type { RouteQuery, RouteLeg, PlaceQuery, Place } from "@trip/shared";

export async function route(q: RouteQuery): Promise<RouteLeg[]> {
  return [{ mode: "train", durationMin: 140, priceUsd: 90, note: `stub ${q.from} -> ${q.to}` }];
}

export async function places(q: PlaceQuery): Promise<Place[]> {
  return [{ name: `Stub attraction near ${q.near}`, category: q.category ?? "sight", rating: 4.5 }];
}
