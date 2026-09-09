"use client";

// Owner: E (shell) + A (wire to real orchestrator chat parsing).
// Posts a ChatRequest to /api/chat and lifts the returned plan up to Workspace.
import { useEffect, useRef, useState } from "react";
import {
  AGENT_NAMES,
  type AgentName,
  type AgentProgressEvent,
  type ChatResponse,
  type TripBrief,
  type TripPlan,
} from "@trip/shared";

type Msg = { role: "user" | "agent"; text: string };
type AgentActivity = {
  agent: AgentName;
  status: "queued" | "running" | "completed" | "failed";
  round?: number;
  error?: string;
};
type StreamFrame =
  | AgentProgressEvent
  | { type: "complete"; response: ChatResponse }
  | { type: "error"; error: string };

const AGENT_LABELS: Record<AgentName, string> = {
  itinerary: "Day plan",
  transport: "Getting around",
  accommodation: "Stay",
  "destination-guide": "Destination guide",
  dining: "Food & dining",
};

const SEED: Msg[] = [
  {
    role: "agent",
    text: "Tell me what to change — for example: “Sydney, 2026-10-01 to 2026-10-05, 2 people, budget $3000.”",
  },
];

export function ChatPanel({
  brief,
  onPlan,
  inputRef,
}: {
  brief: TripBrief;
  onPlan: (plan: TripPlan) => void;
  /** Lets the trip panel hand off to the composer, which is where a plan is changed. */
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const [messages, setMessages] = useState<Msg[]>(SEED);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<AgentActivity[]>([]);
  const streamRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController>(null);

  // Keep the newest turn in view; without this the reply lands below the fold
  // and the panel looks like it did nothing.
  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activity]);

  // A turn takes tens of seconds. If the panel goes away mid-stream, stop
  // reading rather than writing state into an unmounted component.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    setActivity(AGENT_NAMES.map((agent) => ({ agent, status: "queued" })));
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripId: brief.tripId, message: text, brief }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // The route answers 400/422 with { error } as plain JSON, not as a
        // progress stream. Without this the body was parsed as NDJSON, matched
        // no frame type, and the user saw "(no reply)" instead of the reason.
        const detail = await res
          .json()
          .then((body: { error?: string }) => body.error)
          .catch(() => undefined);
        throw new Error(detail ?? `Chat request failed (${res.status}).`);
      }
      if (!res.body) throw new Error("Chat response did not provide a progress stream.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResponse: ChatResponse | undefined;
      let streamError: string | undefined;

      const handleFrame = (frame: StreamFrame) => {
        if (
          frame.type === "agent_started" ||
          frame.type === "agent_completed" ||
          frame.type === "agent_failed"
        ) {
          setActivity((current) =>
            current.map((item) =>
              item.agent === frame.agent
                ? {
                    ...item,
                    status:
                      frame.type === "agent_started"
                        ? "running"
                        : frame.type === "agent_completed"
                          ? "completed"
                          : "failed",
                    round: frame.round,
                    error: frame.type === "agent_failed" ? frame.error : undefined,
                  }
                : item,
            ),
          );
        } else if (frame.type === "complete") {
          finalResponse = frame.response;
        } else if (frame.type === "error") {
          streamError = frame.error;
        }
      };

      // One unparseable frame used to throw out of the read loop and discard
      // the progress and plan already received. Skip it and keep reading.
      const readFrame = (line: string) => {
        if (!line.trim()) return;
        try {
          handleFrame(JSON.parse(line) as StreamFrame);
        } catch (error) {
          console.error("[chat] discarding unreadable progress frame", line, error);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) readFrame(line);
        if (done) break;
      }
      readFrame(buffer);

      if (finalResponse) {
        onPlan(finalResponse.plan);
        setMessages((m) => [...m, { role: "agent", text: finalResponse!.reply }]);
      } else {
        setMessages((m) => [...m, { role: "agent", text: streamError ?? "(no reply)" }]);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("[chat] request failed", error);
      const detail = error instanceof Error ? error.message : "Request failed.";
      setMessages((m) => [...m, { role: "agent", text: detail }]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  return (
    <section className="panel chat">
      <h2>AI Trip Planner · Agent</h2>
      <div className="chat__stream" ref={streamRef} aria-live="polite" aria-busy={busy}>
        {messages.map((m, i) => (
          <div key={i} className={`msg msg--${m.role === "user" ? "user" : "agent"}`}>
            {m.text}
          </div>
        ))}
        {activity.length > 0 && (
          <div className="agent-activity" aria-live="polite">
            <div className="agent-activity__title">Agent activity</div>
            {activity.map((item) => (
              <div className="agent-activity__row" key={item.agent}>
                <span>{AGENT_LABELS[item.agent]}</span>
                <span className={`agent-activity__status agent-activity__status--${item.status}`}>
                  {item.status === "queued"
                    ? "Queued"
                    : item.status === "running"
                      ? `Running${item.round && item.round > 1 ? ` · round ${item.round}` : ""}`
                      : item.status === "completed"
                        ? `Complete${item.round && item.round > 1 ? ` · round ${item.round}` : ""}`
                        : "Needs attention"}
                </span>
                {/* The failure reason was captured and then never shown. */}
                {item.error && <p className="agent-activity__error">{item.error}</p>}
              </div>
            ))}
          </div>
        )}
        {/* TODO(E): render HITL checkpoint cards here (plan.hitl) — hotel picker,
            confirm-brief, escalation. See TripPlan in @trip/shared. */}
        <div className="todo">TODO(E): inline HITL cards (choose hotels, confirm plan…).</div>
      </div>
      <form className="chat__form" onSubmit={send}>
        <input
          className="field"
          ref={inputRef}
          placeholder={busy ? "Planning your trip…" : "Message AI Trip Planner…"}
          aria-label="Message AI Trip Planner"
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? "…" : "Send"}
        </button>
      </form>
      <p className="disclaimer">
        AI-generated results may be inaccurate. Double-check important details.
      </p>
    </section>
  );
}
