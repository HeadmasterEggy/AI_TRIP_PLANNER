import type { TripBrief, AgentProposal, RevisionRequest } from "./contracts";

// Context the Orchestrator passes into every agent call.
// Keep this small on purpose — agents import @trip/tools / @trip/services
// directly for what they need, so this stays decoupled.
export interface AgentContext {
  tripId: string;
  round: number;
  signal?: AbortSignal;
}

// Every specialist agent (B / C / D) implements this.
export interface Agent {
  /** stable id, also used as the section id in the trip plan */
  name: string;
  /** round 1: produce a proposal from the brief */
  run(brief: TripBrief, ctx: AgentContext): Promise<AgentProposal>;
  /** rounds 2..K (optional): revise after a conflict */
  revise?(brief: TripBrief, ctx: AgentContext, req: RevisionRequest): Promise<AgentProposal>;
}
