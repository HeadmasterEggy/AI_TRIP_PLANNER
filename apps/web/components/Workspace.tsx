"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { TripPlan, type AgentProgressEvent, type ChatRequest } from "@trip/shared";
import { FiltersPanel } from "./FiltersPanel";
import { ChatPanel } from "./ChatPanel";
import { TripEditor } from "./TripEditor";
import { TripMap } from "./TripMap";
import { TripPanel } from "./TripPanel";
import { CheckpointCards, type Decision } from "./CheckpointCards";
import { Header, type Navigation } from "./Header";
import { Dialog } from "./Dialog";
import { WorkspaceSkeleton } from "./WorkspaceSkeleton";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import {
  identifyActivities,
  CURRENT_KEY,
  SAVED_KEY,
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
  createCatalog,
  parseCatalog,
  searchCatalog,
  serializeCatalog,
  updateCatalog,
  upsertConversationDraft,
  upsertCurrent,
  type WorkspaceCatalog,
} from "@/lib/workspace-catalog";

type Task =
  { kind: "chat"; request: ChatRequest } | { kind: "decision"; plan: TripPlan; decision: Decision };
const seed: Message[] = [
  {
    role: "agent",
    text: "Edit your trip preferences or tell me what to change. Review the decisions when your plan is ready.",
  },
];
const blankDraft = (): ReturnType<typeof draftFor> => ({
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

export function Workspace({
  initialPlan,
  initialError,
}: {
  initialPlan?: TripPlan;
  initialError?: string;
}) {
  const [loadedPlan, setLoadedPlan] = useState(() =>
    initialPlan ? identifyActivities(initialPlan) : undefined,
  );
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (initialPlan) return;
    // Resolve storage before requesting the demo. The content component restores
    // the complete snapshot, including unfinished drafts and conversation input.
    try {
      const raw = localStorage.getItem(CURRENT_KEY);
      if (raw) {
        setLoadedPlan(parseSnapshot(JSON.parse(raw)).plan);
        return;
      }
    } catch {
      // Preserve unreadable storage; the content component reports the problem.
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
        const next = TripPlan.parse(body.plan);
        if (!controller.signal.aborted) setLoadedPlan(next);
      } catch {
        if (!controller.signal.aborted)
          setLoadError("The initial trip could not be loaded. Please retry planning.");
      }
    }
    void load();
    return () => controller.abort();
  }, [initialPlan, attempt]);

  if (loadedPlan) return <WorkspaceContent initialPlan={loadedPlan} initialError={initialError} />;

  return (
    <>
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
    </>
  );
}

function WorkspaceContent({
  initialPlan,
  initialError,
}: {
  initialPlan: TripPlan;
  initialError?: string;
}) {
  const [plan, setPlan] = useState(() => identifyActivities(initialPlan));
  const [draft, setDraft] = useState(() => draftFor(initialPlan.brief));
  const [messages, setMessages] = useState<Message[]>(seed);
  const [input, setInput] = useState("");
  const [previousTotal, setPreviousTotal] = useState<number>();
  const [editorView, setEditorView] = useState<"overview" | "timeline" | "map">("map");
  const [editPending, setEditPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<AgentProgressEvent[]>([]);
  const [error, setError] = useState(initialError ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState<Task>();
  const [dialog, setDialog] = useState<Navigation | "review">();
  const [saved, setSaved] = useState<Snapshot[]>([]);
  const [storageError, setStorageError] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [storageEnabled, setStorageEnabled] = useState(true);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "failed">("saved");
  const [catalog, setCatalog] = useState<WorkspaceCatalog>(() => createCatalog());
  const catalogRef = useRef(catalog);
  const [historyQuery, setHistoryQuery] = useState("");
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  const [preferencesWidth, setPreferencesWidth] = useState(280);
  const [tripWidth, setTripWidth] = useState(390);
  const [freshChat, setFreshChat] = useState(false);
  const [mobileView, setMobileView] = useState<"history" | "preferences" | "chat" | "map" | "trip">(
    "chat",
  );
  const activeConversation = useRef(`conversation:${crypto.randomUUID()}`);
  const freshTripId = useRef(crypto.randomUUID());

  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);
  const active = useRef<AbortController | null>(null);
  const left = useRef<HTMLDivElement>(null);
  const preferencesToggle = useRef<HTMLButtonElement>(null);
  const tripToggle = useRef<HTMLButtonElement>(null);

  // Restore after hydration; never overwrite unreadable data automatically.
  useEffect(() => {
    let restoredCurrent: Snapshot | undefined;
    let restoredSaved: Snapshot[] = [];
    try {
      const raw = localStorage.getItem(CURRENT_KEY);
      if (raw) {
        const restored = parseSnapshot(JSON.parse(raw));
        restoredCurrent = restored;
        setPlan(restored.plan);
        setDraft(restored.draft);
        setMessages(restored.messages);
        setInput(restored.input);
        setPreviousTotal(restored.previousTotal);
        setError("");
        setNotice("Restored your workspace from this browser.");
      }
    } catch {
      setStorageError(
        "Your last workspace could not be restored. Current edits are kept in this tab. Retry storage or explicitly replace the unreadable workspace.",
      );
      setStorageEnabled(false);
    }
    try {
      restoredSaved = parseSaved(localStorage.getItem(SAVED_KEY));
      setSaved(restoredSaved);
    } catch {
      setStorageError(
        "Saved trips could not be read. Existing stored data has been kept; you can retry from Saved trips.",
      );
    }
    try {
      const nextCatalog = parseCatalog(
        localStorage.getItem(CATALOG_KEY),
        restoredCurrent,
        restoredSaved,
      );
      setCatalog(nextCatalog);
      if (nextCatalog.activeConversationId)
        activeConversation.current = nextCatalog.activeConversationId;
      setPreferencesOpen(false);
      setTripOpen(false);
      setPreferencesWidth(nextCatalog.layout.preferences.width);
      setTripWidth(nextCatalog.layout.trip.width);
      setMobileView(nextCatalog.layout.view);
      setEditorView(nextCatalog.layout.editorView);
      const activeTrip = nextCatalog.trips.find((item) => item.id === nextCatalog.activeTripId);
      const activeChat = nextCatalog.conversations.find(
        (item) => item.id === nextCatalog.activeConversationId,
      );
      if (activeTrip) {
        const restored = activeTrip.snapshot;
        setPlan(restored.plan);
        setDraft(restored.draft);
        setPreviousTotal(restored.previousTotal);
      }
      if (activeChat) {
        setMessages(activeChat.messages);
        setInput(activeChat.input);
        if (!activeChat.tripId && !activeChat.snapshot) {
          setFreshChat(true);
          setDraft(blankDraft());
          freshTripId.current = crypto.randomUUID();
        }
      }
    } catch {
      setStorageError(
        "Workspace history could not be read. Existing stored data was kept and the current trip remains available.",
      );
      setStorageEnabled(false);
    }
    setReady(true);
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !storageEnabled) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      try {
        if (freshChat) {
          const nextCatalog = upsertConversationDraft(catalogRef.current, {
            id: activeConversation.current,
            messages,
            input,
          });
          localStorage.setItem(CATALOG_KEY, serializeCatalog(nextCatalog));
          setCatalog(nextCatalog);
          setSaveState("saved");
          return;
        }
        const id = activeConversation.current.replace(/^conversation:/, "");
        const current = {
          version: 2,
          id,
          savedAt: new Date().toISOString(),
          plan,
          draft,
          messages,
          input,
          previousTotal,
        } satisfies Snapshot;
        const nextCatalog = upsertCurrent(catalogRef.current, current, messages);
        localStorage.setItem(CURRENT_KEY, JSON.stringify(current));
        localStorage.setItem(CATALOG_KEY, serializeCatalog(nextCatalog));
        setCatalog(nextCatalog);
        setSaveState("saved");
      } catch {
        setStorageEnabled(false);
        setSaveState("failed");
        setStorageError(
          "Browser storage is unavailable or full. Your current plan is still in this tab. Retry after freeing space.",
        );
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    ready,
    storageEnabled,
    plan,
    draft,
    messages,
    input,
    previousTotal,
    preferencesOpen,
    tripOpen,
    preferencesWidth,
    tripWidth,
    mobileView,
    editorView,
    freshChat,
  ]);

  useEffect(() => {
    if (!ready || !storageEnabled) return;
    try {
      localStorage.setItem(CATALOG_KEY, serializeCatalog(catalog));
    } catch {
      setSaveState("failed");
      setStorageEnabled(false);
      setStorageError(
        "Browser storage is unavailable or full. Your current plan is still in this tab. Retry after freeing space.",
      );
    }
  }, [catalog, ready, storageEnabled]);

  useEffect(() => {
    setCatalog((current) =>
      updateCatalog(current, {
        layout: {
          preferences: { open: preferencesOpen, width: preferencesWidth },
          trip: { open: tripOpen, width: tripWidth },
          view: mobileView === "history" || mobileView === "preferences" ? "chat" : mobileView,
          editorView,
        },
      }),
    );
  }, [preferencesOpen, tripOpen, preferencesWidth, tripWidth, mobileView, editorView]);

  useEffect(() => {
    const closePanel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (tripOpen) {
        setTripOpen(false);
        tripToggle.current?.focus();
      } else if (preferencesOpen) {
        setPreferencesOpen(false);
        preferencesToggle.current?.focus();
      }
    };
    window.addEventListener("keydown", closePanel);
    return () => window.removeEventListener("keydown", closePanel);
  }, [preferencesOpen, tripOpen]);

  function edit() {
    setEditorView("overview");
    setDialog(undefined);
    setTripOpen(false);
    setPreferencesOpen(true);
    requestAnimationFrame(() => {
      left.current?.scrollIntoView({ block: "start" });
      left.current?.querySelector<HTMLInputElement>("input")?.focus();
    });
  }
  function restore(snapshot: Snapshot) {
    active.current?.abort();
    active.current = null;
    setBusy(false);
    setPlan(snapshot.plan);
    setDraft(snapshot.draft);
    setMessages(snapshot.messages);
    setInput(snapshot.input);
    setPreviousTotal(snapshot.previousTotal);
    setActivity([]);
    setError("");
    setErrors({});
    setRetry(undefined);
    setDialog(undefined);
    activeConversation.current = `conversation:${snapshot.id}`;
    setNotice("Trip restored. Future edits are saved to your current workspace.");
    setFreshChat(false);
  }
  function snapshot(): Snapshot {
    return {
      version: 2,
      id: activeConversation.current.replace(/^conversation:/, ""),
      savedAt: new Date().toISOString(),
      plan,
      draft,
      messages,
      input,
      previousTotal,
    };
  }
  function save() {
    if (freshChat) {
      setNotice("Add trip details before saving a trip.");
      return;
    }
    try {
      const current = parseSaved(localStorage.getItem(SAVED_KEY));
      const next = [{ ...snapshot(), id: crypto.randomUUID() }, ...current];
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
      if (task.kind === "chat" || next.estTotal !== plan.estTotal) setPreviousTotal(plan.estTotal);
      setPlan(identifyActivities(next));
      if (task.kind === "chat") {
        setDraft(draftFor(next.brief));
        setFreshChat(false);
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
    const parsed = parseDraft(draft, plan.brief);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) fields[String(issue.path[0])] ??= issue.message;
      setErrors(fields);
      setError("Check the highlighted trip preferences.");
      edit();
      return;
    }
    setErrors({});
    const brief = freshChat ? { ...parsed.data, tripId: freshTripId.current } : parsed.data;
    const message = `Plan ${brief.destination}, ${brief.dates.join(" to ")}, ${brief.groupSize} travellers, ${money(brief.budgetTotal)} total, with the submitted accommodation preferences.`;
    setMessages((current) => [...current, { role: "user", text: message }]);
    void run({
      kind: "chat",
      request: { tripId: brief.tripId, mode: "plan", brief, message },
    });
  }
  function send() {
    if (!input.trim() || active.current) return;
    setMessages((current) => [...current, { role: "user", text: input.trim() }]);
    void run({
      kind: "chat",
      request: freshChat
        ? { tripId: freshTripId.current, message: input.trim() }
        : { tripId: plan.tripId, message: input.trim(), brief: plan.brief },
    });
  }
  const onDecision = (decision: Decision) => {
    void run({ kind: "decision", plan, decision });
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
      : "No linked trip",
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
    active: item.id === catalog.activeTripId,
  }));
  function selectConversation(id: string) {
    const conversation = catalog.conversations.find((item) => item.id === id);
    if (!conversation) return;
    active.current?.abort();
    active.current = null;
    const linkedTrip = catalog.trips.find((item) => item.id === conversation.tripId);
    if (conversation.snapshot) restore(conversation.snapshot);
    else if (linkedTrip) restore(linkedTrip.snapshot);
    else {
      setFreshChat(true);
      setDraft(blankDraft());
      setActivity([]);
      setError("");
      freshTripId.current = crypto.randomUUID();
    }
    activeConversation.current = id;
    setMessages(conversation.messages);
    setInput(conversation.input);
    setCatalog((current) =>
      updateCatalog(current, {
        activeConversationId: id,
        ...(conversation.tripId ? { activeTripId: conversation.tripId } : {}),
      }),
    );
    setMobileView("chat");
  }
  function selectTrip(id: string) {
    const trip = catalog.trips.find((item) => item.id === id);
    if (!trip) return;
    restore(trip.snapshot);
    const conversationId = trip.conversationIds.at(-1);
    const conversation = catalog.conversations.find((item) => item.id === conversationId);
    if (conversation) {
      activeConversation.current = conversation.id;
      setMessages(conversation.messages);
      setInput(conversation.input);
    }
    setCatalog((current) =>
      updateCatalog(current, {
        activeTripId: id,
        ...(conversationId ? { activeConversationId: conversationId } : {}),
      }),
    );
    setMobileView("trip");
  }
  function newChat() {
    active.current?.abort();
    active.current = null;
    const id = `conversation:${crypto.randomUUID()}`;
    activeConversation.current = id;
    freshTripId.current = crypto.randomUUID();
    setFreshChat(true);
    setDraft(blankDraft());
    setMessages([]);
    setInput("");
    setActivity([]);
    setError("");
    setCatalog((current) => upsertConversationDraft(current, { id, messages: [], input: "" }));
    setMobileView("chat");
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
    <>
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
            ) : initialError && !plan.sections.length ? (
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
        <div className="workspace-floating-actions">
          <button
            ref={preferencesToggle}
            aria-label="Open trip preferences"
            aria-expanded={preferencesOpen}
            onClick={() => {
              setTripOpen(false);
              setPreferencesOpen(true);
            }}
          >
            Preferences
          </button>
          <button
            ref={tripToggle}
            className="trip-trigger"
            aria-label="Open your trip"
            aria-expanded={tripOpen}
            onClick={() => {
              setPreferencesOpen(false);
              setTripOpen(true);
            }}
          >
            <span aria-hidden="true">▣</span> Trip
            {!freshChat && plan.hitl.filter((item) => item.status !== "approved").length > 0 && (
              <span className="trip-trigger__count">
                {plan.hitl.filter((item) => item.status !== "approved").length}
              </span>
            )}
          </button>
        </div>
        {(preferencesOpen || tripOpen) && (
          <button
            className="workspace-drawer-backdrop"
            aria-label="Close open panel"
            onClick={() => {
              setPreferencesOpen(false);
              setTripOpen(false);
            }}
          />
        )}
        <section
          className={`workspace-panel workspace-panel--preferences${preferencesOpen ? " is-open" : ""}`}
          aria-label="Trip preferences panel"
          role="dialog"
          aria-modal={preferencesOpen}
          aria-hidden={!preferencesOpen}
          inert={!preferencesOpen}
        >
          <button
            className="workspace-panel__toggle"
            aria-label="Close trip preferences"
            onClick={() => {
              setPreferencesOpen(false);
              preferencesToggle.current?.focus();
            }}
          >
            ×
          </button>
          <div ref={left} className="filter-container">
            <FiltersPanel
              draft={draft}
              onChange={setDraft}
              onSubmit={submit}
              busy={busy || !ready || editPending}
              errors={errors}
            />
          </div>
        </section>
        <div className="workspace-panel workspace-panel--chat">
          <ChatPanel
            plan={plan}
            messages={messages}
            input={input}
            onInput={setInput}
            busy={busy || !ready || editPending}
            activity={activity}
            onSend={send}
            onDecision={onDecision}
            onEdit={edit}
            showPlan={!freshChat}
          />
        </div>
        <div className="workspace-panel workspace-panel--map">
          {freshChat ? (
            <TripMap places={[]} routes={[]} onSelect={() => {}} />
          ) : (
            <TripEditor
              plan={plan}
              disabled={busy || !ready}
              onPending={setEditPending}
              currentView="map"
              mapOnly
              onApply={(next) => setPlan(next)}
            />
          )}
        </div>
        <section
          className={`workspace-panel workspace-panel--trip${tripOpen ? " is-open" : ""}`}
          aria-label="Your trip panel"
          role="dialog"
          aria-modal={tripOpen}
          aria-hidden={!tripOpen}
          inert={!tripOpen}
        >
          <button
            className="workspace-panel__toggle"
            aria-label="Close your trip"
            onClick={() => {
              setTripOpen(false);
              tripToggle.current?.focus();
            }}
          >
            ×
          </button>
          {freshChat ? (
            <div className="trip-drawer-empty">
              <h2>Your trip</h2>
              <p>Tell us where you want to go. Your itinerary will appear here.</p>
              <button
                onClick={() => {
                  setTripOpen(false);
                  setPreferencesOpen(true);
                }}
              >
                Add trip details
              </button>
            </div>
          ) : (
            <TripPanel
              plan={plan}
              busy={busy || !ready || editPending}
              onReview={() => setDialog("review")}
              onDecision={onDecision}
              onEdit={edit}
              onSave={save}
            />
          )}
        </section>
      </main>
      {dialog && (
        <Dialog title={dialogTitle} onClose={() => setDialog(undefined)}>
          {dialog === "review" && (
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
                <button
                  disabled={freshChat || busy || !ready || !plan.sections.length}
                  onClick={save}
                >
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
              <p>Current workspace: {freshChat ? "New chat" : plan.brief.destination}</p>
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
    </>
  );
}
