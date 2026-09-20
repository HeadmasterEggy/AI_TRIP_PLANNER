// Owner: C — Booking / Price adapter; no reservations or payments.
// Stay prices are AUD per room per night, assuming at most two guests per room.
// Flight prices are AUD for ALL passengers and include both legs when returning.
//
// Hotels: Google has no public live-pricing API (real availability/rates need
// a partner agreement with Booking.com/Expedia/etc., out of scope for this
// project). Real mode is therefore "grounded, estimated": a real property
// from Google Places, priced by mapping Google's price_level bucket to a
// planning estimate — never a live quote. Flights stay mock-only; no
// grounded flight provider is wired up.
import type { StayQuery, StayOption, FlightQuery, FlightOption } from "@trip/shared";
import { searchGooglePlacesText } from "./google-places";

export type { StayQuery, StayOption, FlightQuery, FlightOption } from "@trip/shared";

const mockEnabled = () => process.env.USE_MOCK_TOOLS !== "false";
const provider = () => process.env.MAPS_PROVIDER || (process.env.MAPS_API_KEY ? "google" : "osm");

// Google's place rating is 1.0-5.0; every rating-based rule in this project
// (StayCandidate.rating, accommodation.minRating, chooseInitial's ">= 8")
// assumes a 0-10 scale. Skipping this conversion doesn't fail validation
// (4.6 is still a legal 0-10 value) — it just silently misjudges every real
// hotel's quality, which is exactly the kind of bug that needs a test, not
// just a schema check.
function normalizedRating(googleRating: number | undefined): number {
  if (!Number.isFinite(googleRating)) return 0;
  return Math.round(googleRating! * 2 * 10) / 10;
}

// Google Places' price_level is a coarse 5-bucket enum, not a nightly rate.
// These AUD figures are planning estimates per bucket, converted from the
// original USD estimates using the product's static USD -> AUD rate of 1.5,
// not derived from any live source.
// They use the same "estimate, not a quote" convention the mock fixtures
// already use, just grounded in a bucket Google actually reports for the
// property instead of an invented city tier.
const PRICE_LEVEL_ESTIMATE_AUD: Partial<Record<string, number>> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 135,
  PRICE_LEVEL_MODERATE: 225,
  PRICE_LEVEL_EXPENSIVE: 390,
  PRICE_LEVEL_VERY_EXPENSIVE: 630,
};
function estimatedNightlyRate(priceLevel: string | undefined): number {
  // Google frequently omits price_level for lodging; "moderate" is the
  // least-wrong default when the property didn't report one.
  return PRICE_LEVEL_ESTIMATE_AUD[priceLevel ?? ""] ?? PRICE_LEVEL_ESTIMATE_AUD.PRICE_LEVEL_MODERATE!;
}

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

  if (mockEnabled()) {
    const [economy, standard, comfort] = NIGHTLY_RATES.get(city.toLowerCase()) ?? [100, 180, 280];
    return [
      {
        name: `Mock ${city} Economy`,
        area: "Outer district",
        pricePerNight: economy,
        rating: 7.6,
        freeCancellation: true,
      },
      {
        name: `Mock ${city} Standard`,
        area: "Central",
        pricePerNight: standard,
        rating: 8.7,
        freeCancellation: true,
      },
      {
        name: `Mock ${city} Comfort`,
        area: "Central",
        pricePerNight: comfort,
        rating: 9.3,
        freeCancellation: true,
      },
      {
        name: `Mock ${city} Saver`,
        area: "Outer district",
        pricePerNight: economy - 20,
        rating: 7.2,
        freeCancellation: false,
      },
    ];
  }

  if (provider() !== "google") throw new Error(`Unsupported booking provider: ${provider()}`);
  if (!process.env.MAPS_API_KEY) throw new Error("Google Places provider requires MAPS_API_KEY.");
  const results = await searchGooglePlacesText(
    `hotels in ${city}`,
    "places.displayName,places.rating,places.priceLevel,places.formattedAddress",
  );
  const options: StayOption[] = results
    .map((place) => ({
      name: place.displayName?.text?.trim() ?? "",
      area: place.formattedAddress?.trim() || city,
      pricePerNight: estimatedNightlyRate(place.priceLevel),
      rating: normalizedRating(place.rating),
      // Google Places does not report cancellation policy. Defaulting to
      // false (rather than guessing true) means a traveller who requires
      // free cancellation never gets a hotel we can't actually back that up
      // for — see accommodation's eligibleOptions filter.
      freeCancellation: false,
      grounded: true,
    }))
    .filter((option) => option.name.length > 0);
  if (options.length === 0) throw new Error(`Google Places returned no lodging in ${city}.`);
  return options;
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
    throw new Error("Flight estimate exceeds supported AUD precision.");
  }
  const note =
    `${from} ${legs === 2 ? "<->" : "->"} ${to}; ${q.passengers} passengers; ` +
    `${legs === 2 ? "round-trip" : "one-way"} group total in AUD; fictional mock fare`;
  return [
    { carrier: "MockAir Economy", price: 310 * q.passengers * legs, note },
    { carrier: "MockAir Flexible", price: 420 * q.passengers * legs, note },
  ];
}
