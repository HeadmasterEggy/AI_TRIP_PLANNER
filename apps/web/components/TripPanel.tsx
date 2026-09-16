import type { TripPlan } from "@trip/shared";
import { TripSection } from "./TripSection";
import { CheckpointCards, type Decision } from "./CheckpointCards";
import { money } from "@/lib/workspace";
export function TripPanel({
  plan,
  busy,
  onReview,
  onDecision,
  onEdit,
  onSave,
}: {
  plan: TripPlan;
  busy: boolean;
  onReview: () => void;
  onDecision: (decision: Decision) => void;
  onEdit: () => void;
  onSave: () => void;
}) {
  const pct =
    plan.budgetTotal > 0 ? Math.min(100, Math.round((plan.estTotal / plan.budgetTotal) * 100)) : 0;
  const delta = plan.budgetTotal - plan.estTotal;
  const pending = plan.hitl.filter((c) => c.status !== "approved");
  return (
    <section className="panel panel--right" aria-labelledby="trip-title">
      <div className="trip__head">
        <h2 id="trip-title">Your trip</h2>
        <span className="trip__meta">
          {pending.length
            ? `${pending.length} decisions to review`
            : plan.sections.length
              ? plan.hitl.length
                ? "Plan confirmed"
                : "Ready to review"
              : "No plan yet"}
        </span>
      </div>
      <p className="trip__sub">
        {plan.brief.destination} · {plan.brief.dates.join(" – ")} · {plan.brief.groupSize} people
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
      {plan.sections.length ? (
        plan.sections.map((section) => (
          <TripSection key={section.id} section={section} onEdit={onEdit} onReview={onReview} />
        ))
      ) : (
        <p className="section__empty">
          No itinerary yet. Fill in your preferences and select Update trip.
        </p>
      )}
      <div className="actions">
        <button className="primary" disabled={!plan.sections.length} onClick={onReview}>
          Review plan
        </button>
        <button disabled={busy || !plan.sections.length} onClick={onSave}>
          Save trip
        </button>
      </div>
      <CheckpointCards plan={plan} busy={busy} onDecision={onDecision} onEdit={onEdit} />
    </section>
  );
}
