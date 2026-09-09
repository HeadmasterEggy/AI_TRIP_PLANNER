import type { TripBrief, AgentProposal, RevisionRequest, AgentName } from "./contracts";
import type { ToolGateway, MemoryStore } from "./ports";

// Context the Orchestrator passes into every agent call. The Orchestrator
// builds `tools` and `mem` once per run and injects them here, so agents never
// import singletons and can be unit-tested with fakes.
export interface AgentContext {
  tripId: string;
  round: number;
  /** external-tool gateway (mock or real — decided once by the Orchestrator) */
  tools: ToolGateway;
  /** short / long-term memory store */
  mem: MemoryStore;
  signal?: AbortSignal;
}

/**
 * The immutable request passed to a specialist for one planning round.
 *
 * A single `invoke` entry point handles both initial planning and targeted
 * revisions. This keeps the orchestration layer independent from the
 * specialist's internal model/tool implementation.
 */
export interface SpecialistRequest {
  readonly brief: TripBrief;
  readonly context: AgentContext;
  readonly revision?: RevisionRequest;
}

/**
 * Framework-neutral specialist contract used by the supervisor and workflow.
 * `supportsRevision` is explicit because not every specialist can revise its
 * own proposal (for example, the destination guide is informational only).
 */
export interface Specialist {
  /** stable id, also used as the section id in the trip plan */
  name: AgentName;
  /** human label for the "Your trip" panel, e.g. "Getting around" */
  label: string;
  /** whether the specialist accepts targeted revision requests */
  supportsRevision?: boolean;
  /** produce or revise one validated proposal */
  invoke(request: SpecialistRequest): Promise<AgentProposal>;
}

/**
 * Legacy adapter shape retained temporarily for downstream callers and tests.
 * New orchestration code should depend on `Specialist` and call `invoke`.
 */
/** @deprecated Use Specialist instead. */
export interface Agent {
  /** stable id, also used as the section id in the trip plan */
  name: AgentName;
  /** human label for the "Your trip" panel, e.g. "Getting around" */
  label: string;
  /** round 1: produce a proposal from the brief */
  run(brief: TripBrief, ctx: AgentContext): Promise<AgentProposal>;
  /** rounds 2..K (optional): revise after a conflict */
  revise?(brief: TripBrief, ctx: AgentContext, req: RevisionRequest): Promise<AgentProposal>;
}
