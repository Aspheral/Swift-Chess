import { describe, expect, it } from "vitest";
import { Board, Game, HumanSwiftEngine, SwiftEngine } from "../src";

const FENS = {
  kings: "7k/8/8/8/8/8/8/K7 w - - 0 1",
  knight: "7k/8/8/8/8/8/8/KN6 w - - 0 1",
  bishop: "7k/8/8/8/8/8/8/KB6 w - - 0 1",
  sameBishops: "7k/8/8/8/6b1/8/8/KB6 w - - 0 1",
  oppositeBishops: "7k/8/8/8/5b2/8/8/KB6 w - - 0 1",
  bishopKnight: "7k/8/8/8/6n1/8/8/KB6 w - - 0 1",
  twoKnights: "7k/8/8/8/8/8/8/KNN5 w - - 0 1",
  queen: "7k/8/8/8/8/8/8/KQ6 w - - 0 1",
  rook: "7k/8/8/8/8/8/8/KR6 w - - 0 1",
  pawn: "7k/8/8/8/8/8/P7/K7 w - - 0 1",
};

describe("Swift search agrees with FIDE-style dead-position adjudication", () => {
  it.each(["kings","knight","bishop","sameBishops"] as const)(
    "recognizes %s as a drawn position in both Game and Board", (name) => {
      const board = Board.fromFEN(FENS[name]);
      expect(board.isInsufficientMaterial()).toBe(true);
      expect(Game.fromFEN(FENS[name]).result()).toBe("insufficient-material");
      // A fresh Swift search must not hallucinate a winning piece advantage.
      for (const depth of [2, 3]) {
        const result = new SwiftEngine().search(board, { depth });
        expect(result.depth).toBe(depth);
        expect(result.score).toBe(0);
      }
    });

  it.each(["oppositeBishops","bishopKnight","twoKnights","queen","rook","pawn"] as const)(
    "does not call %s dead if checkmate may still be legally possible", (name) => {
      const board = Board.fromFEN(FENS[name]);
      expect(board.isInsufficientMaterial()).toBe(false);
      expect(Game.fromFEN(FENS[name]).isInsufficientMaterial()).toBe(false);
    });

  it("preserves material counts across legal captures and immutable null moves", () => {
    const initial = Board.fromFEN("7k/1n6/2B5/8/8/8/8/K7 w - - 0 1");
    expect(initial.isInsufficientMaterial()).toBe(false);
    const capture = initial.legalMoves().find((m) => m.uci() === "c6b7");
    expect(capture).toBeDefined();
    const after = initial.makeMove(capture!);
    expect(after.isInsufficientMaterial()).toBe(true);
    expect(after.makeNullMove().isInsufficientMaterial()).toBe(true);
    // Original board is immutable and must retain its two non-king pieces.
    expect(initial.isInsufficientMaterial()).toBe(false);
    expect(new SwiftEngine().search(after, { depth: 3 }).score).toBe(0);
  });

  it("handles promotions as live material, not as a bare-king draw", () => {
    const board = Board.fromFEN("7k/P7/8/8/8/8/8/7K w - - 0 1");
    expect(board.isInsufficientMaterial()).toBe(false);
    const promote = board.legalMoves().find((m) => m.uci() === "a7a8q");
    expect(promote).toBeDefined();
    expect(board.makeMove(promote!).isInsufficientMaterial()).toBe(false);
  });

  it("keeps a queen advantage positive and preserves normal middlegame search", () => {
    const queen = new SwiftEngine().search(Board.fromFEN(FENS.queen), { depth: 3 });
    expect(queen.score).toBeGreaterThan(400);
    const opening = new SwiftEngine().search(Board.start(), { depth: 3 });
    expect(opening.depth).toBe(3);
    expect(Board.start().legalMoves().some((m) => m.uci() === opening.move?.uci())).toBe(true);
    expect(Board.start().isInsufficientMaterial()).toBe(false);
  });

  it("applies the draw rule in human-style searching without distorting other plans", () => {
    const board = Board.fromFEN(FENS.bishop);
    const result = new HumanSwiftEngine().search(board, {
      depth: 2, safetyDepth: 2, ponderDepth: 2,
      adaptiveThinking: false, randomness: 0,
      strictBestPlay: true, tacticalSearchDepth: 0,
    });
    expect(result.move).not.toBeNull();
    expect(result.score).toBe(0);
  });
});
