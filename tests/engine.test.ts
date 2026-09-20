import { describe, expect, it } from "vitest";
import { Board, SwiftEngine, SwiftEnginePVS, staticExchange } from "../src";

describe("Swift search", () => {
  it("finds a mate in one", () => {
    const board = Board.fromFEN("6k1/5ppp/8/8/8/6Q1/5PPP/6K1 w - - 0 1");
    const result = new SwiftEngine().search(board, { depth: 2 });
    expect(result.move?.uci()).toBe("g3b8");
    expect(result.score).toBeGreaterThan(90000);
  });

  it("returns a legal move from the starting position", () => {
    const board = Board.start();
    const result = new SwiftEngine().search(board, { depth: 3 });
    expect(result.move).not.toBeNull();
    expect(board.legalMoves().some((move) => move.uci() === result.move?.uci())).toBe(true);
    expect(result.depth).toBe(3);
    expect(result.nodes).toBeGreaterThan(0);
  });

  it("respects a search time budget", () => {
    const result = new SwiftEngine().search(Board.start(), { depth: 12, timeMs: 20 });
    expect(result.move).not.toBeNull();
    expect(result.nodes).toBeGreaterThan(0);
  });

  it("keeps material advantage visible to evaluation", () => {
    const engine = new SwiftEngine();
    const equal = Board.start();
    const extraQueen = Board.fromFEN("rnbqkbnr/pppppppp/8/8/8/Q7/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(engine.evaluate(extraQueen)).toBeGreaterThan(engine.evaluate(equal) + 800);
  });

  it("recognizes a profitable pawn capture with no recapture", () => {
    const board = Board.fromFEN("4k3/8/8/4p3/4Q3/8/8/4K3 w - - 0 1");
    const move = board.legalMoves().find((candidate) => candidate.uci() === "e4e5");
    expect(move).toBeDefined();
    expect(staticExchange(board, move!)).toBe(100);
  });

  it("recognizes a poisoned queen capture", () => {
    const board = Board.fromFEN("4r1k1/8/8/4p3/4Q3/8/8/4K3 w - - 0 1");
    const move = board.legalMoves().find((candidate) => candidate.uci() === "e4e5");
    expect(move).toBeDefined();
    expect(staticExchange(board, move!)).toBe(-800);
  });

  it("does not cash in a bishop while connected passers are about to reach the seventh", () => {
    const board = Board.fromFEN("7r/p1p1k1pp/1PP1b3/5p2/1P2B3/P5P1/5P1P/3R2K1 b - - 0 35");
    const result = new SwiftEngine().search(board, { depth: 4 });
    expect(result.move?.uci()).not.toBe("f5e4");
  });

  it("PVS preserves mate selection", () => {
    const board = Board.fromFEN("6k1/5ppp/8/8/8/6Q1/5PPP/6K1 w - - 0 1");
    const result = new SwiftEnginePVS().search(board, { depth: 3 });
    expect(result.move?.uci()).toBe("g3b8");
    expect(result.score).toBeGreaterThan(90000);
    expect(result.pv?.[0].uci()).toBe("g3b8");
  });

  it("PVS returns a legal principal variation", () => {
    const board = Board.start();
    const result = new SwiftEnginePVS().search(board, { depth: 4 });
    expect(result.move).not.toBeNull();
    expect(result.pv?.length).toBeGreaterThan(0);
    expect(result.pv?.length).toBeLessThanOrEqual(32);
    expect(board.legalMoves().some((move) => move.uci() === result.move?.uci())).toBe(true);
  });
});
