"use client";
import type { HitlRequest, TripPlan } from "@trip/shared";
import { money } from "@/lib/workspace";
import { SourceBadge } from "./SourceBadge";
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
      {/* An approved checkpoint is a decision the traveller already made; leaving its card up
          reads as still needing them. `select_stay` is the exception: picking a hotel approves it
          immediately, and this is the only place a hotel can be changed, so its card stays as a
          live chooser. `blocked` below still reads the full `plan.hitl`, so hiding a card never
          loosens the confirm-plan prerequisite. */}
      {plan.hitl
        .filter(
          (checkpoint) => checkpoint.status !== "approved" || checkpoint.type === "select_stay",
        )
        .map((checkpoint) => {
          const stay = plan.sections
            .find((s) => s.id === checkpoint.sectionId)
            ?.proposal?.stays?.find((s) => s.id === checkpoint.stayId);
          const source = plan.sections.find((s) => s.id === checkpoint.sectionId)?.proposal?.source;
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
                  {checkpoint.status === "deferred"
                    ? "Deferred · still pending"
                    : checkpoint.status}
                </span>
              </div>
              <p>{checkpoint.detail}</p>
              {stay && (
                <div
                  className="stay-options"
                  role="group"
                  aria-label={`Hotel choices in ${stay.city}`}
                >
                  <div className="checkpoint__source">
                    <SourceBadge source={source} compact />
                    <span>
                      {source?.kind === "live"
                        ? "Live rate; availability can change before booking."
                        : source?.kind === "estimated"
                          ? "Estimated price; verify the property before booking."
                          : "No reservation is made from this workspace."}
                    </span>
                  </div>
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
                        {money(choice.pricePerNight * stay.rooms * stay.nights)} total ·{" "}
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
                  <small className="muted">No reservation will be made from this workspace.</small>
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
