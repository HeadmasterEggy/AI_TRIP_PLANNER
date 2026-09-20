import { z } from "zod";
import { GoogleRequestError, searchPlaces } from "@/lib/integrations/google";

const SearchRequest = z.object({
  text: z.string().trim().min(1).max(200),
  destination: z.string().trim().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  const parsed = SearchRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Enter a place name to search." }, { status: 400 });
  try {
    return Response.json(
      { places: await searchPlaces(parsed.data.text, parsed.data.destination) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Upstream failures are retryable; keep provider details and the query out of the message.
    const status = error instanceof GoogleRequestError && error.status === 429 ? 429 : 502;
    return Response.json(
      {
        error:
          status === 429
            ? "Google Places is busy. Please retry shortly."
            : "Google Places is temporarily unavailable. Please retry.",
      },
      { status },
    );
  }
}
