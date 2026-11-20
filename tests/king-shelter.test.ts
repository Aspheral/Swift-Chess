import { describe, expect, it } from "vitest";
import { Board } from "../src";
import { quietKingShelterDebt } from "../src/chess/king-shelter";

function legal(board: Board, uci: string) {
  const move = board.legalMoves().find((item) => item.uci() === uci);
  if (!move) throw new Error("Fixture is not legal: " + uci);
  return move;
}

describe("king shelter as a positional tie-break, not an unverified veto", () => {
  it("recognizes Black pushing a pawn away from a castled king", () => {
    const board = Board.fromFEN("rnbq1rk1/ppppbppp/4pn2/8/8/4P3/PPPP1PPP/RNBQKBNR b KQ - 0 5");
    expect(quietKingShelterDebt(board, legal(board, "g7g5"))).toBeGreaterThan(3);
    expect(quietKingShelterDebt(board, legal(board, "g7g6"))).toBeGreaterThan(0);
    expect(quietKingShelterDebt(board, legal(board, "a7a6"))).toBe(0);
  });
  it("does not penalize ordinary center pawn development with an undecided king", () => {
    const board = Board.start();
    expect(quietKingShelterDebt(board, legal(board, "e2e4"))).toBe(0);
    expect(quietKingShelterDebt(board, legal(board, "g2g4"))).toBe(0);
  });
  it("recognizes White pushing a pawn away from a castled king", () => {
    const board = Board.fromFEN("4k3/8/8/8/8/8/5PPP/6K1 w - - 0 1");
    expect(quietKingShelterDebt(board, legal(board, "g2g4"))).toBeGreaterThan(3);
    expect(quietKingShelterDebt(board, legal(board, "f2f3"))).toBeGreaterThan(0);
    expect(quietKingShelterDebt(board, legal(board, "h2h3"))).toBeGreaterThan(0);
  });
  it("is neutral for captures even if a shelter pawn moves", () => {
    const board = Board.fromFEN("4k3/8/8/8/8/6p1/5PPP/6K1 w - - 0 1");
    expect(quietKingShelterDebt(board, legal(board, "h2g3"))).toBe(0);
  });
});
