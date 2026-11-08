import { describe, expect, it } from "vitest";
import { Board, SwiftEngine } from "../src";

/** Independently locate each king on the squares, then compare check status. */
function verifyKingChecks(board: Board) {
  for (const color of ["w", "b"] as const) {
    let square = -1;
    for (let i = 0; i < 64; i++) if (board.pieceAt(i) === `${color}k`) square = i;
    const enemy = color === "w" ? "b" : "w";
    expect(board.isInCheck(color), `King tracking mismatch: ${board.toFEN()} (${color})`)
      .toBe(square >= 0 && board.isSquareAttacked(square, enemy));
  }
}

function replay(fen: string, moves: string[]) {
  let board = Board.fromFEN(fen);
  verifyKingChecks(board);
  for (const uci of moves) {
    const legal = board.legalMoves().find((move) => move.uci() === uci);
    expect(legal, `Illegal fixture move ${uci} in ${board.toFEN()}`).toBeDefined();
    board = board.makeMove(legal!);
    verifyKingChecks(board);
    expect(board.toFEN().split(" ")[0]).toBeTruthy();
  }
  return board;
}

describe("cached king locations and search legality", () => {
  it("tracks both kings over the first 60 plies of Swift's 2050 pilot game #1", () => {
    // Source: completed Swift 2050 pilot, game 1, 14 October 2026.
    const moves = [
      "g1f3","d7d5","c2c4","e7e6","c4d5","e6d5","b1c3","g8f6",
      "d1a4","c8d7","a4b3","a7a6","c3d5","b8c6","d5f6","g7f6",
      "b3b7","f8b4","a2a3","a8a7","b7b4","c6b4","a3b4","a7b7",
      "a1a6","b7b6","a6b6","c7b6","d2d4","d8a8","e2e3","h8g8",
      "h2h4","a8a2","h4h5","e8f8","f1d3","g8g2","d3h7","a2c4",
      "c1d2","d7b5","e1d1","g2f2","h1h3","c4f1","d1c2","f1h3",
      "h7e4","b5a4","c2b1","f2f3","e4f3","h3h2","d2c3","h2c2",
      "b1a1","a4b3","c3d2","c2d3",
    ];
    const end = replay(Board.start().toFEN(), moves);
    expect(end.turn()).toBe("w");
  });

  it("tracks king moves and castling without changing legal options", () => {
    const position = Board.fromFEN("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const kingside = position.legalMoves().find((m) => m.uci() === "e1g1");
    expect(kingside?.castle).toBe(true);
    const after = position.makeMove(kingside!);
    verifyKingChecks(after);
    expect(after.pieceAt("g1")).toBe("wk");
    expect(after.pieceAt("f1")).toBe("wr");
    const blackCastle = after.legalMoves().find((m) => m.uci() === "e8c8");
    expect(blackCastle?.castle).toBe(true);
    verifyKingChecks(after.makeMove(blackCastle!));
  });

  it("preserves cached locations across null moves, captures, promotions and FEN reloads", () => {
    const initial = Board.fromFEN("k5rr/5P2/8/8/8/8/8/K7 w - - 0 1");
    const promote = initial.legalMoves().find((m) => m.uci() === "f7g8q");
    expect(promote).toBeDefined();
    const promoted = initial.makeMove(promote!);
    verifyKingChecks(promoted);
    verifyKingChecks(promoted.makeNullMove());
    verifyKingChecks(Board.fromFEN(promoted.toFEN()));
  });

  it("keeps deterministic full-width search decisions and benchmark legality", () => {
    const board = Board.fromFEN("6k1/5ppp/8/8/8/6Q1/5PPP/6K1 w - - 0 1");
    const result = new SwiftEngine().search(board, { depth: 3 });
    expect(result.move?.uci()).toBe("g3b8");
    expect(result.score).toBeGreaterThan(90_000);
  });
});
