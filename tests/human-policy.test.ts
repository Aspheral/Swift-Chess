import { describe, expect, it } from "vitest";
import { Board, type CandidateScore, selectHumanMove } from "../src";
import {
  encodeHumanPolicyMove,
  humanPolicyBonuses,
  validateHumanPolicyModel,
  type HumanPolicyModel,
} from "../src/chess/human-policy";

function oneMovePreference(): HumanPolicyModel {
  const row = new Array<number>(925).fill(0);
  row[832 + 28] = 127; // candidate destination e4, from white's perspective
  return {
    schema: "swift-human-policy-mlp-v1",
    feature_schema: "swift-human-policy-features-v1",
    feature_size: 925, enabled_by_default: false,
    method: "supervised-human-legal-move-imitation-not-reinforcement-learning",
    training: { games: { train: 1000, val: 100, test: 100 } },
    layers: [{ in: 925, out: 1, qweight: [row], scale: [0.025],
      bias: [0], activation: "identity" }],
  };
}

describe("Human-policy neural network, disabled-by-default", () => {
  it("encodes board and move exactly like the PyTorch trainer's features", () => {
    const board = Board.start();
    const e4 = board.legalMoves().find((move) => move.uci() === "e2e4");
    if (!e4) throw Error("Fixture missing e4");
    const x = encodeHumanPolicyMove(board, e4, 2200);
    expect(x.length).toBe(925);
    expect(x[0 * 64 + 12]).toBe(1);  // white pawn e2, own pawn plane
    expect(x[768 + 12]).toBe(1);   // move starts on e2
    expect(x[832 + 28]).toBe(1);   // move lands on e4
    expect(x[896]).toBe(1);        // moving pawn
    expect(x[913 + 5]).toBe(0);    // white to move
    expect(x[913 + 6]).toBe(0);    // 2200 is centered
    expect(x[913 + 8]).toBe(1);    // own kingside castling
    expect(x[913 + 10]).toBe(1);   // opponent kingside castling

    const blackBoard = board.makeMove(e4);
    const e5 = blackBoard.legalMoves().find((move) => move.uci() === "e7e5");
    if (!e5) throw Error("Fixture missing e5");
    const y = encodeHumanPolicyMove(blackBoard, e5, 2200);
    expect(y[12]).toBe(1);         // black e7 pawn mirrored to e2
    expect(y[768 + 12]).toBe(1);
    expect(y[913 + 5]).toBe(1);
  });

  it("never runs an unconfigured, invalid or disabled model", () => {
    const board = Board.start();
    const e4 = board.legalMoves().find((move) => move.uci() === "e2e4");
    if (!e4) throw Error("Fixture missing e4");
    const model = oneMovePreference();
    expect(validateHumanPolicyModel(model)).toBe(true);
    expect(humanPolicyBonuses(board, [e4], undefined, 2200)).toEqual({});
    expect(humanPolicyBonuses(board, [e4], { ...model, schema: "wrong" }, 2200)).toEqual({});
    expect(model.enabled_by_default).toBe(false);
  });

  it("prefers a human-policy-scored move without overriding search safety", () => {
    const board = Board.start();
    const e4 = board.legalMoves().find((move) => move.uci() === "e2e4");
    const d4 = board.legalMoves().find((move) => move.uci() === "d2d4");
    if (!e4 || !d4) throw Error("Fixture missing opening moves");
    const humanBonuses = humanPolicyBonuses(board, [d4, e4], oneMovePreference(), 2200);
    expect(humanBonuses[e4.uci()]).toBeGreaterThan(humanBonuses[d4.uci()]);
    expect(humanBonuses[e4.uci()]).toBeLessThanOrEqual(4);
    const candidates: CandidateScore[] = [
      { move: d4, score: 100, ideaKinds: ["develop"], reasons: ["verified"] },
      { move: e4, score: 100, ideaKinds: ["develop"], reasons: ["verified"] },
    ];
    const baseline = selectHumanMove(board, {
      candidates, randomness: 0, errorBudget: 0.1, initiative: 0,
      simplification: 0, development: 0, pawnBreaks: 0,
    });
    const withModel = selectHumanMove(board, {
      candidates, randomness: 0, errorBudget: 0.1, initiative: 0,
      simplification: 0, development: 0, pawnBreaks: 0,
      humanPolicyBonus: humanBonuses,
    });
    expect(baseline.move?.uci()).toBe("d2d4");
    expect(withModel.move?.uci()).toBe("e2e4");
    const farWorse = selectHumanMove(board, {
      candidates: [candidates[0], { ...candidates[1], score: 5 }],
      randomness: 0, errorBudget: 0.1,
      humanPolicyBonus: { e2e4: 100000 },
    });
    expect(farWorse.move?.uci()).toBe("d2d4");
  });
});
