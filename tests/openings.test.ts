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
  it("starts from Swift's preferred opening without changing identity by seed", () => {
    const choices = [1, 7, 17].map((seed) => openingBookMove(Board.start(), seed, []));
    for (const choice of choices) {
      expect(choice?.move.uci()).toBe("g1f3");
      expect(choice?.opening).toBe("Reti");
    }
  });

  it("recognizes the Reti path", () => {
    const history = ["g1f3"];
    const board = play(Board.start(), history);
    expect(["d7d5", "g8f6"]).toContain(openingBookMove(board, 1, history)?.move.uci());
    expect(openingBookMove(board, 1, history)?.opening).toBe("Reti");
  });

  it("keeps a natural Reti development after a harmless knight-first deviation", () => {
    const history = ["g1f3", "d7d5", "b1c3"];
    const board = play(Board.start(), history);
    expect(openingBookMove(board, 1, history)?.move.uci()).toBe("g8f6");
    expect(openingBookMove(board, 1, history)?.opening).toBe("Reti");
  });

  it("keeps a stable Queen's Gambit preference instead of seed-driven branching", () => {
    const history = ["d2d4", "d7d5", "c2c4"];
    const board = play(Board.start(), history);
    const choices = [1, 7, 17].map((seed) => openingBookMove(board, seed, history));
    for (const choice of choices) {
      expect(choice?.move.uci()).toBe("e7e6");
      expect(choice?.opening).toBe("Queen's Gambit Declined");
    }
  });

  it("recognizes the Queen's Gambit Declined continuation", () => {
    const history = ["d2d4", "d7d5", "c2c4", "e7e6"];
    const board = play(Board.start(), history);
    expect(["g1f3", "b1c3", "c1g5"]).toContain(openingBookMove(board, 1, history)?.move.uci());
    expect(openingBookMove(board, 1, history)?.opening).toBe("Queen's Gambit Declined");
  });

  it("follows Four Knights after 1.e4 e5 2.Nf3 Nc6", () => {
    const history = ["e2e4", "e7e5", "g1f3", "b8c6"];
    const board = play(Board.start(), history);
    expect(["b1c3", "f1b5", "f1c4"]).toContain(openingBookMove(board, 1, history)?.move.uci());
    expect(openingBookMove(board, 1, history)?.opening).toBe("Four Knights");
  });

  it("follows the Bishop's Opening after 1.e4 e5 2.Bc4", () => {
    const history = ["e2e4", "e7e5", "f1c4"];
    const board = play(Board.start(), history);
    expect(openingBookMove(board, 1, history)?.move.uci()).toBe("g8f6");
    expect(openingBookMove(board, 1, history)?.opening).toBe("Bishop's Opening");
  });

  it("hands unfamiliar opening positions to strategic reasoning instead of a generic setup", () => {
    const history = ["g1f3", "d7d5", "c2c4", "h7h5"];
    const board = play(Board.start(), history);
    expect(openingBookMove(board, 1, history)).toBeNull();
  });

  it("hands the game to strategic reasoning after four familiar moves", () => {
    const history = ["g1f3", "d7d5", "c2c4", "e7e6", "g2g3", "g8f6", "f1g2", "f8e7"];
    const board = play(Board.start(), history);
    expect(openingBookMove(board, 1, history)).toBeNull();
  });
});
