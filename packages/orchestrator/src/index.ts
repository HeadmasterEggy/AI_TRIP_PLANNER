// @trip/orchestrator — the OrchestratorAgent.
// Owner: A. Skeleton of the negotiation loop from the design doc. The stub runs
// end to end (chat -> proposals -> conflict check -> K rounds -> aggregate) so
// the rest of the team can build against a real TripPlan shape today.
// Slots to fill are marked TODO(A).

import type {
  AgentContext,
  AgentProposal,
  HitlCheckpoint,
  RevisionRequest,
  TripBrief,
  TripPlan,
  TripSection,
} from "@trip/shared";
import { allAgents } from "@trip/agents";
import { createToolGateway } from "@trip/tools";
import { memory } from "@trip/services";
import {
  assessBudget,
  costOf,
  rollUpCost,
  NEGOTIATION_OVERRUN_PCT,
  ESCALATION_OVERRUN_PCT,
} from "./budget";

export { DEMO_BRIEF } from "./demo";
export { rollUpCost } from "./budget";

const MAX_ROUNDS = 3; // K

const AGENT_BY_NAME = new Map(allAgents.map((a) => [a.name, a]));

export async function runOrchestrator(brief: TripBrief): Promise<TripPlan> {
  // One shared tool gateway + memory store for the whole run, injected into
  // every agent via ctx (agents never import these singletons themselves).
  const tools = createToolGateway();
  const ctx = (round: number): AgentContext => ({
    tripId: brief.tripId,
    round,
    tools,
    mem: memory,
  });

  // --- Round 1: dispatch the brief to every agent in parallel ---------------
  let round = 1;
  let proposals = await Promise.all(allAgents.map((a) => a.run(brief, ctx(round))));

  // --- Rounds 2..K: revise on conflict -------------------------------------
  let conflicts = detectConflicts(proposals, brief);
  while (conflicts.length > 0 && round < MAX_ROUNDS) {
    round += 1;
    proposals = await applyRevisions(brief, ctx(round), proposals, conflicts);
    conflicts = detectConflicts(proposals, brief);
  }

  // --- Aggregate ----------------------------------------------------------
  const unresolved = conflicts.length > 0;
  const sections = proposals.map((p) => toSection(p, conflicts));
  const { estTotal, overrunPct } = rollUpCost(sections, brief.budgetTotal);
  const hitl = buildHitl(brief, overrunPct, unresolved);

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
// Conflict detection.
// Implemented: budget overrun -> ask the two priciest agents to cut.
// TODO(A): add time + geo conflicts — call the TransportAgent helper (B) for
//          overlapping / too-far-apart same-day items and return one
//          RevisionRequest per affected agent.
// ---------------------------------------------------------------------------
export function detectConflicts(proposals: AgentProposal[], brief: TripBrief): RevisionRequest[] {
  const { overrunPct } = assessBudget(proposals.map(costOf), brief.budgetTotal);
  if (overrunPct <= NEGOTIATION_OVERRUN_PCT) return [];

  return [...proposals]
    .filter((p) => costOf(p) > 0)
    .sort((a, b) => costOf(b) - costOf(a))
    .slice(0, 2)
    .map((p) => ({
      tripId: brief.tripId,
      targetAgent: p.agent,
      reason: `plan is ${overrunPct.toFixed(2)}% over budget`,
      constraints: [`cut ${p.agent} cost by ~30%`],
    }));
}

// Send each RevisionRequest to its target agent's revise() and swap the proposal in.
async function applyRevisions(
  brief: TripBrief,
  ctx: AgentContext,
  proposals: AgentProposal[],
  requests: RevisionRequest[],
): Promise<AgentProposal[]> {
  const byName = new Map(proposals.map((p) => [p.agent, p]));
  for (const req of requests) {
    const agent = AGENT_BY_NAME.get(req.targetAgent);
    if (!agent?.revise) continue;
    byName.set(req.targetAgent, await agent.revise(brief, ctx, req));
  }
  return [...byName.values()];
}

function toSection(p: AgentProposal, unresolved: RevisionRequest[]): TripSection {
  const stillConflicting = unresolved.some((r) => r.targetAgent === p.agent);
  return {
    id: p.agent,
    label: AGENT_BY_NAME.get(p.agent)?.label ?? p.agent,
    summary: p.summary,
    // TODO(A/E): promote to "confirmed" once the user accepts a section.
    status: stillConflicting ? "needs_you" : "draft",
    estCost: costOf(p),
    proposal: p,
  };
}

// TODO(A): richer HITL — per-section confirm, hotel-picker payload, resume tokens.
function buildHitl(brief: TripBrief, overrunPct: number, unresolved: boolean): HitlCheckpoint[] {
  const items: HitlCheckpoint[] = [
    {
      id: "confirm-brief",
      type: "confirm_brief",
      title: "Confirm your trip basics",
      detail: `${brief.destination} · ${brief.dates[0]} to ${brief.dates[1]} · ${brief.groupSize} people · $${brief.budgetTotal}`,
      status: "pending",
    },
  ];
  if (overrunPct > ESCALATION_OVERRUN_PCT || unresolved) {
    items.push({
      id: "escalation",
      type: "escalation",
      title: "Needs a human decision",
      detail: unresolved
        ? `Agents did not converge within ${MAX_ROUNDS} rounds.`
        : `Plan is ${overrunPct.toFixed(2)}% over budget.`,
      status: "pending",
    });
  }
  return items;
}
