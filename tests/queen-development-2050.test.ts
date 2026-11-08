import { describe, expect, it } from "vitest";
import { Board, SwiftEngine } from "../src";

const evaluation = new SwiftEngine();

function find(board: Board, uci: string) {
  const move = board.legalMoves().find((candidate) => candidate.uci() === uci);
  expect(move, `Missing ${uci} in ${board.toFEN()}`).toBeDefined();
  return move!;
}

describe("2050-game strategic queen development", () => {
  it("prices a risky early deep queen raid while multiple minor pieces remain home", () => {
    // Same pieces, same material, and same side to move. One queen is on b3
    // and the other is on the opponent's seventh rank.
    const quiet = Board.fromFEN("rnbqkbnr/p1pppppp/8/8/8/1Q6/PPPPPPPP/RNB1KBNR w KQkq - 0 1");
    const raid = Board.fromFEN("rnbqkbnr/pQpppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1");
    expect(evaluation.evaluate(quiet) - evaluation.evaluate(raid)).toBeGreaterThan(110);
  });

  it("does not punish a deep queen once the minor pieces have developed", () => {
    const quiet = Board.fromFEN("rnbqkbnr/p1pppppp/8/8/1B4B1/1QN2N2/PPPPPPPP/R3K2R w KQkq - 0 1");
    const raid = Board.fromFEN("rnbqkbnr/pQpppppp/8/8/1B4B1/2N2N2/PPPPPPPP/R3K2R w KQkq - 0 1");
    expect(Math.abs(evaluation.evaluate(quiet) - evaluation.evaluate(raid))).toBeLessThan(30);
  });

  it("does not restrain queen activity in a simplified endgame", () => {
    const quiet = Board.fromFEN("6k1/8/8/8/8/1Q6/8/6K1 w - - 0 1");
    const raid = Board.fromFEN("6k1/1Q6/8/8/8/8/8/6K1 w - - 0 1");
    expect(Math.abs(evaluation.evaluate(quiet) - evaluation.evaluate(raid))).toBeLessThan(30);
  });

  it("recognizes the strategic cost of 9.Qxb7 in Swift's first 2050 game", () => {
    let board = Board.start();
    const history = [
      "g1f3","d7d5","c2c4","e7e6",
      "c4d5","e6d5","b1c3","g8f6",
      "d1a4","c8d7","a4b3","a7a6",
      "c3d5","b8c6","d5f6","g7f6",
    ];
    for (const uci of history) board = board.makeMove(find(board, uci));
    const earlyRaid = -evaluation.evaluate(board.makeMove(find(board, "b3b7")));
    const develop = -evaluation.evaluate(board.makeMove(find(board, "e2e3")));
    expect(develop).toBeGreaterThan(earlyRaid);
  });
});
