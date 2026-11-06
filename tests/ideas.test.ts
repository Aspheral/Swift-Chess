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

  it("does not invent a loose-piece alarm when a pawn protects an attacked rook", () => {
    const protectedRook = Board.fromFEN("2r1k3/8/8/8/8/2R5/1P4P1/6K1 w - - 0 1");
    const undefendedRook = Board.fromFEN("2r1k3/8/8/8/8/2R5/6P1/6K1 w - - 0 1");
    const reason = "A piece is currently vulnerable";
    expect(generateIdeas(protectedRook).ideas.some((idea) => idea.kind === "defend" && idea.reason.startsWith(reason))).toBe(false);
    expect(generateIdeas(undefendedRook).ideas.some((idea) => idea.kind === "defend" && idea.reason.startsWith(reason))).toBe(true);
  });

  it("does not invent duplicate candidate moves", () => {
    const result = generateIdeas(Board.start());
    const moves = result.candidates.map((move) => move.uci());
    expect(new Set(moves).size).toBe(moves.length);
  });
});
