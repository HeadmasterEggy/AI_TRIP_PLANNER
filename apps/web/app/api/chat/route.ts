import { NextResponse } from "next/server";
import { IncompleteBriefError, runTripChat } from "@trip/orchestrator";
import { ChatRequest, ChatResponse, type AgentProgressEvent } from "@trip/shared";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = ChatRequest.safeParse(body);
  if (!parsed.success || (parsed.data.mode === "plan" && !parsed.data.brief)) {
    return NextResponse.json({ error: "invalid ChatRequest" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() {
      cancelled = true;
    },
    async start(controller) {
      const send = (
        event:
          | AgentProgressEvent
          | { type: "complete"; response: ChatResponse }
          | { type: "error"; error: string },
      ) => {
        if (cancelled) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const response = ChatResponse.parse(await runTripChat(parsed.data, { onProgress: send }));
        send({ type: "complete", response });
      } catch (error) {
        console.error("[chat] planning failed", error);
        send({
          type: "error",
          error:
            error instanceof IncompleteBriefError
              ? error.message
              : error instanceof Error && error.message.startsWith("No valid stays")
                ? "No stays match your accommodation preferences. Lower the minimum rating or change cancellation preferences, then retry."
                : "Unable to update this trip. Check the request and try again.",
        });
      } finally {
        if (!cancelled) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
