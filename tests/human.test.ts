import { describe, expect, it } from "vitest";
import { Board, CandidateScore, HumanSwiftEngine, humanErrorProfile, humanPlanLatitude, selectHumanMove } from "../src";
import type { SwiftMindSnapshot } from "../src";

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

  it("preserves different strategic ideas in a small candidate menu", () => {
    const board = Board.start();
    const legal = board.legalMoves();
    const candidates: CandidateScore[] = legal.slice(0, 4).map((move, index) => ({
      move,
      score: 100 - index,
      ideaKinds: index === 0 ? ["develop"] : index === 1 ? ["attack"] : index === 2 ? ["simplify"] : ["pawn-break"],
      reasons: ["test"],
    }));

    const result = selectHumanMove(board, {
      candidates,
      candidateLimit: 3,
      randomness: 0,
      errorBudget: 1,
    });

    expect(result.candidates).toHaveLength(3);
    expect(new Set(result.candidates.map((candidate) => candidate.ideaKinds[0])).size).toBeGreaterThan(1);
  });


  it("re-ranks safety-scored candidates before applying human style", () => {
    const board = Board.start();
    const e4 = board.legalMoves().find((move) => move.uci() === "e2e4");
    const a3 = board.legalMoves().find((move) => move.uci() === "a2a3");
    if (!e4 || !a3) throw new Error("Expected fixture moves");

    const weaker: CandidateScore = { move: a3, score: 20, ideaKinds: ["develop"], reasons: ["test"] };
    const stronger: CandidateScore = { move: e4, score: 100, ideaKinds: ["attack"], reasons: ["test"] };
    const result = selectHumanMove(board, {
      candidates: [weaker, stronger],
      candidateLimit: 2,
      randomness: 0,
      errorBudget: 0,
      initiative: 0,
      development: 1,
    });

    expect(result.candidates[0].move.uci()).toBe(e4.uci());
    expect(result.move?.uci()).toBe(e4.uci());
  });


  it("lets a mature plan choose a calm near-equal move for a coherent reason", () => {
    const board = Board.start();
    const e4 = board.legalMoves().find((move) => move.uci() === "e2e4");
    const d4 = board.legalMoves().find((move) => move.uci() === "d2d4");
    if (!e4 || !d4) throw new Error("Expected central pawn moves");

    const mind: SwiftMindSnapshot = {
      plan: "attack",
      planAge: 5,
      confidence: 0.9,
      setbacks: 0,
      concern: "No urgent defect dominates the position.",
      opponent: { aggression: 0, exchangeSeeking: 0, pawnActivity: 0, observedMoves: 4 },
      observedHistoryLength: 8,
    };
    const engineFavorite: CandidateScore = {
      move: d4,
      score: 100,
      ideaKinds: ["simplify"],
      reasons: ["slightly higher concrete score"],
    };
    const planMove: CandidateScore = {
      move: e4,
      score: 96,
      ideaKinds: ["attack"],
      reasons: ["continue the attacking plan"],
    };

    const result = selectHumanMove(board, {
      candidates: [engineFavorite, planMove],
      candidateLimit: 2,
      randomness: 0,
      errorBudget: 0,
      initiative: 0,
      simplification: 0,
      mind,
    });

    expect(result.move?.uci()).toBe(e4.uci());
  });

  it("removes plan latitude when the position becomes tactically dangerous", () => {
    const calm = {
      complexity: 0.5,
      tacticalPressure: 0,
      phase: 0.4,
      practicalPressure: 0,
      gameStage: "middlegame" as const,
      effectiveBudget: 0,
    };
    const mind: SwiftMindSnapshot = {
      plan: "attack",
      planAge: 5,
      confidence: 0.9,
      setbacks: 0,
      concern: "No urgent defect dominates the position.",
      opponent: { aggression: 0, exchangeSeeking: 0, pawnActivity: 0, observedMoves: 4 },
      observedHistoryLength: 8,
    };

    expect(humanPlanLatitude(mind, calm)).toBeGreaterThan(4);
    expect(humanPlanLatitude(mind, calm)).toBeLessThanOrEqual(6);
    expect(humanPlanLatitude(mind, { ...calm, tacticalPressure: 0.06 })).toBe(0);
    expect(humanPlanLatitude({ ...mind, setbacks: 1 }, calm)).toBe(0);
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

  it("classifies positions into opening, middlegame, and endgame flow stages", () => {
    const opening = humanErrorProfile(Board.start());
    const middlegame = humanErrorProfile(Board.fromFEN("4k3/pppp4/8/8/8/8/PPPP4/4K3 w - - 0 1"));
    const endgame = humanErrorProfile(Board.fromFEN("4k3/8/8/8/8/8/8/4K3 w - - 0 1"));

    expect(opening.gameStage).toBe("opening");
    expect(middlegame.gameStage).toBe("middlegame");
    expect(endgame.gameStage).toBe("endgame");
  });

  it("gives middlegame pawn breaks a practical preference", () => {
    const board = Board.fromFEN("4k3/pppp4/8/8/8/8/PPPP4/4K3 w - - 0 1");
    const pawnMoves = board.legalMoves().filter((move) => board.pieceAt(move.from)?.[1] === "p");
    const pawnBreak: CandidateScore = { move: pawnMoves[0], score: 100, ideaKinds: ["pawn-break"], reasons: ["challenge the structure"] };
    const quiet: CandidateScore = { move: pawnMoves[1], score: 100, ideaKinds: ["improve-piece"], reasons: ["improve"] };

    const result = selectHumanMove(board, {
      candidates: [quiet, pawnBreak],
      candidateLimit: 2,
      randomness: 0,
      errorBudget: 0,
      pawnBreaks: 1,
    });

    expect(result.profile?.gameStage).toBe("middlegame");
    expect(result.move?.uci()).toBe(pawnBreak.move.uci());
  });

  it("exposes position factors with every human selection", () => {
    const result = selectHumanMove(Board.start(), { randomness: 0, seed: 7 });
    expect(result.profile).toBeDefined();
    expect(result.profile?.effectiveBudget).toBeGreaterThanOrEqual(0);
    expect(result.profile?.effectiveBudget).toBeLessThanOrEqual(1);
  });

  it("changes practical preferences without changing tactical candidates", () => {
    const board = Board.start();
    const e4 = board.legalMoves().find((move) => move.uci() === "e2e4");
    const d4 = board.legalMoves().find((move) => move.uci() === "d2d4");
    if (!e4 || !d4) throw new Error("Expected central pawn moves in the starting position");

    const simplify: CandidateScore = { move: d4, score: 100, ideaKinds: ["simplify"], reasons: ["exchange"] };
    const attack: CandidateScore = { move: e4, score: 100, ideaKinds: ["attack"], reasons: ["initiative"] };

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
