import { describe, it, expect } from "vitest";
import { parseDraft, parseSnapshot, parseSaved, readPlanStream } from "./workspace";
import { plan, snapshot } from "./test-fixtures";

describe("workspace boundaries", () => {
  it("rejects impossible dates, empty fields, fractional people and invalid preferences", () => {
    for (const patch of [
      { start: "2026-02-30" },
      { end: "2026-09-30" },
      { destination: " " },
      { groupSize: "1.2" },
      { budgetTotal: "0" },
      { minRating: "11" },
      { minRating: "" },
    ])
      expect(parseDraft({ ...snapshot.draft, ...patch }, plan.brief).success).toBe(false);
    expect(parseDraft({ ...snapshot.draft, budgetTotal: "0.01" }, plan.brief).success).toBe(true);
    expect(
      parseDraft(
        { ...snapshot.draft, destination: "Sydney & Melbourne", end: "2026-10-02" },
        plan.brief,
      ).success,
    ).toBe(false);
  });
  it("round-trips unfinished forms while rejecting corrupt or incompatible snapshots", () => {
    const unfinished = { ...snapshot, draft: { ...snapshot.draft, budgetTotal: "" } };
    expect(parseSnapshot(JSON.parse(JSON.stringify(unfinished)))).toEqual(unfinished);
    for (const invalid of [
      { ...snapshot, version: 2 },
      { ...snapshot, plan: {} },
      { ...snapshot, messages: [{ role: "system", text: "bad" }] },
      { ...snapshot, draft: {} },
      { ...snapshot, previousTotal: -1 },
    ])
      expect(() => parseSnapshot(invalid)).toThrow();
    expect(() => parseSaved("garbage")).toThrow();
  });
  it("parses split NDJSON and a trailing final frame, skipping malformed progress", async () => {
    const payload = JSON.stringify({ type: "complete", response: { plan, reply: "Updated" } });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'broken\n{"type":"agent_started","agent":"itinerary","round":1}\n' +
              payload.slice(0, 40),
          ),
        );
        controller.enqueue(new TextEncoder().encode(payload.slice(40)));
        controller.close();
      },
    });
    const events: unknown[] = [];
    expect(
      (await readPlanStream(new Response(stream), (event) => events.push(event))).plan,
    ).toEqual(plan);
    expect(events).toHaveLength(1);
  });
  it("rejects HTTP errors, truncated streams and invalid final plans", async () => {
    await expect(
      readPlanStream(new Response('{"error":"Bad dates"}', { status: 400 }), () => {}),
    ).rejects.toThrow("Bad dates");
    await expect(readPlanStream(new Response(""), () => {})).rejects.toThrow("before the plan");
    await expect(
      readPlanStream(new Response('{"type":"complete","response":{}}'), () => {}),
    ).rejects.toThrow("invalid");
  });
});
