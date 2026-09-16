import { describe, expect, it } from "vitest";
import { Board, scoreCandidates } from "../src";

describe("Swift candidate scoring", () => {
  it("keeps immediate mate at the top of the candidate list", () => {
    const board = Board.fromFEN("6k1/6Q1/5K2/8/8/8/8/8 w - - 0 1");
    const result = scoreCandidates(board);
    expect(result.scores.length).toBeGreaterThan(0);
    expect(board.makeMove(result.scores[0].move).isCheckmate()).toBe(true);
  });

  it("returns only legal moves", () => {
    const board = Board.start();
    const legal = new Set(board.legalMoves().map((move) => move.uci()));
    const result = scoreCandidates(board);
    expect(result.candidates.every((move) => legal.has(move.uci()))).toBe(true);
  });

  it("merges multiple strategic reasons for the same move", () => {
    const board = Board.start();
    const result = scoreCandidates(board);
    expect(result.scores.every((candidate) => candidate.ideaKinds.length > 0 && candidate.reasons.length > 0)).toBe(true);
  });
});
