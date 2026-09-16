"use client";
import { useEffect, useRef } from "react";
import { AGENT_NAMES, type AgentProgressEvent, type TripPlan } from "@trip/shared";
import { CheckpointCards, type Decision } from "./CheckpointCards";
import type { Message } from "@/lib/workspace";
const labels = {
  itinerary: "Day plan",
  transport: "Getting around",
  accommodation: "Stay",
  "destination-guide": "Destination guide",
  dining: "Food & dining",
};
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
}: {
  plan: TripPlan;
  messages: Message[];
  input: string;
  onInput: (value: string) => void;
  busy: boolean;
  activity: AgentProgressEvent[];
  onSend: () => void;
  onDecision: (decision: Decision) => void;
  onEdit: () => void;
}) {
  const stream = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stream.current?.scrollTo({ top: stream.current.scrollHeight });
  }, [messages]);
  return (
    <section className="panel chat" aria-labelledby="chat-title">
      <h2 id="chat-title">Plan together</h2>
      <div className="chat__stream" ref={stream} aria-busy={busy}>
        <div role="log" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`msg msg--${m.role}`}>
              {m.text}
            </div>
          ))}
        </div>
        {activity.length > 0 && (
          <div className="agent-activity">
            <h3>Planning progress</h3>
            <details>
              <summary>
                Coordinator ·{" "}
                {activity.filter((e) => e.type === "coordinator").at(-1)?.type === "coordinator"
                  ? "View stages"
                  : "Assigning tasks"}
              </summary>
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
            {AGENT_NAMES.map((agent) => {
              const events = activity.filter((e) => "agent" in e && e.agent === agent);
              const last = events.at(-1);
              const status = !last
                ? busy
                  ? "Queued"
                  : "Not run"
                : last.type === "agent_failed"
                  ? "Needs attention"
                  : last.type === "agent_completed"
                    ? "Complete"
                    : busy
                      ? last.round > 1
                        ? "Revising"
                        : "Running"
                      : "Interrupted";
              return (
                <details key={agent}>
                  <summary>
                    {labels[agent]} <span className="progress-label">{status}</span>
                  </summary>
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
              );
            })}
          </div>
        )}
        <CheckpointCards plan={plan} busy={busy} onDecision={onDecision} onEdit={onEdit} />
      </div>
      <form
        className="chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      >
        <input
          className="field"
          aria-label="Message AI Trip Planner"
          placeholder="Tell me what to change…"
          value={input}
          disabled={busy}
          onChange={(e) => onInput(e.target.value)}
        />
        <button className="primary" disabled={busy || !input.trim()}>
          {busy ? "Planning…" : "Send"}
        </button>
      </form>
      <p className="disclaimer">Estimates require verification. Nothing here makes a booking.</p>
    </section>
  );
}
