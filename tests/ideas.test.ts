import { describe, expect, it } from "vitest";
import { Board, generateIdeas } from "../src";

describe("Swift idea generation", () => {
  it("produces structured candidates from the starting position", () => {
    const result = generateIdeas(Board.start());
    expect(result.understanding.sideToMove).toBe("w");
    expect(result.ideas.length).toBeGreaterThan(0);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.ideas.every((idea) => idea.reason.length > 0 && idea.candidates.length > 0)).toBe(true);
  });

  it("prioritizes an immediate check", () => {
    const board = Board.fromFEN("6k1/8/6Q1/8/8/8/8/6K1 w - - 0 1");
    const result = generateIdeas(board);
    expect(result.ideas[0]?.kind).toBe("tactical");
    expect(result.ideas[0]?.candidates.some((move) => board.makeMove(move).isInCheck("b"))).toBe(true);
  });

  it("does not invent duplicate candidate moves", () => {
    const result = generateIdeas(Board.start());
    const moves = result.candidates.map((move) => move.uci());
    expect(new Set(moves).size).toBe(moves.length);
  });
  it("finds a concrete defense against an invading rook", () => {
    const board = Board.fromFEN("4k3/8/8/8/8/8/6P1/2r2RK1 w - - 0 1");
    const result = generateIdeas(board);
    const defensive = result.ideas.find((idea) => idea.kind === "defend" && idea.reason.includes("penetrated"));
    expect(defensive).toBeDefined();
    expect(defensive?.candidates.map((move) => move.uci())).toContain("f1c1");
    expect(result.understanding.king.w.rookInvasionPressure).toBe(2);
  });

  it("does not fabricate a rook-invasion defense in an ordinary position", () => {
    const result = generateIdeas(Board.start());
    expect(result.understanding.king.w.rookInvasionPressure).toBe(0);
    expect(result.ideas.some((idea) => idea.reason.includes("penetrated"))).toBe(false);
  });

});
