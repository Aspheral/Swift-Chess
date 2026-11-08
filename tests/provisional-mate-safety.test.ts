import { describe, expect, it } from "vitest";
import { Board } from "../src";
import { safeEmergencyProvisional } from "../src/chess/provisional-safety";

function legal(board: Board, uci: string) {
  const move = board.legalMoves().find((candidate) => candidate.uci() === uci);
  if (!move) throw new Error(`Expected legal move: ${uci}`);
  return move;
}

describe("safe browser-worker emergency fallback", () => {
  it("permits a calm legal opening move after completing the defensive proof", () => {
    const board = Board.start();
    expect(safeEmergencyProvisional(board, legal(board, "e2e4"))).toBe(true);
  });

  it("never publishes a root move hanging mate in one", () => {
    const board = Board.fromFEN("1k4r1/8/8/6q1/8/8/5PPP/R6K w - - 0 1");
    expect(safeEmergencyProvisional(board, legal(board, "a1a2"))).toBe(false);
  });

  it("never publishes a root move hanging forced checking mate in two", () => {
    const board = Board.fromFEN("5r1k/p5pp/8/3Q2N1/2B5/8/8/K7 b - - 0 1");
    expect(safeEmergencyProvisional(board, legal(board, "a7a6"))).toBe(false);
  });

  it("never publishes a root move hanging forced checking mate in three", () => {
    const board = Board.fromFEN("8/7p/8/2N5/8/2k1N3/Q3r2q/K7 b - - 0 1");
    expect(safeEmergencyProvisional(board, legal(board, "h7h6"))).toBe(false);
  });

  it("rejects forged or stale moves not legal from this board", () => {
    const board = Board.start();
    // The same UCI move cannot be used after another turn's state change.
    const stale = legal(board, "e2e4");
    expect(safeEmergencyProvisional(board.makeMove(stale), stale)).toBe(false);
  });
});
