import { describe, expect, it } from "vitest";
import {
  Board, HumanSwiftEngine, selectHumanMove, soloPlanTieBreaks,
  visualizeSoloPlans,
} from "../src";

const choiceBoard = Board.fromFEN("6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1");
const get = (board: Board, uci: string) => {
  const move = board.legalMoves().find((candidate) => candidate.uci() === uci);
  if (!move) throw Error("Illegal fixture move: " + uci);
  return move;
};

describe("Two-track human plan vision", () => {
  it("imagines no more than five of its own legal moves and labels the opponent as absent", () => {
    const root = get(choiceBoard, "e1e3");
    const result = visualizeSoloPlans(choiceBoard, [root], {
      maxOwnMoves: 5, beamWidth: 2, maxExpansions: 120,
    });
    expect(result).toHaveLength(1);
    expect(result[0].rootMove).toBe(root.uci());
    expect(result[0].imaginedLine[0]).toBe(root.uci());
    expect(result[0].ownMovesImagined).toBeGreaterThanOrEqual(1);
    expect(result[0].ownMovesImagined).toBeLessThanOrEqual(5);
    expect(result[0].opponentUnopposed).toBe(true);
    expect(result[0].examinedMoves).toBeLessThanOrEqual(120);

    let board = choiceBoard;
    for (const [index, uci] of result[0].imaginedLine.entries()) {
      const nextMove = board.legalMoves().find((move) => move.uci() === uci);
      expect(nextMove, "Imagined step " + index + " is legal").toBeDefined();
      board = board.makeMove(nextMove!);
      if (index < result[0].imaginedLine.length - 1) {
        expect(board.isInCheck(board.turn())).toBe(false);
        board = board.makeNullMove(); // The opponent deliberately passes ONLY in the imagination.
      }
    }
  });

  it("never invents five free moves after giving check", () => {
    const check = get(choiceBoard, "e1e8");
    const imagined = visualizeSoloPlans(choiceBoard, [check]);
    expect(imagined).toHaveLength(1);
    expect(imagined[0].imaginedLine).toEqual(["e1e8"]);
    expect(imagined[0].possibleCheck).toBe(true);
  });

  it("rejects forged candidates and refuses fantasy planning when in check", () => {
    const fake = get(Board.start(), "e2e4");
    expect(visualizeSoloPlans(choiceBoard, [fake])).toEqual([]);
    const checked = Board.fromFEN("6k1/8/8/8/8/7q/8/6K1 w - - 0 1");
    expect(checked.isInCheck("w")).toBe(true);
    expect(visualizeSoloPlans(checked, checked.legalMoves())).toEqual([]);
  });

  it("respects a hard expansion limit, deterministic plan lines, and bounded alternatives", () => {
    const roots = ["e1e3", "e1e4", "e1e2"].map((uci) => get(choiceBoard, uci));
    const options = { maxOwnMoves: 5, beamWidth: 2, maxExpansions: 35 };
    const first = visualizeSoloPlans(choiceBoard, roots, options);
    const second = visualizeSoloPlans(choiceBoard, roots, options);
    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    for (const vision of first) {
      expect(vision.examinedMoves).toBeLessThanOrEqual(35);
      expect(vision.imaginedLine.length).toBeLessThanOrEqual(5);
      expect(vision.alternativeLine.length).toBeLessThanOrEqual(5);
      expect(vision.alternativeLine.length === 0 ||
        vision.alternativeLine[0] === vision.rootMove).toBe(true);
    }
    const bonuses = soloPlanTieBreaks(first);
    expect(Object.values(bonuses).every((bonus) => bonus >= 0 && bonus <= 5)).toBe(true);
  });

  it("uses imagined strategic pressure as a small tie-break ONLY for verified near-equal moves", () => {
    const board = Board.start();
    const a = get(board, "a2a3"), h = get(board, "h2h3");
    const candidates = [
      { move: a, score: 100, ideaKinds: ["develop" as const], reasons: ["same quality"] },
      { move: h, score: 100, ideaKinds: ["develop" as const], reasons: ["same quality"] },
    ];
    const base = selectHumanMove(board, { candidates, candidateLimit: 2,
      errorBudget: 0.1, randomness: 0, riskTolerance: 0, initiative: 0 });
    const vision = selectHumanMove(board, { candidates, candidateLimit: 2,
      errorBudget: 0.1, randomness: 0, riskTolerance: 0, initiative: 0,
      planVisionBonus: { h2h3: 5 } });
    expect(base.move?.uci()).toBe("a2a3");
    expect(vision.move?.uci()).toBe("h2h3");

    const bad = [{ ...candidates[0] }, { ...candidates[1], score: 60 }];
    const safe = selectHumanMove(board, { candidates: bad, candidateLimit: 2,
      errorBudget: 0.1, randomness: 0, riskTolerance: 0, initiative: 0,
      planVisionBonus: { h2h3: 100000 } });
    expect(safe.move?.uci()).toBe("a2a3");
    const strict = selectHumanMove(board, { candidates: bad, candidateLimit: 2,
      errorBudget: 0.1, randomness: 0, strictBestPlay: true,
      planVisionBonus: { h2h3: 100000 } });
    expect(strict.move?.uci()).toBe("a2a3");
  });

  it("never bypasses the opponent-aware safety layer or forced mate detection", () => {
    const board = Board.fromFEN("6k1/8/8/8/8/7q/8/6K1 w - - 0 1");
    const result = new HumanSwiftEngine().search(board, { depth: 2, safetyDepth: 2,
      tacticalSearchDepth: 0, randomness: 0, seed: 8, errorBudget: 0,
      moveHistory: Array(20).fill("fixture"), planVision: true });
    expect(result.move).not.toBeNull();
    expect(result.planVision).toBeUndefined();
    const legal = new Set(board.legalMoves().map((move) => move.uci()));
    expect(legal.has(result.move!.uci())).toBe(true);
  });
});
