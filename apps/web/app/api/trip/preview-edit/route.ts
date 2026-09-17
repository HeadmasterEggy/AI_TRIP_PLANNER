import { previewEdit } from "@/lib/trip-edit";
export async function POST(request: Request) {
  try {
    return Response.json(await previewEdit(await request.json()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Edit failed" },
      { status: 400 },
    );
  }
}
