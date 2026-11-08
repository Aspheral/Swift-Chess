import { describe, expect, it } from "vitest";
import { Board, SwiftEngine } from "../src";

function uci(moves: ReturnType<Board["legalMoves"]>): string[] {
  return moves.map((move) => move.uci()).sort();
}

function compareTactics(board: Board): void {
  const all = board.legalMoves();
  const expected = all.filter((move) =>
    move.enPassant || !!move.promotion || board.pieceAt(move.to) !== null);
  const actual = board.legalTactics();
  expect(uci(actual.moves), board.toFEN()).toEqual(uci(expected));
  expect(actual.hasLegalMove, board.toFEN()).toBe(all.length > 0);
}

describe("quiescence tactical legality", () => {
  it("matches legal captures/promotions at every position in a real Stockfish-2050 game", () => {
    const played = [
      "g1f3","d7d5","c2c4","e7e6","c4d5","e6d5","b1c3","g8f6",
      "d1a4","c8d7","a4b3","a7a6","c3d5","b8c6","d5f6","g7f6",
      "b3b7","f8b4","a2a3","a8a7","b7b4","c6b4","a3b4","a7b7",
      "a1a6","b7b6","a6b6","c7b6","d2d4","d8a8","e2e3","h8g8",
      "h2h4","a8a2","h4h5","e8f8","f1d3","g8g2","d3h7","a2c4",
      "c1d2","d7b5","e1d1","g2f2","h1h3","c4f1","d1c2","f1h3",
      "h7e4","b5a4","c2b1","f2f3","e4f3","h3h2","d2c3","h2c2",
      "b1a1","a4b3","c3d2","c2d3","d2e1","d3a6","a1b1","a6a2",
      "b1c1","a2a1","c1d2","a1b2","d2d3","b2c2",
    ];
    let board = Board.start();
    for (const encoded of played) {
      compareTactics(board);
      const move = board.legalMoves().find((entry) => entry.uci() === encoded);
      expect(move, board.toFEN()).toBeDefined();
      board = board.makeMove(move!);
    }
    compareTactics(board);
  });

  it("handles captures of pinned pieces, en passant, and all promotions", () => {
    for (const fen of [
      "4r1k1/8/8/8/8/8/2p1R3/4K3 w - - 0 1",
      "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1",
      "4k3/P7/8/8/8/8/8/4K3 w - - 0 1",
      "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
      "7k/6Q1/5K2/8/8/8/8/8 b - - 0 1",
    ]) compareTactics(Board.fromFEN(fen));

    const pinned = Board.fromFEN("4r1k1/8/8/8/8/8/2p1R3/4K3 w - - 0 1");
    expect(uci(pinned.legalTactics().moves)).not.toContain("e2c2");
    const enPassant = Board.fromFEN("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
    expect(uci(enPassant.legalTactics().moves)).toContain("e5d6");
    const promotion = Board.fromFEN("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    expect(uci(promotion.legalTactics().moves).filter((s) => s.startsWith("a7a8")))
      .toEqual(["a7a8b", "a7a8n", "a7a8q", "a7a8r"]);
  });

  it("keeps stalemate and checkmate distinct at the quiescence boundary", () => {
    const search = new SwiftEngine() as unknown as {
      quiescence(board: Board, alpha: number, beta: number, ply: number): number;
    };
    const stalemate = Board.fromFEN("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(stalemate.isStalemate()).toBe(true);
    expect(search.quiescence(stalemate, -1000000, 1000000, 4)).toBe(0);

    const mate = Board.fromFEN("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1");
    expect(mate.isCheckmate()).toBe(true);
    expect(search.quiescence(mate, -1000000, 1000000, 4)).toBe(-99996);
  });

  it("still searches quiet legal evasions when the side is in check", () => {
    const board = Board.fromFEN("7k/8/8/8/8/7Q/8/K7 b - - 0 1");
    expect(board.isInCheck("b")).toBe(true);
    expect(board.legalMoves().some((move) => move.uci() === "h8g8")).toBe(true);
    const search = new SwiftEngine() as unknown as {
      quiescence(board: Board, alpha: number, beta: number, ply: number): number;
    };
    expect(search.quiescence(board, -1000000, 1000000, 4)).toBeGreaterThan(-99000);
  });
});
