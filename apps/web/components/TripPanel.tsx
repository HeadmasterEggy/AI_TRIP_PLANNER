// The "Your trip" panel. Data comes straight from the aggregated TripPlan
// (see @trip/orchestrator).
import type { TripPlan } from "@trip/shared";
import { TripSection } from "@/components/TripSection";

export function TripPanel({ plan, onReview }: { plan: TripPlan; onReview?: () => void }) {
  const pct =
    plan.budgetTotal > 0 ? Math.min(100, Math.round((plan.estTotal / plan.budgetTotal) * 100)) : 0;
  const delta = plan.budgetTotal - plan.estTotal;
  const overBudget = delta < 0;
  const pendingHitl = plan.hitl.filter((h) => h.status === "pending");
  const nextDecision = pendingHitl[0];

  return (
    <section className="panel panel--right">
      <div className="trip__head">
        <h2>Your trip</h2>
        <span className="trip__meta">
          {plan.round > 1 ? `Round ${plan.round} · ` : ""}Timeline · Day plan
        </span>
      </div>
      <p className="trip__sub">
        {plan.brief.destination} · {plan.brief.dates[0]} – {plan.brief.dates[1]} ·{" "}
        {plan.brief.groupSize} people
      </p>

      {/* one budget bar, top only */}
      <div className="trip__budget">
        <span className="trip__budget-label">Budget</span>
        <span>
          <strong>${plan.estTotal.toLocaleString()}</strong>{" "}
          <span className="trip__budget-total">/ ${plan.budgetTotal.toLocaleString()}</span>
        </span>
      </div>
      <div className={`bar${overBudget ? " bar--over" : ""}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className={`trip__budget-delta${overBudget ? " trip__budget-delta--over" : ""}`}>
        {overBudget
          ? `$${(-delta).toLocaleString()} over budget`
          : `$${delta.toLocaleString()} under budget`}
      </p>

      {nextDecision && (
        <div className="banner">
          <span>
            <strong>{nextDecision.title}</strong>
            <br />
            {pendingHitl.length === 1
              ? nextDecision.detail
              : `${pendingHitl.length} decisions need you`}
          </span>
        </div>
      )}

      <div>
        {plan.sections.map((s) => (
          <TripSection key={s.id} section={s} />
        ))}
      </div>

      {/* TODO(E): once HITL decisions are executable, this should approve the
          pending checkpoint directly. Until then the plan is only changed
          through chat, so hand off to the composer rather than sit inert. */}
      <button className="trip__cta" onClick={onReview}>
        {nextDecision ? nextDecision.title : "Review plan"}
      </button>
    </section>
  );
}
