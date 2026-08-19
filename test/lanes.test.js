import { describe, it, expect } from "vitest";
import { packTracks, buildLanes, layoutLanes } from "../src/timeline/lanes.js";
import { REGIONS, eventEnd } from "../src/data/schema.js";

const event = (id, start, end = null, region = "EUROPE") => ({
  id,
  start,
  end,
  region,
  instant: end === null,
});

describe("packTracks", () => {
  it("puts non-overlapping events in one track", () => {
    const { tracks, trackCount } = packTracks([event("a", 0, 10), event("b", 20, 30)]);
    expect(trackCount).toBe(1);
    expect(tracks.get("a")).toBe(0);
    expect(tracks.get("b")).toBe(0);
  });

  it("splits overlapping events across tracks", () => {
    const { trackCount } = packTracks([event("a", 0, 100), event("b", 50, 150), event("c", 60, 70)]);
    expect(trackCount).toBe(3);
  });

  it("never lets two events in the same track overlap", () => {
    const events = [];
    for (let i = 0; i < 200; i++) {
      const start = (i * 37) % 500;
      events.push(event(`e${i}`, start, start + ((i * 13) % 90)));
    }
    const { tracks } = packTracks(events);
    const byTrack = new Map();
    for (const e of events) {
      const track = tracks.get(e.id);
      if (!byTrack.has(track)) byTrack.set(track, []);
      byTrack.get(track).push(e);
    }
    for (const inTrack of byTrack.values()) {
      inTrack.sort((a, b) => a.start - b.start);
      for (let i = 1; i < inTrack.length; i++) {
        expect(inTrack[i].start).toBeGreaterThanOrEqual(eventEnd(inTrack[i - 1]));
      }
    }
  });

  it("treats instants as points, not as intervals with borrowed width", () => {
    // Two instants a year apart must share a track. Under the v3 model each
    // would have claimed a synthetic century and forced a second track.
    const { trackCount } = packTracks([event("a", 1815), event("b", 1816)]);
    expect(trackCount).toBe(1);
  });

  it("is stable regardless of input order", () => {
    const events = [event("a", 0, 100), event("b", 50, 150), event("c", 60, 70)];
    const forward = packTracks(events).tracks;
    const backward = packTracks([...events].reverse()).tracks;
    for (const e of events) expect(backward.get(e.id)).toBe(forward.get(e.id));
  });

  it("honours a minimum gap between events in a track", () => {
    expect(packTracks([event("a", 0, 10), event("b", 12, 20)]).trackCount).toBe(1);
    expect(packTracks([event("a", 0, 10), event("b", 12, 20)], { gap: 5 }).trackCount).toBe(2);
  });
});

describe("buildLanes", () => {
  it("returns every region in fixed order, empty ones included", () => {
    const lanes = buildLanes([event("a", 0, 10, "EUROPE")]);
    expect(lanes.map((l) => l.region)).toEqual(REGIONS);
    expect(lanes[0].region).toBe("GLOBAL");
    expect(lanes.find((l) => l.region === "EUROPE").events).toHaveLength(1);
    expect(lanes.find((l) => l.region === "AFRICA").trackCount).toBe(0);
  });

  it("packs each lane independently", () => {
    const lanes = buildLanes([
      event("a", 0, 100, "EUROPE"),
      event("b", 0, 100, "ASIA_EAST"),
    ]);
    expect(lanes.find((l) => l.region === "EUROPE").trackCount).toBe(1);
    expect(lanes.find((l) => l.region === "ASIA_EAST").trackCount).toBe(1);
  });
});

describe("layoutLanes", () => {
  it("stacks lanes without overlap and reports the total height", () => {
    const lanes = buildLanes([event("a", 0, 100, "EUROPE"), event("b", 0, 100, "GLOBAL")]);
    const { lanes: placed, totalHeight } = layoutLanes(lanes, { height: 400 });
    for (let i = 1; i < placed.length; i++) {
      expect(placed[i].y).toBeGreaterThanOrEqual(placed[i - 1].y + placed[i - 1].height);
    }
    expect(totalHeight).toBeGreaterThan(0);
  });

  it("gives empty lanes a thin strip rather than zero height", () => {
    const lanes = buildLanes([event("a", 0, 100, "EUROPE")]);
    const { lanes: placed } = layoutLanes(lanes, { height: 400, emptyHeight: 14 });
    expect(placed.find((l) => l.region === "AFRICA").height).toBe(14);
  });

  it("never compresses tracks below the minimum", () => {
    const many = [];
    for (let i = 0; i < 300; i++) many.push(event(`e${i}`, 0, 100, "EUROPE"));
    const { trackHeight } = layoutLanes(buildLanes(many), { height: 400, minTrackHeight: 4 });
    expect(trackHeight).toBe(4);
  });
});
