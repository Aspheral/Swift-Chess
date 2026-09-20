import { describe, expect, it } from "vitest";
import { Board, HumanSwiftEngine, SwiftEngine, SwiftEnginePVS, staticExchange } from "../src";

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

  it("does not reward a white pawn for staying on its starting rank", () => {
    const engine = new SwiftEngine();
    const home = Board.fromFEN("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
    const advanced = Board.fromFEN("4k3/8/8/8/4P3/8/8/4K3 w - - 0 1");
    expect(engine.evaluate(advanced)).toBeGreaterThan(engine.evaluate(home));
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

  it("does not burn castling rights with the rook in a live opening", () => {
    const board = Board.fromFEN("r1bqk2r/pppp1ppp/1b3n2/4p3/1P1nP3/P1NQ4/1BPP1PPP/R3KBNR b KQkq - 2 8");
    const history = [
      "e2e3", "b8c6", "d1f3", "g8f6", "e3e4", "c6d4", "f3d3", "e7e5",
      "b1c3", "f8b4", "a2a3", "b4a5", "b2b4", "a5b6", "c1b2",
    ];
    const result = new HumanSwiftEngine().search(board, {
      depth: 3,
      timeMs: 250,
      randomness: 0,
      errorBudget: 0,
      safetyDepth: 2,
      ponderDepth: 2,
      safetyTimeMs: 30,
      ponderTimeMs: 30,
      safetyCandidateLimit: 4,
      concreteCandidateLimit: 8,
      tacticalSearchDepth: 0,
      moveHistory: history,
    });
    expect(result.move?.uci()).not.toBe("h8g8");
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
