// Owner: E — the redesigned "Your trip" panel.
// Data comes straight from the aggregated TripPlan (see @trip/orchestrator).
import type { TripPlan } from "@trip/shared";
import { TripSection } from "@/components/TripSection";

export function TripPanel({ plan }: { plan: TripPlan }) {
  const pct = plan.budgetTotal > 0
    ? Math.min(100, Math.round((plan.estTotal / plan.budgetTotal) * 100))
    : 0;
  const delta = plan.budgetTotal - plan.estTotal;
  const overBudget = delta < 0;
  const pendingHitl = plan.hitl.filter((h) => h.status === "pending");

  return (
    <section className="panel panel--right">
      <div className="trip__head">
        <h2 style={{ margin: 0 }}>Your trip</h2>
        <span style={{ fontSize: 12, color: "var(--text-mut)" }}>
          {plan.round > 1 ? `Round ${plan.round} · ` : ""}Timeline · Day plan
        </span>
      </div>
      <p className="trip__sub">
        {plan.brief.destination} · {plan.brief.dates[0]} – {plan.brief.dates[1]} ·{" "}
        {plan.brief.groupSize} people
      </p>

      {/* one budget bar, top only */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
        <span style={{ color: "var(--text-dim)" }}>Budget</span>
        <span>
          <strong>${plan.estTotal.toLocaleString()}</strong>{" "}
          <span style={{ color: "var(--text-mut)" }}>/ ${plan.budgetTotal.toLocaleString()}</span>
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

      {pendingHitl.length > 0 && (
        <div className="banner">
          <span>
            <strong>{pendingHitl[0]!.title}</strong>
            <br />
            {pendingHitl.length === 1
              ? pendingHitl[0]!.detail
              : `${pendingHitl.length} decisions need you`}
          </span>
        </div>
      )}

      <div>
        {plan.sections.map((s) => (
          <TripSection key={s.id} section={s} />
        ))}
      </div>

      {/* TODO(E): make this the current next action (confirm hotels / review day 3 / save). */}
      <button className="trip__cta">Review plan</button>
    </section>
  );
}
