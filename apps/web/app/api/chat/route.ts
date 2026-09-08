import { NextResponse } from "next/server";
import { runTripChat } from "@trip/orchestrator";
import { ChatRequest, ChatResponse } from "@trip/shared";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = ChatRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid ChatRequest" }, { status: 400 });
  }

  try {
    return NextResponse.json(ChatResponse.parse(await runTripChat(parsed.data)));
  } catch (error) {
    console.error("[chat] planning failed", error);
    return NextResponse.json(
      { error: "Unable to update this trip. Check the request and try again." },
      { status: 422 },
    );
  }
}
