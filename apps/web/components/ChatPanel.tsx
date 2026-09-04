"use client";

// Owner: E (shell) + A (wire to real orchestrator chat parsing).
// Right now: posts the message to /api/chat and appends the stub reply.
import { useState } from "react";

type Msg = { role: "user" | "agent"; text: string };

const SEED: Msg[] = [
  {
    role: "user",
    text: "Plan a 7-day trip to Tokyo and Kyoto for 2 people in mid June. Budget ~$4000.",
  },
  {
    role: "agent",
    text: "Stub assistant. TODO(A): parse this into a TripBrief and run the orchestrator per message.",
  },
];

export function ChatPanel() {
  const [messages, setMessages] = useState<Msg[]>(SEED);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "agent", text: data.reply ?? "(no reply)" }]);
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
      <p className="disclaimer">AI-generated results may be inaccurate. Double-check important details.</p>
    </section>
  );
}
