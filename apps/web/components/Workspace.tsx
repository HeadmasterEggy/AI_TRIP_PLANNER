"use client";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { TripPlan, type AgentProgressEvent, type ChatRequest } from "@trip/shared";
import { FiltersPanel } from "./FiltersPanel";
import { ChatPanel } from "./ChatPanel";
import { TripEditor } from "./TripEditor";
import { TripMapCanvas } from "./TripMapCanvas";
import { TripPanel, pendingDecisions, tripStatus, type TripTab } from "./TripPanel";
import { CheckpointCards, type Decision } from "./CheckpointCards";
import { Dialog } from "./Dialog";
import { Drawer } from "./Drawer";
import { WorkspaceSkeleton } from "./WorkspaceSkeleton";
import { WorkspaceSidebar, type SidebarSection } from "./WorkspaceSidebar";
import { SidebarResizer } from "./SidebarResizer";
import { MenuIcon, RouteIcon, SlidersIcon } from "./icons";
import { useTripPlaces } from "./useTripPlaces";
import type { RouteResult } from "@/lib/google";
import {
  identifyActivities,
  CURRENT_KEY,
  SAVED_KEY,
  blankDraft,
  draftFor,
  draftWithKnown,
  knownFromDraft,
  budgetHint,
  money,
  parseDraft,
  parseSaved,
  parseSnapshot,
  readPlanStream,
  NeedsInfoError,
  type Message,
  type Snapshot,
} from "@/lib/workspace";
import {
  CATALOG_KEY,
  restoreWorkspace,
  reusableBlankConversation,
  searchCatalog,
  serializeCatalog,
  updateCatalog,
  upsertConversationDraft,
  upsertCurrent,
  type RestoredWorkspace,
  type WorkspaceCatalog,
} from "@/lib/workspace-catalog";

type Task =
  { kind: "chat"; request: ChatRequest } | { kind: "decision"; plan: TripPlan; decision: Decision };
type DialogKind = "review" | "saved" | "language" | "account";
/** Narrow screens show one of chat or map; preferences, trip and navigation are drawers. */
type MobileView = "chat" | "map";
const NARROW_QUERY = "(max-width: 1000px)";

function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return narrow;
}

/** Topbar facts from the plan only; nothing is shown for values the trip does not have. */
function tripFacts(plan: TripPlan) {
  const { dates, groupSize, budgetTotal } = plan.brief;
  const days = (Date.parse(dates[1]) - Date.parse(dates[0])) / 86400000 + 1;
  return [
    Number.isFinite(days) && days > 0 ? `${days} ${days === 1 ? "day" : "days"}` : undefined,
    `${groupSize} ${groupSize === 1 ? "traveller" : "travellers"}`,
    `${money(budgetTotal)}${budgetHint(plan.brief)} budget`,
  ].filter(Boolean);
}
const seed: Message[] = [
  {
    role: "agent",
    text: "Edit your trip preferences or tell me what to change. Review the decisions when your plan is ready.",
  },
];
const STORAGE_FULL =
  "Browser storage is unavailable or full. Your current plan is still in this tab. Retry after freeing space.";

function readableStorage(): Pick<Storage, "getItem"> {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null };
  }
}

/**
 * The planning workspace always opens on a blank planning entry. Saved chats and trips are
 * listed in the sidebar and open only when the user chooses them; no demo plan is loaded.
 * `initialPlan` lets an embedding page (or a test) open a specific plan explicitly.
 */
export function Workspace({ initialPlan }: { initialPlan?: TripPlan }) {
  const [restored, setRestored] = useState<RestoredWorkspace>();

  useEffect(() => {
    // Storage is read after hydration, so the server and first client render match.
    const state = restoreWorkspace(readableStorage());
    if (!initialPlan) {
      setRestored(state);
      return;
    }
    const plan = identifyActivities(initialPlan);
    setRestored({
      ...state,
      plan,
      draft: draftFor(plan.brief),
      messages: undefined,
      input: "",
      conversationId: undefined,
    });
  }, [initialPlan]);

  return restored ? <WorkspaceContent restored={restored} /> : <WorkspaceSkeleton />;
}

function WorkspaceContent({ restored }: { restored: RestoredWorkspace }) {
  const [plan, setPlan] = useState<TripPlan | undefined>(restored.plan);
  const [draft, setDraft] = useState(restored.draft);
  const [messages, setMessages] = useState<Message[]>(
    () => restored.messages ?? (restored.plan ? seed : []),
  );
  const [input, setInput] = useState(restored.input);
  const [previousTotal, setPreviousTotal] = useState(restored.previousTotal);
  const [editPending, setEditPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<AgentProgressEvent[]>([]);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState<Task>();
  const [dialog, setDialog] = useState<DialogKind>();
  const [saved, setSaved] = useState<Snapshot[]>(restored.saved);
  const [storageError, setStorageError] = useState(restored.storageError ?? "");
  const [notice, setNotice] = useState("");
  const [storageEnabled, setStorageEnabled] = useState(restored.storageEnabled);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "failed">("saved");
  const [catalog, setCatalog] = useState<WorkspaceCatalog>(restored.catalog);
  const catalogRef = useRef(catalog);
  const [historyQuery, setHistoryQuery] = useState("");
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  const [tripTab, setTripTab] = useState<TripTab>(
    restored.catalog.layout.editorView === "timeline" ? "timeline" : "overview",
  );
  const [mobileView, setMobileView] = useState<MobileView>(
    restored.catalog.layout.view === "map" ? "map" : "chat",
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    restored.catalog.layout.sidebar.collapsed,
  );
  const [sidebarWidth, setSidebarWidth] = useState(restored.catalog.layout.sidebar.width);
  const [section, setSection] = useState<SidebarSection>("chats");
  const [navOpen, setNavOpen] = useState(false);
  const narrow = useIsNarrow();
  const [selectedActivity, setSelectedActivity] = useState<string>();
  const [mapRoutes, setMapRoutes] = useState<RouteResult[]>([]);
  const activeConversation = useRef(
    restored.conversationId ?? `conversation:${crypto.randomUUID()}`,
  );
  // The trip ID a blank conversation will use once it produces its first plan.
  const freshTripId = useRef(crypto.randomUUID());
  const planRef = useRef(plan);
  planRef.current = plan;
  const active = useRef<AbortController | null>(null);
  const left = useRef<HTMLDivElement>(null);
  const preferencesToggle = useRef<HTMLButtonElement>(null);
  const tripToggle = useRef<HTMLButtonElement>(null);
  const navToggle = useRef<HTMLButtonElement>(null);
  const tripPlaces = useTripPlaces(plan);
  const blank = !plan;

  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [],
  );

  // Debounced autosave of the active conversation (and its trip, once one exists).
  const pendingSave = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!storageEnabled) return;
    const conversationId = activeConversation.current;
    setSaveState("saving");
    const persist = () => {
      pendingSave.current = null;
      try {
        let nextCatalog: WorkspaceCatalog;
        if (!plan) {
          nextCatalog = upsertConversationDraft(catalogRef.current, {
            id: conversationId,
            messages,
            input,
            draft,
          });
        } else {
          const current = {
            version: 3,
            id: conversationId.replace(/^conversation:/, ""),
            savedAt: new Date().toISOString(),
            plan,
            draft,
            messages,
            input,
            previousTotal,
          } satisfies Snapshot;
          nextCatalog = upsertCurrent(catalogRef.current, current, messages);
          localStorage.setItem(CURRENT_KEY, JSON.stringify(current));
        }
        localStorage.setItem(CATALOG_KEY, serializeCatalog(nextCatalog));
        catalogRef.current = nextCatalog;
        setCatalog(nextCatalog);
        setSaveState("saved");
      } catch {
        setStorageEnabled(false);
        setSaveState("failed");
        setStorageError(STORAGE_FULL);
      }
    };
    pendingSave.current = persist;
    const timer = window.setTimeout(persist, 350);
    return () => {
      window.clearTimeout(timer);
      if (pendingSave.current === persist) pendingSave.current = null;
    };
  }, [storageEnabled, plan, draft, messages, input, previousTotal]);

  useEffect(() => {
    if (!storageEnabled) return;
    try {
      localStorage.setItem(CATALOG_KEY, serializeCatalog(catalog));
    } catch {
      setSaveState("failed");
      setStorageEnabled(false);
      setStorageError(STORAGE_FULL);
    }
  }, [catalog, storageEnabled]);

  useEffect(() => {
    setCatalog((current) =>
      updateCatalog(current, {
        layout: {
          sidebar: { collapsed: sidebarCollapsed, width: sidebarWidth },
          preferences: { ...current.layout.preferences, open: preferencesOpen },
          trip: { ...current.layout.trip, open: tripOpen },
          view: mobileView,
          editorView: tripTab,
        },
      }),
    );
  }, [preferencesOpen, tripOpen, mobileView, tripTab, sidebarCollapsed, sidebarWidth]);

  // Leaving the narrow layout closes its navigation drawer.
  useEffect(() => {
    if (!narrow) setNavOpen(false);
  }, [narrow]);

  /** Stop in-flight work and clear state that belongs to the previous chat or trip. */
  function resetTransient() {
    // Persist the outgoing conversation now; its debounced save would otherwise be dropped.
    pendingSave.current?.();
    active.current?.abort();
    active.current = null;
    setBusy(false);
    setActivity([]);
    setError("");
    setErrors({});
    setRetry(undefined);
    setDialog(undefined);
    setSelectedActivity(undefined);
    setMapRoutes([]);
  }
  function applySnapshot(snapshot: Snapshot) {
    setPlan(snapshot.plan);
    setDraft(snapshot.draft);
    setMessages(snapshot.messages);
    setInput(snapshot.input);
    setPreviousTotal(snapshot.previousTotal);
  }
  function openPreferences() {
    setDialog(undefined);
    setTripOpen(false);
    setNavOpen(false);
    setPreferencesOpen(true);
  }
  function closePreferences() {
    setPreferencesOpen(false);
  }
  function openTrip() {
    setPreferencesOpen(false);
    setNavOpen(false);
    setTripOpen(true);
  }
  function closeTrip() {
    setTripOpen(false);
  }
  function openDialog(kind: DialogKind) {
    if (kind === "saved") loadSaved();
    setNavOpen(false);
    setDialog(kind);
  }
  function edit() {
    openPreferences();
    requestAnimationFrame(() => {
      left.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    });
  }
  function restore(snapshot: Snapshot) {
    resetTransient();
    applySnapshot(snapshot);
    activeConversation.current = `conversation:${snapshot.id}`;
    setNotice("Trip restored. Future edits are saved to your current workspace.");
  }
  function snapshot(current: TripPlan): Snapshot {
    return {
      version: 3,
      id: activeConversation.current.replace(/^conversation:/, ""),
      savedAt: new Date().toISOString(),
      plan: current,
      draft,
      messages,
      input,
      previousTotal,
    };
  }
  function save() {
    if (!plan) {
      setNotice("Add trip details before saving a trip.");
      return;
    }
    try {
      const current = parseSaved(localStorage.getItem(SAVED_KEY));
      const next = [{ ...snapshot(plan), id: crypto.randomUUID() }, ...current];
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      setSaved(next);
      setNotice("Saved a copy of this trip in this browser.");
      setStorageError("");
    } catch {
      setStorageError(
        "Could not save this trip. Storage may be full or the saved list unreadable. Existing data was kept.",
      );
    }
  }
  function loadSaved() {
    try {
      setSaved(parseSaved(localStorage.getItem(SAVED_KEY)));
      setStorageError("");
    } catch {
      setStorageError("Saved trips are still unreadable. Existing data was kept.");
    }
  }
  async function run(task: Task) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    setRetry(undefined);
    if (task.kind === "chat")
      setActivity([
        { type: "coordinator", phase: "dispatch", round: 1, summary: "Preparing your request." },
      ]);
    try {
      let next: TripPlan;
      if (task.kind === "chat") {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(task.request),
          signal: controller.signal,
        });
        const result = await readPlanStream(response, (event) => {
          if (active.current === controller) setActivity((events) => [...events, event]);
        });
        next = result.plan;
        // A New chat or history switch replaced this request; its answer belongs nowhere.
        if (active.current !== controller) return;
        setMessages((current) => [...current, { role: "agent", text: result.reply }]);
        setInput("");
      } else {
        const response = await fetch("/api/hitl", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ plan: task.plan, ...task.decision }),
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to apply this decision.");
        next = TripPlan.parse(body.plan);
        if (active.current !== controller) return;
      }
      const before = planRef.current;
      if (task.kind === "chat" || next.estTotal !== before?.estTotal)
        setPreviousTotal(before?.estTotal);
      setPlan(identifyActivities(next));
      if (task.kind === "chat") {
        setDraft(draftFor(next.brief));
        setSelectedActivity(undefined);
        setMapRoutes([]);
      }
      setErrors({});
      if (task.kind === "decision" && task.decision.action === "reject") edit();
    } catch (failure) {
      if (active.current !== controller || controller.signal.aborted) return;
      // Not enough to plan yet: the assistant asks for the rest in the chat, and what it already
      // understood goes into the preferences form and travels with the next message.
      if (failure instanceof NeedsInfoError) {
        setMessages((current) => [...current, { role: "agent", text: failure.needsInfo.question }]);
        setDraft((current) => draftWithKnown(current, failure.needsInfo.known));
        setInput("");
        setActivity([]);
        return;
      }
      setError(
        failure instanceof Error ? failure.message : "Unable to update the trip. Please retry.",
      );
      setRetry(task);
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  function submit() {
    if (active.current) return;
    const parsed = parseDraft(draft, plan?.brief ?? { tripId: freshTripId.current });
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) fields[String(issue.path[0])] ??= issue.message;
      setErrors(fields);
      setError("Check the highlighted trip preferences.");
      edit();
      return;
    }
    setErrors({});
    const brief = parsed.data;
    const message = `Plan ${brief.destination}, ${brief.dates.join(" to ")}, ${brief.groupSize} travellers, ${money(brief.budgetTotal)} total, with the submitted accommodation preferences.`;
    setMessages((current) => [...current, { role: "user", text: message }]);
    void run({
      kind: "chat",
      request: { tripId: brief.tripId, mode: "plan", brief, message },
    });
  }
  function send() {
    const message = input.trim();
    if (!message || active.current) return;
    setMessages((current) => [...current, { role: "user", text: message }]);
    // No mode: the assistant reads the message and decides whether this is a question,
    // an edit, or a request to plan. The plan travels with the brief so a question can
    // be answered without rebuilding it.
    void run({
      kind: "chat",
      request: plan
        ? { tripId: plan.tripId, message, brief: plan.brief, plan }
        : { tripId: freshTripId.current, message, known: knownFromDraft(draft) },
    });
  }
  const onDecision = (decision: Decision) => {
    if (plan) void run({ kind: "decision", plan, decision });
  };
  const filteredHistory = useMemo(
    () => searchCatalog(catalog, historyQuery),
    [catalog, historyQuery],
  );
  const historyChats = filteredHistory.conversations.map((item) => ({
    id: item.id,
    title: item.title,
    subtitle: item.tripId
      ? (catalog.trips.find((trip) => trip.id === item.tripId)?.title ?? "Linked trip")
      : "No trip yet",
    updatedAt: item.updatedAt,
    active: item.id === catalog.activeConversationId,
  }));
  const historyTrips = filteredHistory.trips.map((item) => ({
    id: item.id,
    title: item.title,
    subtitle: `${item.snapshot.plan.brief.dates.join(" – ")} · ${money(item.snapshot.plan.estTotal)}`,
    updatedAt: item.updatedAt,
    status:
      item.status === "needs_review"
        ? ("Needs review" as const)
        : item.status === "confirmed"
          ? ("Confirmed" as const)
          : ("Draft" as const),
    active: !blank && item.id === catalog.activeTripId,
  }));
  function selectConversation(id: string) {
    const conversation = catalog.conversations.find((item) => item.id === id);
    if (!conversation) return;
    resetTransient();
    const source =
      conversation.snapshot ??
      catalog.trips.find((item) => item.id === conversation.tripId)?.snapshot;
    if (source) applySnapshot(source);
    else {
      setPlan(undefined);
      setDraft(conversation.draft ?? blankDraft());
      setPreviousTotal(undefined);
      freshTripId.current = crypto.randomUUID();
    }
    activeConversation.current = id;
    setMessages(conversation.messages);
    setInput(conversation.input);
    setNotice("");
    setCatalog((current) => {
      const next = updateCatalog(current, {
        activeConversationId: id,
        ...(conversation.tripId ? { activeTripId: conversation.tripId } : {}),
      });
      if (!conversation.tripId) delete next.activeTripId;
      return next;
    });
    setNavOpen(false);
    setMobileView("chat");
  }
  function selectTrip(id: string) {
    const trip = catalog.trips.find((item) => item.id === id);
    if (!trip) return;
    resetTransient();
    applySnapshot(trip.snapshot);
    const conversationId = trip.conversationIds.at(-1);
    const conversation = catalog.conversations.find((item) => item.id === conversationId);
    activeConversation.current = conversation?.id ?? `conversation:${trip.snapshot.id}`;
    if (conversation) {
      setMessages(conversation.messages);
      setInput(conversation.input);
    }
    setNotice("");
    setCatalog((current) =>
      updateCatalog(current, {
        activeTripId: id,
        ...(conversation ? { activeConversationId: conversation.id } : {}),
      }),
    );
    setNavOpen(false);
  }
  /**
   * `base` is the catalog this new chat is derived from. `deleteChat` passes the already-pruned
   * catalog: React has not committed the removal yet, so reading the `catalog` closure here would
   * reuse the id of the conversation being deleted and put it straight back.
   *
   * Kept separate from `newChat` because that one is handed to `onClick`-style props, which would
   * otherwise pass a click event in as `base`.
   */
  function startBlankChat(base?: WorkspaceCatalog) {
    resetTransient();
    // Reuse an untouched conversation so repeated New chat presses cannot stack blank history
    // entries. Only a conversation holding nothing the user wrote is safe to reuse.
    const id =
      reusableBlankConversation(base ?? catalog)?.id ?? `conversation:${crypto.randomUUID()}`;
    activeConversation.current = id;
    freshTripId.current = crypto.randomUUID();
    setPlan(undefined);
    setDraft(blankDraft());
    setMessages([]);
    setInput("");
    setPreviousTotal(undefined);
    setNotice("");
    setPreferencesOpen(false);
    setTripOpen(false);
    setNavOpen(false);
    setCatalog((current) =>
      upsertConversationDraft(base ?? current, {
        id,
        messages: [],
        input: "",
        draft: blankDraft(),
      }),
    );
    setMobileView("chat");
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLInputElement>('[aria-label="Message AI Trip Planner"]')
        ?.focus({ preventScroll: true }),
    );
  }
  function newChat() {
    startBlankChat();
  }
  function renameChat(id: string) {
    const existing = catalog.conversations.find((item) => item.id === id);
    if (!existing) return;
    const title = window.prompt("Rename chat", existing.title)?.trim();
    if (!title) return;
    setCatalog((current) => ({
      ...current,
      conversations: current.conversations.map((item) =>
        item.id === id
          ? { ...item, title, renamed: true, updatedAt: new Date().toISOString() }
          : item,
      ),
    }));
  }
  function withoutConversation(source: WorkspaceCatalog, id: string): WorkspaceCatalog {
    return {
      ...source,
      activeConversationId:
        source.activeConversationId === id ? undefined : source.activeConversationId,
      conversations: source.conversations.filter((item) => item.id !== id),
      trips: source.trips.map((item) => ({
        ...item,
        conversationIds: item.conversationIds.filter((conversationId) => conversationId !== id),
      })),
    };
  }
  function deleteChat(id: string) {
    const existing = catalog.conversations.find((item) => item.id === id);
    if (!existing || !window.confirm(`Delete “${existing.title}”? The linked trip will be kept.`))
      return;
    // Deleting the open chat has to remove it and open a fresh one in a single update. Splitting
    // it in two let `newChat` read the pre-delete catalog, reuse the deleted conversation's id and
    // put it straight back, so the chat could never be deleted.
    if (activeConversation.current === id) startBlankChat(withoutConversation(catalog, id));
    else setCatalog((current) => withoutConversation(current, id));
  }
  const pending = pendingDecisions(plan);
  const dialogTitle =
    dialog === "review"
      ? "Review plan"
      : dialog === "saved"
        ? "Saved trips"
        : dialog === "language"
          ? "Language"
          : "Local account";
  const facts = plan ? tripFacts(plan) : [];
  const drawerOpen = preferencesOpen || tripOpen || navOpen;
  return (
    <div
      className="workspace-app"
      data-sidebar-collapsed={!narrow && sidebarCollapsed}
      data-narrow={narrow}
      style={
        !narrow && sidebarWidth !== undefined
          ? ({ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties)
          : undefined
      }
    >
      {!narrow && (
        <WorkspaceSidebar
          onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
          collapsed={sidebarCollapsed}
          section={section}
          onSection={setSection}
          query={historyQuery}
          onQuery={setHistoryQuery}
          chats={historyChats}
          trips={historyTrips}
          savedCount={saved.length}
          onNewChat={newChat}
          onOpenChat={selectConversation}
          onOpenTrip={selectTrip}
          onRenameChat={renameChat}
          onDeleteChat={deleteChat}
          onSavedTrips={() => openDialog("saved")}
          onLanguage={() => openDialog("language")}
          onAccount={() => openDialog("account")}
          saveState={saveState}
        />
      )}
      {!narrow && !sidebarCollapsed && (
        <SidebarResizer width={sidebarWidth} onChange={setSidebarWidth} />
      )}
      <div className="workspace-main">
        <header className="workspace-topbar">
          {narrow && (
            <button
              ref={navToggle}
              type="button"
              className="topbar-icon-button"
              aria-label="Open navigation"
              aria-expanded={navOpen}
              aria-haspopup="dialog"
              onClick={() => {
                setPreferencesOpen(false);
                setTripOpen(false);
                setNavOpen(true);
              }}
            >
              <MenuIcon />
            </button>
          )}
          <div className="topbar-summary">
            <h1 className="topbar-title">{plan ? plan.brief.destination : "New trip"}</h1>
            <p className="topbar-facts">
              {plan ? facts.join(" · ") : "Not planned yet — add a destination and dates"}
            </p>
          </div>
          {narrow && (
            <div className="topbar-views" role="group" aria-label="Workspace view">
              {(["chat", "map"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={mobileView === view}
                  onClick={() => setMobileView(view)}
                >
                  {view === "chat" ? "Chat" : "Map"}
                </button>
              ))}
            </div>
          )}
          <div className="topbar-actions">
            <button
              ref={preferencesToggle}
              type="button"
              className="topbar-button"
              aria-label="Open trip preferences"
              aria-expanded={preferencesOpen}
              aria-haspopup="dialog"
              onClick={() => (preferencesOpen ? closePreferences() : openPreferences())}
            >
              <SlidersIcon />
              <span className="topbar-button__label">Preferences</span>
            </button>
            <button
              ref={tripToggle}
              type="button"
              className="topbar-button trip-trigger"
              aria-label="Open your trip"
              aria-describedby={pending ? "trip-trigger-count" : undefined}
              aria-expanded={tripOpen}
              aria-haspopup="dialog"
              onClick={() => (tripOpen ? closeTrip() : openTrip())}
            >
              <RouteIcon />
              <span className="topbar-button__label">Trip</span>
              {pending > 0 && (
                <span className="trip-trigger__count" id="trip-trigger-count">
                  {pending}
                  <span className="sr-only"> decisions pending</span>
                </span>
              )}
            </button>
          </div>
        </header>
        <div className="workspace-notices">
          {error && (
            <div className="error-banner" role="alert">
              {error}{" "}
              {retry && (
                <button disabled={busy} onClick={() => void run(retry)}>
                  Retry update
                </button>
              )}
            </div>
          )}
          {storageError && (
            <div className="error-banner" role="alert">
              {storageError}{" "}
              <button
                onClick={() => {
                  setStorageError("");
                  setStorageEnabled(true);
                }}
              >
                Retry / replace workspace storage
              </button>
            </div>
          )}
          {notice && (
            <p role="status" className="notice">
              {notice}{" "}
              <button onClick={() => setNotice("")} aria-label="Dismiss notification">
                Dismiss
              </button>
            </p>
          )}
        </div>
        <main
          className="workspace-shell"
          aria-busy={busy}
          data-preferences-open={preferencesOpen}
          data-trip-open={tripOpen}
          data-mobile-view={mobileView}
        >
          <div className="workspace-panel workspace-panel--chat">
            <ChatPanel
              plan={plan}
              messages={messages}
              input={input}
              onInput={setInput}
              busy={busy || editPending}
              activity={activity}
              onSend={send}
              onDecision={onDecision}
              onEdit={edit}
              onStart={edit}
            />
          </div>
          <div className="workspace-panel workspace-panel--map">
            <TripMapCanvas
              destination={plan?.brief.destination}
              viewKey={plan ? `${plan.tripId}|${plan.brief.destination}` : undefined}
              tripPlaces={tripPlaces}
              selectedActivity={selectedActivity}
              onSelectActivity={setSelectedActivity}
              routes={mapRoutes}
            />
          </div>
          {drawerOpen && (
            <button
              type="button"
              tabIndex={-1}
              className="workspace-drawer-backdrop"
              aria-label="Close open panel"
              onClick={() => {
                const trigger = tripOpen
                  ? tripToggle
                  : preferencesOpen
                    ? preferencesToggle
                    : navToggle;
                closePreferences();
                closeTrip();
                setNavOpen(false);
                trigger.current?.focus({ preventScroll: true });
              }}
            />
          )}
          {narrow && (
            <Drawer
              side="left"
              open={navOpen}
              title="Chats and trips"
              closeLabel="Close navigation"
              onClose={() => setNavOpen(false)}
              returnFocus={navToggle}
              className="workspace-drawer workspace-drawer--nav"
            >
              <WorkspaceSidebar
                collapsible={false}
                collapsed={sidebarCollapsed}
                section={section}
                onSection={setSection}
                query={historyQuery}
                onQuery={setHistoryQuery}
                chats={historyChats}
                trips={historyTrips}
                savedCount={saved.length}
                onNewChat={newChat}
                onOpenChat={selectConversation}
                onOpenTrip={selectTrip}
                onRenameChat={renameChat}
                onDeleteChat={deleteChat}
                onSavedTrips={() => openDialog("saved")}
                onLanguage={() => openDialog("language")}
                onAccount={() => openDialog("account")}
                saveState={saveState}
              />
            </Drawer>
          )}
          <Drawer
            side="left"
            open={preferencesOpen}
            title="Trip preferences"
            closeLabel="Close trip preferences"
            onClose={closePreferences}
            returnFocus={preferencesToggle}
            className="workspace-drawer workspace-drawer--preferences"
          >
            <div ref={left} className="filter-container">
              <FiltersPanel
                draft={draft}
                onChange={setDraft}
                onSubmit={submit}
                busy={busy || editPending}
                errors={errors}
              />
            </div>
          </Drawer>
          <Drawer
            side="right"
            open={tripOpen}
            title="Your trip"
            closeLabel="Close your trip"
            onClose={closeTrip}
            returnFocus={tripToggle}
            className="workspace-drawer workspace-drawer--trip"
            meta={plan && <span className="trip__meta">{tripStatus(plan)}</span>}
          >
            {plan ? (
              <TripPanel
                plan={plan}
                busy={busy || editPending}
                tab={tripTab}
                onTab={setTripTab}
                onReview={() => setDialog("review")}
                onDecision={onDecision}
                onEdit={edit}
                onSave={save}
                timeline={
                  <TripEditor
                    plan={plan}
                    disabled={busy}
                    onPending={setEditPending}
                    tripPlaces={tripPlaces}
                    selected={selectedActivity}
                    onSelect={setSelectedActivity}
                    onRoutesChange={setMapRoutes}
                    onApply={(next) => {
                      setPreviousTotal(plan.estTotal);
                      setPlan(next);
                    }}
                  />
                }
              />
            ) : (
              <div className="trip-drawer-empty">
                <p>
                  No trip yet. Describe where you want to go in the chat, or add your trip details.
                  Your itinerary, budget and decisions will appear here.
                </p>
                <button type="button" onClick={edit}>
                  Add trip details
                </button>
              </div>
            )}
          </Drawer>
        </main>
      </div>
      {dialog && (
        <Dialog title={dialogTitle} onClose={() => setDialog(undefined)}>
          {dialog === "review" && plan && (
            <>
              <p>
                {plan.brief.destination} · {money(plan.estTotal)} estimated /{" "}
                {money(plan.budgetTotal)} budget
              </p>
              <p>
                {previousTotal === undefined
                  ? "No previous plan to compare."
                  : `Change from the previous estimate: ${money(plan.estTotal - previousTotal)}.`}
              </p>
              <h3>Conflicts</h3>
              {plan.conflicts?.length ? (
                <ul>
                  {plan.conflicts.map((c, i) => (
                    <li key={i}>
                      {c.reason}
                      <ul>
                        {c.constraints.map((v, j) => (
                          <li key={j}>{v}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No detected schedule conflicts.</p>
              )}
              {error && (
                <div className="error-text" role="alert">
                  {error}
                  {retry && (
                    <button disabled={busy} onClick={() => void run(retry)}>
                      Retry update
                    </button>
                  )}
                </div>
              )}
              {!plan.sections.length && <p>No plan yet. Update your trip preferences to start.</p>}
              <CheckpointCards plan={plan} busy={busy} onDecision={onDecision} onEdit={edit} />
            </>
          )}
          {dialog === "saved" && (
            <>
              <p>Saved on this browser only. Restoring a copy replaces your current workspace.</p>
              <div className="actions">
                <button disabled={!plan || busy || !plan.sections.length} onClick={save}>
                  Save current trip
                </button>
                <button onClick={loadSaved}>Reload saved trips</button>
                <button
                  onClick={() => {
                    try {
                      const raw = localStorage.getItem(CURRENT_KEY);
                      if (!raw) throw new Error();
                      restore(parseSnapshot(JSON.parse(raw)));
                    } catch {
                      setStorageError("No readable workspace is available to restore.");
                    }
                  }}
                >
                  Restore last workspace
                </button>
              </div>
              <p className="muted">
                Chats and trips in the sidebar are also saved automatically in this browser.
              </p>
              {storageError && (
                <p role="alert" className="error-text">
                  {storageError}
                </p>
              )}
              {notice && <p role="status">{notice}</p>}
              {saved.length ? (
                saved.map((item) => (
                  <article className="checkpoint" key={item.id}>
                    <h3>{item.plan.brief.destination}</h3>
                    <p>
                      {item.plan.brief.dates.join(" to ")} · {money(item.plan.estTotal)}
                    </p>
                    <p>Saved {new Date(item.savedAt).toLocaleString()}</p>
                    <button onClick={() => restore(item)}>Restore trip</button>
                  </article>
                ))
              ) : (
                <p>No saved trips yet. Save your current trip to keep a copy.</p>
              )}
            </>
          )}
          {dialog === "language" && (
            <p>
              English is the current interface language. You can chat in your preferred language;
              interface translation is not available yet.
            </p>
          )}
          {dialog === "account" && (
            <p>
              This is a single-user local workspace. No sign-in is required. Saved trips stay in
              this browser and are not synced to other devices.
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
