import { AgentProgressEvent, ChatResponse, TripBrief, TripPlan } from "@trip/shared";

export type Message = { role: "user" | "agent"; text: string };
export type Draft = {
  destination: string;
  start: string;
  end: string;
  groupSize: string;
  budgetTotal: string;
  nationality: string;
  roomAllocation: "shared" | "individual";
  minRating: string;
  freeCancellation: boolean;
};
export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    currencyDisplay: "code",
  }).format(value);
export function draftFor(brief: TripBrief): Draft {
  return {
    destination: brief.destination,
    start: brief.dates[0],
    end: brief.dates[1],
    groupSize: String(brief.groupSize),
    budgetTotal: String(brief.budgetTotal),
    nationality: brief.nationality ?? "",
    roomAllocation: brief.accommodation?.roomAllocation ?? "shared",
    minRating: String(brief.accommodation?.minRating ?? 0),
    freeCancellation: brief.accommodation?.freeCancellation ?? false,
  };
}
/** Empty preferences for a new conversation; never derived from the demo or a previous trip. */
export const blankDraft = (): Draft => ({
  destination: "",
  start: "",
  end: "",
  groupSize: "",
  budgetTotal: "",
  nationality: "",
  roomAllocation: "shared",
  minRating: "",
  freeCancellation: false,
});
export function isDraft(value: unknown): value is Draft {
  return (
    object(value) &&
    ["destination", "start", "end", "groupSize", "budgetTotal", "nationality", "minRating"].every(
      (key) => typeof value[key] === "string",
    ) &&
    ["shared", "individual"].includes(String(value.roomAllocation)) &&
    typeof value.freeCancellation === "boolean"
  );
}
/** `current` is the existing brief, or only the identifiers for a blank conversation. */
export function parseDraft(draft: Draft, current: Pick<TripBrief, "tripId"> & Partial<TripBrief>) {
  return TripBrief.safeParse({
    ...current,
    destination: draft.destination,
    dates: [draft.start, draft.end],
    groupSize: Number(draft.groupSize),
    budgetTotal: Number(draft.budgetTotal),
    nationality: draft.nationality.trim() || undefined,
    accommodation: {
      roomAllocation: draft.roomAllocation,
      minRating: draft.minRating.trim() ? Number(draft.minRating) : NaN,
      freeCancellation: draft.freeCancellation,
    },
  });
}
export type Snapshot = {
  version: 1 | 2;
  id: string;
  savedAt: string;
  plan: TripPlan;
  draft: Draft;
  messages: Message[];
  input: string;
  previousTotal?: number;
};
export const CURRENT_KEY = "trip-workspace-v1";
export const SAVED_KEY = "trip-saved-v1";
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function parseSnapshot(value: unknown): Snapshot {
  if (
    !object(value) ||
    (value.version !== 1 && value.version !== 2) ||
    typeof value.id !== "string" ||
    typeof value.savedAt !== "string" ||
    !Number.isFinite(Date.parse(value.savedAt))
  )
    throw new Error("Saved trip version or data is invalid.");
  const plan = identifyActivities(TripPlan.parse(value.plan));
  if (plan.tripId !== plan.brief.tripId) throw new Error("Saved trip identifiers do not match.");
  if (!isDraft(value.draft)) throw new Error("Saved form data is invalid.");
  if (
    !Array.isArray(value.messages) ||
    !value.messages.every(
      (m) => object(m) && ["user", "agent"].includes(String(m.role)) && typeof m.text === "string",
    ) ||
    typeof value.input !== "string"
  )
    throw new Error("Saved conversation is invalid.");
  if (
    value.previousTotal !== undefined &&
    (typeof value.previousTotal !== "number" ||
      !Number.isFinite(value.previousTotal) ||
      value.previousTotal < 0)
  )
    throw new Error("Saved budget history is invalid.");
  return { ...value, version: 2, plan } as Snapshot;
}
export function parseSaved(raw: string | null): Snapshot[] {
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("Saved trip list is invalid.");
  return value.map(parseSnapshot);
}

/** One shared parser for form planning and chat. An incomplete stream is a retryable failure. */
export async function readPlanStream(
  response: Response,
  onProgress: (event: AgentProgressEvent) => void,
): Promise<ChatResponse> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${response.status}).`);
  }
  if (!response.body) throw new Error("No progress stream was received. Please retry.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ChatResponse | undefined;
  let error: string | undefined;
  const frame = (line: string) => {
    if (!line.trim()) return;
    let data: unknown;
    try {
      data = JSON.parse(line);
    } catch {
      return;
    }
    if (!object(data)) return;
    if (data.type === "complete") {
      const parsed = ChatResponse.safeParse(data.response);
      if (parsed.success) result = parsed.data;
      else error = "The returned plan was invalid. Please retry.";
    } else if (data.type === "error")
      error = typeof data.error === "string" ? data.error : "Planning failed. Please retry.";
    else {
      const parsed = AgentProgressEvent.safeParse(data);
      if (parsed.success) onProgress(parsed.data);
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(frame);
      if (done) break;
    }
    frame(buffer);
  } finally {
    reader.releaseLock();
  }
  if (error) throw new Error(error);
  if (!result) throw new Error("Connection ended before the plan was ready. Please retry.");
  return result;
}

/** Itinerary activities in plan order; hotels and transport are never mapped. */
export function itineraryActivities(plan: TripPlan | undefined) {
  return (
    plan?.sections
      .find((section) => section.id === "itinerary")
      ?.proposal?.items.filter((item) => item.kind === "activity") ?? []
  );
}

/** Allocate IDs only for legacy/new items; never derive identity from array position. */
export function identifyActivities(plan: TripPlan): TripPlan {
  return {
    ...plan,
    editVersion: plan.editVersion ?? 0,
    sections: plan.sections.map((section) => ({
      ...section,
      proposal: section.proposal
        ? {
            ...section.proposal,
            items: section.proposal.items.map((item) =>
              item.kind === "activity" && !item.id ? { ...item, id: crypto.randomUUID() } : item,
            ),
          }
        : undefined,
    })),
  };
}
