import { describe, expect, it } from "vitest";
import { Board, SwiftEngine } from "../src";

type Stored = { depth: number; score: number; bound: "exact" | "lower" | "upper"; move?: unknown };
type Inspectable = {
  table: Map<string, Stored>;
  key(board: Board): string;
  negamax(board: Board, depth: number, alpha: number, beta: number, ply: number, allowNullMove: boolean): { score: number };
};

describe("TT-tightened window soundness", () => {
  it("does not mislabel a TT-assisted fail-low as an exact value", () => {
    const board = Board.start();
    const engine = new SwiftEngine() as unknown as Inspectable;
    const key = engine.key(board);
    engine.table.set(key, { depth: 2, score: 250, bound: "lower" });
    const result = engine.negamax(board, 2, -1000, 1000, 0, false);
    expect(result.score).toBeLessThan(250);
    const cached = engine.table.get(key);
    expect(cached?.bound).toBe("upper");
    expect(cached?.depth).toBe(2);
  });

  it("does not mislabel a TT-assisted fail-high as an exact value", () => {
    const board = Board.start();
    const engine = new SwiftEngine() as unknown as Inspectable;
    const key = engine.key(board);
    engine.table.set(key, { depth: 2, score: -250, bound: "upper" });
    const result = engine.negamax(board, 2, -1000, 1000, 0, false);
    expect(result.score).toBeGreaterThan(-250);
    expect(engine.table.get(key)?.bound).toBe("lower");
  });

  it("preserves an exact root result after repeated searches", () => {
    const board = Board.fromFEN("6k1/5ppp/8/8/8/6Q1/5PPP/6K1 w - - 0 1");
    const engine = new SwiftEngine();
    for (const depth of [3, 4, 3]) {
      const r = engine.search(board, { depth });
      expect(r.move?.uci()).toBe("g3b8");
      expect(r.score).toBeGreaterThan(90000);
    }
  });
});
