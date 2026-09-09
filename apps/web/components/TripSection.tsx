"use client";

// Each row represents one specialist agent. The row stays compact, while its
// expanded body exposes that agent's structured proposal in a readable form.
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
  const bodyId = `section-details-${section.id}`;

  return (
    <div className={`section${open ? " section--open" : ""}`}>
      <button
        className="section__row"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <span className="section__label">
          <strong>{section.label}</strong>
          <small>{section.summary}</small>
        </span>
        <span className={`chip chip--${section.status}`}>
          {STATUS_LABEL[section.status] ?? section.status}
        </span>
        <span className="cost">${Math.round(section.estCost).toLocaleString()}</span>
        <span className="section__chevron" aria-hidden>
          ▸
        </span>
      </button>

      {open && (
        <div className="section__body" id={bodyId}>
          {section.proposal ? (
            <>
              <div className="proposal-items">
                {section.proposal.items.length ? (
                  [...section.proposal.items]
                    .sort(
                      (left, right) =>
                        (left.day ?? 999) - (right.day ?? 999) ||
                        (left.startTime ?? "").localeCompare(right.startTime ?? ""),
                    )
                    .map((item, index) => (
                      <article
                        className="proposal-item"
                        key={`${item.kind}-${item.day ?? "any"}-${index}`}
                      >
                        <div className="proposal-item__meta">
                          <span className="proposal-item__kind">
                            {item.kind.replaceAll("-", " ")}
                          </span>
                          {item.day !== undefined && <span>Day {item.day}</span>}
                          {item.startTime && item.endTime && (
                            <span>
                              {item.startTime}–{item.endTime}
                            </span>
                          )}
                          {item.estCost !== undefined && (
                            <strong>${item.estCost.toLocaleString()}</strong>
                          )}
                        </div>
                        {item.location && <h4>{item.location}</h4>}
                        <p>{item.detail}</p>
                      </article>
                    ))
                ) : (
                  <p className="section__empty">No detailed items were returned.</p>
                )}
              </div>
              {section.proposal.assumptions.length > 0 && (
                <details className="assumptions">
                  <summary>Important notes ({section.proposal.assumptions.length})</summary>
                  <ul>
                    {section.proposal.assumptions.map((assumption, index) => (
                      <li key={index}>{assumption}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <p className="section__empty">Details are still being prepared.</p>
          )}
        </div>
      )}
    </div>
  );
}
