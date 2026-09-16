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
  it("handles promotion", () => {
    expect(moves(Board.fromFEN("8/P7/8/8/8/8/7k/4K3 w - - 0 1"))).toEqual(["a7a8=B","a7a8=N","a7a8=Q","a7a8=R"]);
  });
  it("rejects a pinned rook move", () => {
    expect(moves(Board.fromFEN("4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1"))).not.toContain("e2a2");
  });
});
