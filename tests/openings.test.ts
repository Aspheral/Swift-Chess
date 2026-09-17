import { describe, expect, it } from "vitest";
import { Board, openingBookMove } from "../src";

function play(board: Board, moves: string[]): Board {
  return moves.reduce((current, uci) => {
    const move = current.legalMoves().find((candidate) => candidate.uci() === uci);
    if (!move) throw new Error(`Illegal fixture move: ${uci}`);
    return current.makeMove(move);
  }, board);
}

describe("Swift human opening repertoire", () => {
  it("recognizes the Reti path", () => {
    const board = play(Board.start(), ["g1f3"]);
    expect(openingBookMove(board, 1)?.move.uci()).toBe("d7d5");
    expect(openingBookMove(board, 1)?.opening).toBe("Reti");
  });

  it("chooses between the Queen's Gambit branches like a repertoire", () => {
    const board = play(Board.start(), ["d2d4", "d7d5", "c2c4"]);
    const choice = openingBookMove(board, 7);
    expect(["d5c4", "e7e6"]).toContain(choice?.move.uci());
  });

  it("recognizes the Queen's Gambit Declined continuation", () => {
    const board = play(Board.start(), ["d2d4", "d7d5", "c2c4", "e7e6"]);
    expect(openingBookMove(board, 1)?.move.uci()).toBe("g1f3");
    expect(openingBookMove(board, 1)?.opening).toBe("Queen's Gambit Declined");
  });

  it("follows Four Knights after 1.e4 e5 2.Nf3 Nc6", () => {
    const board = play(Board.start(), ["e2e4", "e7e5", "g1f3", "b8c6"]);
    expect(openingBookMove(board, 1)?.move.uci()).toBe("b1c3");
    expect(openingBookMove(board, 1)?.opening).toBe("Four Knights");
  });

  it("follows the Bishop's Opening after 1.e4 e5 2.Bc4", () => {
    const board = play(Board.start(), ["e2e4", "e7e5", "f1c4"]);
    expect(openingBookMove(board, 1)?.move.uci()).toBe("g8f6");
    expect(openingBookMove(board, 1)?.opening).toBe("Bishop's Opening");
  });
});
