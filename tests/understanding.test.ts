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

  it("reports exposed kings", () => {
    const board = Board.fromFEN("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    const understanding = understandPosition(board);
    expect(understanding.king.w.exposed).toBe(true);
    expect(understanding.king.b.exposed).toBe(true);
  });
  it("recognizes a rook invasion of White's home rank without claiming a forced check", () => {
    const board = Board.fromFEN("4k3/8/8/8/8/8/6P1/2r2RK1 w - - 0 1");
    const understanding = understandPosition(board);
    expect(board.isInCheck("w")).toBe(false);
    expect(understanding.king.w.rookInvasionPressure).toBe(2);
    expect(understanding.king.b.rookInvasionPressure).toBe(0);
  });

  it("mirrors rook pressure for Black, without overreacting to rooks on distant ranks", () => {
    const invaded = Board.fromFEN("2R2rk1/6p1/8/8/8/8/8/4K3 b - - 0 1");
    expect(understandPosition(invaded).king.b.rookInvasionPressure).toBe(2);
    const distant = Board.fromFEN("4k3/8/8/8/8/2r5/6P1/5RK1 w - - 0 1");
    expect(understandPosition(distant).king.w.rookInvasionPressure).toBe(0);
    const advancedKing = Board.fromFEN("4k3/8/8/4K3/8/8/2r5/8 w - - 0 1");
    expect(understandPosition(advancedKing).king.w.rookInvasionPressure).toBe(0);
  });

});
