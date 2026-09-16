import { NextResponse } from "next/server";
import { getDemoPlan } from "@/lib/demoPlan";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      { plan: await getDemoPlan() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "The initial trip could not be loaded. Please retry planning." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
