import { describe, it, expect } from "vitest";
import {
  draftWithKnown,
  knownFromDraft,
  NeedsInfoError,
  parseDraft,
  parseSnapshot,
  parseSaved,
  readPlanStream,
} from "./workspace";
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
    expect(parseSnapshot(JSON.parse(JSON.stringify(unfinished)))).toMatchObject({
      version: 2,
      draft: unfinished.draft,
    });
    for (const invalid of [
      { ...snapshot, version: 3 },
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
  it("raises a follow-up question as a question rather than a failed request", async () => {
    const frame = JSON.stringify({
      type: "needs_info",
      question: "你打算哪天出发？",
      known: { destination: "悉尼" },
    });
    const error = await readPlanStream(new Response(frame), () => {}).catch(
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(NeedsInfoError);
    expect((error as NeedsInfoError).needsInfo).toEqual({
      type: "needs_info",
      question: "你打算哪天出发？",
      known: { destination: "悉尼" },
    });
  });
  it("sends only filled, valid form fields as what the traveller has stated", () => {
    const blank = {
      ...snapshot.draft,
      destination: "",
      start: "",
      end: "",
      groupSize: "",
      budgetTotal: "",
      nationality: "",
    };
    expect(knownFromDraft(blank)).toEqual({});
    // One date alone is not a range, and a half-typed number is not a stated fact.
    expect(knownFromDraft({ ...blank, start: "2026-10-01", groupSize: "0" })).toEqual({});
    expect(
      knownFromDraft({ ...blank, destination: "悉尼", start: "2026-10-01", end: "2026-10-05" }),
    ).toEqual({ destination: "悉尼", dates: ["2026-10-01", "2026-10-05"] });
  });
  it("shows what the assistant understood in the form without clearing the rest", () => {
    const draft = { ...snapshot.draft, destination: "", groupSize: "4" };
    expect(
      draftWithKnown(draft, { destination: "悉尼", dates: ["2026-10-01", "2026-10-05"] }),
    ).toMatchObject({
      destination: "悉尼",
      start: "2026-10-01",
      end: "2026-10-05",
      groupSize: "4",
      minRating: draft.minRating,
    });
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
