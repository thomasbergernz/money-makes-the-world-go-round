import { describe, it, expect } from "vitest";
import { yearTicks, tickLabel } from "../src/timeline/axis.js";
import { parseYear } from "../src/time/year.js";

describe("yearTicks", () => {
  it("lands on round historical years on both sides of the era boundary", () => {
    // parseYear("3000 BC") is mid-year, so the 3000 BC tick itself sits just
    // outside the domain; every tick that is in range must still be round.
    const labels = yearTicks([parseYear("3000 BC"), 2026], 8).map(tickLabel);
    expect(labels).toContain("2500 BC");
    expect(labels).toContain("2000 BC");
    expect(labels).toContain("1000 BC");
    expect(labels).toContain("1000");
    expect(labels).toContain("2000");
    for (const label of labels) {
      expect(Number(label.replace(" BC", "")) % 500 === 0 || label === "1").toBe(true);
    }
  });

  it("includes the outermost round year when the domain reaches it", () => {
    expect(yearTicks([-2999, 2026], 8).map(tickLabel)).toContain("3000 BC");
  });

  it("includes the era boundary when it is in view", () => {
    expect(yearTicks([parseYear("500 BC"), 500], 10).map(tickLabel)).toContain("1");
  });

  it("never emits a negative label or a year zero", () => {
    for (const domain of [[-2999, 2026], [-500, 500], [-50, 50], [1500, 2026]]) {
      for (const label of yearTicks(domain, 10).map(tickLabel)) {
        expect(label).not.toMatch(/-/);
        expect(label).not.toBe("0");
      }
    }
  });

  it("stays inside the domain", () => {
    const domain = [-2999, 2026];
    for (const t of yearTicks(domain, 10)) {
      expect(t).toBeGreaterThanOrEqual(domain[0]);
      expect(t).toBeLessThanOrEqual(domain[1]);
    }
  });

  it("returns nothing for a degenerate domain", () => {
    expect(yearTicks([100, 100])).toEqual([]);
  });
});
