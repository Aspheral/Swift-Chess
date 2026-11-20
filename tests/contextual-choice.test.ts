import { describe, expect, it } from "vitest";
import { Board, swiftPlayProfile } from "../src";
import { contextualChoiceUncertainty } from "../src/chess/contextual-choice";

const calm = { tacticalPressure: 0.02, practicalPressure: 0.1 };
const alternatives = [
  { score: 100, ideaKinds: ["improve-piece"] as const },
  { score: 98, ideaKinds: ["pawn-break"] as const },
];

describe("reasoned, seeded variation among genuinely verified plans", () => {
  it("offers bounded uncertainty for distinct equally reasonable plans", () => {
    const amount = contextualChoiceUncertainty(alternatives, calm);
    expect(amount).toBeGreaterThan(0.2);
    expect(amount).toBeLessThanOrEqual(0.4);
  });

  it("does not randomize a tactical response or dangerous position", () => {
    expect(contextualChoiceUncertainty(alternatives, { ...calm, tacticalPressure: 0.10 })).toBe(0);
    expect(contextualChoiceUncertainty(alternatives, { ...calm, practicalPressure: 0.45 })).toBe(0);
  });

  it("rejects false alternatives that are weaker than the near-tie window", () => {
    expect(contextualChoiceUncertainty([
      alternatives[0],
      { score: 91, ideaKinds: ["pawn-break"] },
    ], calm)).toBe(0);
  });

  it("does not confuse redundant moves for independent plans", () => {
    expect(contextualChoiceUncertainty([
      alternatives[0],
      { score: 100, ideaKinds: ["improve-piece"] },
    ], calm)).toBe(0);
  });

  it("respects an earned plan but allows a stalled plan to reconsider", () => {
    const committed = contextualChoiceUncertainty(alternatives, calm,
      { plan: "improve-piece", confidence: 0.9, planStallCycles: 0 });
    const stalled = contextualChoiceUncertainty(alternatives, calm,
      { plan: "improve-piece", confidence: 0.9, planStallCycles: 4 });
    expect(committed).toBeGreaterThan(0);
    expect(committed).toBeLessThan(stalled);
  });

  it("rejects invalid candidate evidence, absent ideas, and a single choice", () => {
    expect(contextualChoiceUncertainty([{ score: 100, ideaKinds: ["attack"] }], calm)).toBe(0);
    expect(contextualChoiceUncertainty([{ score: NaN, ideaKinds: ["attack"] }, alternatives[1]], calm)).toBe(0);
    expect(contextualChoiceUncertainty([{ score: 100, ideaKinds: [] }, alternatives[1]], calm)).toBe(0);
  });

  it("opt-ins only for the calm browser profile, preserving opening and endgame safety", () => {
    const opening = swiftPlayProfile(Board.start(), []);
    const middlegame = swiftPlayProfile(Board.start(), Array(18).fill("fixture"));
    const ending = swiftPlayProfile(Board.fromFEN("7k/8/8/8/8/8/8/K7 w - - 0 1"), Array(18).fill("fixture"));
    expect(opening.options.contextualVariation).toBeUndefined();
    expect(middlegame.kind).toBe("calm");
    expect(middlegame.options.contextualVariation).toBe(true);
    expect(ending.options.contextualVariation).toBeUndefined();
  });
});
