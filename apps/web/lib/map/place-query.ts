/**
 * Decide how (and whether) an itinerary activity may be looked up in Google Places.
 *
 * Activity `detail` is prose written for people ("Arrival-day orientation walk at the single
 * grounded candidate; low-key start to settle in."). Sending it to Places produces misleading
 * matches or noisy failures, so it is only used when it is itself a short place name. Nothing
 * here invents a place, coordinate or place ID.
 */
export type PlaceQuery =
  { kind: "id"; placeId: string } | { kind: "search"; text: string } | { kind: "none" };

type ActivityLike = { placeId?: string; location?: string; detail: string };

const MAX_NAME_LENGTH = 60;
const MAX_NAME_WORDS = 6;

// Placeholders produced by mock tools or model scaffolding, never real place names.
const PLACEHOLDER =
  /\b(mock|placeholder|tbd|tba|unknown|candidate|grounded|various|somewhere|n\/a)\b|^(hotel|accommodation|city cent(er|re)|downtown|free time|rest)$/i;

// Words that make a title an activity description rather than a place name.
const GENERIC =
  /\b(visit|walk|walking|stroll|orientation|explore|exploring|arrival|arrive|departure|depart|check[- ]?in|check[- ]?out|free|leisure|rest|relax|settle|morning|afternoon|evening|night|day|breakfast|lunch|dinner|meal|transfer|travel|return|optional|suggested|stop|start|finish|keep|before|after|around|nearby|local|low-key)\b/i;

function isPlaceName(value: string) {
  const text = value.trim();
  if (!text || text.length > MAX_NAME_LENGTH) return false;
  if (/[;:!?]|\.\s|\.$/.test(text)) return false; // sentences and notes, not names
  if (text.split(/\s+/).length > MAX_NAME_WORDS) return false;
  if (PLACEHOLDER.test(text) || GENERIC.test(text)) return false;
  // A proper name has a capitalised word, or is written in a script without letter case.
  return (
    /\p{Lu}/u.test(text) ||
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Arabic}\p{Script=Thai}]/u.test(
      text,
    )
  );
}

/** Priority: saved place ID → explicit location name → a title that is itself a place name. */
export function placeQueryFor(activity: ActivityLike): PlaceQuery {
  const placeId = activity.placeId?.trim();
  if (placeId) return { kind: "id", placeId };
  const location = activity.location?.trim();
  if (location && !PLACEHOLDER.test(location) && location.length <= 200)
    return { kind: "search", text: location };
  if (isPlaceName(activity.detail)) return { kind: "search", text: activity.detail.trim() };
  return { kind: "none" };
}

/** Cities of a destination such as "Tokyo & Kyoto"; the brief separates cities with "&". */
export function destinationCities(destination: string | undefined) {
  return [
    ...new Set(
      (destination ?? "")
        .split("&")
        .map((city) => city.trim())
        .filter(Boolean),
    ),
  ];
}
