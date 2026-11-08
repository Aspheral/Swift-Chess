import { describe, expect, it } from "vitest";
import { Board, SwiftEngine } from "../src";

type Entry = { depth: number; score: number; bound: "exact" | "lower" | "upper" };
type InspectableEngine = {
  table: Map<string, Entry>;
  storeTransposition(key: string, entry: Entry): void;
};
const inspect = (engine: SwiftEngine): InspectableEngine =>
  engine as unknown as InspectableEngine;

describe("long-game transposition-table strength", () => {
  it("never replaces deeper positions with shallow or weaker bound entries", () => {
    const engine = inspect(new SwiftEngine());
    engine.storeTransposition("position", { depth: 8, score: 35, bound: "exact" });
    engine.storeTransposition("position", { depth: 4, score: -120, bound: "exact" });
    expect(engine.table.get("position")).toEqual({ depth: 8, score: 35, bound: "exact" });

    engine.storeTransposition("position", { depth: 8, score: 110, bound: "lower" });
    expect(engine.table.get("position")?.score).toBe(35);
    engine.storeTransposition("position", { depth: 9, score: 40, bound: "lower" });
    expect(engine.table.get("position")).toEqual({ depth: 9, score: 40, bound: "lower" });
  });

  it("upgrades a bounded position to an exact result at the same depth", () => {
    const engine = inspect(new SwiftEngine());
    engine.storeTransposition("position", { depth: 6, score: 10, bound: "upper" });
    engine.storeTransposition("position", { depth: 6, score: 12, bound: "exact" });
    expect(engine.table.get("position")).toEqual({ depth: 6, score: 12, bound: "exact" });
  });

  it("retains most recent positions rather than clearing the entire cache", () => {
    const engine = inspect(new SwiftEngine());
    // Set up the exact cache-capacity boundary without running 80k searches.
    for (let i = 0; i < 80_000; i++) {
      engine.table.set(`cached-${i}`, { depth: 3, score: i, bound: "exact" });
    }
    engine.storeTransposition("new-position", { depth: 5, score: 99, bound: "exact" });
    expect(engine.table.size).toBe(60_001);
    expect(engine.table.has("cached-0")).toBe(false);
    expect(engine.table.has("cached-19999")).toBe(false);
    expect(engine.table.has("cached-20000")).toBe(true);
    expect(engine.table.has("cached-79999")).toBe(true);
    expect(engine.table.has("new-position")).toBe(true);
  });

  it("preserves a direct mating line through repeated deep and shallow searches", () => {
    const board = Board.fromFEN("6k1/5ppp/8/8/8/6Q1/5PPP/6K1 w - - 0 1");
    const engine = new SwiftEngine();
    const deep = engine.search(board, { depth: 4 });
    const shallow = engine.search(board, { depth: 2 });
    const repeated = engine.search(board, { depth: 4 });
    expect(deep.move?.uci()).toBe("g3b8");
    expect(shallow.move?.uci()).toBe("g3b8");
    expect(repeated.move?.uci()).toBe("g3b8");
    expect(repeated.score).toBeGreaterThan(90_000);
  });
});
