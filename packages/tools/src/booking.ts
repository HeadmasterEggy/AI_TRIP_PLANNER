// Owner: C — Booking / Price adapter (MOCK ONLY — real payment is out of scope)
// TODO(C): call a real lodging / flight price API. Canned data for now.
// The interface lives in @trip/shared (BookingPort); this file implements it.

import type {
  StayQuery,
  StayOption,
  FlightQuery,
  FlightOption,
} from "@trip/shared";

export type { StayQuery, StayOption, FlightQuery, FlightOption } from "@trip/shared";

export async function searchStays(q: StayQuery): Promise<StayOption[]> {
  return [
    {
      name: `Stub Hotel ${q.city}`,
      area: "Central",
      pricePerNightUsd: 180,
      rating: 8.7,
      freeCancellation: true,
    },
  ];
}

export async function searchFlights(q: FlightQuery): Promise<FlightOption[]> {
  return [{ carrier: "StubAir", priceUsd: 1246, note: `${q.from} <-> ${q.to}` }];
}
