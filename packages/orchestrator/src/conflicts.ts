import type { AgentName, AgentProposal, TripBrief, RevisionRequest } from "@trip/shared";
import { assessBudget, costOf, NEGOTIATION_OVERRUN_PCT } from "./budget";

export function detectConflicts(proposals: AgentProposal[], brief: TripBrief): RevisionRequest[] {
  const { overrunPct } = assessBudget(proposals.map(costOf), brief.budgetTotal);
  const pending = new Map<AgentName, { reasons: string[]; constraints: string[] }>();
  const add = (agent: AgentName, reason: string, constraint: string) => {
    const entry = pending.get(agent) ?? { reasons: [], constraints: [] };
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    if (!entry.constraints.includes(constraint)) entry.constraints.push(constraint);
    pending.set(agent, entry);
  };

  if (overrunPct > NEGOTIATION_OVERRUN_PCT) {
    [...proposals]
      .filter((proposal) => costOf(proposal) > 0)
      .sort((left, right) => costOf(right) - costOf(left))
      .slice(0, 2)
      .forEach((proposal) =>
        add(
          proposal.agent,
          `plan is ${overrunPct.toFixed(2)}% over budget`,
          `cut ${proposal.agent} cost by ~30%`,
        ),
      );
  }

  for (const proposal of proposals) {
    for (const reason of proposal.conflictsWith) {
      add(proposal.agent, reason, "make the route geographically feasible");
    }
  }

  const scheduled = proposals.flatMap((proposal) =>
    proposal.items.flatMap((item) =>
      item.day !== undefined && item.startTime && item.endTime
        ? [{ agent: proposal.agent, item }]
        : [],
    ),
  );
  const toMinutes = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    return hour! * 60 + minute!;
  };
  for (let leftIndex = 0; leftIndex < scheduled.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < scheduled.length; rightIndex += 1) {
      const left = scheduled[leftIndex]!;
      const right = scheduled[rightIndex]!;
      if (left.item.day !== right.item.day) continue;
      const overlaps =
        toMinutes(left.item.startTime!) < toMinutes(right.item.endTime!) &&
        toMinutes(right.item.startTime!) < toMinutes(left.item.endTime!);
      if (!overlaps) continue;
      // A deliberate asymmetry: when an activity collides with anything else, only the
      // itinerary is asked to move. A flight or a train leaves when it leaves; a museum
      // visit does not. Keep it -- "fixing" this into a symmetric rule asks both sides to
      // reschedule around each other and can oscillate for every remaining round.
      // `conflicts.test.ts` locks this semantics, now that transport picks its own times.
      const targets =
        left.agent === "itinerary" || right.agent === "itinerary"
          ? (["itinerary"] as const)
          : ([left.agent, right.agent] as const);
      const reason = `time overlap on day ${left.item.day}: ${left.item.startTime}-${left.item.endTime} conflicts with ${right.item.startTime}-${right.item.endTime}`;
      for (const target of new Set<AgentName>(targets)) {
        // A revising agent only sees its own proposal, so name the window it has
        // to work around and who owns it. Without this it is guessing, and the
        // graph burns every remaining round without converging.
        const blocker = target === left.agent ? right : left;
        add(
          target,
          reason,
          `on day ${left.item.day} keep clear of ${blocker.item.startTime}-${blocker.item.endTime}, held by ${blocker.agent}${
            blocker.item.location ? ` (${blocker.item.location})` : ""
          }; reschedule without changing trip dates`,
        );
      }
    }
  }

  return [...pending].map(([targetAgent, value]) => ({
    tripId: brief.tripId,
    targetAgent,
    reason: value.reasons.join("; "),
    constraints: value.constraints,
  }));
}
