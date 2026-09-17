import type { ReactNode } from "react";
import type { TripPlan } from "@trip/shared";
import { TripSection } from "./TripSection";
import { CheckpointCards, type Decision } from "./CheckpointCards";
import { money } from "@/lib/workspace";

export type TripTab = "overview" | "timeline";

export function pendingDecisions(plan: TripPlan | undefined) {
  return plan?.hitl.filter((checkpoint) => checkpoint.status !== "approved").length ?? 0;
}

export function tripStatus(plan: TripPlan) {
  const pending = pendingDecisions(plan);
  if (pending) return `${pending} decision${pending === 1 ? "" : "s"} to review`;
  if (!plan.sections.length) return "No plan yet";
  return plan.hitl.length ? "Plan confirmed" : "Ready to review";
}

/** Body of the Your Trip drawer; the drawer supplies the heading and close button. */
export function TripPanel({
  plan,
  busy,
  tab,
  onTab,
  timeline,
  onReview,
  onDecision,
  onEdit,
  onSave,
}: {
  plan: TripPlan;
  busy: boolean;
  tab: TripTab;
  onTab(tab: TripTab): void;
  timeline: ReactNode;
  onReview: () => void;
  onDecision: (decision: Decision) => void;
  onEdit: () => void;
  onSave: () => void;
}) {
  const pct =
    plan.budgetTotal > 0 ? Math.min(100, Math.round((plan.estTotal / plan.budgetTotal) * 100)) : 0;
  const delta = plan.budgetTotal - plan.estTotal;
  const tabs: [TripTab, string][] = [
    ["overview", "Overview"],
    ["timeline", "Timeline & routes"],
  ];
  return (
    <div className="trip-panel">
      <p className="trip__sub">
        {plan.brief.destination} · {plan.brief.dates.join(" – ")} · {plan.brief.groupSize}{" "}
        {plan.brief.groupSize === 1 ? "traveller" : "travellers"}
      </p>
      <div className="trip__budget">
        <span>Estimated total</span>
        <strong>{money(plan.estTotal)}</strong>
      </div>
      <div className={`bar${delta < 0 ? " bar--over" : ""}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className={`trip__budget-delta${delta < 0 ? " trip__budget-delta--over" : ""}`}>
        {money(Math.abs(delta))} {delta < 0 ? "over" : "under"} the {money(plan.budgetTotal)} budget
      </p>
      <div className="trip-tabs" role="tablist" aria-label="Trip views">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            id={`trip-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`trip-tabpanel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => onTab(id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              const next = tabs[(tabs.findIndex(([item]) => item === id) + 1) % tabs.length]![0];
              onTab(next);
              document.getElementById(`trip-tab-${next}`)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="trip-tabpanel"
        role="tabpanel"
        id={`trip-tabpanel-${tab}`}
        aria-labelledby={`trip-tab-${tab}`}
      >
        {tab === "overview" ? (
          <>
            {plan.sections.length ? (
              plan.sections.map((section) => (
                <TripSection
                  key={section.id}
                  section={section}
                  onEdit={onEdit}
                  onReview={onReview}
                />
              ))
            ) : (
              <p className="section__empty">
                No itinerary yet. Fill in your preferences and select Update trip.
              </p>
            )}
            {plan.hitl.length > 0 && (
              <>
                <h3 className="trip-panel__subhead">Stays and confirmations</h3>
                <CheckpointCards plan={plan} busy={busy} onDecision={onDecision} onEdit={onEdit} />
              </>
            )}
          </>
        ) : (
          timeline
        )}
      </div>
      <div className="actions trip-panel__footer">
        <button className="primary" disabled={!plan.sections.length} onClick={onReview}>
          Review plan
        </button>
        <button disabled={busy || !plan.sections.length} onClick={onSave}>
          Save trip
        </button>
      </div>
    </div>
  );
}
