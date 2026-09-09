import { NextResponse } from "next/server";
import { runTripChat } from "@trip/orchestrator";
import { ChatRequest, ChatResponse, type AgentProgressEvent } from "@trip/shared";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = ChatRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid ChatRequest" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (
        event:
          | AgentProgressEvent
          | { type: "complete"; response: ChatResponse }
          | { type: "error"; error: string },
      ) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const response = ChatResponse.parse(await runTripChat(parsed.data, { onProgress: send }));
        send({ type: "complete", response });
      } catch (error) {
        console.error("[chat] planning failed", error);
        send({
          type: "error",
          error: "Unable to update this trip. Check the request and try again.",
        });
      } finally {
        controller.close();
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
