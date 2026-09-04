// Owner: A — the chat entry point.
// Contract: POST ChatRequest -> ChatResponse (both in @trip/shared).
// TODO(A):
//   1. read short-term memory for this trip (ctx.mem)
//   2. use an LLM to turn `message` into / update a TripBrief
//   3. run the loop, persist, return the fresh plan
import { NextResponse } from "next/server";
import { runOrchestrator, DEMO_BRIEF } from "@trip/orchestrator";
import { ChatRequest, type ChatResponse } from "@trip/shared";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = ChatRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid ChatRequest" }, { status: 400 });
  }

  // TODO(A): parse parsed.data.message into a TripBrief via the LLM + short-term
  // memory. For now every message just re-runs the demo brief.
  const plan = await runOrchestrator({ ...DEMO_BRIEF, tripId: parsed.data.tripId });

  const res: ChatResponse = {
    reply: `Ran the orchestrator (${plan.round} round${plan.round > 1 ? "s" : ""}). Wire real chat parsing in apps/web/app/api/chat/route.ts (A).`,
    plan,
  };
  return NextResponse.json(res);
}
