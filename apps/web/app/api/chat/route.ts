// Owner: A — the chat entry point.
// TODO(A):
//   1. read short-term memory for this trip (@trip/services `memory`)
//   2. use the OrchestratorAgent + LLM to turn `message` into / update a TripBrief
//   3. run the negotiation loop, persist, and return { reply, plan }
import { NextResponse } from "next/server";
import { runOrchestrator, DEMO_BRIEF } from "@trip/orchestrator";
import { TripBrief } from "@trip/shared";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);

  // For now: accept an optional partial brief, otherwise use the demo one.
  const parsed = TripBrief.partial().safeParse(body.brief ?? {});
  const brief: TripBrief = { ...DEMO_BRIEF, ...(parsed.success ? parsed.data : {}) };

  const plan = await runOrchestrator(brief);

  return NextResponse.json({
    reply:
      "Stub orchestrator ran end to end. Wire real chat parsing in apps/web/app/api/chat/route.ts (A).",
    plan,
  });
}
