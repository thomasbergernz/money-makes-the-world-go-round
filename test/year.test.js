import { describe, it, expect } from "vitest";
import { parseYear, parseYearSpan, formatYear, isLeapYear } from "../src/time/year.js";

describe("parseYear", () => {
  it("parses bare AD years as mid-year decimals", () => {
    expect(parseYear("1815")).toBeCloseTo(1815.5, 6);
    expect(parseYear("1")).toBeCloseTo(1.5, 6);
  });

  it("does not treat two-digit years as 19xx", () => {
    // The d3 v3 original produced 1950 for "50" via new Date(50, 6, 1).
    expect(parseYear("50")).toBeCloseTo(50.5, 6);
    expect(Math.floor(parseYear("50"))).toBe(50);
  });

  it("maps BC years onto astronomical numbering (1 BC === 0)", () => {
    expect(Math.floor(parseYear("1 BC"))).toBe(0);
    expect(Math.floor(parseYear("2 BC"))).toBe(-1);
    expect(Math.floor(parseYear("1815 BC"))).toBe(-1814);
    expect(Math.floor(parseYear("3000 BC"))).toBe(-2999);
  });

  it("accepts every era spelling", () => {
    const bc = Math.floor(parseYear("44 BC"));
    for (const s of ["44 BC", "44BC", "44 BCE", "44 b.c.", "BC 44"]) {
      expect(Math.floor(parseYear(s))).toBe(bc);
    }
    const ad = Math.floor(parseYear("1234"));
    for (const s of ["1234 AD", "1234 CE", "1234 a.d.", "AD 1234"]) {
      expect(Math.floor(parseYear(s))).toBe(ad);
    }
  });

  it("reads '1234 AD' as AD, not BC", () => {
    // The original isNaN() heuristic silently produced 1234 BC here.
    expect(parseYear("1234 AD")).toBeGreaterThan(0);
    expect(Math.floor(parseYear("1234 AD"))).toBe(1234);
  });

  it("parses ISO dates to a fractional year, anchored mid-day", () => {
    expect(parseYear("1815-01-01")).toBeCloseTo(1815 + 0.5 / 365, 6);
    expect(parseYear("1815-04-10")).toBeCloseTo(1815 + 99.5 / 365, 5);
    expect(parseYear("2007-06-08")).toBeCloseTo(2007 + 158.5 / 365, 5);
  });

  it("accepts month precision, anchored mid-month", () => {
    expect(parseYear("2003-06")).toBeGreaterThan(parseYear("2003-01-01"));
    expect(parseYear("2003-06")).toBeLessThan(parseYear("2003-08"));
    expect(parseYear("2003-06")).toBeCloseTo(2003 + (151 + 15) / 365, 3);
    expect(() => parseYear("2003-13")).toThrow();
  });

  it("handles leap years in ISO fractions", () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2024)).toBe(true);
    expect(parseYear("2024-12-31")).toBeCloseTo(2024 + 365.5 / 366, 5);
  });

  it("throws on input it cannot classify rather than guessing", () => {
    for (const bad of ["", "   ", "circa 1200", "MCMXVII", "17th century", null, undefined, "12-34"]) {
      expect(() => parseYear(bad)).toThrow();
    }
  });

  it("rejects the bare-minus year form, which has two incompatible readings", () => {
    // ISO 8601 says -1815 is 1816 BC; the original viewer and the Smithsonian
    // volcano data say it is 1815 BC. Refuse rather than pick silently.
    expect(() => parseYear("-1815")).toThrow(/ambiguous/i);
    expect(() => parseYear("-44")).toThrow(/ambiguous/i);
  });

  it("rejects year zero, which does not exist in historical numbering", () => {
    expect(() => parseYear("0")).toThrow();
    expect(() => parseYear("0 BC")).toThrow();
  });
});

describe("formatYear", () => {
  it("round-trips historical years through the astronomical representation", () => {
    for (const s of ["3000 BC", "1815 BC", "2 BC", "1 BC"]) {
      expect(formatYear(parseYear(s))).toBe(s);
    }
    for (const [input, output] of [["1", "1"], ["50", "50"], ["1815", "1815"], ["2026", "2026"]]) {
      expect(formatYear(parseYear(input))).toBe(output);
    }
  });

  it("never renders a negative number or a year zero", () => {
    for (let y = -3000; y <= 5; y++) {
      const label = formatYear(y);
      expect(label).not.toMatch(/-/);
      expect(label).not.toBe("0");
    }
  });

  it("floors fractional years toward the year they fall in", () => {
    expect(formatYear(1815.9)).toBe("1815");
    // Astronomical year -1815 spans [-1815, -1814) and is 1816 BC.
    expect(formatYear(-1814.9)).toBe("1816 BC");
    expect(formatYear(parseYear("1815 BC"))).toBe("1815 BC");
  });

  it("supports a circa prefix for uncertain dates", () => {
    expect(formatYear(-1627, { circa: true })).toBe("c. 1628 BC");
    expect(formatYear(1815, { circa: true })).toBe("c. 1815");
  });
});

describe("parseYearSpan", () => {
  it("gives a bare year its whole year", () => {
    const [lo, hi] = parseYearSpan("1816");
    expect(lo).toBeCloseTo(1816, 5);
    expect(hi).toBeGreaterThan(1816.99);
    expect(hi).toBeLessThan(1817);
  });

  it("formats its upper bound as the year that was written", () => {
    // The end of 1816 must read "1816", never "1817".
    expect(formatYear(parseYearSpan("1816")[1])).toBe("1816");
    expect(formatYear(parseYearSpan("800 BC")[1])).toBe("800 BC");
  });

  it("makes a same-year interval span the year rather than a point", () => {
    // "1816,1816" as two midpoints would be zero-width and unhittable.
    const [lo] = parseYearSpan("1816");
    const [, hi] = parseYearSpan("1816");
    expect(hi - lo).toBeGreaterThan(0.99);
  });

  it("narrows the span as the written precision narrows", () => {
    const year = parseYearSpan("2003");
    const month = parseYearSpan("2003-06");
    const day = parseYearSpan("2003-06-15");
    expect(year[1] - year[0]).toBeCloseTo(1, 3);
    expect(month[1] - month[0]).toBeCloseTo(30 / 365, 3);
    expect(day[1] - day[0]).toBeCloseTo(1 / 365, 4);
  });

  it("works across the era boundary", () => {
    const [lo, hi] = parseYearSpan("1 BC");
    expect(formatYear(lo)).toBe("1 BC");
    expect(formatYear(hi)).toBe("1 BC");
    expect(hi).toBeLessThan(parseYearSpan("1")[0]);
  });
});
