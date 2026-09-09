"use client";

// Owner: E (shell) + A (wire to real orchestrator chat parsing).
// Posts a ChatRequest to /api/chat and lifts the returned plan up to Workspace.
import { useState } from "react";
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
}: {
  brief: TripBrief;
  onPlan: (plan: TripPlan) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>(SEED);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<AgentActivity[]>([]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    setActivity(AGENT_NAMES.map((agent) => ({ agent, status: "queued" })));
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripId: brief.tripId, message: text, brief }),
      });
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

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) handleFrame(JSON.parse(line) as StreamFrame);
        }
        if (done) break;
      }
      if (buffer.trim()) handleFrame(JSON.parse(buffer) as StreamFrame);

      if (finalResponse) {
        onPlan(finalResponse.plan);
        setMessages((m) => [...m, { role: "agent", text: finalResponse!.reply }]);
      } else {
        setMessages((m) => [...m, { role: "agent", text: streamError ?? "(no reply)" }]);
      }
    } catch {
      setMessages((m) => [...m, { role: "agent", text: "Request failed." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel chat">
      <h2>AI Trip Planner · Agent</h2>
      <div className="chat__stream">
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
          style={{ marginBottom: 0 }}
          placeholder="Message AI Trip Planner…"
          value={input}
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
