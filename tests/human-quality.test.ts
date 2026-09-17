import { describe, expect, it } from "vitest";
import { Board, CandidateScore, selectHumanMove } from "../src";

describe("Human move quality distribution", () => {
  it("keeps the selected move inside the configured quality budget", () => {
    const board = Board.start();
    const legal = board.legalMoves();
    const candidates: CandidateScore[] = legal.slice(0, 4).map((move, index) => ({
      move,
      score: 100 - index * 20,
      ideaKinds: [index % 2 === 0 ? "develop" : "attack"],
      reasons: ["test candidate"],
    }));

    const result = selectHumanMove(board, {
      candidates,
      candidateLimit: 4,
      errorBudget: 0.25,
      randomness: 1,
      seed: 9,
    });

    const selected = candidates.find((candidate) => candidate.move.uci() === result.move?.uci());
    expect(selected?.score).toBeGreaterThanOrEqual(80);
  });

  it("uses the strongest candidate when there is no error budget", () => {
    const board = Board.start();
    const legal = board.legalMoves();
    const candidates: CandidateScore[] = [
      { move: legal[0], score: 120, ideaKinds: ["develop"], reasons: ["best"] },
      { move: legal[1], score: 90, ideaKinds: ["attack"], reasons: ["inferior"] },
    ];

    const result = selectHumanMove(board, {
      candidates,
      candidateLimit: 2,
      errorBudget: 0,
      randomness: 0,
    });

    expect(result.move?.uci()).toBe(legal[0].uci());
  });
});
