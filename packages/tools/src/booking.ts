// Owner: C — Booking / Price adapter (MOCK ONLY — real payment is out of scope)
// TODO(C): call a real lodging / flight price API. Canned data for now.

export interface StayQuery {
  city: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

export interface StayOption {
  name: string;
  area: string;
  pricePerNightUsd: number;
  rating: number;
  freeCancellation: boolean;
}

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

export interface FlightQuery {
  from: string;
  to: string;
  depart: string;
  return?: string;
  passengers: number;
}

export interface FlightOption {
  carrier: string;
  priceUsd: number;
  note?: string;
}

export async function searchFlights(q: FlightQuery): Promise<FlightOption[]> {
  return [{ carrier: "StubAir", priceUsd: 1246, note: `${q.from} <-> ${q.to}` }];
}
