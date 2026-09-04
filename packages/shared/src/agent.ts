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

// Every specialist agent (B / C / D) implements this.
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
