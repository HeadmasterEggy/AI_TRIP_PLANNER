// Owner: C — deterministic Booking / Price mocks; no reservations or payments.
// Stay prices are USD per room per night, assuming at most two guests per room.
// Flight prices are USD for ALL passengers and include both legs when returning.
import type { StayQuery, StayOption, FlightQuery, FlightOption } from "@trip/shared";

export type { StayQuery, StayOption, FlightQuery, FlightOption } from "@trip/shared";

// Expensive Tokyo/Kyoto standard rooms keep the negotiation demo useful.
// These are fictional fixtures, not quotes, availability or real recommendations.
const NIGHTLY_RATES = new Map<string, [number, number, number]>([
  ["tokyo", [240, 380, 520]],
  ["kyoto", [220, 360, 490]],
  ["sydney", [150, 230, 330]],
  ["paris", [160, 250, 360]],
]);

function dateValue(date: string): number {
  const value = Date.parse(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(value) ||
    new Date(value).toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`Booking requires a valid YYYY-MM-DD date: ${date}`);
  }
  return value;
}

function requireCount(count: number): void {
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error("Booking requires a positive integer guest/passenger count.");
  }
}

export async function searchStays(q: StayQuery): Promise<StayOption[]> {
  requireCount(q.guests);
  if (dateValue(q.checkOut) <= dateValue(q.checkIn)) {
    throw new Error("Check-out must be after check-in.");
  }
  const city = q.city.trim();
  if (!city) throw new Error("A city is required for a stay search.");
  const [economy, standard, comfort] = NIGHTLY_RATES.get(city.toLowerCase()) ?? [100, 180, 280];
  return [
    {
      name: `Mock ${city} Economy`,
      area: "Outer district",
      pricePerNightUsd: economy,
      rating: 7.6,
      freeCancellation: true,
    },
    {
      name: `Mock ${city} Standard`,
      area: "Central",
      pricePerNightUsd: standard,
      rating: 8.7,
      freeCancellation: true,
    },
    {
      name: `Mock ${city} Comfort`,
      area: "Central",
      pricePerNightUsd: comfort,
      rating: 9.3,
      freeCancellation: true,
    },
    {
      name: `Mock ${city} Saver`,
      area: "Outer district",
      pricePerNightUsd: economy - 20,
      rating: 7.2,
      freeCancellation: false,
    },
  ];
}

export async function searchFlights(q: FlightQuery): Promise<FlightOption[]> {
  requireCount(q.passengers);
  const departure = dateValue(q.depart);
  if (q.return !== undefined && dateValue(q.return) < departure) {
    throw new Error("Return date cannot precede departure.");
  }
  const from = q.from.trim();
  const to = q.to.trim();
  if (!from || !to || from.toLowerCase() === to.toLowerCase()) {
    throw new Error("Flight origin and destination must be distinct, non-empty locations.");
  }
  const legs = q.return === undefined ? 1 : 2;
  if (!Number.isSafeInteger(420 * q.passengers * legs * 100)) {
    throw new Error("Flight estimate exceeds supported USD precision.");
  }
  const note =
    `${from} ${legs === 2 ? "<->" : "->"} ${to}; ${q.passengers} passengers; ` +
    `${legs === 2 ? "round-trip" : "one-way"} group total in USD; fictional mock fare`;
  return [
    { carrier: "MockAir Economy", priceUsd: 310 * q.passengers * legs, note },
    { carrier: "MockAir Flexible", priceUsd: 420 * q.passengers * legs, note },
  ];
}
