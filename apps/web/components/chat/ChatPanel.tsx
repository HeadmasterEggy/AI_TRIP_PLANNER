"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { AGENT_NAMES, type AgentProgressEvent, type TripPlan } from "@trip/shared";
import { looksLikeDateQuestion } from "@/lib/planning/date-range";
import type { Message } from "@/lib/workspace";
import { CalendarIcon } from "../ui/icons";
import { CheckpointCards, type Decision } from "../trip/CheckpointCards";

// react-day-picker + its stylesheet are only worth loading once the
// traveller actually opens the calendar, not on every chat load.
const DateRangePicker = dynamic(
  () => import("../preferences/DateRangePicker").then((m) => m.DateRangePicker),
  { ssr: false },
);
const labels = {
  itinerary: "Day plan",
  transport: "Getting around",
  accommodation: "Stay",
  "destination-guide": "Destination guide",
  dining: "Food & dining",
};
const suggestions = [
  "Plan a week in Paris with food, museums and day trips.",
  "Build a relaxed long weekend in Lisbon for two.",
  "Plan a family-friendly five days in Vancouver.",
  "Create a train-focused week through northern Italy.",
];

type ActivityStatus =
  "queued" | "running" | "revising" | "completed" | "failed" | "interrupted" | "unknown";
const statusLabels: Record<ActivityStatus, string> = {
  queued: "Queued",
  running: "Running",
  revising: "Revising",
  completed: "Complete",
  failed: "Needs attention",
  interrupted: "Interrupted",
  unknown: "Unknown status",
};
const statusSymbols: Record<ActivityStatus, string> = {
  queued: "○",
  running: "↻",
  revising: "↻",
  completed: "✓",
  failed: "!",
  interrupted: "■",
  unknown: "?",
};

function agentStatus(event: AgentProgressEvent | undefined, busy: boolean): ActivityStatus {
  if (!event) return busy ? "queued" : "interrupted";
  if (event.type === "agent_failed") return "failed";
  if (event.type === "agent_completed") return "completed";
  if (event.type === "agent_started") return event.round > 1 ? "revising" : "running";
  return "unknown";
}
export function ChatPanel({
  plan,
  messages,
  input,
  onInput,
  busy,
  activity,
  onSend,
  onDecision,
  onEdit,
  onStart,
}: {
  /** Undefined for a blank conversation that has not produced a plan. */
  plan?: TripPlan;
  messages: Message[];
  input: string;
  onInput: (value: string) => void;
  busy: boolean;
  activity: AgentProgressEvent[];
  onSend: () => void;
  onDecision: (decision: Decision) => void;
  onEdit: () => void;
  /** Opens Trip preferences from the blank-conversation prompt. */
  onStart?: () => void;
}) {
  const stream = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (messages.length || activity.length)
      stream.current?.scrollTo({ top: stream.current.scrollHeight });
  }, [messages, activity]);

  const [showCalendar, setShowCalendar] = useState(false);
  // Auto-open once per new assistant message that reads as a date question —
  // track the message count we last reacted to so closing the dialog (or the
  // traveller typing instead) doesn't make it pop back open on every render.
  const autoOpenedFor = useRef(-1);
  useEffect(() => {
    const last = messages.at(-1);
    if (
      last?.role === "agent" &&
      looksLikeDateQuestion(last.text) &&
      autoOpenedFor.current !== messages.length
    ) {
      autoOpenedFor.current = messages.length;
      setShowCalendar(true);
    }
  }, [messages]);
  return (
    <section className="panel chat" aria-labelledby="chat-title">
      <h2 id="chat-title">Plan together</h2>
      <div className="chat__stream" ref={stream} aria-busy={busy}>
        {!plan && !messages.length && (
          <div className="chat-empty">
            <h3>Where to next?</h3>
            <p>
              Describe your destination, travel dates, number of travellers and total budget, or
              fill in the preferences form.
            </p>
            <div className="chat-empty__suggestions" aria-label="Example trip suggestions">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    onInput(suggestion);
                    inputRef.current?.focus();
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <p className="chat-empty__input-hint">Choose a suggestion or write your own below.</p>
            {onStart && (
              <button type="button" onClick={onStart}>
                Fill in trip preferences
              </button>
            )}
          </div>
        )}
        <div role="log" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`msg msg--${m.role}`}>
              <span className="msg__speaker">
                {m.role === "user" ? "You" : "Travel planning assistant"}
              </span>
              <div className="msg__content">{m.text}</div>
            </div>
          ))}
        </div>
        {activity.length > 0 && (
          <section className="agent-activity" aria-label="Planning progress">
            <h3 className="agent-activity__title">Planning progress</h3>
            <div className="agent-activity__list" role="list">
              <div
                className="agent-activity__row"
                role="listitem"
                aria-label={`Coordinator ${busy ? "Running" : "Complete"}`}
              >
                <span>Coordinator</span>
                <span
                  className={`agent-activity__status agent-activity__status--${busy ? "running" : "completed"}`}
                >
                  <span className="agent-activity__indicator" aria-hidden="true">
                    {statusSymbols[busy ? "running" : "completed"]}
                  </span>
                  {busy ? "Running" : "Complete"}
                </span>
              </div>
              {AGENT_NAMES.map((agent) => {
                const events = activity.filter((e) => "agent" in e && e.agent === agent);
                const status = agentStatus(events.at(-1), busy);
                return (
                  <div
                    className="agent-activity__row"
                    key={agent}
                    role="listitem"
                    aria-label={`${labels[agent]} ${statusLabels[status]}`}
                  >
                    <span>{labels[agent]}</span>
                    <span className={`agent-activity__status agent-activity__status--${status}`}>
                      <span className="agent-activity__indicator" aria-hidden="true">
                        {statusSymbols[status]}
                      </span>
                      {statusLabels[status]}
                    </span>
                    <details aria-label={`${labels[agent]} details`}>
                      <summary>View details</summary>
                      {events.length ? (
                        events.map((event, i) => (
                          <div key={i}>
                            <strong>Round {event.round}</strong>
                            {"summary" in event && <p>{event.summary}</p>}
                            {"constraints" in event && event.constraints?.length ? (
                              <ul>
                                {event.constraints.map((c, j) => (
                                  <li key={j}>{c}</li>
                                ))}
                              </ul>
                            ) : null}
                            {event.type === "agent_failed" && (
                              <p className="error-text">{event.error}</p>
                            )}
                          </div>
                        ))
                      ) : (
                        <p>Waiting for assignment.</p>
                      )}
                    </details>
                  </div>
                );
              })}
            </div>
            <details aria-label="Coordinator details">
              <summary>Coordinator details</summary>
              {activity
                .filter((e) => e.type === "coordinator")
                .map(
                  (event, i) =>
                    event.type === "coordinator" && (
                      <div key={i}>
                        <strong>
                          {event.phase} · round {event.round}
                        </strong>
                        <p>{event.summary}</p>
                        {event.constraints?.length ? (
                          <ul>
                            {event.constraints.map((c, j) => (
                              <li key={j}>{c}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ),
                )}
            </details>
          </section>
        )}
        {plan && (
          <CheckpointCards plan={plan} busy={busy} onDecision={onDecision} onEdit={onEdit} />
        )}
      </div>
      <form
        className="chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      >
        <button
          type="button"
          className="chat__calendar-trigger"
          aria-label="Pick travel dates from a calendar"
          disabled={busy}
          onClick={() => setShowCalendar(true)}
        >
          <CalendarIcon />
        </button>
        <input
          ref={inputRef}
          className="field"
          aria-label="Message AI Trip Planner"
          placeholder={
            plan ? "Tell me what to change…" : "Destination, dates, travellers and budget…"
          }
          value={input}
          disabled={busy}
          onChange={(e) => onInput(e.target.value)}
        />
        <button className="primary" disabled={busy || !input.trim()}>
          {busy ? "Planning…" : "Send"}
        </button>
      </form>
      <p className="disclaimer">Estimates require verification. Nothing here makes a booking.</p>
      {showCalendar && (
        <DateRangePicker
          onConfirm={({ start, end }) => onInput(`Travel dates: ${start} to ${end}`)}
          onClose={() => setShowCalendar(false)}
        />
      )}
    </section>
  );
}
