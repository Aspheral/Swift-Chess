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
});
