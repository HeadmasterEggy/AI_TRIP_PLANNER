"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { TripPlan, type AgentProgressEvent, type ChatRequest } from "@trip/shared";
import { FiltersPanel } from "./FiltersPanel";
import { ChatPanel } from "./ChatPanel";
import { TripEditor } from "./TripEditor";
import { TripMapCanvas } from "./TripMapCanvas";
import { TripPanel, pendingDecisions, tripStatus, type TripTab } from "./TripPanel";
import { CheckpointCards, type Decision } from "./CheckpointCards";
import { Header, type Navigation } from "./Header";
import { Dialog } from "./Dialog";
import { Drawer } from "./Drawer";
import { WorkspaceSkeleton } from "./WorkspaceSkeleton";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { useTripPlaces } from "./useTripPlaces";
import type { RouteResult } from "@/lib/google";
import {
  identifyActivities,
  CURRENT_KEY,
  SAVED_KEY,
  blankDraft,
  draftFor,
  money,
  parseDraft,
  parseSaved,
  parseSnapshot,
  readPlanStream,
  type Message,
  type Snapshot,
} from "@/lib/workspace";
import {
  CATALOG_KEY,
  restoreWorkspace,
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
type MobileView = "history" | "preferences" | "chat" | "map" | "trip";
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

export function Workspace({
  initialPlan,
  initialError,
}: {
  initialPlan?: TripPlan;
  initialError?: string;
}) {
  const [restored, setRestored] = useState<RestoredWorkspace>();
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Resolve storage before anything renders so a blank conversation never flashes a
    // previous trip, and the demo is requested only when nothing is stored.
    const state = restoreWorkspace(readableStorage());
    if (state.plan || state.blank) {
      setRestored(state);
      return;
    }
    if (initialPlan) {
      const plan = identifyActivities(initialPlan);
      setRestored({ ...state, plan, draft: draftFor(plan.brief) });
      return;
    }
    const controller = new AbortController();
    setLoadError("");
    async function load() {
      try {
        const response = await fetch("/api/demo", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Unable to load the initial trip.");
        const body = await response.json();
        const next = identifyActivities(TripPlan.parse(body.plan));
        if (!controller.signal.aborted)
          setRestored({ ...state, plan: next, draft: draftFor(next.brief) });
      } catch {
        if (!controller.signal.aborted)
          setLoadError("The initial trip could not be loaded. Please retry planning.");
      }
    }
    void load();
    return () => controller.abort();
  }, [initialPlan, attempt]);

  if (restored) return <WorkspaceContent restored={restored} initialError={initialError} />;

  return (
    <div className="workspace-app">
      <Header />
      {loadError ? (
        <main className="workspace-notices">
          <div className="error-banner" role="alert">
            {loadError}{" "}
            <button onClick={() => setAttempt((value) => value + 1)}>Retry planning</button>
          </div>
        </main>
      ) : (
        <WorkspaceSkeleton />
      )}
    </div>
  );
}

function WorkspaceContent({
  restored,
  initialError,
}: {
  restored: RestoredWorkspace;
  initialError?: string;
}) {
  const [plan, setPlan] = useState<TripPlan | undefined>(restored.plan);
  const [draft, setDraft] = useState(restored.draft);
  const [messages, setMessages] = useState<Message[]>(
    () => restored.messages ?? (restored.blank ? [] : seed),
  );
  const [input, setInput] = useState(restored.input);
  const [previousTotal, setPreviousTotal] = useState(restored.previousTotal);
  const [editPending, setEditPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<AgentProgressEvent[]>([]);
  const [error, setError] = useState(initialError ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState<Task>();
  const [dialog, setDialog] = useState<Navigation | "review">();
  const [saved, setSaved] = useState<Snapshot[]>(restored.saved);
  const [storageError, setStorageError] = useState(restored.storageError ?? "");
  const [notice, setNotice] = useState(restored.notice ?? "");
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
  const [mobileView, setMobileView] = useState<MobileView>(restored.catalog.layout.view);
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
            version: 2,
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
          preferences: { ...current.layout.preferences, open: preferencesOpen },
          trip: { ...current.layout.trip, open: tripOpen },
          view: mobileView === "history" || mobileView === "preferences" ? "chat" : mobileView,
          editorView: tripTab,
        },
      }),
    );
  }, [preferencesOpen, tripOpen, mobileView, tripTab]);

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
    setPreferencesOpen(true);
    setMobileView("preferences");
  }
  function closePreferences() {
    setPreferencesOpen(false);
    setMobileView((view) => (view === "preferences" ? "chat" : view));
  }
  function openTrip() {
    setPreferencesOpen(false);
    setTripOpen(true);
    setMobileView("trip");
  }
  function closeTrip() {
    setTripOpen(false);
    setMobileView((view) => (view === "trip" ? "chat" : view));
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
      version: 2,
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
    void run({
      kind: "chat",
      request: plan
        ? { tripId: plan.tripId, message, brief: plan.brief }
        : { tripId: freshTripId.current, mode: "start", message },
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
    setMobileView("trip");
  }
  function newChat() {
    resetTransient();
    const id = `conversation:${crypto.randomUUID()}`;
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
    setCatalog((current) =>
      upsertConversationDraft(current, { id, messages: [], input: "", draft: blankDraft() }),
    );
    setMobileView("chat");
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLInputElement>('[aria-label="Message AI Trip Planner"]')
        ?.focus({ preventScroll: true }),
    );
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
  function deleteChat(id: string) {
    const existing = catalog.conversations.find((item) => item.id === id);
    if (!existing || !window.confirm(`Delete “${existing.title}”? The linked trip will be kept.`))
      return;
    setCatalog((current) => ({
      ...current,
      activeConversationId:
        current.activeConversationId === id ? undefined : current.activeConversationId,
      conversations: current.conversations.filter((item) => item.id !== id),
      trips: current.trips.map((item) => ({
        ...item,
        conversationIds: item.conversationIds.filter((conversationId) => conversationId !== id),
      })),
    }));
    if (activeConversation.current === id) newChat();
  }
  const pending = pendingDecisions(plan);
  const dialogTitle =
    dialog === "review"
      ? "Review plan"
      : dialog === "saved"
        ? "Saved trips"
        : dialog === "trips"
          ? "My trips"
          : dialog === "language"
            ? "Language"
            : "Local account";
  return (
    <div className="workspace-app">
      <Header
        onNavigate={(page) => {
          if (page === "saved") loadSaved();
          setDialog(page);
        }}
      />
      <div className="workspace-notices">
        {error && (
          <div className="error-banner" role="alert">
            {error}{" "}
            {retry ? (
              <button disabled={busy} onClick={() => void run(retry)}>
                Retry update
              </button>
            ) : initialError && plan && !plan.sections.length ? (
              <button disabled={busy} onClick={submit}>
                Retry planning
              </button>
            ) : null}
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
        <nav className="workspace-mobile-nav" aria-label="Workspace views">
          {(["history", "preferences", "chat", "map", "trip"] as const).map((view) => (
            <button
              key={view}
              aria-pressed={mobileView === view}
              onClick={() => {
                setMobileView(view);
                setPreferencesOpen(view === "preferences");
                setTripOpen(view === "trip");
              }}
            >
              {view[0]!.toUpperCase() + view.slice(1)}
            </button>
          ))}
        </nav>
        <WorkspaceSidebar
          query={historyQuery}
          onQuery={setHistoryQuery}
          chats={historyChats}
          trips={historyTrips}
          onNewChat={newChat}
          onOpenChat={selectConversation}
          onOpenTrip={selectTrip}
          onRenameChat={renameChat}
          onDeleteChat={deleteChat}
          saveState={saveState}
        />
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
            blank={blank}
            viewKey={plan?.tripId ?? activeConversation.current}
            tripPlaces={tripPlaces}
            selectedActivity={selectedActivity}
            onSelectActivity={setSelectedActivity}
            routes={mapRoutes}
          />
          <div className="workspace-map-actions">
            <button
              ref={preferencesToggle}
              type="button"
              aria-label="Open trip preferences"
              aria-expanded={preferencesOpen}
              aria-haspopup="dialog"
              onClick={openPreferences}
            >
              Preferences
            </button>
            <button
              ref={tripToggle}
              type="button"
              className="trip-trigger"
              aria-label="Open your trip"
              aria-describedby={pending ? "trip-trigger-count" : undefined}
              aria-expanded={tripOpen}
              aria-haspopup="dialog"
              onClick={openTrip}
            >
              <span aria-hidden="true" className="trip-trigger__icon">
                ▤
              </span>
              Trip
              {pending > 0 && (
                <span className="trip-trigger__count" id="trip-trigger-count">
                  {pending}
                  <span className="sr-only"> decisions pending</span>
                </span>
              )}
            </button>
          </div>
        </div>
        {(preferencesOpen || tripOpen) && (
          <button
            type="button"
            tabIndex={-1}
            className="workspace-drawer-backdrop"
            aria-label="Close open panel"
            onClick={() => {
              const trigger = tripOpen ? tripToggle : preferencesToggle;
              closePreferences();
              closeTrip();
              trigger.current?.focus({ preventScroll: true });
            }}
          />
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
              </div>
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
          {dialog === "trips" && (
            <>
              <p>Current workspace: {plan ? plan.brief.destination : "New chat"}</p>
              <p>
                Your plan, conversation and unfinished form are automatically saved in this browser.
              </p>
              <div className="actions">
                <button onClick={() => setDialog(undefined)}>Return to current trip</button>
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
                  Restore browser workspace
                </button>
                <button
                  onClick={() => {
                    loadSaved();
                    setDialog("saved");
                  }}
                >
                  Browse saved trips
                </button>
              </div>
              {storageError && <p role="alert">{storageError}</p>}
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
