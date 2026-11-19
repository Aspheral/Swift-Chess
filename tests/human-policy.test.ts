import { describe, expect, it } from "vitest";
import { Board, type CandidateScore, selectHumanMove } from "../src";
import {
  encodeHumanPolicyMove,
  encodeHumanPolicyContextMove,
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
    // Exact active one-hot indices exported by the independently trained
    // Python chess encoder. This catches cross-language feature drift.
    const nonzeroIndices = Array.from(x, (value, i) => value ? i : -1)
      .filter((i) => i >= 0);
    expect(nonzeroIndices).toEqual([
      8,9,10,11,12,13,14,15,65,70,130,133,192,199,259,324,
      432,433,434,435,436,437,438,439,505,510,570,573,632,639,
      699,764,780,860,896,921,922,923,924,
    ]);


    const blackBoard = board.makeMove(e4);
    const e5 = blackBoard.legalMoves().find((move) => move.uci() === "e7e5");
    if (!e5) throw Error("Fixture missing e5");
    const y = encodeHumanPolicyMove(blackBoard, e5, 2200);
    expect(y[12]).toBe(1);         // black e7 pawn mirrored to e2
    expect(y[768 + 12]).toBe(1);
    expect(y[913 + 5]).toBe(1);
  });

  it("encodes eight real previous plies in the trained model's exact coordinate schema", () => {
    const board = Board.start();
    const e4 = board.legalMoves().find((m) => m.uci() === "e2e4");
    if (!e4) throw Error("Missing e4");
    const afterE4 = board.makeMove(e4);
    const e5 = afterE4.legalMoves().find((m) => m.uci() === "e7e5");
    if (!e5) throw Error("Missing e5");
    const afterE5 = afterE4.makeMove(e5);
    const nf3 = afterE5.legalMoves().find((m) => m.uci() === "g1f3");
    if (!nf3) throw Error("Missing Nf3");
    const x = encodeHumanPolicyContextMove(afterE5, nf3, 2200, ["e2e4", "e7e5"]);
    expect(x.length).toBe(1949);
    expect(Array.from(x.slice(0, 925))).toEqual(
      Array.from(encodeHumanPolicyMove(afterE5, nf3, 2200)),
    );
    // Black's e7-e5 is the most recent move, at slot 7.
    expect(x[925 + 7 * 128 + 52]).toBe(1);
    expect(x[925 + 7 * 128 + 64 + 36]).toBe(1);
    // White's e2-e4 is previous slot 6.
    expect(x[925 + 6 * 128 + 12]).toBe(1);
    expect(x[925 + 6 * 128 + 64 + 28]).toBe(1);
    expect(x.slice(925).filter((value) => value !== 0).length).toBe(4);
    const black = encodeHumanPolicyContextMove(afterE4, e5, 2200, ["e2e4"]);
    // Black perspective mirrors ranks (e2->e7 and e4->e5).
    expect(black[925 + 7 * 128 + 52]).toBe(1);
    expect(black[925 + 7 * 128 + 64 + 36]).toBe(1);
    expect(black.slice(925).filter((value) => value !== 0).length).toBe(2);
  });

  it("rejects the wrong checkpoint schema and does not fabricate history", () => {
    const board = Board.start();
    const e4 = board.legalMoves().find((m) => m.uci() === "e2e4");
    const d4 = board.legalMoves().find((m) => m.uci() === "d2d4");
    if (!e4 || !d4) throw Error("Missing legal fixture");
    const row = new Array<number>(1949).fill(0);
    row[925 + 7 * 128 + 12] = 100;
    const contextual: HumanPolicyModel = {
      schema: "swift-human-policy-context-v1",
      feature_schema: "swift-human-policy-features+history8-v1",
      feature_size: 1949,
      enabled_by_default: false,
      layers: [{ in: 1949, out: 1, qweight: [row],
        scale: [0.01], bias: [0], activation: "identity" }],
    };
    expect(validateHumanPolicyModel(contextual)).toBe(true);
    expect(validateHumanPolicyModel({ ...contextual, feature_size: 925 })).toBe(false);
    expect(validateHumanPolicyModel({ ...contextual, schema: "swift-human-policy-mlp-v1" })).toBe(false);
    const withHistory = encodeHumanPolicyContextMove(board, e4, 2200, ["e2e4"]);
    const withoutHistory = encodeHumanPolicyContextMove(board, e4, 2200, []);
    expect(withHistory).not.toEqual(withoutHistory);
    expect(humanPolicyBonuses(board, [d4, e4], contextual, 2200, ["not-a-move"])).toEqual({});
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

  it("does not turn a tiny uncertain neural difference into a full 4cp bonus", () => {
    const board = Board.start();
    const e4 = board.legalMoves().find((move) => move.uci() === "e2e4");
    const d4 = board.legalMoves().find((move) => move.uci() === "d2d4");
    if (!e4 || !d4) throw Error("Missing fixture move");
    const uncertain = oneMovePreference();
    uncertain.layers[0].scale[0] = 0.0005;
    const bonus = humanPolicyBonuses(board, [d4, e4], uncertain, 2200);
    expect(bonus[e4.uci()]).toBeLessThan(0.5);
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
