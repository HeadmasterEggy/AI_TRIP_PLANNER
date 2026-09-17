import { describe, expect, it } from "vitest";
import { plan, snapshot } from "./test-fixtures";
import {
  createCatalog,
  parseCatalog,
  searchCatalog,
  serializeCatalog,
  updateCatalog,
  upsertCurrent,
} from "./workspace-catalog";

describe("workspace catalog", () => {
  it("builds stable linked chat and trip records from legacy snapshots", () => {
    const catalog = createCatalog(snapshot, [snapshot]);
    expect(catalog.version).toBe(3);
    expect(catalog.activeTripId).toBe("trip:test-trip");
    expect(catalog.activeConversationId).toBe("conversation:saved-copy");
    expect(catalog.trips).toHaveLength(1);
    expect(catalog.conversations).toHaveLength(1);
    expect(catalog.trips[0].conversationIds).toEqual(["conversation:saved-copy"]);
    expect(parseCatalog(serializeCatalog(catalog))).toEqual(catalog);
  });

  it("migrates a legacy saved array without mutating it", () => {
    const legacy = [JSON.parse(JSON.stringify(snapshot))];
    const before = JSON.stringify(legacy);
    const catalog = parseCatalog(JSON.stringify(legacy));
    expect(catalog.trips[0].snapshot.version).toBe(2);
    expect(JSON.stringify(legacy)).toBe(before);
  });

  it("updates current snapshot and keeps independent conversations linked to one trip", () => {
    const catalog = createCatalog(snapshot);
    const second = {
      ...snapshot,
      id: "another-chat",
      savedAt: "2026-09-17T00:00:00Z",
      input: "Plan museums",
    };
    const next = upsertCurrent(catalog, second);
    expect(next.trips).toHaveLength(1);
    expect(next.conversations).toHaveLength(2);
    expect(next.trips[0].conversationIds).toEqual([
      "conversation:saved-copy",
      "conversation:another-chat",
    ]);
    expect(next.activeConversationId).toBe("conversation:another-chat");
  });

  it("searches destination, dates, titles and message text", () => {
    const catalog = createCatalog({
      ...snapshot,
      messages: [{ role: "user", text: "Find galleries" }],
    });
    expect(searchCatalog(catalog, "sydney").trips).toHaveLength(1);
    expect(searchCatalog(catalog, "galleries").conversations).toHaveLength(1);
    expect(searchCatalog(catalog, "2099").trips).toHaveLength(0);
  });

  it("rejects corrupt catalog data without changing the input", () => {
    const corrupt = {
      version: 3,
      conversations: [],
      trips: [],
      layout: {
        preferences: { open: true, width: 1 },
        trip: { open: true, width: 2 },
        view: "chat",
      },
      activeTripId: "missing",
    };
    const before = JSON.stringify(corrupt);
    expect(() => parseCatalog(corrupt)).toThrow();
    expect(JSON.stringify(corrupt)).toBe(before);
  });

  it("updates layout and active IDs through a validated copy", () => {
    const catalog = createCatalog(snapshot);
    const next = updateCatalog(catalog, {
      layout: { view: "map", editorView: "timeline", day: "2026-10-01" },
    });
    expect(next.layout.view).toBe("map");
    expect(next.layout.day).toBe("2026-10-01");
    expect(next.layout.editorView).toBe("timeline");
    expect(catalog.layout.view).toBe("chat");
    expect(plan.tripId).toBe("test-trip");
  });
});
