import { describe, expect, it } from "vitest";
import { Board, HumanSwiftEngine } from "../src";

describe("Integrated Swift human engine", () => {
  it("never exposes a candidate that allows an immediate mate", () => {
    const board = Board.fromFEN("6k1/8/8/8/8/7q/8/6K1 w - - 0 1");
    const result = new HumanSwiftEngine().search(board, {
      depth: 2,
      safetyDepth: 2,
      randomness: 1,
      errorBudget: 1,
      candidateLimit: 8,
      seed: 17,
    });

    expect(result.move).not.toBeNull();
    for (const candidate of result.humanCandidates) {
      const child = board.makeMove(candidate.move);
      if (child.isCheckmate()) continue;
      const allowsMate = child.legalMoves().some((reply) => child.makeMove(reply).isCheckmate());
      expect(allowsMate).toBe(false);
    }
  });

  it("keeps the engine move available when safety filtering is active", () => {
    const board = Board.start();
    const engine = new HumanSwiftEngine();
    const result = engine.search(board, {
      depth: 2,
      safetyDepth: 2,
      safetyMargin: 60,
      randomness: 1,
      errorBudget: 0.5,
      candidateLimit: 8,
      seed: 23,
    });

    expect(result.move).not.toBeNull();
    expect(result.humanCandidates.some((candidate) => candidate.move.uci() === result.move?.uci())).toBe(true);
  });

  it("refuses to create a third occurrence when a non-repeating move exists", () => {
    const gameMoves = ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1"];
    let board = Board.start();
    for (const uci of gameMoves) {
      const move = board.legalMoves().find((candidate) => candidate.uci() === uci);
      if (!move) throw new Error(`Illegal fixture move: ${uci}`);
      board = board.makeMove(move);
    }

    const repeatedKey = Board.start().toFEN().split(/\s+/).slice(0, 4).join(" ");
    const result = new HumanSwiftEngine().search(board, {
      depth: 2,
      safetyDepth: 2,
      randomness: 0,
      errorBudget: 0.35,
      seed: 7,
      moveHistory: gameMoves,
      positionHistoryKeys: [repeatedKey, repeatedKey],
    });

    expect(result.move).not.toBeNull();
    const nextKey = board.makeMove(result.move!).toFEN().split(/\s+/).slice(0, 4).join(" ");
    expect(nextKey).not.toBe(repeatedKey);
  });

  it("does not send a knight back to the square it just vacated when alternatives exist", () => {
    const board = Board.fromFEN("rnbqkb1r/pppppppp/8/7n/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 2 2");
    const result = new HumanSwiftEngine().search(board, {
      depth: 2,
      safetyDepth: 2,
      randomness: 0,
      errorBudget: 0.35,
      seed: 11,
      moveHistory: ["g1f3", "g8h6"],
    });

    expect(result.move).not.toBeNull();
    expect(result.move?.uci()).not.toBe("h6g8");
  });
});
