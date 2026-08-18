import { describe, it, expect } from "vitest";
import { eventsAt, countAt } from "../src/timeline/cursor.js";
import { parseYear } from "../src/time/year.js";

const ev = (id, region, category, start, end = null) => ({
  id,
  region,
  category,
  start: parseYear(start),
  end: end === null ? null : parseYear(end),
  instant: end === null,
  label: id,
});

// The worked example from the design: the eruption, the year without a summer,
// and the panic that followed.
const corpus = [
  ev("tambora", "GLOBAL", "nature", "1815-04-10", "1815-07-15"),
  ev("year-without-summer", "EUROPE", "nature", "1816", "1816"),
  ev("european-famine", "EUROPE", "nature", "1816", "1819"),
  ev("panic-1819", "AMERICAS", "economy", "1819", "1821"),
  ev("qing-decline", "ASIA_EAST", "politics", "1796", "1850"),
  ev("waterloo", "EUROPE", "politics", "1815-06-18"),
];

describe("eventsAt", () => {
  it("answers the question the timeline exists to answer", () => {
    const groups = eventsAt(corpus, parseYear("1816"), { tolerance: 1 });
    const ids = groups.flatMap((g) => g.events.map((e) => e.id));
    expect(ids).toContain("year-without-summer");
    expect(ids).toContain("european-famine");
    expect(ids).toContain("qing-decline");
    expect(groups.map((g) => g.region)).toContain("EUROPE");
    expect(groups.map((g) => g.region)).toContain("ASIA_EAST");
  });

  it("returns groups in lane order with GLOBAL first", () => {
    const groups = eventsAt(corpus, parseYear("1815-06-01"), { tolerance: 0.2 });
    expect(groups[0].region).toBe("GLOBAL");
  });

  it("omits regions with nothing at that moment", () => {
    const groups = eventsAt(corpus, parseYear("1830"));
    expect(groups.map((g) => g.region)).toEqual(["ASIA_EAST"]);
  });

  it("does not report an instant fifty years after it happened", () => {
    // The v3 model gave instants a synthetic century; this is that regression.
    const groups = eventsAt(corpus, parseYear("1865"), { tolerance: 1 });
    expect(groups.flatMap((g) => g.events.map((e) => e.id))).not.toContain("waterloo");
  });

  it("makes instants hittable within the given tolerance", () => {
    const near = parseYear("1815-06-18");
    expect(countAt(eventsAt(corpus, near, { tolerance: 0 }))).toBeGreaterThan(0);
    expect(
      eventsAt(corpus, near + 3, { tolerance: 5 }).flatMap((g) => g.events.map((e) => e.id)),
    ).toContain("waterloo");
    expect(
      eventsAt(corpus, near + 3, { tolerance: 0.1 }).flatMap((g) => g.events.map((e) => e.id)),
    ).not.toContain("waterloo");
  });

  it("includes an interval at both of its endpoints", () => {
    expect(countAt(eventsAt(corpus, parseYear("1796")))).toBe(1);
    expect(countAt(eventsAt(corpus, parseYear("1850")))).toBe(1);
  });

  it("works across the era boundary", () => {
    const ancient = [ev("roman-warm", "EUROPE", "nature", "250 BC", "400")];
    expect(countAt(eventsAt(ancient, parseYear("1 BC")))).toBe(1);
    expect(countAt(eventsAt(ancient, parseYear("1")))).toBe(1);
    expect(countAt(eventsAt(ancient, parseYear("500")))).toBe(0);
  });
});
