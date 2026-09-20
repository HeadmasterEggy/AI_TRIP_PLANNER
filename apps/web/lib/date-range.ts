import type { DateRange } from "react-day-picker";

/** Local calendar fields, not toISOString — UTC conversion can shift the
 *  date near midnight depending on the viewer's timezone, silently sending
 *  the wrong day. */
function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format a calendar-picked range into the exact "YYYY-MM-DD to YYYY-MM-DD"
 * shape `extractBriefPatchLocally` (@trip/orchestrator) already recognizes —
 * picking dates needs no backend change, it just produces the same message
 * shape a traveller could have typed by hand.
 */
export function formatTravelDatesMessage(range: DateRange): string | undefined {
  if (!range.from || !range.to) return undefined;
  const [start, end] =
    range.from.getTime() <= range.to.getTime() ? [range.from, range.to] : [range.to, range.from];
  return `Travel dates: ${toIsoDate(start)} to ${toIsoDate(end)}`;
}

/** Heuristic: is the assistant's message asking the traveller to pick dates? */
const DATE_QUESTION =
  /\b(what|which)\s+dates?\b|\btravel\s+dates?\b|\bwhen\s+(are|is)\s+you\b|哪天|什么时候|几号|日期/i;
export function looksLikeDateQuestion(text: string): boolean {
  return DATE_QUESTION.test(text);
}
