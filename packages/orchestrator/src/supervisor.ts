import {
  AgentProposal as AgentProposalSchema,
  type Agent,
  type AgentContext,
  type AgentProposal,
  type TripBrief,
} from "@trip/shared";
import { createRoutedChatModel } from "@trip/agents";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createAgent, tool } from "langchain";
import { z } from "zod/v4";

const DelegationRequest = z.object({
  objective: z
    .string()
    .trim()
    .min(1)
    .describe("The bounded planning objective for this specialist."),
});

export interface SupervisorDispatchOptions {
  brief: TripBrief;
  agents: Agent[];
  context: AgentContext;
  model?: BaseChatModel;
}

/**
 * Typed specialist tools are deliberately built around the current run context.
 * The supervisor chooses which tools to call; it cannot alter the validated brief,
 * memory store or tool gateway passed to a specialist.
 */
export function createSupervisorTools(
  options: Omit<SupervisorDispatchOptions, "model">,
  onProposal: (proposal: AgentProposal) => void,
) {
  return options.agents.map((specialist) =>
    tool(
      async ({ objective }) => {
        const proposal = AgentProposalSchema.parse(
          await specialist.run(options.brief, options.context),
        );
        onProposal(proposal);
        return { objective, proposal };
      },
      {
        name: `ask_${specialist.name.replaceAll("-", "_")}_specialist`,
        description: `Delegate a bounded task to the ${specialist.label} specialist. Use this when its domain is needed for the trip plan.`,
        schema: DelegationRequest,
      },
    ),
  );
}

/** Run a genuine LangChain supervisor tool loop and return only called specialists. */
export async function dispatchWithSupervisor(
  options: SupervisorDispatchOptions,
): Promise<AgentProposal[]> {
  const model = options.model ?? createRoutedChatModel("itinerary");
  if (!model) throw new Error("Supervisor requires a configured routed chat model.");

  const proposals = new Map<AgentProposal["agent"], AgentProposal>();
  const tools = createSupervisorTools(options, (proposal) =>
    proposals.set(proposal.agent, proposal),
  );
  const supervisor = createAgent({
    name: "trip_planning_supervisor",
    model,
    tools,
    systemPrompt:
      "You are the trip-planning supervisor. Decide which specialist tools are needed for the user's requested plan, delegate bounded objectives, and do not perform specialist work yourself. For a complete new trip plan, consider day planning, inter-city transport, accommodation, destination guidance and dining. Do not invent or modify trip facts. Stop after the necessary specialist tools have returned; the deterministic LangGraph workflow validates, reconciles and persists their proposals.",
  });

  await supervisor.invoke({
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          task: "Delegate the specialist work required to produce this trip plan.",
          brief: options.brief,
        }),
      },
    ],
  });

  if (proposals.size === 0) {
    throw new Error("Supervisor completed without delegating to a specialist.");
  }
  return options.agents.flatMap((agent) => {
    const proposal = proposals.get(agent.name);
    return proposal ? [proposal] : [];
  });
}
