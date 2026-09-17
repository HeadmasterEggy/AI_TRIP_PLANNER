import type { TripPlan } from "@trip/shared";
import {
  CURRENT_KEY,
  SAVED_KEY,
  blankDraft,
  isDraft,
  parseSaved,
  parseSnapshot,
  type Draft,
  type Message,
  type Snapshot,
} from "./workspace";

/** Storage key for the multi-chat/multi-trip workspace catalog. */
export const CATALOG_KEY = "trip-workspace-catalog-v3";

export type TripStatus = "draft" | "needs_review" | "confirmed";
export type WorkspaceView = "chat" | "map" | "trip";

export type ConversationRecord = {
  id: string;
  title: string;
  updatedAt: string;
  tripId?: string;
  messages: Message[];
  input: string;
  renamed?: boolean;
  snapshot?: Snapshot;
  /** Unfinished preferences of a conversation that has not produced a trip yet. */
  draft?: Draft;
};

export type TripRecord = {
  id: string;
  title: string;
  updatedAt: string;
  status: TripStatus;
  conversationIds: string[];
  snapshot: Snapshot;
};

export type PanelLayout = {
  /** Desktop sidebar preference. Older catalogs have no value and start expanded. */
  sidebar: { collapsed: boolean };
  preferences: { open: boolean; width: number };
  trip: { open: boolean; width: number };
  view: WorkspaceView;
  day?: string;
  editorView: "overview" | "timeline" | "map";
};

export type WorkspaceCatalog = {
  version: 3;
  activeConversationId?: string;
  activeTripId?: string;
  conversations: ConversationRecord[];
  trips: TripRecord[];
  layout: PanelLayout;
};

const DEFAULT_LAYOUT: PanelLayout = {
  sidebar: { collapsed: false },
  preferences: { open: true, width: 280 },
  trip: { open: true, width: 340 },
  view: "chat",
  editorView: "map",
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const validDate = (value: unknown): value is string =>
  text(value) && Number.isFinite(Date.parse(value));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function titleFor(snapshot: Snapshot): string {
  const destination = snapshot.plan.brief.destination.trim();
  const [start, end] = snapshot.plan.brief.dates;
  return destination
    ? `${destination} · ${start}${end && end !== start ? ` – ${end}` : ""}`
    : "Untitled trip";
}

function statusFor(snapshot: Snapshot): TripStatus {
  if (snapshot.plan.hitl.some((checkpoint) => checkpoint.status !== "approved"))
    return "needs_review";
  if (snapshot.plan.hitl.length) return "confirmed";
  return "draft";
}

/**
 * Layout is a preference, not user data: invalid or legacy values fall back to defaults per
 * field instead of making the whole catalog (and its chats and trips) unreadable.
 */
function normalizeLayout(value: unknown): PanelLayout {
  const layout = isObject(value) ? value : {};
  const panel = (key: "preferences" | "trip") => {
    const item = layout[key];
    const fallback = DEFAULT_LAYOUT[key];
    if (!isObject(item)) return { ...fallback };
    return {
      open: typeof item.open === "boolean" ? item.open : fallback.open,
      width:
        typeof item.width === "number" && Number.isFinite(item.width)
          ? Math.min(720, Math.max(180, item.width))
          : fallback.width,
    };
  };
  const sidebar = isObject(layout.sidebar) ? layout.sidebar : {};
  const view = layout.view === "map" || layout.view === "trip" ? layout.view : "chat";
  const editorView =
    layout.editorView === "overview" || layout.editorView === "timeline"
      ? layout.editorView
      : "map";
  return {
    sidebar: { collapsed: sidebar.collapsed === true },
    preferences: panel("preferences"),
    trip: panel("trip"),
    view,
    editorView,
    ...(text(layout.day) ? { day: layout.day } : {}),
  };
}

function conversationFrom(snapshot: Snapshot, tripId: string): ConversationRecord {
  return {
    id: `conversation:${snapshot.id}`,
    title: titleFor(snapshot),
    updatedAt: snapshot.savedAt,
    tripId,
    messages: clone(snapshot.messages),
    input: snapshot.input,
    snapshot: clone(parseSnapshot(snapshot)),
  };
}

function tripFrom(snapshot: Snapshot, conversationId?: string): TripRecord {
  const id = `trip:${snapshot.plan.tripId}`;
  return {
    id,
    title: titleFor(snapshot),
    updatedAt: snapshot.savedAt,
    status: statusFor(snapshot),
    conversationIds: conversationId ? [conversationId] : [],
    snapshot: clone(parseSnapshot(snapshot)),
  };
}

/** Build a fresh catalog from an optional current snapshot and saved snapshots. */
export function createCatalog(current?: Snapshot, saved: Snapshot[] = []): WorkspaceCatalog {
  const snapshots = [current, ...saved].filter((item): item is Snapshot => item !== undefined);
  const catalog: WorkspaceCatalog = {
    version: 3,
    conversations: [],
    trips: [],
    layout: clone(DEFAULT_LAYOUT),
  };
  for (const snapshot of snapshots) {
    const tripId = `trip:${snapshot.plan.tripId}`;
    const conversationId = `conversation:${snapshot.id}`;
    const existingTrip = catalog.trips.find((trip) => trip.id === tripId);
    if (!existingTrip) catalog.trips.push(tripFrom(snapshot, conversationId));
    else if (!existingTrip.conversationIds.includes(conversationId))
      existingTrip.conversationIds.push(conversationId);
    if (!catalog.conversations.some((conversation) => conversation.id === conversationId))
      catalog.conversations.push(conversationFrom(snapshot, tripId));
    if (snapshot === current) {
      catalog.activeTripId = tripId;
      catalog.activeConversationId = conversationId;
    }
  }
  return catalog;
}

/** Parse and migrate catalog JSON or a decoded value. This never writes to storage or mutates its input. */
export function parseCatalog(
  raw: string | unknown | null,
  legacyCurrent?: unknown,
  legacySaved?: unknown,
): WorkspaceCatalog {
  if (raw === null || raw === undefined || raw === "") {
    const current = legacyCurrent === undefined ? undefined : parseSnapshot(legacyCurrent);
    const saved = legacySaved === undefined ? [] : parseLegacySaved(legacySaved);
    return createCatalog(current, saved);
  }
  let value: unknown;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error("Workspace catalog JSON is invalid.");
  }
  if (Array.isArray(value))
    return createCatalog(
      undefined,
      value.map((item) => parseSnapshot(item)),
    );
  if (!isObject(value)) throw new Error("Workspace catalog is invalid.");
  if (value.version !== 3) {
    if (value.version === 1 || value.version === 2)
      return createCatalog(undefined, [parseSnapshot(value)]);
    throw new Error("Workspace catalog version is invalid.");
  }
  if (!Array.isArray(value.conversations) || !Array.isArray(value.trips))
    throw new Error("Workspace catalog records are invalid.");
  const trips = value.trips.map(parseTrip);
  const conversations = value.conversations.map(parseConversation);
  const tripIds = new Set(trips.map((trip) => trip.id));
  const conversationIds = new Set(conversations.map((conversation) => conversation.id));
  for (const trip of trips)
    for (const id of trip.conversationIds)
      if (!conversationIds.has(id)) throw new Error("Workspace catalog linkage is invalid.");
  for (const conversation of conversations)
    if (conversation.tripId && !tripIds.has(conversation.tripId))
      throw new Error("Workspace catalog linkage is invalid.");
  if (value.activeTripId !== undefined && !tripIds.has(value.activeTripId as string))
    throw new Error("Workspace catalog active trip is invalid.");
  if (
    value.activeConversationId !== undefined &&
    !conversationIds.has(value.activeConversationId as string)
  )
    throw new Error("Workspace catalog active conversation is invalid.");
  return {
    version: 3,
    ...(value.activeTripId === undefined ? {} : { activeTripId: value.activeTripId as string }),
    ...(value.activeConversationId === undefined
      ? {}
      : { activeConversationId: value.activeConversationId as string }),
    conversations,
    trips,
    layout: normalizeLayout(value.layout),
  };
}

function parseLegacySaved(value: unknown): Snapshot[] {
  if (!Array.isArray(value)) throw new Error("Saved trip list is invalid.");
  return value.map((item) => parseSnapshot(item));
}

function parseConversation(value: unknown): ConversationRecord {
  if (
    !isObject(value) ||
    !text(value.id) ||
    !text(value.title) ||
    !validDate(value.updatedAt) ||
    !Array.isArray(value.messages) ||
    !value.messages.every(
      (m) => isObject(m) && (m.role === "user" || m.role === "agent") && text(m.text),
    ) ||
    !text(value.input)
  )
    throw new Error("Workspace conversation is invalid.");
  if (value.tripId !== undefined && !text(value.tripId))
    throw new Error("Workspace conversation linkage is invalid.");
  if (value.renamed !== undefined && typeof value.renamed !== "boolean")
    throw new Error("Workspace conversation title state is invalid.");
  const snapshot = value.snapshot === undefined ? undefined : parseSnapshot(value.snapshot);
  if (value.draft !== undefined && !isDraft(value.draft))
    throw new Error("Workspace conversation form is invalid.");
  return {
    id: value.id,
    title: value.title,
    updatedAt: value.updatedAt,
    ...(value.tripId === undefined ? {} : { tripId: value.tripId }),
    messages: clone(value.messages) as Message[],
    input: value.input,
    ...(value.renamed ? { renamed: true } : {}),
    ...(snapshot ? { snapshot } : {}),
    ...(value.draft === undefined ? {} : { draft: clone(value.draft) as Draft }),
  };
}

function parseTrip(value: unknown): TripRecord {
  if (
    !isObject(value) ||
    !text(value.id) ||
    !text(value.title) ||
    !validDate(value.updatedAt) ||
    !["draft", "needs_review", "confirmed"].includes(String(value.status)) ||
    !Array.isArray(value.conversationIds) ||
    !value.conversationIds.every(text)
  )
    throw new Error("Workspace trip is invalid.");
  const snapshot = parseSnapshot(value.snapshot);
  return {
    id: value.id,
    title: value.title,
    updatedAt: value.updatedAt,
    status: value.status as TripStatus,
    conversationIds: [...value.conversationIds],
    snapshot,
  };
}

export function serializeCatalog(catalog: WorkspaceCatalog): string {
  return JSON.stringify(parseCatalog(catalog));
}

export function upsertCurrent(
  catalog: WorkspaceCatalog,
  snapshot: Snapshot,
  messages: Message[] = snapshot.messages,
): WorkspaceCatalog {
  const next = parseCatalog(catalog);
  const tripId = `trip:${snapshot.plan.tripId}`;
  const conversationId = `conversation:${snapshot.id}`;
  const trip = tripFrom(snapshot, conversationId);
  const existingTrip = next.trips.findIndex((item) => item.id === tripId);
  if (existingTrip >= 0) {
    const ids = new Set(next.trips[existingTrip].conversationIds);
    ids.add(conversationId);
    next.trips[existingTrip] = { ...trip, conversationIds: [...ids] };
  } else next.trips.push(trip);
  const conversation = { ...conversationFrom(snapshot, tripId), messages: clone(messages) };
  const existingConversation = next.conversations.findIndex((item) => item.id === conversationId);
  if (existingConversation >= 0) {
    const previous = next.conversations[existingConversation];
    next.conversations[existingConversation] = previous.renamed
      ? { ...conversation, title: previous.title, renamed: true }
      : conversation;
  } else next.conversations.push(conversation);
  next.activeTripId = tripId;
  next.activeConversationId = conversationId;
  return next;
}

export function upsertConversationDraft(
  catalog: WorkspaceCatalog,
  conversation: Pick<ConversationRecord, "id" | "messages" | "input"> & {
    title?: string;
    draft?: Draft;
  },
): WorkspaceCatalog {
  const next = parseCatalog(catalog);
  const now = new Date().toISOString();
  const existing = next.conversations.findIndex((item) => item.id === conversation.id);
  const record: ConversationRecord = {
    id: conversation.id,
    title: conversation.title?.trim() || "New chat",
    updatedAt: now,
    messages: clone(conversation.messages),
    input: conversation.input,
    draft: clone(conversation.draft ?? blankDraft()),
  };
  if (existing >= 0) {
    const previous = next.conversations[existing];
    next.conversations[existing] = previous.renamed
      ? { ...record, title: previous.title, renamed: true }
      : record;
  } else next.conversations.unshift(record);
  next.activeConversationId = conversation.id;
  delete next.activeTripId;
  return next;
}

export function searchCatalog(
  catalog: WorkspaceCatalog,
  query: string,
): { conversations: ConversationRecord[]; trips: TripRecord[] } {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return { conversations: [...catalog.conversations], trips: [...catalog.trips] };
  const matches = (value: string) => value.toLocaleLowerCase().includes(needle);
  return {
    conversations: catalog.conversations.filter(
      (item) => matches(item.title) || item.messages.some((message) => matches(message.text)),
    ),
    trips: catalog.trips.filter(
      (item) =>
        matches(item.title) ||
        matches(item.snapshot.plan.brief.destination) ||
        matches(item.snapshot.plan.brief.dates.join(" ")),
    ),
  };
}

export function updateCatalog(
  catalog: WorkspaceCatalog,
  patch: Partial<Pick<WorkspaceCatalog, "activeConversationId" | "activeTripId">> & {
    layout?: Partial<PanelLayout>;
  },
): WorkspaceCatalog {
  const next = parseCatalog(catalog);
  if (patch.activeConversationId !== undefined)
    next.activeConversationId = patch.activeConversationId;
  if (patch.activeTripId !== undefined) next.activeTripId = patch.activeTripId;
  if (patch.layout)
    next.layout = normalizeLayout({
      ...next.layout,
      ...patch.layout,
      sidebar: { ...next.layout.sidebar, ...patch.layout.sidebar },
      preferences: { ...next.layout.preferences, ...patch.layout.preferences },
      trip: { ...next.layout.trip, ...patch.layout.trip },
    });
  return next;
}

/** Everything the workspace needs for its first render, read from one storage pass. */
export type RestoredWorkspace = {
  /** Only set when a caller explicitly opens a plan; storage never opens a trip by itself. */
  plan?: TripPlan;
  draft: Draft;
  messages?: Message[];
  input: string;
  previousTotal?: number;
  saved: Snapshot[];
  catalog: WorkspaceCatalog;
  /** The blank conversation to continue, when the last active conversation had no trip yet. */
  conversationId?: string;
  storageEnabled: boolean;
  storageError?: string;
};

/**
 * Read history for a fresh start. The workspace always opens on a blank planning entry: a
 * previously active trip stays in Chats/Trips until the user chooses it, while an unfinished
 * blank conversation (form and input, no trip yet) is continued. Reading never writes, and
 * unreadable data stays in storage and is reported.
 */
export function restoreWorkspace(storage: Pick<Storage, "getItem">): RestoredWorkspace {
  const result: RestoredWorkspace = {
    draft: blankDraft(),
    input: "",
    saved: [],
    catalog: createCatalog(),
    storageEnabled: true,
  };
  let current: Snapshot | undefined;
  try {
    const raw = storage.getItem(CURRENT_KEY);
    // The legacy snapshot is only migration input for history; it is not reopened.
    if (raw) current = parseSnapshot(JSON.parse(raw));
  } catch {
    result.storageEnabled = false;
    result.storageError =
      "Your last workspace could not be read. It was kept unchanged; your history may be incomplete. Retry storage or explicitly replace the unreadable workspace.";
  }
  try {
    result.saved = parseSaved(storage.getItem(SAVED_KEY));
  } catch {
    result.storageError ??=
      "Saved trips could not be read. Existing stored data has been kept; you can retry from Saved trips.";
  }
  try {
    const catalog = parseCatalog(storage.getItem(CATALOG_KEY), current, result.saved);
    const isBlank = (item: ConversationRecord) => !item.tripId && !item.snapshot;
    // Untouched means the user entered nothing about a trip; filter defaults do not count.
    const untouched = (item: ConversationRecord) =>
      isBlank(item) &&
      !item.messages.length &&
      !item.input.trim() &&
      (["destination", "start", "end", "groupSize", "budgetTotal", "nationality"] as const).every(
        (key) => !item.draft?.[key]?.trim(),
      );
    const active = catalog.conversations.find((item) => item.id === catalog.activeConversationId);
    // Continue the active blank chat; otherwise reuse an untouched one instead of adding
    // another empty "New chat" on every refresh.
    const conversation =
      active && isBlank(active)
        ? active
        : [...catalog.conversations]
            .filter(untouched)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (conversation) {
      catalog.activeConversationId = conversation.id;
      result.conversationId = conversation.id;
      result.messages = conversation.messages;
      result.input = conversation.input;
      result.draft = conversation.draft ?? blankDraft();
    } else {
      delete catalog.activeConversationId;
    }
    delete catalog.activeTripId;
    result.catalog = catalog;
  } catch {
    result.storageEnabled = false;
    result.storageError =
      "Workspace history could not be read. Existing stored data was kept; you can still plan a new trip.";
  }
  return result;
}
