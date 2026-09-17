import { z } from "zod";
import { searchPlaces } from "@/lib/google";
export async function POST(request: Request) {
  try {
    const { text, destination } = z
      .object({
        text: z.string().trim().min(1).max(200),
        destination: z.string().trim().min(1).max(200),
      })
      .parse(await request.json());
    return Response.json(
      { places: await searchPlaces(text, destination) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 400 },
    );
  }
}
