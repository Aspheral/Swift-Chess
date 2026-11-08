import { describe, expect, it } from "vitest";
import { Board } from "../src/chess/board";
import { immediateMajorPieceLoss, safeProvisionalMove } from "../src/chess/blunder-guard";

// Position after 31...Ne7 in SwiftChessTV vs jovenciomiasco, 2026-10-29.
// The queen on b7 must not go to b8 while Black's rook is on h8.
const board = Board.fromFEN(
  "7r/1QB1n2k/p2pPb2/4p1p1/4P1p1/5pPq/PPP2P2/R4RK1 w - - 0 32",
);

describe("2026-10-29 Qb8 queen-for-rook blunder", () => {
  const queenHang = board.legalMoves().find((move) => move.uci() === "b7b8");

  it("recognizes 32...Rxb8 as a legal queen capture with no adequate exchange", () => {
    expect(queenHang).toBeDefined();
    const next = board.makeMove(queenHang!);
    const rookCapture = next.legalMoves().find((move) => move.uci() === "h8b8");
    expect(rookCapture).toBeDefined();
    expect(next.makeMove(rookCapture!).legalMoves().some((move) => move.uci() === "c7b8")).toBe(true);
    expect(immediateMajorPieceLoss(board, queenHang!)).toBeGreaterThanOrEqual(350);
  });

  it("will not offer Qb8 as a provisional move", () => {
    const fallback = safeProvisionalMove(board, queenHang!, 2);
    expect(fallback).not.toBeNull();
    expect(fallback?.uci()).not.toBe("b7b8");
    expect(immediateMajorPieceLoss(board, fallback!)).toBeLessThan(160);
  });

  it("never offers the arbitrary legal-first move from a zero-depth search", () => {
    expect(safeProvisionalMove(board, queenHang!, 0)).toBeNull();
  });
});
