import { describe, expect, it } from "vitest";
import { Board, understandPosition } from "../src";

describe("Swift position understanding", () => {
  it("recognizes material, development, and open files", () => {
    const understanding = understandPosition(Board.start());
    expect(understanding.material).toBe(0);
    expect(understanding.materialAdvantage).toBe("equal");
    expect(understanding.development.w).toBe(0);
    expect(understanding.development.b).toBe(0);
    expect(understanding.pawns.w.openFiles).toEqual([]);
  });

  it("recognizes passed and isolated pawns", () => {
    const board = Board.fromFEN("4k3/8/8/3p4/8/8/P7/4K3 w - - 0 1");
    const understanding = understandPosition(board);
    expect(understanding.pawns.w.passed).toBe(1);
    expect(understanding.pawns.w.isolated).toBe(1);
    expect(understanding.pawns.b.passed).toBe(1);
  });

  it("recognizes immediate tactical checks and captures", () => {
    const board = Board.fromFEN("6k1/5ppp/8/8/8/6Q1/5PPP/6K1 w - - 0 1");
    const understanding = understandPosition(board);
    expect(understanding.tactics.checks).toBeGreaterThan(0);
    expect(understanding.tactics.forcingMoves).toBeGreaterThanOrEqual(understanding.tactics.checks);
  });

  it("recognizes a friendly rook defended by a pawn despite no legal move onto its square", () => {
    const board = Board.fromFEN("2r1k3/8/8/8/8/2R5/1P4P1/6K1 w - - 0 1");
    expect(board.legalMoves().some((move) => move.to === 18)).toBe(false);
    const rook = understandPosition(board).pieces.w.find((piece) => piece.square === "c3");
    expect(rook).toBeDefined();
    expect(rook?.defended).toBe(true);
    expect(rook?.vulnerable).toBe(false);
  });

  it("distinguishes the same attacked rook when its pawn defender is absent", () => {
    const board = Board.fromFEN("2r1k3/8/8/8/8/2R5/6P1/6K1 w - - 0 1");
    const rook = understandPosition(board).pieces.w.find((piece) => piece.square === "c3");
    expect(rook?.defended).toBe(false);
    expect(rook?.vulnerable).toBe(true);
  });

  it("recognizes both sides' ordinary supporting pieces in the starting position", () => {
    const position = understandPosition(Board.start());
    expect(position.pieces.w.find((piece) => piece.square === "g1")?.defended).toBe(true);
    expect(position.pieces.b.find((piece) => piece.square === "g8")?.defended).toBe(true);
    expect(position.pieces.w.every((piece) => !piece.vulnerable)).toBe(true);
  });

  it("reports exposed kings", () => {
    const board = Board.fromFEN("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    const understanding = understandPosition(board);
    expect(understanding.king.w.exposed).toBe(true);
    expect(understanding.king.b.exposed).toBe(true);
  });
});
