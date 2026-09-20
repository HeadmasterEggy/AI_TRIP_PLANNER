import { describe, expect, it } from "vitest";
import { formatTravelDatesMessage, looksLikeDateQuestion } from "./date-range";

describe("formatTravelDatesMessage", () => {
  it("formats a chosen range using local calendar fields, not UTC", () => {
    // Deliberately near midnight local time to catch a toISOString-style bug
    // that would shift this to the wrong day in most timezones.
    const from = new Date(2026, 10, 1, 0, 30); // 2026-11-01, 00:30 local
    const to = new Date(2026, 10, 4, 23, 45); // 2026-11-04, 23:45 local
    expect(formatTravelDatesMessage({ from, to })).toBe("Travel dates: 2026-11-01 to 2026-11-04");
  });

  it("orders the range chronologically even if the picker reports it backwards", () => {
    const from = new Date(2026, 10, 4);
    const to = new Date(2026, 10, 1);
    expect(formatTravelDatesMessage({ from, to })).toBe("Travel dates: 2026-11-01 to 2026-11-04");
  });

  it("returns undefined for an incomplete selection (only the start day picked)", () => {
    expect(formatTravelDatesMessage({ from: new Date(2026, 10, 1), to: undefined })).toBeUndefined();
    expect(formatTravelDatesMessage({ from: undefined, to: new Date(2026, 10, 4) })).toBeUndefined();
  });

  it("produces a string extractBriefPatchLocally's date regex actually matches", async () => {
    const { extractBriefPatchLocally } = await import("@trip/orchestrator");
    const message = formatTravelDatesMessage({
      from: new Date(2026, 10, 1),
      to: new Date(2026, 10, 4),
    })!;
    expect(extractBriefPatchLocally(message).dates).toEqual(["2026-11-01", "2026-11-04"]);
  });
});

describe("looksLikeDateQuestion", () => {
  it.each([
    "What dates are you planning to travel?",
    "Which date works best for departure?",
    "When are you thinking of going?",
    "你打算什么时候出发?",
    "希望在哪天出发呢",
  ])("recognizes a date question: %s", (text) => {
    expect(looksLikeDateQuestion(text)).toBe(true);
  });

  it.each([
    "How many people are travelling?",
    "What's your total budget?",
    "Sydney sounds like a great choice!",
  ])("does not fire on an unrelated message: %s", (text) => {
    expect(looksLikeDateQuestion(text)).toBe(false);
  });
});
