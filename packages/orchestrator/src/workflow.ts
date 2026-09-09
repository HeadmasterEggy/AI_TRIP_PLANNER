import {
  END,
  START,
  StateGraph,
  StateSchema,
  type ConditionalEdgeRouter,
  type GraphNode,
} from "@langchain/langgraph";
import { allSpecialists } from "@trip/agents";
import { memory } from "@trip/services";
import {
  AgentProposal as AgentProposalSchema,
  TripBrief as TripBriefSchema,
  TripPlan as TripPlanSchema,
  type Agent,
  type AgentContext,
  type AgentProposal,
  type AgentName,
  type HitlCheckpoint,
  type MemoryStore,
  type RevisionRequest,
  type Specialist,
  type ToolGateway,
  type TripBrief,
  type TripPlan,
  type TripSection,
} from "@trip/shared";
import { createToolGateway } from "@trip/tools";
import { z } from "zod/v4";
import {
  assessBudget,
  costOf,
  rollUpCost,
  ESCALATION_OVERRUN_PCT,
  NEGOTIATION_OVERRUN_PCT,
} from "./budget";
import { dispatchWithSupervisor, reviseWithSupervisor } from "./supervisor";

const DEFAULT_MAX_ROUNDS = 3;

/** Dependencies are injectable so the graph can be tested without network or singleton state. */
export interface OrchestratorOptions {
  /** New framework-neutral specialist implementations. */
  specialists?: Specialist[];
  /** @deprecated Use `specialists`; retained for downstream compatibility. */
  agents?: Agent[];
  tools?: ToolGateway;
  mem?: MemoryStore;
  maxRounds?: number;
}

/** Adapt the old split run/revise API at the boundary only. */
function adaptLegacyAgent(agent: Agent): Specialist {
  return {
    name: agent.name,
    label: agent.label,
    supportsRevision: Boolean(agent.revise),
    invoke({ brief, context, revision }) {
      if (revision) {
        if (!agent.revise) {
          throw new Error(`${agent.name} does not support targeted revisions.`);
        }
        return agent.revise(brief, context, revision);
      }
      return agent.run(brief, context);
    },
  };
}

const OrchestratorState = new StateSchema({
  // The shared package still exposes Zod v3 contracts. LangGraph's recommended
  // StateSchema uses Zod v4 fields, so public values are parsed at graph boundaries
  // and represented as typed custom fields while the migration remains local.
  brief: z.custom<TripBrief>(),
  round: z.number().int().nonnegative().default(0),
  proposals: z.array(z.custom<AgentProposal>()).default(() => []),
  conflicts: z.array(z.custom<RevisionRequest>()).default(() => []),
  plan: z.custom<TripPlan>().optional(),
});

type WorkflowNode = GraphNode<typeof OrchestratorState>;

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

function toSection(
  proposal: AgentProposal,
  unresolved: RevisionRequest[],
  specialistByName: Map<Specialist["name"], Specialist>,
): TripSection {
  const stillConflicting = unresolved.some((request) => request.targetAgent === proposal.agent);
  return {
    id: proposal.agent,
    label: specialistByName.get(proposal.agent)?.label ?? proposal.agent,
    summary: proposal.summary,
    status: stillConflicting ? "needs_you" : "draft",
    estCost: costOf(proposal),
    proposal,
  };
}

function buildHitl(
  brief: TripBrief,
  overrunPct: number,
  unresolved: boolean,
  maxRounds: number,
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

  if (overrunPct > ESCALATION_OVERRUN_PCT || unresolved) {
    items.push({
      id: "escalation",
      type: "escalation",
      title: "Needs a human decision",
      detail: unresolved
        ? `Agents did not converge within ${maxRounds} rounds.`
        : `Plan is ${overrunPct.toFixed(2)}% over budget.`,
      status: "pending",
    });
  }
  return items;
}

function resolveOptions(options: OrchestratorOptions) {
  const injected = options.specialists !== undefined || options.agents !== undefined;
  const specialists =
    options.specialists ?? options.agents?.map(adaptLegacyAgent) ?? allSpecialists;
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
  if (!Number.isSafeInteger(maxRounds) || maxRounds < 1) {
    throw new Error("Orchestrator maxRounds must be a positive integer.");
  }
  if (specialists.length === 0) throw new Error("Orchestrator requires at least one specialist.");

  const specialistByName = new Map(
    specialists.map((specialist) => [specialist.name, specialist]),
  );
  if (specialistByName.size !== specialists.length) {
    throw new Error("Orchestrator specialist names must be unique.");
  }

  return {
    specialists,
    specialistByName,
    injected,
    maxRounds,
    tools: options.tools ?? createToolGateway(),
    mem: options.mem ?? memory,
  };
}

/**
 * Build a fresh compiled graph for one dependency set.
 *
 * START -> dispatch_specialists -> detect_conflicts
 *                                      | (conditional)
 *                         revise_conflicts <-> detect_conflicts
 *                                      |
 *                                 build_plan -> END
 */
export function createOrchestratorGraph(options: OrchestratorOptions = {}) {
  const { specialists, specialistByName, injected, maxRounds, tools, mem } =
    resolveOptions(options);

  const context = (brief: TripBrief, round: number): AgentContext => ({
    tripId: brief.tripId,
    round,
    tools,
    mem,
  });

  const dispatchSpecialists: WorkflowNode = async (state) => {
    const round = 1;
    const agentContext = context(state.brief, round);
    let proposals: AgentProposal[];
    // Explicit specialist injection is the deterministic seam used by tests.
    // Production uses the supervisor to select named specialist tools.
    if (injected) {
      proposals = await Promise.all(
        specialists.map((specialist) =>
          specialist.invoke({ brief: state.brief, context: agentContext }),
        ),
      );
    } else {
      try {
        proposals = await dispatchWithSupervisor({
          brief: state.brief,
          specialists,
          context: agentContext,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "unknown supervisor error";
        console.warn(
          `[supervisor] Delegation unavailable; using deterministic dispatch: ${reason}`,
        );
        proposals = await Promise.all(
          specialists.map((specialist) =>
            specialist.invoke({ brief: state.brief, context: agentContext }),
          ),
        );
      }
    }
    return { round, proposals: proposals.map((proposal) => AgentProposalSchema.parse(proposal)) };
  };

  const detectProposalConflicts: WorkflowNode = (state) => ({
    conflicts: detectConflicts(state.proposals, state.brief),
  });

  const reviseConflicts: WorkflowNode = async (state) => {
    const round = state.round + 1;
    const requestByAgent = new Map(
      state.conflicts.map((request) => [request.targetAgent, request]),
    );
    const deterministicRevision = () =>
      Promise.all(
        state.proposals.map(async (proposal) => {
          const request = requestByAgent.get(proposal.agent);
          const specialist = specialistByName.get(proposal.agent);
          if (!request || !specialist?.supportsRevision) return proposal;
          const revised = await specialist.invoke({
            brief: state.brief,
            context: context(state.brief, round),
            revision: request,
          });
          return AgentProposalSchema.parse(revised);
        }),
      );
    let proposals: AgentProposal[];
    if (injected) {
      proposals = await deterministicRevision();
    } else {
      try {
        proposals = await reviseWithSupervisor({
          brief: state.brief,
          specialists,
          context: context(state.brief, round),
          proposals: state.proposals,
          requests: state.conflicts,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "unknown revision supervisor error";
        console.warn(
          `[supervisor] Revision delegation unavailable; using deterministic routing: ${reason}`,
        );
        proposals = await deterministicRevision();
      }
    }
    return { round, proposals };
  };

  const buildPlan: WorkflowNode = (state) => {
    const unresolved = state.conflicts.length > 0;
    const sections = state.proposals.map((proposal) =>
      toSection(proposal, state.conflicts, specialistByName),
    );
    const { estTotal, overrunPct } = rollUpCost(sections, state.brief.budgetTotal);
    const plan: TripPlan = {
      tripId: state.brief.tripId,
      brief: state.brief,
      round: state.round,
      budgetTotal: state.brief.budgetTotal,
      estTotal,
      overrunPct,
      sections,
      hitl: buildHitl(state.brief, overrunPct, unresolved, maxRounds),
    };
    return { plan: TripPlanSchema.parse(plan) };
  };

  const routeAfterDetection: ConditionalEdgeRouter<
    typeof OrchestratorState,
    Record<string, unknown>,
    "revise_conflicts" | "build_plan"
  > = (state) =>
    state.conflicts.length > 0 && state.round < maxRounds ? "revise_conflicts" : "build_plan";

  return new StateGraph(OrchestratorState)
    .addNode("dispatch_specialists", dispatchSpecialists)
    .addNode("detect_conflicts", detectProposalConflicts)
    .addNode("revise_conflicts", reviseConflicts)
    .addNode("build_plan", buildPlan)
    .addEdge(START, "dispatch_specialists")
    .addEdge("dispatch_specialists", "detect_conflicts")
    .addConditionalEdges("detect_conflicts", routeAfterDetection, [
      "revise_conflicts",
      "build_plan",
    ])
    .addEdge("revise_conflicts", "detect_conflicts")
    .addEdge("build_plan", END)
    .compile();
}

export async function runOrchestrator(
  brief: TripBrief,
  options: OrchestratorOptions = {},
): Promise<TripPlan> {
  const result = await createOrchestratorGraph(options).invoke({
    brief: TripBriefSchema.parse(brief),
  });
  if (!result.plan) throw new Error("Orchestrator graph finished without a trip plan.");
  return TripPlanSchema.parse(result.plan);
}
