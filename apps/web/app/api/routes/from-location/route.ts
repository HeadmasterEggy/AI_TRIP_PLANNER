import { z } from "zod";
import { googleRouteFromCoordinates } from "@/lib/google";

const Input = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  placeId: z.string().min(1),
  mode: z.enum(["WALK", "TRANSIT"]),
});

export async function POST(request: Request) {
  try {
    const input = Input.parse(await request.json());
    return Response.json(
      await googleRouteFromCoordinates(
        { latitude: input.latitude, longitude: input.longitude },
        input.placeId,
        input.mode,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Route lookup failed" },
      { status: 400 },
    );
  }
}
