import { describe, expect, it, vi } from "vitest";
import type { ChatTurn, UserPreference } from "@trip/shared";
import { createJsonStore } from "../src/durable";
import { memory } from "../src/memory";

describe("durable JSON store", () => {
  it("keeps the MemoryStore contract when no shared store is configured", async () => {
    const store = createJsonStore();
    const turn: ChatTurn = { role: "user", content: "Plan Sydney", at: new Date().toISOString() };
    const pref: UserPreference = { key: "pace", value: "relaxed", source: "filter" };

    await store.set("test:durable:value", { turn, pref });
    expect(await store.get("test:durable:value")).toEqual({ turn, pref });
    expect(await store.increment("test:durable:counter")).toBe(1);
    expect(await store.increment("test:durable:counter")).toBe(2);
  });

  it("uses the configured Redis REST boundary for reads, writes and counters", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://redis.example");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | string, init?: RequestInit) => {
        calls.push(`${init?.method}:${String(input)}`);
        return new Response(JSON.stringify({ result: "7" }), { status: 200 });
      }),
    );
    const store = createJsonStore();

    await store.set("test:redis:value", { ok: true });
    await store.get("test:redis:value");
    await store.increment("test:redis:counter");

    expect(calls).toEqual([
      "POST:https://redis.example/set/test%3Aredis%3Avalue/%7B%22ok%22%3Atrue%7D",
      "POST:https://redis.example/get/test%3Aredis%3Avalue",
      "POST:https://redis.example/incr/test%3Aredis%3Acounter",
    ]);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("persists chat and preference records through the same boundary", async () => {
    const tripId = `durable-test-${crypto.randomUUID()}`;
    const userId = `durable-user-${crypto.randomUUID()}`;
    await memory.appendShortTerm(tripId, {
      role: "assistant",
      content: "Saved answer",
      at: new Date().toISOString(),
    });
    await memory.setLongTerm(userId, { key: "pace", value: "slow", source: "chat_confirmed" });

    expect((await memory.getShortTerm(tripId)).map(({ content }) => content)).toEqual([
      "Saved answer",
    ]);
    expect(await memory.getLongTerm(userId)).toEqual([
      { key: "pace", value: "slow", source: "chat_confirmed" },
    ]);
  });
});
