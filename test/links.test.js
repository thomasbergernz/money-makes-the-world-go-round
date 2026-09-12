import { describe, it, expect } from "vitest";
import { buildLinkIndex } from "../src/data/links.js";

const event = (id, follows = []) => ({ id, label: id, follows });

describe("buildLinkIndex", () => {
  it("resolves links in both directions", () => {
    const tambora = event("tambora");
    const summer = event("summer", ["tambora"]);
    const fodder = event("fodder", ["summer"]);
    const index = buildLinkIndex([tambora, summer, fodder]);

    expect(index.follows("summer")).toEqual([tambora]);
    expect(index.followedBy("summer")).toEqual([fodder]);
    expect(index.followedBy("tambora")).toEqual([summer]);
  });

  it("returns empty arrays for unlinked or unknown ids", () => {
    const index = buildLinkIndex([event("lonely")]);
    expect(index.follows("lonely")).toEqual([]);
    expect(index.followedBy("lonely")).toEqual([]);
    expect(index.follows("nope")).toEqual([]);
  });

  it("skips targets missing from the corpus instead of crashing", () => {
    // A bulk layer toggled off must not take the panel down with it.
    const index = buildLinkIndex([event("orphan", ["gone"])]);
    expect(index.follows("orphan")).toEqual([]);
    expect(index.followedBy("gone")).toEqual([]);
  });

  it("supports multiple targets per event", () => {
    const a = event("a");
    const b = event("b");
    const c = event("c", ["a", "b"]);
    const index = buildLinkIndex([a, b, c]);
    expect(index.follows("c")).toEqual([a, b]);
  });

  it("tolerates events without a follows field", () => {
    const index = buildLinkIndex([{ id: "bare", label: "bare" }]);
    expect(index.follows("bare")).toEqual([]);
  });
});

describe("chain walking", () => {
  it("walks a three-hop chain in both directions", () => {
    const tambora = event("tambora");
    const summer = event("summer", ["tambora"]);
    const fodder = event("fodder", ["summer"]);
    const drais = event("drais", ["fodder"]);
    const index = buildLinkIndex([tambora, summer, fodder, drais]);

    expect(index.chainUp("drais").map((e) => e.id)).toEqual(["fodder", "summer", "tambora"]);
    expect(index.chainDown("tambora").map((e) => e.id)).toEqual(["summer", "fodder", "drais"]);
  });

  it("walks branches breadth-first without duplicates", () => {
    const root = event("root");
    const a = event("a", ["root"]);
    const b = event("b", ["root"]);
    const leaf = event("leaf", ["a", "b"]);
    const index = buildLinkIndex([root, a, b, leaf]);

    expect(index.chainUp("leaf").map((e) => e.id)).toEqual(["a", "b", "root"]);
    expect(index.chainDown("root").map((e) => e.id)).toEqual(["a", "b", "leaf"]);
  });

  it("terminates on a cycle instead of hanging", () => {
    const a = event("a", ["b"]);
    const b = event("b", ["a"]);
    const index = buildLinkIndex([a, b]);
    expect(index.chainUp("a").map((e) => e.id)).toEqual(["b"]);
  });

  it("returns an empty chain for an unknown id", () => {
    const index = buildLinkIndex([event("only")]);
    expect(index.chainUp("nope")).toEqual([]);
    expect(index.chainDown("nope")).toEqual([]);
  });
});
