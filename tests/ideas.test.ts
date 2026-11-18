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

  it("never mislabels king-only endgame moves as late development", () => {
    // Actual final position from the 2350/London v17 smoke-game trace.
    // Black has a developed bishop; White has only a king. The old
    // relative-development heuristic incorrectly offered White's king
    // walks as development and reinforced an obsolete long-term plan.
    const board = Board.fromFEN("8/8/7K/5b2/8/4k1q1/8/8 w - - 14 104");
    const result = generateIdeas(board);
    expect(result.understanding.development.b).toBeGreaterThan(result.understanding.development.w);
    expect(board.legalMoves().length).toBeGreaterThan(0);
    expect(result.ideas.filter((idea) => idea.kind === "develop")).toEqual([]);
    // The current side cannot 'catch up on development' with king moves.
  });

  it("does not invent a new threat when a move preserves an existing attack", () => {
    // White's knight on c3 ALREADY attacks the black knight on d5.
    // Moving the white king from e1 to d1 doesn't create any new pressure.
    // The previous create-threat generator incorrectly treated almost every
    // quiet legal move as an attack because it inspected only the next board.
    const board = Board.fromFEN("4k3/8/8/3n4/8/2N5/8/4K3 w - - 0 1");
    const ideas = generateIdeas(board).ideas.filter((idea) => idea.kind === "create-threat");
    const kingDrift = board.legalMoves().find((move) => move.uci() === "e1d1");
    expect(kingDrift).toBeDefined();
    expect(board.isSquareAttacked(35, "w")).toBe(true); // black knight on d5
    expect(ideas.flatMap((idea) => idea.candidates.map((move) => move.uci())))
      .not.toContain("e1d1");
  });

  it("does recognize a move that creates a genuinely new attack", () => {
    // Bf1-b5 adds a bishop attack on the knight d7, which did not exist.
    const board = Board.fromFEN("4k3/3n4/8/8/8/8/8/4KB2 w - - 0 1");
    const ideas = generateIdeas(board).ideas.filter((idea) => idea.kind === "create-threat");
    expect(board.isSquareAttacked(51, "w")).toBe(false); // d7
    expect(ideas.flatMap((idea) => idea.candidates.map((move) => move.uci())))
      .toContain("f1b5");
  });

  it("keeps legitimate first-move minor piece development available", () => {
    const result = generateIdeas(Board.start());
    const develop = result.ideas.filter((idea) => idea.kind === "develop");
    expect(develop.length).toBeGreaterThan(0);
    expect(develop.some((idea) => idea.candidates.some((move) => move.uci() === "g1f3"))).toBe(true);
  });


});
