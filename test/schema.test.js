import { describe, it, expect } from "vitest";
import {
  normaliseRow,
  normaliseDataset,
  dedupeById,
  eventEnd,
  REGIONS,
  CATEGORIES,
} from "../src/data/schema.js";

const valid = {
  id: "tambora-1815",
  start: "1815-04-10",
  end: "1815-07-15",
  label: "Mount Tambora eruption",
  category: "nature",
  region: "ASIA_SOUTH",
  certainty: "exact",
  uncertainty: "",
  source: "Smithsonian GVP",
  link: "",
};

describe("normaliseRow", () => {
  it("normalises a complete row", () => {
    const event = normaliseRow(valid);
    expect(event.id).toBe("tambora-1815");
    expect(event.start).toBeCloseTo(1815 + 99 / 365, 3);
    expect(event.instant).toBe(false);
    expect(event.uncertainty).toBe(0);
  });

  it("treats an empty end as an instant and never synthesises one", () => {
    const event = normaliseRow({ ...valid, end: "" });
    expect(event.end).toBeNull();
    expect(event.instant).toBe(true);
    // The v3 original produced start + 100 years here.
    expect(eventEnd(event)).toBe(event.start);
  });

  it("rejects an unknown region rather than inventing a lane", () => {
    expect(() => normaliseRow({ ...valid, region: "Europe" })).toThrow(/unknown region/i);
    expect(() => normaliseRow({ ...valid, region: "EU" })).toThrow(/unknown region/i);
  });

  it("rejects an unknown category", () => {
    expect(() => normaliseRow({ ...valid, category: "weather" })).toThrow(/unknown category/i);
  });

  it("rejects an unknown certainty", () => {
    expect(() => normaliseRow({ ...valid, certainty: "probably" })).toThrow(/unknown certainty/i);
  });

  it("requires the mandatory fields", () => {
    for (const field of ["id", "start", "label", "category", "region", "certainty"]) {
      expect(() => normaliseRow({ ...valid, [field]: "" })).toThrow(/missing required field/i);
    }
  });

  it("rejects an end that precedes its start", () => {
    expect(() => normaliseRow({ ...valid, start: "1815", end: "1800" })).toThrow(/precedes/i);
  });

  it("accepts BC intervals and orders them correctly", () => {
    const event = normaliseRow({ ...valid, start: "1628 BC", end: "1600 BC", certainty: "contested", uncertainty: "50" });
    expect(event.start).toBeLessThan(event.end);
    expect(event.uncertainty).toBe(50);
  });

  it("rejects a malformed id", () => {
    for (const id of ["Tambora", "tambora 1815", "_x", "-x"]) {
      expect(() => normaliseRow({ ...valid, id })).toThrow(/invalid id/i);
    }
  });

  it("names the dataset and line in its error messages", () => {
    expect(() => normaliseRow({ ...valid, region: "Nope" }, { dataset: "nature.csv", index: 3 })).toThrow(
      /nature\.csv row 5/,
    );
  });
});

describe("normaliseDataset", () => {
  it("collects every error instead of stopping at the first", () => {
    const rows = [valid, { ...valid, id: "a", region: "Nope" }, { ...valid, id: "b", category: "nope" }];
    const { events, errors } = normaliseDataset(rows, "test.csv");
    expect(events).toHaveLength(1);
    expect(errors).toHaveLength(2);
  });
});

describe("dedupeById", () => {
  it("keeps the first occurrence so a bulk layer cannot double a curated event", () => {
    const curated = { id: "tambora-1815", dataset: "nature.csv" };
    const bulk = { id: "tambora-1815", dataset: "gvp.csv" };
    expect(dedupeById([curated, bulk])).toEqual([curated]);
  });
});

describe("enums", () => {
  it("puts GLOBAL first so it renders as the top lane", () => {
    expect(REGIONS[0]).toBe("GLOBAL");
  });

  it("covers the six domains", () => {
    expect(CATEGORIES).toEqual(["nature", "economy", "politics", "science", "religion", "thought"]);
  });
});
