import { describe, expect, it } from "vitest";
import { Board, SwiftEngine } from "../src";

describe("search correctness near the fifty-move rule", () => {
  const fen = (halfmove: number) => `7k/8/8/8/8/8/8/KQ6 w - - ${halfmove} 1`;

  it("scores an unavoidable fifty-move draw as a draw, not a queen advantage", () => {
    const engine = new SwiftEngine();
    const result = engine.search(Board.fromFEN(fen(99)), { depth: 2 });
    expect(result.depth).toBe(2);
    expect(result.score).toBe(0);
  });

  it("does not reuse transposition evaluations across different draw clocks", () => {
    const engine = new SwiftEngine();
    const normal = engine.search(Board.fromFEN(fen(0)), { depth: 3 });
    const draw = engine.search(Board.fromFEN(fen(99)), { depth: 3 });
    const normalAgain = engine.search(Board.fromFEN(fen(0)), { depth: 3 });
    expect(normal.score).toBeGreaterThan(400);
    expect(draw.score).toBe(0);
    expect(normalAgain.score).toBeGreaterThan(400);
  });

  it("gives checkmate priority when the halfmove clock also reaches 100", () => {
    // After Qg7#, black has no legal move: checkmate is not a drawn game.
    const board = Board.fromFEN("7k/8/5KQ1/8/8/8/8/8 w - - 99 1");
    const mate = board.legalMoves().find((move) => move.uci() === "g6g7");
    expect(mate).toBeDefined();
    expect(board.makeMove(mate!).isCheckmate()).toBe(true);
    expect(new SwiftEngine().search(board, { depth: 2 }).score).toBeGreaterThan(90_000);
  });
});

describe("null-move pruning eligibility", () => {
  const canNullMove = (board: Board): boolean =>
    (new SwiftEngine() as unknown as { canNullMove(position: Board): boolean }).canNullMove(board);

  it("does not make a king-and-pawn side pass null-move eligibility using the opponent's material", () => {
    const board = Board.fromFEN("7k/6p1/8/8/8/8/6P1/KQRR4 b - - 0 1");
    expect(canNullMove(board)).toBe(false);
  });

  it("still permits null-move pruning for a side with its own heavy pieces", () => {
    const board = Board.fromFEN("7k/6p1/8/8/8/8/6P1/KQRR4 w - - 0 1");
    expect(canNullMove(board)).toBe(true);
  });
});
