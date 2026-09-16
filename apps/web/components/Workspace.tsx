"use client";
import { useEffect, useRef, useState } from "react";
import { TripPlan, type AgentProgressEvent, type ChatRequest } from "@trip/shared";
import { FiltersPanel } from "./FiltersPanel";
import { ChatPanel } from "./ChatPanel";
import { TripPanel } from "./TripPanel";
import { CheckpointCards, type Decision } from "./CheckpointCards";
import { Header, type Navigation } from "./Header";
import { Dialog } from "./Dialog";
import {
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

type Task =
  { kind: "chat"; request: ChatRequest } | { kind: "decision"; plan: TripPlan; decision: Decision };
const seed: Message[] = [
  {
    role: "agent",
    text: "Edit your trip preferences or tell me what to change. Review the decisions when your plan is ready.",
  },
];

export function Workspace({
  initialPlan,
  initialError,
}: {
  initialPlan: TripPlan;
  initialError?: string;
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [draft, setDraft] = useState(() => draftFor(initialPlan.brief));
  const [messages, setMessages] = useState<Message[]>(seed);
  const [input, setInput] = useState("");
  const [previousTotal, setPreviousTotal] = useState<number>();
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
  const active = useRef<AbortController | null>(null);
  const left = useRef<HTMLDivElement>(null);

  // Restore after hydration; never overwrite unreadable data automatically.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CURRENT_KEY);
      if (raw) {
        const restored = parseSnapshot(JSON.parse(raw));
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
      setSaved(parseSaved(localStorage.getItem(SAVED_KEY)));
    } catch {
      setStorageError(
        "Saved trips could not be read. Existing stored data has been kept; you can retry from Saved trips.",
      );
    }
    setReady(true);
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !storageEnabled) return;
    try {
      localStorage.setItem(
        CURRENT_KEY,
        JSON.stringify({
          version: 1,
          id: plan.tripId,
          savedAt: new Date().toISOString(),
          plan,
          draft,
          messages,
          input,
          previousTotal,
        } satisfies Snapshot),
      );
    } catch {
      setStorageEnabled(false);
      setStorageError(
        "Browser storage is unavailable or full. Your current plan is still in this tab. Retry after freeing space.",
      );
    }
  }, [ready, storageEnabled, plan, draft, messages, input, previousTotal]);

  function edit() {
    setDialog(undefined);
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
    setNotice("Trip restored. Future edits are saved to your current workspace.");
  }
  function snapshot(): Snapshot {
    return {
      version: 1,
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      plan,
      draft,
      messages,
      input,
      previousTotal,
    };
  }
  function save() {
    try {
      const current = parseSaved(localStorage.getItem(SAVED_KEY));
      const next = [snapshot(), ...current];
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
      setPlan(next);
      if (task.kind === "chat") setDraft(draftFor(next.brief));
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
    const message = `Plan ${parsed.data.destination}, ${parsed.data.dates.join(" to ")}, ${parsed.data.groupSize} travellers, ${money(parsed.data.budgetTotal)} total, with the submitted accommodation preferences.`;
    setMessages((current) => [...current, { role: "user", text: message }]);
    void run({
      kind: "chat",
      request: { tripId: plan.tripId, mode: "plan", brief: parsed.data, message },
    });
  }
  function send() {
    if (!input.trim() || active.current) return;
    setMessages((current) => [...current, { role: "user", text: input.trim() }]);
    void run({
      kind: "chat",
      request: { tripId: plan.tripId, message: input.trim(), brief: plan.brief },
    });
  }
  const onDecision = (decision: Decision) => {
    void run({ kind: "decision", plan, decision });
  };
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
      <main className="layout" aria-busy={busy}>
        <div ref={left} className="filter-container">
          <FiltersPanel
            draft={draft}
            onChange={setDraft}
            onSubmit={submit}
            busy={busy || !ready}
            errors={errors}
          />
        </div>
        <ChatPanel
          plan={plan}
          messages={messages}
          input={input}
          onInput={setInput}
          busy={busy || !ready}
          activity={activity}
          onSend={send}
          onDecision={onDecision}
          onEdit={edit}
        />
        <TripPanel
          plan={plan}
          busy={busy || !ready}
          onReview={() => setDialog("review")}
          onDecision={onDecision}
          onEdit={edit}
          onSave={save}
        />
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
                <button disabled={busy || !ready || !plan.sections.length} onClick={save}>
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
              <p>Current workspace: {plan.brief.destination}</p>
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
