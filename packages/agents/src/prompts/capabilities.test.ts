import { describe, expect, it } from "vitest";
import { CAPABILITIES } from "./capabilities";
import { allSpecialists } from "../index";

/**
 * A drift alarm, not a behaviour test. The agent says "not built yet" from this
 * string alone, so a capability that ships without being listed here goes on
 * being denied, and one that is listed but never built gets promised.
 */
describe("CAPABILITIES", () => {
  it("covers every specialist's domain", () => {
    const domains: Record<string, string> = {
      itinerary: "行程",
      transport: "交通",
      accommodation: "住宿",
      "destination-guide": "目的地",
      dining: "餐饮",
    };
    for (const specialist of allSpecialists) {
      const word = domains[specialist.name];
      expect(word, `no expected word for ${specialist.name}`).toBeDefined();
      expect(CAPABILITIES).toContain(word!);
    }
  });

  it("names what this product cannot do, so the agent does not invent it", () => {
    for (const missing of ["预订", "实时天气", "实时汇率"]) expect(CAPABILITIES).toContain(missing);
  });

  it("states the base currency and the currencies a budget can be given in", () => {
    expect(CAPABILITIES).toContain("澳元");
    for (const currency of ["AUD", "CNY", "USD", "JPY"]) expect(CAPABILITIES).toContain(currency);
  });
});
