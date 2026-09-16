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
});
