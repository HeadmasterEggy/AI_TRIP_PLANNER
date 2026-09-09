import { z } from "zod";
import { AGENT_NAMES, TripBrief } from "./contracts";
import { TripPlan } from "./plan";

// The contract between the web client and POST /api/chat.
// Owner: A. Frozen shape — streaming can be added later without changing it
// (the final frame of a stream is still one ChatResponse).

// Client -> server
export const ChatRequest = z.object({
  tripId: z.string(),
  message: z.string().min(1),
  // Optional for backward compatibility. The browser sends the latest brief so
  // serverless requests can apply incremental edits without sticky process state.
  brief: TripBrief.optional(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

// Server -> client
export const ChatResponse = z.object({
  reply: z.string(), // assistant text for the chat stream
  plan: TripPlan, // the fresh aggregated plan for the right-hand panel
});
export type ChatResponse = z.infer<typeof ChatResponse>;

// Progress frames emitted while the orchestrator delegates work. The final
// ChatResponse remains unchanged; clients can render these frames as optional
// activity without coupling to LangGraph internals.
export const AgentProgressEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("agent_started"),
    agent: z.enum(AGENT_NAMES),
    round: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("agent_completed"),
    agent: z.enum(AGENT_NAMES),
    round: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("agent_failed"),
    agent: z.enum(AGENT_NAMES),
    round: z.number().int().positive(),
    error: z.string(),
  }),
]);
export type AgentProgressEvent = z.infer<typeof AgentProgressEvent>;
