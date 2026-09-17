"use client";
import type { HitlRequest, TripPlan } from "@trip/shared";
import { money } from "@/lib/workspace";
export type Decision = Pick<HitlRequest, "checkpointId" | "action" | "candidateId">;
export function CheckpointCards({
  plan,
  busy,
  onDecision,
  onEdit,
}: {
  plan: TripPlan;
  busy: boolean;
  onDecision: (decision: Decision) => void;
  onEdit: () => void;
}) {
  return (
    <div className="checkpoints">
      {plan.hitl.map((checkpoint) => {
        const stay = plan.sections
          .find((s) => s.id === checkpoint.sectionId)
          ?.proposal?.stays?.find((s) => s.id === checkpoint.stayId);
        const blocked =
          checkpoint.type === "confirm_plan" &&
          plan.hitl.some((c) => c.id !== checkpoint.id && c.status !== "approved");
        return (
          <article className="checkpoint" key={checkpoint.id}>
            <div className="checkpoint__head">
              <strong>{checkpoint.title}</strong>
              <span
                className={`chip chip--${checkpoint.status === "approved" ? "confirmed" : "needs_you"}`}
              >
                {checkpoint.status === "deferred" ? "Deferred · still pending" : checkpoint.status}
              </span>
            </div>
            <p>{checkpoint.detail}</p>
            {stay && (
              <div
                className="stay-options"
                role="group"
                aria-label={`Hotel choices in ${stay.city}`}
              >
                {stay.candidates.map((choice) => (
                  <button
                    disabled={busy}
                    className={`stay-option${stay.selectedId === choice.id ? " stay-option--selected" : ""}`}
                    key={choice.id}
                    aria-pressed={stay.selectedId === choice.id}
                    onClick={() =>
                      onDecision({
                        checkpointId: checkpoint.id,
                        action: "select_stay",
                        candidateId: choice.id,
                      })
                    }
                  >
                    <strong>{choice.name}</strong>
                    <span>
                      {choice.area} · {choice.rating}/10 ·{" "}
                      {choice.freeCancellation ? "Free cancellation" : "No free cancellation"}
                    </span>
                    <span>
                      {money(choice.pricePerNightUsd * stay.rooms * stay.nights)} total ·{" "}
                      {stay.rooms} room(s) × {stay.nights} nights
                    </span>
                    <small>
                      {stay.selectedId === choice.id
                        ? checkpoint.status === "approved"
                          ? "Selected and confirmed"
                          : "Suggested · click to confirm"
                        : "Choose this stay"}
                    </small>
                  </button>
                ))}
                <small className="muted">
                  Simulated booking data. No reservation will be made.
                </small>
              </div>
            )}
            {checkpoint.status !== "approved" && (
              <div className="actions">
                {checkpoint.type !== "select_stay" && (
                  <button
                    disabled={busy || blocked}
                    onClick={() => onDecision({ checkpointId: checkpoint.id, action: "approve" })}
                  >
                    {checkpoint.type === "escalation" ? "Accept these conflicts" : "Confirm"}
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() => onDecision({ checkpointId: checkpoint.id, action: "reject" })}
                >
                  Return to edit
                </button>
                <button
                  disabled={busy || checkpoint.status === "deferred"}
                  onClick={() => onDecision({ checkpointId: checkpoint.id, action: "defer" })}
                >
                  Decide later
                </button>
              </div>
            )}
            {checkpoint.status === "rejected" && (
              <button disabled={busy} onClick={onEdit}>
                Edit trip preferences
              </button>
            )}
            {blocked && <small className="muted">Resolve the other decisions first.</small>}
          </article>
        );
      })}
    </div>
  );
}
