import { describe, expect, it } from "vitest";
import { Board, generateIdeas, planProgressMetric } from "../src";
import { planOutcomeDelta } from "../src/chess/plan-evidence";

function move(board: Board, uci: string) {
  const candidate = board.legalMoves().find((m) => m.uci() === uci);
  if (!candidate) throw new Error(`Illegal fixture move: ${uci}`);
  return candidate;
}

describe("Measurable strategic plan evidence", () => {
  it("distinguishes real minor-piece development from an irrelevant pawn move", () => {
    const board = Board.start();
    const before = planProgressMetric(board, generateIdeas(board), "develop");
    const developing = planOutcomeDelta(board, move(board, "g1f3"), "develop", before);
    const unrelated = planOutcomeDelta(board, move(board, "a2a3"), "develop", before);
    expect(developing).toBeGreaterThan(0.1);
    expect(unrelated).toBeCloseTo(0);
  });

  it("does not treat a checking move as unopposed long-term progress", () => {
    const board = Board.fromFEN("6k1/8/8/8/8/8/6Q1/6K1 w - - 0 1");
    const before = planProgressMetric(board, generateIdeas(board), "create-threat");
    expect(planOutcomeDelta(board, move(board, "g2g7"), "create-threat", before)).toBe(0);
  });

  it("measures a plan without mutating the real side to move", () => {
    const board = Board.start();
    const before = planProgressMetric(board, generateIdeas(board), "develop");
    const fen = board.toFEN();
    planOutcomeDelta(board, move(board, "b1c3"), "develop", before);
    expect(board.toFEN()).toBe(fen);
    expect(board.turn()).toBe("w");
  });
});
