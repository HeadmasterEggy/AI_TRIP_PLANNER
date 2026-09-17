import { z } from "zod";

export const PlaceDetails = z.object({
  id: z.string().min(1),
  displayName: z.object({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  location: z
    .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
    .optional(),
  googleMapsUri: z.string().url().optional(),
  rating: z.number().optional(),
  attributions: z
    .array(z.object({ provider: z.string().optional(), providerUri: z.string().optional() }))
    .optional(),
});
export type GooglePlace = z.infer<typeof PlaceDetails>;
const fields = "id,displayName,formattedAddress,location,googleMapsUri,rating,attributions";
function key() {
  if (!process.env.MAPS_API_KEY)
    throw new Error("Google Maps is not configured. Add the server MAPS_API_KEY.");
  return process.env.MAPS_API_KEY;
}
async function request(url: string, mask?: string, body?: unknown) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key(),
      ...(mask ? { "X-Goog-FieldMask": mask } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google request failed (${response.status}). Please retry.`);
  return response.json();
}
export async function searchPlaces(text: string, destination: string) {
  const data = await request(
    "https://places.googleapis.com/v1/places:searchText",
    fields
      .split(",")
      .map((f) => `places.${f}`)
      .join(","),
    { textQuery: `${text} ${destination}`, pageSize: 5 },
  );
  return z.array(PlaceDetails).parse(data.places ?? []);
}
export async function placeDetails(id: string) {
  return PlaceDetails.parse(
    await request(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, fields),
  );
}
export async function timeZone(place: GooglePlace, date: string) {
  if (!place.location) throw new Error("This place has no verified coordinates.");
  const { latitude, longitude } = place.location;
  const url = new URL("https://maps.googleapis.com/maps/api/timezone/json");
  url.search = new URLSearchParams({
    location: `${latitude},${longitude}`,
    timestamp: String(Date.parse(`${date}T12:00:00Z`) / 1000),
    key: key(),
  }).toString();
  const data = await request(url.toString());
  if (data.status !== "OK" || typeof data.timeZoneId !== "string")
    throw new Error("Destination time zone could not be verified.");
  return data.timeZoneId as string;
}
/** Enumerate possible offsets: reject ambiguous/nonexistent local times at DST transitions. */
export function localInstant(date: string, time: string, zone: string) {
  const target = `${date}T${time}`;
  const naive = Date.parse(`${target}:00Z`);
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const matches: number[] = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const instant = naive - offset * 60000;
    if (formatter.format(new Date(instant)).replace(" ", "T") === target) matches.push(instant);
  }
  if (matches.length !== 1)
    throw new Error(
      "Local time is ambiguous or nonexistent due to daylight saving. Choose another time.",
    );
  return new Date(matches[0]!).toISOString();
}
export type RouteResult = {
  from: string;
  to: string;
  mode: "WALK" | "TRANSIT";
  status: "ok" | "unavailable";
  durationMin?: number;
  distanceMeters?: number;
  polyline?: string;
  fare?: { amount: number; currency: string };
  error?: string;
};
export async function googleRoute(
  from: string,
  to: string,
  departure: string,
  mode: "WALK" | "TRANSIT",
): Promise<RouteResult> {
  const base = { from, to, mode };
  try {
    const delta = Date.parse(departure) - Date.now();
    if (mode === "TRANSIT" && (delta < -7 * 86400000 || delta > 100 * 86400000))
      throw new Error("Transit departure is outside Google's supported date window.");
    const data = await request(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      "routes.duration,routes.polyline.encodedPolyline,routes.travelAdvisory.transitFare",
      {
        origin: { placeId: from },
        destination: { placeId: to },
        travelMode: mode,
        ...(mode === "TRANSIT" ? { departureTime: departure } : {}),
      },
    );
    const route = data.routes?.[0];
    if (!route || !/^\d+(\.\d+)?s$/.test(route.duration))
      throw new Error("No verified route was returned.");
    const durationMin = Math.ceil(Number(route.duration.slice(0, -1)) / 60);
    if (!Number.isFinite(durationMin) || durationMin <= 0)
      throw new Error("Invalid route duration.");
    const fare = route.travelAdvisory?.transitFare;
    const amount = Number(fare?.units ?? 0) + Number(fare?.nanos ?? 0) / 1e9;
    return {
      ...base,
      status: "ok",
      durationMin,
      polyline: route.polyline?.encodedPolyline,
      ...(fare?.currencyCode && Number.isFinite(amount) && amount >= 0
        ? { fare: { amount, currency: fare.currencyCode } }
        : {}),
    };
  } catch (error) {
    return {
      ...base,
      status: "unavailable",
      error: error instanceof Error ? error.message : "Route unavailable",
    };
  }
}

/** User-triggered route lookup. Coordinates are used only for this request and are never stored. */
export async function googleRouteFromCoordinates(
  origin: { latitude: number; longitude: number },
  to: string,
  mode: "WALK" | "TRANSIT",
): Promise<RouteResult> {
  const base = { from: "current-location", to, mode } as const;
  try {
    const data = await request(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      "routes.duration,routes.distanceMeters,routes.travelAdvisory.transitFare",
      {
        origin: { location: { latLng: origin } },
        destination: { placeId: to },
        travelMode: mode,
        ...(mode === "TRANSIT" ? { departureTime: new Date().toISOString() } : {}),
      },
    );
    const route = data.routes?.[0];
    if (!route || !/^\d+(\.\d+)?s$/.test(route.duration))
      throw new Error("No verified route was returned.");
    const durationMin = Math.ceil(Number(route.duration.slice(0, -1)) / 60);
    const distanceMeters = Number(route.distanceMeters);
    if (!Number.isFinite(durationMin) || durationMin <= 0)
      throw new Error("Invalid route duration.");
    const fare = route.travelAdvisory?.transitFare;
    const amount = Number(fare?.units ?? 0) + Number(fare?.nanos ?? 0) / 1e9;
    return {
      ...base,
      status: "ok",
      durationMin,
      ...(Number.isFinite(distanceMeters) && distanceMeters >= 0 ? { distanceMeters } : {}),
      ...(fare?.currencyCode && Number.isFinite(amount) && amount >= 0
        ? { fare: { amount, currency: fare.currencyCode } }
        : {}),
    };
  } catch (error) {
    return {
      ...base,
      status: "unavailable",
      error: error instanceof Error ? error.message : "Route unavailable",
    };
  }
}
