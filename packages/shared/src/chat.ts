import { z } from "zod";
import { AGENT_NAMES, TripBrief } from "./contracts";
import { TripPlan } from "./plan";

// The contract between the web client and POST /api/chat.
// Progress is streamed as NDJSON; the final frame contains one ChatResponse.
// Optional request modes preserve existing chat clients.

// Client -> server
export const ChatRequest = z.object({
  tripId: z.string(),
  message: z.string().min(1),
  // Optional for backward compatibility. The browser sends the latest brief so
  // serverless requests can apply incremental edits without sticky process state.
  brief: TripBrief.optional(),
  // "start" begins a blank conversation: the brief is extracted only from the
  // message, and missing required fields are reported instead of defaulted.
  mode: z.enum(["chat", "plan", "start"]).optional(),
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
    type: z.literal("coordinator"),
    phase: z.enum(["dispatch", "conflicts", "revision", "assembly"]),
    round: z.number().int().positive(),
    summary: z.string(),
    constraints: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("agent_started"),
    summary: z.string().optional(),
    constraints: z.array(z.string()).optional(),
    agent: z.enum(AGENT_NAMES),
    round: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("agent_completed"),
    summary: z.string().optional(),
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
