// @trip/orchestrator — the OrchestratorAgent.
// Owner: A. This file is the skeleton of the negotiation loop from the design doc.
// Everything marked TODO(A) is a slot to fill; the stub already runs end to end
// so the rest of the team can build against a real TripPlan shape today.

import type {
  AgentProposal,
  HitlCheckpoint,
  RevisionRequest,
  TripBrief,
  TripPlan,
  TripSection,
} from "@trip/shared";
import { allAgents } from "@trip/agents";

export { DEMO_BRIEF } from "./demo";

const MAX_ROUNDS = 3; // K
const SECTION_LABELS: Record<string, string> = {
  itinerary: "Day plan",
  transport: "Getting around",
  accommodation: "Stay",
  "destination-guide": "Destination guide",
  dining: "Things to do",
};

export async function runOrchestrator(brief: TripBrief): Promise<TripPlan> {
  // --- Round 1: dispatch the brief to every agent in parallel -----------------
  let round = 1;
  let proposals = await Promise.all(
    allAgents.map((a) => a.run(brief, { tripId: brief.tripId, round })),
  );

  // --- Rounds 2..K: revise on conflict --------------------------------------
  let conflicts = detectConflicts(proposals, brief);
  while (conflicts.length > 0 && round < MAX_ROUNDS) {
    round += 1;
    proposals = await applyRevisions(brief, round, proposals, conflicts);
    conflicts = detectConflicts(proposals, brief);
  }

  // --- Aggregate ----------------------------------------------------------
  const sections = proposals.map((p) => toSection(p));
  const { estTotal, overrunPct } = rollUpCost(sections, brief.budgetTotal);
  const hitl = buildHitl(brief, sections, overrunPct, conflicts.length > 0);

  return {
    tripId: brief.tripId,
    brief,
    round,
    budgetTotal: brief.budgetTotal,
    estTotal,
    overrunPct,
    sections,
    hitl,
  };
}

// ---------------------------------------------------------------------------
// TODO(A): real conflict detection. Should catch:
//   - budget: sum(estCost) over brief.budgetTotal
//   - time:   overlapping / impossible day assignments (ask TransportAgent helper)
//   - geo:    two same-day items too far apart (ask TransportAgent helper)
// Return one RevisionRequest per affected agent.
// ---------------------------------------------------------------------------
export function detectConflicts(_proposals: AgentProposal[], _brief: TripBrief): RevisionRequest[] {
  return [];
}

// TODO(A): send each RevisionRequest to its target agent's revise() and swap the proposal in.
async function applyRevisions(
  brief: TripBrief,
  round: number,
  proposals: AgentProposal[],
  requests: RevisionRequest[],
): Promise<AgentProposal[]> {
  const byName = new Map(proposals.map((p) => [p.agent, p]));
  for (const req of requests) {
    const agent = allAgents.find((a) => a.name === req.targetAgent);
    if (!agent?.revise) continue;
    const revised = await agent.revise(brief, { tripId: brief.tripId, round }, req);
    byName.set(req.targetAgent, revised);
  }
  return [...byName.values()];
}

function toSection(p: AgentProposal): TripSection {
  const estCost = p.items.reduce((sum, item) => sum + (item.estCost ?? 0), 0);
  return {
    id: p.agent,
    label: SECTION_LABELS[p.agent] ?? p.agent,
    summary: p.summary,
    status: "draft", // TODO(A): promote to needs_you / confirmed as the loop progresses
    estCost,
    proposal: p,
  };
}

// The one bit of real logic: add up the sections and compare to the budget.
// TODO(A): decide the escalation threshold X% and wire it into buildHitl().
export function rollUpCost(
  sections: TripSection[],
  budgetTotal: number,
): { estTotal: number; overrunPct: number } {
  const estTotal = Math.round(sections.reduce((sum, s) => sum + s.estCost, 0));
  const overrunPct = budgetTotal > 0 ? Math.round(((estTotal - budgetTotal) / budgetTotal) * 100) : 0;
  return { estTotal, overrunPct };
}

// TODO(A): build the real HITL checkpoints. For now: one "confirm the brief" item,
// plus an escalation stub if the plan is badly over budget.
function buildHitl(
  brief: TripBrief,
  _sections: TripSection[],
  overrunPct: number,
  hasUnresolvedConflict: boolean,
): HitlCheckpoint[] {
  const items: HitlCheckpoint[] = [
    {
      id: "confirm-brief",
      type: "confirm_brief",
      title: "Confirm your trip basics",
      detail: `${brief.destination} · ${brief.dates[0]} to ${brief.dates[1]} · ${brief.groupSize} people · $${brief.budgetTotal}`,
      status: "pending",
    },
  ];
  if (overrunPct > 10 || hasUnresolvedConflict) {
    items.push({
      id: "escalation",
      type: "escalation",
      title: "Needs a human decision",
      detail: hasUnresolvedConflict
        ? "Agents did not converge within K rounds."
        : `Plan is ${overrunPct}% over budget.`,
      status: "pending",
    });
  }
  return items;
}
