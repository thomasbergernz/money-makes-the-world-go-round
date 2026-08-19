// The shipped datasets are part of the product. A row that fails the schema is
// a defect, not a runtime surprise, so it fails here rather than in a browser.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { csvParse } from "d3-dsv";
import { normaliseDataset, REQUIRED_COLUMNS } from "../src/data/schema.js";

const DATA_DIR = join(import.meta.dirname, "..", "public", "data");
const files = readdirSync(DATA_DIR).filter((name) => name.endsWith(".csv"));

const parsed = files.map((file) => {
  const rows = csvParse(readFileSync(join(DATA_DIR, file), "utf8"));
  return { file, rows, ...normaliseDataset(rows, file) };
});

describe("shipped datasets", () => {
  it("ships at least the six core domains", () => {
    for (const name of ["nature.csv", "economy.csv", "politics.csv", "science.csv", "religion.csv", "thought.csv"]) {
      expect(files).toContain(name);
    }
  });

  it.each(parsed)("$file has no schema violations", ({ errors }) => {
    expect(errors).toEqual([]);
  });

  it.each(parsed)("$file declares every required column", ({ rows }) => {
    for (const column of REQUIRED_COLUMNS) {
      expect(Object.keys(rows[0])).toContain(column);
    }
  });

  it("has globally unique ids", () => {
    const seen = new Map();
    const duplicates = [];
    for (const { file, events } of parsed) {
      for (const event of events) {
        if (seen.has(event.id)) duplicates.push(`${event.id} in ${file} and ${seen.get(event.id)}`);
        else seen.set(event.id, file);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it("keeps every event inside the stated time scope", () => {
    // The scope is 3000 BC to the present. A little headroom is allowed for
    // events that set the scene (cuneiform, the unification of Egypt), but not
    // enough for a deep-time event to stretch the axis and compress all of
    // recorded history into a corner. 3500 BC is astronomical year -3499.
    for (const { file, events } of parsed) {
      for (const event of events) {
        expect(event.start, `${event.id} in ${file} starts before 3500 BC`).toBeGreaterThanOrEqual(-3499);
        expect(event.start, `${event.id} in ${file}`).toBeLessThan(2100);
      }
    }
  });

  it("gives every contested date an uncertainty to render", () => {
    for (const { file, events } of parsed) {
      for (const event of events.filter((e) => e.certainty === "contested")) {
        expect(event.uncertainty, `${event.id} in ${file} is contested but states no range`).toBeGreaterThan(0);
      }
    }
  });

  it("covers every region and every category across the corpus", () => {
    const events = parsed.flatMap((entry) => entry.events);
    for (const region of ["GLOBAL", "EUROPE", "MIDDLE_EAST", "AFRICA", "ASIA_EAST", "ASIA_SOUTH", "AMERICAS", "OCEANIA"]) {
      expect(events.some((event) => event.region === region), `no events in ${region}`).toBe(true);
    }
    for (const category of ["nature", "economy", "politics", "science", "religion", "thought"]) {
      expect(events.some((event) => event.category === category), `no ${category} events`).toBe(true);
    }
  });
});
