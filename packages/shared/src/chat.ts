import { z } from "zod";
import { TripPlan } from "./plan";

// The contract between the web client and POST /api/chat.
// Owner: A. Frozen shape — streaming can be added later without changing it
// (the final frame of a stream is still one ChatResponse).

// Client -> server
export const ChatRequest = z.object({
  tripId: z.string(),
  message: z.string().min(1),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

// Server -> client
export const ChatResponse = z.object({
  reply: z.string(), // assistant text for the chat stream
  plan: TripPlan, // the fresh aggregated plan for the right-hand panel
});
export type ChatResponse = z.infer<typeof ChatResponse>;
