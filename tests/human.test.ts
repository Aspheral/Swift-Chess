import { describe, expect, it } from "vitest";
import { Board, CandidateScore, HumanSwiftEngine, humanErrorProfile, selectHumanMove } from "../src";

describe("Swift human move selection", () => {
  it("returns a legal move", () => {
    const board = Board.start();
    const result = selectHumanMove(board, { randomness: 0 });
    expect(result.move).not.toBeNull();
    expect(board.legalMoves().some((move) => move.uci() === result.move?.uci())).toBe(true);
  });

  it("respects the candidate limit", () => {
    const result = selectHumanMove(Board.start(), { candidateLimit: 3, randomness: 0 });
    expect(result.candidates.length).toBeLessThanOrEqual(3);
  });

  it("returns no move for a checkmated position", () => {
    const board = Board.fromFEN("7k/5Q2/7K/8/8/8/8/8 b - - 0 1");
    const result = selectHumanMove(board);
    expect(result.move).toBeNull();
    expect(result.candidates).toHaveLength(0);
  });

  it("keeps an immediate mate in the human candidate set", () => {
    const board = Board.fromFEN("6k1/6Q1/5K2/8/8/8/8/8 w - - 0 1");
    const result = selectHumanMove(board, { randomness: 0, candidateLimit: 8 });
    expect(result.move).not.toBeNull();
    expect(result.candidates.some((candidate) => board.makeMove(candidate.move).isCheckmate())).toBe(true);
  });

  it("reproduces the same choice from the same seed", () => {
    const board = Board.start();
    const first = selectHumanMove(board, { candidateLimit: 6, randomness: 1, errorBudget: 0.5, seed: 42 });
    const second = selectHumanMove(board, { candidateLimit: 6, randomness: 1, errorBudget: 0.5, seed: 42 });
    expect(first.move?.uci()).toBe(second.move?.uci());
  });

  it("reports more decision latitude in a quiet complex position than under tactical pressure", () => {
    const quiet = Board.fromFEN("8/8/3k4/8/2K5/8/8/8 w - - 0 1");
    const tactical = Board.fromFEN("6k1/6Q1/5K2/8/8/8/8/8 w - - 0 1");
    const quietProfile = humanErrorProfile(quiet, 0.5);
    const tacticalProfile = humanErrorProfile(tactical, 0.5);
    expect(quietProfile.effectiveBudget).toBeGreaterThan(tacticalProfile.effectiveBudget);
    expect(tacticalProfile.tacticalPressure).toBeGreaterThan(quietProfile.tacticalPressure);
  });

  it("exposes position factors with every human selection", () => {
    const result = selectHumanMove(Board.start(), { randomness: 0, seed: 7 });
    expect(result.profile).toBeDefined();
    expect(result.profile?.effectiveBudget).toBeGreaterThanOrEqual(0);
    expect(result.profile?.effectiveBudget).toBeLessThanOrEqual(1);
  });

  it("changes practical preferences without changing tactical candidates", () => {
    const board = Board.start();
    const legal = board.legalMoves();
    const simplify: CandidateScore = { move: legal[0], score: 100, ideaKinds: ["simplify"], reasons: ["exchange"] };
    const attack: CandidateScore = { move: legal[1], score: 100, ideaKinds: ["attack"], reasons: ["initiative"] };

    const exchangeFocused = selectHumanMove(board, {
      candidates: [simplify, attack],
      candidateLimit: 2,
      randomness: 0,
      errorBudget: 0,
      initiative: 0,
      simplification: 1,
    });
    const initiativeFocused = selectHumanMove(board, {
      candidates: [simplify, attack],
      candidateLimit: 2,
      randomness: 0,
      errorBudget: 0,
      initiative: 1,
      simplification: 0,
    });

    expect(exchangeFocused.move?.uci()).toBe(simplify.move.uci());
    expect(initiativeFocused.move?.uci()).toBe(attack.move.uci());
  });

  it("returns a legal move and profile through the integrated human engine", () => {
    const board = Board.start();
    const result = new HumanSwiftEngine().search(board, { depth: 2, randomness: 0, seed: 7 });
    expect(result.move).not.toBeNull();
    expect(board.legalMoves().some((move) => move.uci() === result.move?.uci())).toBe(true);
    expect(result.humanProfile).toBeDefined();
    expect(result.humanProfile?.effectiveBudget).toBeGreaterThanOrEqual(0);
    expect(result.humanProfile?.effectiveBudget).toBeLessThanOrEqual(1);
  });
});
