"use client";

// Owner: E (row shell). The expanded body is a slot each agent owner fills in
// with a real detail view for their section.
import { useState } from "react";
import type { TripSection as TripSectionData } from "@trip/shared";

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  draft: "Draft",
  needs_you: "Needs you",
  confirmed: "Confirmed",
};

export function TripSection({ section }: { section: TripSectionData }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="section">
      <button className="section__row" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong>{section.label}</strong>
          <small>{section.summary}</small>
        </span>
        <span className={`chip chip--${section.status}`}>
          {STATUS_LABEL[section.status] ?? section.status}
        </span>
        <span className="cost">${Math.round(section.estCost).toLocaleString()}</span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="section__body">
          {/* TODO(owner of {section.id}): render the real detail view here —
              flights list, hotel cards, day-by-day, etc. Raw proposal below. */}
          <pre
            style={{
              fontSize: 11,
              whiteSpace: "pre-wrap",
              color: "var(--text-dim)",
              margin: 0,
            }}
          >
            {JSON.stringify(section.proposal ?? {}, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
