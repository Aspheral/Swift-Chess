import { describe, expect, it } from "vitest";
import {
  Board,
  CandidateScore,
  generateIdeas,
  selectHumanMove,
  SwiftMind,
  SwiftMindSnapshot,
} from "../src";
import type { ChessIdea } from "../src";

const quietProfile = {
  tacticalPressure: 0.04,
  practicalPressure: 0.08,
  gameStage: "opening" as const,
};

function ideas(board: Board, entries: Array<[ChessIdea["kind"], number]>): ReturnType<typeof generateIdeas> {
  const generation = generateIdeas(board);
  generation.ideas = entries.map(([kind, priority]) => ({
    kind,
    priority,
    reason: `Test ${kind} plan`,
    candidates: board.legalMoves().slice(0, 2),
  }));
  return generation;
}

function snapshot(plan: SwiftMindSnapshot["plan"], confidence = 0.8, planAge = 3): SwiftMindSnapshot {
  return {
    plan,
    planAge,
    confidence,
    concern: "No urgent defect dominates the position.",
    opponent: { aggression: 0, exchangeSeeking: 0, pawnActivity: 0, observedMoves: 0 },
    observedHistoryLength: 0,
  };
}

describe("Swift persistent mind", () => {
  it("keeps a viable plan instead of resetting every turn", () => {
    const board = Board.start();
    const mind = new SwiftMind();

    const first = mind.observe(board, ideas(board, [["develop", 60], ["attack", 55]]), quietProfile, []);
    expect(first.plan).toBe("develop");

    const second = mind.observe(board, ideas(board, [["attack", 63], ["develop", 60]]), quietProfile, []);
    expect(second.plan).toBe("develop");
    expect(second.planAge).toBeGreaterThan(first.planAge);
    expect(second.confidence).toBeGreaterThan(first.confidence);
  });

  it("abandons a plan when a much stronger new idea appears", () => {
    const board = Board.start();
    const mind = new SwiftMind();

    mind.observe(board, ideas(board, [["develop", 60], ["attack", 50]]), quietProfile, []);
    const changed = mind.observe(board, ideas(board, [["attack", 100], ["develop", 45]]), quietProfile, []);

    expect(changed.plan).toBe("attack");
    expect(changed.planAge).toBe(1);
  });

  it("lets game history meaningfully change an otherwise equal choice", () => {
    const board = Board.start();
    const e4 = board.legalMoves().find((move) => move.uci() === "e2e4");
    const d4 = board.legalMoves().find((move) => move.uci() === "d2d4");
    if (!e4 || !d4) throw new Error("Expected central pawn moves");

    const attack: CandidateScore = {
      move: e4,
      score: 100,
      ideaKinds: ["attack"],
      reasons: ["continue pressure"],
    };
    const simplify: CandidateScore = {
      move: d4,
      score: 100,
      ideaKinds: ["simplify"],
      reasons: ["reduce complexity"],
    };

    const attackingMind = selectHumanMove(board, {
      candidates: [simplify, attack],
      candidateLimit: 2,
      randomness: 0,
      errorBudget: 0,
      mind: snapshot("attack"),
      initiative: 0,
      simplification: 0,
    });
    const simplifyingMind = selectHumanMove(board, {
      candidates: [attack, simplify],
      candidateLimit: 2,
      randomness: 0,
      errorBudget: 0,
      mind: snapshot("simplify"),
      initiative: 0,
      simplification: 0,
    });

    expect(attackingMind.move?.uci()).toBe(e4.uci());
    expect(simplifyingMind.move?.uci()).toBe(d4.uci());
  });

  it("builds a lightweight opponent model from recent play", () => {
    const history = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"];
    let board = Board.start();
    for (const uci of history) {
      const move = board.legalMoves().find((candidate) => candidate.uci() === uci);
      if (!move) throw new Error(`Illegal fixture move: ${uci}`);
      board = board.makeMove(move);
    }

    const mind = new SwiftMind();
    const state = mind.observe(board, generateIdeas(board), quietProfile, history);

    expect(state.opponent.observedMoves).toBe(3);
    expect(state.opponent.pawnActivity).toBeGreaterThan(0.5);
    expect(state.opponent.aggression).toBe(0);
  });

  it("remembers the reason for the move it chose", () => {
    const mind = new SwiftMind();
    const state = mind.recordDecision("e2e4", "Claim space and keep development flexible.");

    expect(state.lastMove).toBe("e2e4");
    expect(state.lastReason).toContain("Claim space");
  });
});
