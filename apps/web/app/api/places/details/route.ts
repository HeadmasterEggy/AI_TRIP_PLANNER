import { z } from "zod";
import { placeDetails } from "@/lib/google";
export async function POST(request: Request) {
  try {
    const { placeId } = z
      .object({ placeId: z.string().min(1).max(300) })
      .parse(await request.json());
    return Response.json(
      { place: await placeDetails(placeId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Details failed" },
      { status: 400 },
    );
  }
}
