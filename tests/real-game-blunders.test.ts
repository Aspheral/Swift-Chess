import { describe, expect, it } from "vitest";
import { Board, HumanSwiftEngine, SwiftEngine } from "../src";
import { avoidImmediateMajorBlunder, immediateMajorPieceLoss } from "../src/chess/blunder-guard";

/**
 * Real positions from Swift vs Divij Deep, October 11 2026 (10+10).
 * Swift played Black; it lost its queen on 27...Qe3? 28.Rxe3,
 * and later exchanged its last rook for a bishop on 32...Rg6? 33.Bxg6.
 */
describe("Swift real-game material-blunder regression", () => {
  const queenHang = Board.fromFEN("4rrk1/ppp2p1p/4bQ1R/2qpR2B/8/2P5/2P3PP/7K b - - 0 27");
  const rookHang = Board.fromFEN("6rk/ppp2p1p/7R/3p1B2/8/2P1Q3/2P3PP/7K b - - 0 32");

  it("recognizes the queen hanging to 28.Rxe3 instead of believing a zero-depth eval", () => {
    const blunder = queenHang.legalMoves().find((move) => move.uci() === "c5e3");
    expect(blunder).toBeDefined();
    const child = queenHang.makeMove(blunder!);
    expect(child.legalMoves().some((move) => move.uci() === "e5e3")).toBe(true);
    expect(immediateMajorPieceLoss(queenHang, blunder!)).toBeGreaterThanOrEqual(800);
    const correction = avoidImmediateMajorBlunder(queenHang, blunder!, [], (b) => new SwiftEngine().evaluate(b));
    expect(correction).not.toBeNull();
    expect(correction?.move.uci()).not.toBe("c5e3");
    expect(correction!.remainingLoss).toBeLessThan(160);
  });

  it("recognizes an unfavorable exchange of rook for bishop on 32...Rg6", () => {
    const blunder = rookHang.legalMoves().find((move) => move.uci() === "g8g6");
    expect(blunder).toBeDefined();
    expect(rookHang.makeMove(blunder!).legalMoves().some((move) => move.uci() === "f5g6")).toBe(true);
    expect(immediateMajorPieceLoss(rookHang, blunder!)).toBeGreaterThanOrEqual(160);
    const correction = avoidImmediateMajorBlunder(rookHang, blunder!);
    expect(correction).not.toBeNull();
    expect(correction?.move.uci()).not.toBe("g8g6");
    expect(correction!.remainingLoss).toBeLessThan(160);
  });

  it("confirms final position was a stalemate, NOT a defensive win", () => {
    const finalBoard = Board.fromFEN("8/8/8/8/8/2Q5/4Q1P1/1k5K b - - 0 61");
    expect(finalBoard.isStalemate()).toBe(true);
    expect(finalBoard.isCheckmate()).toBe(false);
    expect(finalBoard.legalMoves()).toHaveLength(0);
  });

  it("does not veto a direct checkmate for a material heuristic", () => {
    const mate = Board.fromFEN("6k1/5ppp/8/8/8/6Q1/5PPP/6K1 w - - 0 1");
    const mating = mate.legalMoves().find((move) => move.uci() === "g3b8");
    expect(mating).toBeDefined();
    expect(mate.makeMove(mating!).isCheckmate()).toBe(true);
    expect(avoidImmediateMajorBlunder(mate, mating!)).toBeNull();
  });
});
