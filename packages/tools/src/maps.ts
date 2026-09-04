// Owner: B — Maps / Places adapter
// TODO(B): call a real routing / places API. For now returns canned data so
//          TransportAgent + ItineraryPlannerAgent can be built independently.

export interface RouteQuery {
  from: string;
  to: string;
  date?: string;
}

export interface RouteLeg {
  mode: "train" | "flight" | "bus" | "walk" | "transit";
  durationMin: number;
  priceUsd: number;
  note?: string;
}

export async function route(q: RouteQuery): Promise<RouteLeg[]> {
  return [{ mode: "train", durationMin: 140, priceUsd: 90, note: `stub ${q.from} -> ${q.to}` }];
}

export interface PlaceQuery {
  near: string;
  category?: string;
}

export interface Place {
  name: string;
  category: string;
  rating?: number;
}

export async function places(q: PlaceQuery): Promise<Place[]> {
  return [{ name: `Stub attraction near ${q.near}`, category: q.category ?? "sight", rating: 4.5 }];
}
