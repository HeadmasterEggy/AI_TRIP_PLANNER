"use client";

// Each row represents one specialist agent. The row stays compact, while its
// expanded body exposes that agent's structured proposal in a readable form.
import { ProposalDetails } from "./ProposalDetails";
import { money } from "@/lib/workspace";
import { useState } from "react";
import type { TripSection as TripSectionData } from "@trip/shared";

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  draft: "Draft",
  needs_you: "Needs you",
  confirmed: "Confirmed",
};
const SOURCE_KIND_LABEL: Record<string, string> = {
  live: "Live data",
  estimated: "Estimated data",
  mock: "Mock data",
  fallback: "Fallback plan",
  unavailable: "Data unavailable",
};

export function TripSection({
  section,
  onEdit,
  onReview,
}: {
  section: TripSectionData;
  onEdit: () => void;
  onReview: () => void;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = `section-details-${section.id}`;

  return (
    <section className={`section${open ? " section--open" : ""}`}>
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
        <span className="cost">{money(section.estCost)}</span>
        <span className="section__chevron" aria-hidden>
          ▸
        </span>
      </button>

      {open && (
        <div className="section__body" id={bodyId}>
          {section.proposal ? (
            <>
              <p className="source-note">
                <span
                  className={`source-kind source-kind--${section.proposal.source?.kind ?? "unavailable"}`}
                  role="status"
                >
                  {SOURCE_KIND_LABEL[section.proposal.source?.kind ?? "unavailable"] ??
                    "Source status"}
                </span>
                <strong>{section.proposal.source?.label ?? "Source not recorded"}</strong>
                <br />
                {section.proposal.source?.freshness ?? "These estimates are not live verified."}
              </p>
              <ProposalDetails section={section} onReview={onReview} />
              <button onClick={onEdit}>Change trip preferences</button>
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
    </section>
  );
}
