import { describe, expect, it } from "vitest";
import { Board } from "../src/chess/board";

const moves = (board: Board) => board.legalMoves().map((move) => move.uci()).sort();

describe("Swift chess foundation", () => {
  it("loads the standard starting position", () => {
    const board = Board.start();
    expect(board.toFEN()).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(board.legalMoves()).toHaveLength(20);
  });
  it("generates opening moves", () => { expect(moves(Board.start())).toContain("e2e4"); expect(moves(Board.start())).toContain("g1f3"); });
  it("allows both castling directions when clear", () => {
    const board = Board.fromFEN("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(moves(board)).toContain("e1c1"); expect(moves(board)).toContain("e1g1");
  });
  it("handles en passant", () => { expect(moves(Board.fromFEN("8/8/8/3pP3/8/8/8/8 w - d6 0 1"))).toContain("e5d6"); });
  it("handles promotion without discarding other legal king moves", () => {
    const result = moves(Board.fromFEN("8/P7/8/8/8/8/7k/4K3 w - - 0 1"));
    expect(result).toHaveLength(9);
    expect(result).toEqual(expect.arrayContaining(["a7a8b", "a7a8n", "a7a8q", "a7a8r"]));
    expect(result).toEqual(expect.arrayContaining(["e1d1", "e1d2", "e1e2", "e1f1", "e1f2"]));
  });
  it("rejects a pinned rook move", () => {
    expect(moves(Board.fromFEN("4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1"))).not.toContain("e2a2");
  });
});
